"""FEFO 領用 API，連真實 PostgreSQL：SRS 第 9 節流程、錯誤碼、防重送與超領併發（NFR-02）。"""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from decimal import Decimal
from time import monotonic, sleep
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.dependencies import get_clock
from app.core.enums import ErrorCode, TransactionType
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.models import InventoryBatch, InventoryTransaction
from app.main import create_app
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.issue.repository_sqlalchemy import SqlAlchemyIssueRepository
from app.modules.issue.service import IssueLineInput, IssueService
from app.modules.issue.strategies import FefoStrategy, ManualStrategy
from tests.integration.factories import (
    add_employee,
    add_ingredient,
    add_item,
    add_location,
    make_token,
    op_for,
)

OCT_31 = datetime(2026, 10, 31, 2, 0, tzinfo=UTC)  # 台北 10/31
NOV_02 = datetime(2026, 11, 2, 2, 0, tzinfo=UTC)
URL = "/api/v1/issues"


class Clock:
    """測試中途可以換日。"""

    def __init__(self) -> None:
        self.now = OCT_31

    def __call__(self) -> FixedClock:
        return FixedClock(self.now)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def app(clock: Clock):
    app = create_app()
    app.dependency_overrides[get_clock] = clock
    return app


def _receive(session, *, ingredient_id, location_id, operator_id, quantity, expiry, received):
    item = add_item(
        session,
        ingredient_id=ingredient_id,
        location_id=location_id,
        operator_id=operator_id,
        quantity=quantity,
        expiry_date=expiry,
        receipt_date=received,
    )
    return SqlAlchemyStockLedger(session).receive(item, op_for(operator_id)).batch_id


@pytest.fixture
def world():
    """雞胸肉 A（5kg、11/01 到期）與 B（8kg、11/07 到期）；另有豬肉批次 P。"""
    with get_session_factory()() as session:
        staff = add_employee(session)
        chicken = add_ingredient(session)
        pork = add_ingredient(session)
        location = add_location(session)
        common = {"location_id": location.id, "operator_id": staff.id}
        a = _receive(
            session,
            ingredient_id=chicken.id,
            quantity="5",
            expiry=date(2026, 11, 1),
            received=date(2026, 10, 25),
            **common,
        )
        b = _receive(
            session,
            ingredient_id=chicken.id,
            quantity="8",
            expiry=date(2026, 11, 7),
            received=date(2026, 10, 26),
            **common,
        )
        p = _receive(
            session,
            ingredient_id=pork.id,
            quantity="3",
            expiry=date(2026, 11, 9),
            received=date(2026, 10, 26),
            **common,
        )
        session.commit()
        return {
            "staff": staff.id,
            "chicken": chicken.id,
            "pork": pork.id,
            "location_code": location.code,
            "a": a,
            "b": b,
            "p": p,
        }


@pytest.fixture
def client(app, world) -> TestClient:
    client = TestClient(app)
    client.cookies.set(get_settings().auth_cookie_name, make_token(world["staff"]))
    return client


def _remaining(batch_id: int) -> Decimal:
    with get_session_factory()() as session:
        return session.get_one(InventoryBatch, batch_id).remaining_quantity


def _issue_transactions(batch_id: int | None = None) -> list[InventoryTransaction]:
    with get_session_factory()() as session:
        stmt = select(InventoryTransaction).where(
            InventoryTransaction.type == TransactionType.ISSUE
        )
        if batch_id is not None:
            stmt = stmt.where(InventoryTransaction.batch_id == batch_id)
        return list(session.scalars(stmt.order_by(InventoryTransaction.id)))


def _post_issue(client: TestClient, ingredient_id: int, lines: list[dict], key=None):
    return client.post(
        URL,
        json={"ingredient_id": ingredient_id, "lines": lines},
        headers={"Idempotency-Key": str(key or uuid4())},
    )


def _line(batch_id: int, quantity: str, reason: str | None = None) -> dict:
    line = {"batch_id": batch_id, "quantity": quantity}
    if reason is not None:
        line["reason"] = reason
    return line


def test_section_nine_issue_flow(client, clock, world) -> None:
    chicken, a, b = world["chicken"], world["a"], world["b"]

    ingredients = client.get(f"{URL}/ingredients").json()["items"]
    assert {item["id"]: item["available_quantity"] for item in ingredients} == {
        chicken: "13.000",
        world["pork"]: "3.000",
    }

    # 領用 3 公斤：建議 A
    suggestion = client.post(f"{URL}/suggestions", json={"ingredient_id": chicken, "quantity": "3"})
    assert suggestion.status_code == 200
    body = suggestion.json()
    assert (body["requested_quantity"], body["available_quantity"]) == ("3.000", "13.000")
    first = body["candidates"][0]
    assert first["batch_id"] == a
    assert first["location_code"] == world["location_code"]
    assert (first["remaining_quantity"], first["quantity"], first["fefo_quantity"]) == (
        "5.000",
        "3.000",
        "3.000",
    )
    assert (first["expiry_status"], first["days_until_expiry"]) == ("EXPIRING_SOON", 1)
    assert [item["quantity"] for item in body["candidates"]] == ["3.000", "0.000"]

    key = uuid4()
    issued = _post_issue(client, chicken, [_line(a, "3")], key)
    assert issued.status_code == 200
    result = issued.json()
    assert result["operation_group_id"] == str(key)
    [line] = result["lines"]
    assert (line["batch_id"], line["quantity"], line["quantity_after"], line["is_non_fefo"]) == (
        a,
        "3.000",
        "2.000",
        False,
    )
    assert (_remaining(a), _remaining(b)) == (Decimal("2"), Decimal("8"))
    [transaction] = _issue_transactions(a)
    assert transaction.id == line["transaction_id"]
    assert transaction.quantity_delta == Decimal("-3")
    assert transaction.operator_id == world["staff"]

    # 改選 B 領用 1 公斤並填原因
    checked = client.post(
        f"{URL}/suggestions", json={"ingredient_id": chicken, "lines": [_line(b, "1")]}
    ).json()
    assert {item["batch_id"]: item["is_non_fefo"] for item in checked["candidates"]} == {
        a: False,
        b: True,
    }
    rejected = _post_issue(client, chicken, [_line(b, "1")])
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "RULE_VIOLATION"
    assert [item["field"] for item in rejected.json()["error"]["fields"]] == ["lines.0.reason"]
    assert _remaining(b) == Decimal("8")

    switched = _post_issue(client, chicken, [_line(b, "1", "A 在冷藏庫最裡面")])
    assert switched.status_code == 200
    assert switched.json()["lines"][0]["is_non_fefo"] is True
    [b_transaction] = _issue_transactions(b)
    assert (b_transaction.is_non_fefo, b_transaction.reason) == (True, "A 在冷藏庫最裡面")
    assert _remaining(b) == Decimal("7")

    # 再嘗試從 A 領用 3 公斤
    over = _post_issue(client, chicken, [_line(a, "3")])
    assert over.status_code == 409
    error = over.json()["error"]
    assert error["code"] == "INSUFFICIENT_STOCK"
    assert error["details"] == {
        "batch_id": a,
        "remaining_quantity": "2.000",
        "available_quantity": "9.000",
    }
    assert _remaining(a) == Decimal("2")

    # 11/02：A 已過期，不得領用也不出現在建議中
    clock.now = NOV_02
    expired = _post_issue(client, chicken, [_line(a, "1")])
    assert expired.status_code == 422
    assert expired.json()["error"]["code"] == "RULE_VIOLATION"
    later = client.post(f"{URL}/suggestions", json={"ingredient_id": chicken, "quantity": "1"})
    assert [item["batch_id"] for item in later.json()["candidates"]] == [b]
    assert len(_issue_transactions()) == 2


def test_suggestion_over_available_is_insufficient_stock(client, world) -> None:
    response = client.post(
        f"{URL}/suggestions", json={"ingredient_id": world["chicken"], "quantity": "14"}
    )

    assert response.status_code == 409
    assert response.json()["error"]["details"]["available_quantity"] == "13.000"


def test_one_short_line_rejects_every_line(client, world) -> None:
    response = _post_issue(
        client, world["chicken"], [_line(world["a"], "2"), _line(world["b"], "9", "原因")]
    )

    assert response.status_code == 409
    assert response.json()["error"]["details"]["batch_id"] == world["b"]
    assert (_remaining(world["a"]), _remaining(world["b"])) == (Decimal("5"), Decimal("8"))
    assert _issue_transactions() == []


@pytest.mark.parametrize(
    ("lines", "status"),
    [
        ([{"batch_id": "a", "quantity": "0"}], 422),
        ([{"batch_id": "a", "quantity": "1.2345"}], 422),
        ([{"batch_id": "a", "quantity": 1}], 422),
        ([{"batch_id": "a", "quantity": "1"}, {"batch_id": "a", "quantity": "1"}], 422),
        ([], 422),
        ([{"batch_id": 999999, "quantity": "1"}], 404),
        ([{"batch_id": "p", "quantity": "1"}], 404),
    ],
)
def test_invalid_lines(client, world, lines, status) -> None:
    resolved = [
        {**line, "batch_id": world[line["batch_id"]]} if isinstance(line["batch_id"], str) else line
        for line in lines
    ]

    response = _post_issue(client, world["chicken"], resolved)

    assert response.status_code == status
    assert _remaining(world["a"]) == Decimal("5")
    assert _issue_transactions() == []


def test_missing_idempotency_key_is_validation_error(client, world) -> None:
    response = client.post(
        URL, json={"ingredient_id": world["chicken"], "lines": [_line(world["a"], "1")]}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_replay_returns_the_original_result_and_different_content_is_duplicate(
    client, world
) -> None:
    key = uuid4()
    first = _post_issue(client, world["chicken"], [_line(world["a"], "3")], key)

    replay = _post_issue(client, world["chicken"], [_line(world["a"], "3.000")], key)
    different = _post_issue(client, world["chicken"], [_line(world["a"], "2")], key)

    assert (first.status_code, replay.status_code) == (200, 200)
    assert replay.json() == first.json()
    assert different.status_code == 409
    assert different.json()["error"]["code"] == "DUPLICATE"
    assert _remaining(world["a"]) == Decimal("2")
    assert len(_issue_transactions()) == 1


def _service(session) -> IssueService:
    return IssueService(
        SqlAlchemyIssueRepository(session),
        SqlAlchemyStockLedger(session),
        SqlAlchemyUnitOfWork(session),
        FixedClock(OCT_31),
        default_strategy=FefoStrategy(),
        manual_strategy=ManualStrategy(),
    )


def _wait_until_blocked(expected: int) -> None:
    """第二個等待者排在第一個後面，pg_blocking_pids 指向的是第一個等待者，不是 holder。"""
    deadline = monotonic() + 5
    with get_session_factory()() as observer:
        while True:
            waiting = observer.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity"
                    " WHERE datname = current_database()"
                    " AND cardinality(pg_blocking_pids(pid)) > 0"
                )
            )
            if waiting >= expected:
                return
            # pg_stat_activity 在同一交易內是快照，要結束交易才會讀到新狀態。
            observer.rollback()
            assert monotonic() < deadline, f"只有 {waiting} 個領用在等列鎖"
            sleep(0.01)


def _issue_after_reading(batch_id: int, ingredient_id: int, operator_id: int):
    """鎖前先在同一 Session 讀過批次（看到 6），鎖後必須以最新量判斷。"""
    with get_session_factory()() as session:
        assert session.get_one(InventoryBatch, batch_id).remaining_quantity == Decimal("6")
        try:
            return _service(session).issue(
                ingredient_id,
                [IssueLineInput(batch_id, Decimal("4"))],
                idempotency_key=uuid4(),
                operator_id=operator_id,
            )
        except DomainError as error:
            return error


def test_two_people_issuing_four_from_six_cannot_oversell(world) -> None:
    b, chicken = world["b"], world["chicken"]
    with get_session_factory()() as session:
        # 只留 B，且剩 6：先把 A 用完、B 扣 2。
        ledger = SqlAlchemyStockLedger(session)
        batches = {batch.id: batch for batch in ledger.lock_ingredient_batches(chicken)}
        ledger.deduct(
            batches[world["a"]], Decimal("5"), TransactionType.WASTE, op_for(world["staff"])
        )
        ledger.deduct(batches[b], Decimal("2"), TransactionType.WASTE, op_for(world["staff"]))
        session.commit()

    with ThreadPoolExecutor(max_workers=2) as executor, get_session_factory()() as holder:
        SqlAlchemyStockLedger(holder).lock_ingredient_batches(chicken)
        pending = [
            executor.submit(_issue_after_reading, b, chicken, world["staff"]) for _ in range(2)
        ]
        _wait_until_blocked(expected=2)
        assert not any(item.done() for item in pending)
        holder.rollback()
        outcomes = [item.result(timeout=10) for item in pending]

    errors = [item for item in outcomes if isinstance(item, DomainError)]
    assert len(errors) == 1
    assert errors[0].code is ErrorCode.INSUFFICIENT_STOCK
    assert errors[0].details["remaining_quantity"] == "2.000"
    assert _remaining(b) == Decimal("2")
    assert len(_issue_transactions(b)) == 1
    with get_session_factory()() as session:
        negative = session.scalar(select(func.count()).where(InventoryBatch.remaining_quantity < 0))
    assert negative == 0


@pytest.mark.parametrize(
    "body",
    [
        {"quantity": "1", "lines": [{"batch_id": "a", "quantity": "1"}]},
        {},
        {"lines": [{"batch_id": "a", "quantity": "1"}, {"batch_id": "a", "quantity": "2"}]},
        {"lines": []},
        {"quantity": "0"},
    ],
    ids=["both", "neither", "duplicate-batch", "empty-lines", "zero"],
)
def test_invalid_suggestion_requests_are_validation_errors(client, world, body) -> None:
    resolved = {
        **body,
        **(
            {"lines": [{**line, "batch_id": world[line["batch_id"]]} for line in body["lines"]]}
            if "lines" in body
            else {}
        ),
    }

    response = client.post(
        f"{URL}/suggestions", json={"ingredient_id": world["chicken"], **resolved}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    ("batch", "quantity", "status", "code"),
    [
        ("p", "1", 404, "NOT_FOUND"),
        ("a", "6", 409, "INSUFFICIENT_STOCK"),
    ],
)
def test_suggestion_lines_are_classified_like_confirmation(
    client, world, batch, quantity, status, code
) -> None:
    response = client.post(
        f"{URL}/suggestions",
        json={"ingredient_id": world["chicken"], "lines": [_line(world[batch], quantity)]},
    )

    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_expired_line_in_suggestion_is_rule_violation(client, clock, world) -> None:
    clock.now = NOV_02

    response = client.post(
        f"{URL}/suggestions",
        json={"ingredient_id": world["chicken"], "lines": [_line(world["a"], "1")]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RULE_VIOLATION"


def test_blank_reason_counts_as_missing(client, world) -> None:
    response = _post_issue(client, world["chicken"], [_line(world["b"], "1", "   ")])

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "RULE_VIOLATION"
    assert [item["field"] for item in error["fields"]] == ["lines.0.reason"]
    assert _remaining(world["b"]) == Decimal("8")


def test_ingredient_list_keeps_inactive_stock_and_drops_expired_only(client, world) -> None:
    with get_session_factory()() as session:
        staff = world["staff"]
        location = add_location(session)
        inactive = add_ingredient(session, is_active=False)
        expired_only = add_ingredient(session)
        common = {"location_id": location.id, "operator_id": staff, "received": date(2026, 10, 1)}
        _receive(
            session, ingredient_id=inactive.id, quantity="2", expiry=date(2026, 11, 9), **common
        )
        _receive(
            session,
            ingredient_id=expired_only.id,
            quantity="4",
            expiry=date(2026, 10, 30),
            **common,
        )
        session.commit()

    items = {item["id"]: item for item in client.get(f"{URL}/ingredients").json()["items"]}

    assert items[inactive.id]["is_active"] is False
    assert items[inactive.id]["available_quantity"] == "2.000"
    assert expired_only.id not in items


def test_ingredient_options_carry_category_and_backend_statuses(client, world) -> None:
    with get_session_factory()() as session:
        location = add_location(session)
        low = add_ingredient(session, safety="20")
        inactive_low = add_ingredient(session, safety="20", is_active=False)
        common = {"location_id": location.id, "operator_id": world["staff"]}
        for ingredient in (low, inactive_low):
            _receive(
                session,
                ingredient_id=ingredient.id,
                quantity="5",
                expiry=date(2026, 10, 31),
                received=date(2026, 10, 20),
                **common,
            )
        session.commit()

    items = {item["id"]: item for item in client.get(f"{URL}/ingredients").json()["items"]}

    chicken = items[world["chicken"]]
    assert chicken["category_name"].startswith("分類")
    assert chicken["storage_method"] == "REFRIGERATED"
    assert (chicken["nearest_expiry_date"], chicken["nearest_expiry_status"]) == (
        "2026-11-01",
        "EXPIRING_SOON",
    )
    assert chicken["nearest_days_until_expiry"] == 1
    assert chicken["is_low_stock"] is False
    assert items[low.id]["is_low_stock"] is True
    assert items[low.id]["nearest_expiry_status"] == "EXPIRES_TODAY"
    assert items[inactive_low.id]["is_low_stock"] is False  # AD-21：停用食材不提醒低庫存


def test_recent_issues_are_grouped_per_operation_newest_first(client, world) -> None:
    first = _post_issue(client, world["chicken"], [_line(world["a"], "5"), _line(world["b"], "1")])
    second = _post_issue(client, world["pork"], [_line(world["p"], "1")])
    assert (first.status_code, second.status_code) == (200, 200)

    response = client.get(URL, params={"limit": 5})

    assert response.status_code == 200
    records = response.json()["items"]
    assert [record["ingredient_id"] for record in records] == [world["pork"], world["chicken"]]
    chicken = records[1]
    assert chicken["operation_group_id"] == first.json()["operation_group_id"]
    assert chicken["unit"] == "kg"
    assert chicken["operator_name"]
    assert [
        (line["batch_id"], line["quantity"], line["quantity_after"]) for line in chicken["lines"]
    ] == [
        (world["a"], "5.000", "0.000"),
        (world["b"], "1.000", "7.000"),
    ]
    assert client.get(URL, params={"limit": 1}).json()["items"][0]["ingredient_id"] == world["pork"]


def test_reversal_restores_stock_links_records_and_shows_in_history(client, world) -> None:
    issued = _post_issue(client, world["chicken"], [_line(world["a"], "3")]).json()
    group = issued["operation_group_id"]

    response = client.post(f"{URL}/{group}/reversal", json={"reason": "  數量填錯  "})
    again = client.post(f"{URL}/{group}/reversal", json={"reason": "重按"})

    assert (response.status_code, again.status_code) == (200, 200)
    reversal = response.json()["reversal"]
    assert reversal["reason"] == "數量填錯"
    assert again.json()["reversal"]["reason"] == "數量填錯"
    assert _remaining(world["a"]) == Decimal("5")
    with get_session_factory()() as session:
        reversals = list(
            session.scalars(
                select(InventoryTransaction).where(
                    InventoryTransaction.type == TransactionType.REVERSAL
                )
            )
        )
    assert [item.reverses_transaction_id for item in reversals] == [
        issued["lines"][0]["transaction_id"]
    ]
    assert len(_issue_transactions()) == 1  # 原紀錄保留
    [record] = client.get(URL).json()["items"]
    assert record["reversal"]["reason"] == "數量填錯"


@pytest.mark.parametrize(
    ("group", "body", "status"),
    [(None, {"reason": "x"}, 404), ("issued", {"reason": "   "}, 422), ("issued", {}, 422)],
)
def test_invalid_reversals(client, world, group, body, status) -> None:
    issued = _post_issue(client, world["chicken"], [_line(world["a"], "1")]).json()
    target = issued["operation_group_id"] if group else str(uuid4())

    response = client.post(f"{URL}/{target}/reversal", json=body)

    assert response.status_code == status
    assert _remaining(world["a"]) == Decimal("4")


def test_indivisible_unit_over_http(client, world) -> None:
    with get_session_factory()() as session:
        location = add_location(session)
        eggs = add_ingredient(session)
        eggs.unit = "顆"
        batch = _receive(
            session,
            ingredient_id=eggs.id,
            location_id=location.id,
            operator_id=world["staff"],
            quantity="30",
            expiry=date(2026, 11, 9),
            received=date(2026, 10, 25),
        )
        session.commit()

    fraction = _post_issue(client, eggs.id, [_line(batch, "2.5")])
    whole = _post_issue(client, eggs.id, [_line(batch, "2")])
    options = {item["id"]: item for item in client.get(f"{URL}/ingredients").json()["items"]}

    assert fraction.status_code == 422
    assert [item["field"] for item in fraction.json()["error"]["fields"]] == ["lines.0.quantity"]
    assert whole.status_code == 200
    assert options[eggs.id]["allows_fraction"] is False
    assert options[world["chicken"]]["allows_fraction"] is True
