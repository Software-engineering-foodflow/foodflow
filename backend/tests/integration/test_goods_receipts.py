from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, ErrorCode, GoodsReceiptStatus, TransactionType
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.models import (
    Employee,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    InventoryTransaction,
    StorageLocation,
    Supplier,
)
from app.main import create_app
from app.modules.goods_receipt.repository_sqlalchemy import SqlAlchemyGoodsReceiptRepository
from app.modules.goods_receipt.service import GoodsReceiptService, ReceiptItemInput
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from tests.integration.factories import (
    NOW,
    TODAY,
    add_employee,
    add_ingredient,
    add_location,
    make_token,
)

URL = "/api/v1/goods-receipts"


@pytest.fixture
def data(session):
    employee = add_employee(session)
    supplier = Supplier(name="供應商", is_active=True)
    session.add(supplier)
    ingredient = add_ingredient(session)
    location = add_location(session)
    session.commit()
    return {
        "employee": employee.id,
        "supplier": supplier.id,
        "ingredient": ingredient.id,
        "location": location.id,
    }


@pytest.fixture
def app():
    app = create_app()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW)
    return app


@pytest.fixture
def client(app, data):
    client = TestClient(app)
    client.cookies.set(get_settings().auth_cookie_name, make_token(data["employee"]))
    return client


def body(data, **overrides):
    return {
        "supplier_id": data["supplier"],
        "receipt_date": TODAY.isoformat(),
        "items": [item(data)],
    } | overrides


def item(data, **overrides):
    return {
        "ingredient_id": data["ingredient"],
        "quantity": "2.125",
        "unit_price": "0",
        "expiry_date": (TODAY + timedelta(days=30)).isoformat(),
        "location_id": data["location"],
        "note": None,
    } | overrides


def service(session):
    return GoodsReceiptService(
        SqlAlchemyGoodsReceiptRepository(session),
        SqlAlchemyStockLedger(session),
        SqlAlchemyUnitOfWork(session),
        FixedClock(NOW),
    )


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


@pytest.mark.parametrize("value", [0, -1, 2**63, 10**100])
def test_external_path_ids_are_bounded(client, data, value):
    for method, suffix in (("GET", ""), ("PATCH", ""), ("DELETE", ""), ("POST", "/confirm")):
        response = client.request(
            method, f"{URL}/{value}{suffix}", json=body(data) if method == "PATCH" else None
        )
        assert response.status_code == 422
        assert response.json()["error"]["fields"][0]["field"] == "receipt_id"


@pytest.mark.parametrize("field", ["supplier_id", "ingredient_id", "location_id", "id"])
@pytest.mark.parametrize("value", [0, -1, 2**63, 10**100])
def test_external_body_ids_are_bounded(client, data, field, value):
    payload = body(data)
    target = payload if field == "supplier_id" else payload["items"][0]
    target[field] = value
    receipt = client.post(URL, json=body(data)).json()
    for method, path in (("POST", URL), ("PATCH", f"{URL}/{receipt['id']}")):
        response = client.request(method, path, json=payload)
        assert response.status_code == 422
        expected = field if field == "supplier_id" else f"items.0.{field}"
        assert expected in {error["field"] for error in response.json()["error"]["fields"]}


def test_bigint_max_is_accepted_and_unknown_ids_are_controlled(client, data):
    maximum = 2**63 - 1
    assert client.get(f"{URL}/{maximum}").status_code == 404
    for field in ("supplier_id", "ingredient_id", "location_id", "id"):
        payload = body(data)
        target = payload if field == "supplier_id" else payload["items"][0]
        target[field] = maximum
        response = client.post(URL, json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("role", [EmployeeRole.ADMIN, EmployeeRole.STAFF])
def test_two_lines_atomic_confirmation_and_replay(client, data, session, role):
    session.get(Employee, data["employee"]).role = role
    session.commit()
    response = client.post(URL, json=body(data, items=[item(data), item(data, unit_price=None)]))
    assert response.status_code == 201, response.text
    draft = response.json()
    assert draft["receipt_number"] == f"GR-{draft['id']:08d}"
    assert draft["status"] == "DRAFT"
    assert count(session, InventoryBatch) == count(session, InventoryTransaction) == 0
    confirmed = client.post(f"{URL}/{draft['id']}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "CONFIRMED"
    assert client.post(f"{URL}/{draft['id']}/confirm").json() == confirmed.json()
    session.expire_all()
    batches = list(session.scalars(select(InventoryBatch).order_by(InventoryBatch.id)))
    transactions = list(session.scalars(select(InventoryTransaction)))
    assert len(batches) == len(transactions) == 2
    assert [batch.unit_price for batch in batches] == [Decimal("0"), None]
    for batch, line in zip(batches, draft["items"], strict=True):
        assert batch.batch_number == f"B-{line['id']:08d}"
        assert batch.initial_quantity == batch.remaining_quantity == Decimal("2.125")
        assert batch.current_location_id == data["location"]
        assert batch.expiry_date == TODAY + timedelta(days=30)
        assert batch.received_date == TODAY
    assert {tx.operator_id for tx in transactions} == {data["employee"]}
    assert {tx.occurred_at for tx in transactions} == {NOW}
    assert {tx.type for tx in transactions} == {TransactionType.RECEIPT}
    assert len({tx.operation_group_id for tx in transactions}) == 1
    assert client.patch(f"{URL}/{draft['id']}", json=body(data)).status_code == 409
    assert client.delete(f"{URL}/{draft['id']}").status_code == 409


def test_incomplete_draft_edit_ids_and_delete(client, data, session):
    draft = client.post(
        URL,
        json=body(
            data, items=[item(data), item(data, quantity=None, expiry_date=None, location_id=None)]
        ),
    ).json()
    receipt_id = draft["id"]
    assert client.get(f"{URL}/{receipt_id}").json() == draft
    assert client.post(f"{URL}/{receipt_id}/confirm").status_code == 422
    kept = draft["items"][1]["id"]
    updated = client.patch(
        f"{URL}/{receipt_id}",
        json=body(data, items=[item(data, id=kept), item(data, quantity="7.001")]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["items"][0]["id"] == kept
    assert updated.json()["items"][1]["id"] not in [line["id"] for line in draft["items"]]
    assert count(session, GoodsReceiptItem) == 2
    assert client.delete(f"{URL}/{receipt_id}").status_code == 204
    assert client.get(f"{URL}/{receipt_id}").status_code == 404
    assert count(session, GoodsReceiptItem) == count(session, GoodsReceipt) == 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("quantity", "0"),
        ("quantity", "-1"),
        ("quantity", "1.0001"),
        ("quantity", 1.2),
        ("quantity", "1e2"),
        ("unit_price", "-1"),
        ("unit_price", "1.001"),
        ("unit_price", 0),
        ("ingredient_id", 99999999),
        ("location_id", 99999999),
    ],
)
def test_invalid_lines_have_dotted_fields_and_do_not_write(client, data, session, field, value):
    response = client.post(URL, json=body(data, items=[item(data, **{field: value})]))
    assert response.status_code == 422
    assert f"items.0.{field}" in {error["field"] for error in response.json()["error"]["fields"]}
    assert count(session, GoodsReceipt) == count(session, InventoryBatch) == 0


def test_empty_future_invalid_supplier_and_foreign_ids(client, data):
    for payload in (
        body(data, items=[]),
        body(data, supplier_id=99999999),
        body(data, receipt_date=(TODAY + timedelta(days=1)).isoformat()),
    ):
        assert client.post(URL, json=payload).status_code == 422
    first = client.post(URL, json=body(data)).json()
    second = client.post(URL, json=body(data)).json()
    for lines in (
        [item(data, id=second["items"][0]["id"])],
        [item(data, id=first["items"][0]["id"])] * 2,
    ):
        result = client.patch(f"{URL}/{first['id']}", json=body(data, items=lines))
        assert result.status_code == 422
    assert client.get(f"{URL}/{first['id']}").json() == first


@pytest.mark.parametrize(
    "model,key,field",
    [
        (Supplier, "supplier", "supplier_id"),
        (Ingredient, "ingredient", "items.0.ingredient_id"),
        (StorageLocation, "location", "items.0.location_id"),
    ],
)
def test_deactivated_references_display_but_reject_writes(client, data, session, model, key, field):
    draft = client.post(URL, json=body(data)).json()
    session.get(model, data[key]).is_active = False
    session.commit()
    assert client.get(f"{URL}/{draft['id']}").status_code == 200
    for response in (
        client.post(f"{URL}/{draft['id']}/confirm"),
        client.post(URL, json=body(data)),
    ):
        assert response.status_code == 422
        assert field in {error["field"] for error in response.json()["error"]["fields"]}
    assert count(session, InventoryBatch) == 0


def test_confirmation_revalidates_today_and_expiry(client, data, app, session):
    draft = client.post(
        URL, json=body(data, items=[item(data, expiry_date=TODAY.isoformat())])
    ).json()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW + timedelta(days=1))
    client.cookies.set(
        get_settings().auth_cookie_name,
        make_token(data["employee"], expires_at=NOW + timedelta(days=2)),
    )
    assert client.post(f"{URL}/{draft['id']}/confirm").status_code == 422
    assert client.get(f"{URL}/{draft['id']}").json()["status"] == "DRAFT"
    assert count(session, InventoryBatch) == 0


def test_third_line_failure_rolls_back_all_stock_and_status(client, data, session, monkeypatch):
    draft = client.post(URL, json=body(data, items=[item(data)] * 3)).json()
    original = SqlAlchemyStockLedger.receive
    calls = []

    def fail_third(self, line, op):
        transaction = original(self, line, op)
        calls.append(transaction.id)
        if len(calls) == 3:
            raise DomainError(ErrorCode.STATE_CONFLICT, "注入第三筆寫入失敗")
        return transaction

    monkeypatch.setattr(SqlAlchemyStockLedger, "receive", fail_third)
    assert client.post(f"{URL}/{draft['id']}/confirm").status_code == 409
    assert len(calls) == 3
    session.expire_all()
    assert count(session, InventoryBatch) == count(session, InventoryTransaction) == 0
    receipt = session.get(GoodsReceipt, draft["id"])
    assert receipt.status is GoodsReceiptStatus.DRAFT and receipt.confirmed_at is None


def test_reference_options_paginate_search_and_exclude_inactive(client, session):
    session.add_all([Supplier(name=f"page-{index:03}", is_active=True) for index in range(105)])
    session.add(Supplier(name="disabled", is_active=False))
    session.commit()
    first = client.get(f"{URL}/options/suppliers?search=page-&page_size=100").json()
    second = client.get(f"{URL}/options/suppliers?search=page-&page_size=100&page=2").json()
    assert len(first["items"]) == 100 and len(second["items"]) == 5
    assert first["total"] == second["total"] == 105
    assert client.get(f"{URL}/options/suppliers?search=disabled").json()["items"] == []
    assert client.get(f"{URL}/options/suppliers?search=%25").json()["items"] == []


@pytest.mark.parametrize("kind", ["anonymous", "disabled", "stale", "expired"])
def test_authentication_rejects_all_operational_endpoints(app, data, session, kind):
    caller = TestClient(app)
    if kind == "disabled":
        session.get(Employee, data["employee"]).is_active = False
        session.commit()
    if kind != "anonymous":
        token = make_token(
            data["employee"],
            token_version=1 if kind == "stale" else 0,
            expires_at=NOW - timedelta(seconds=1)
            if kind == "expired"
            else NOW + timedelta(hours=1),
        )
        caller.cookies.set(get_settings().auth_cookie_name, token)
    for method, suffix, payload in [
        ("GET", "/options/suppliers", None),
        ("POST", "", body(data)),
        ("GET", "/1", None),
        ("PATCH", "/1", body(data)),
        ("DELETE", "/1", None),
        ("POST", "/1/confirm", None),
        ("GET", "", None),
        ("POST", "/1/reverse", {"reason": "更正"}),
    ]:
        assert caller.request(method, URL + suffix, json=payload).status_code == 401


def test_simultaneous_confirmation_with_stale_prelock_reads(client, data, session):
    draft = client.post(URL, json=body(data, items=[item(data)] * 2)).json()
    barrier = Barrier(2)

    def confirm():
        with get_session_factory()() as connection:
            handler = service(connection)
            assert handler.get(draft["id"]).status is GoodsReceiptStatus.DRAFT
            barrier.wait(timeout=10)
            return handler.confirm(draft["id"], operator_id=data["employee"]).status

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: confirm(), range(2)))
    assert results == [GoodsReceiptStatus.CONFIRMED] * 2
    assert count(session, InventoryBatch) == count(session, InventoryTransaction) == 2


@pytest.mark.parametrize("first", ["edit", "confirm"])
def test_edit_and_confirm_serialize_after_stale_read(client, data, session, first):
    draft = client.post(URL, json=body(data)).json()
    locked = Event()
    release = Event()
    waiting = Event()

    class HoldingRepository(SqlAlchemyGoodsReceiptRepository):
        def lock(self, receipt_id):
            receipt = super().lock(receipt_id)
            locked.set()
            assert release.wait(10)
            return receipt

    class WaitingRepository(SqlAlchemyGoodsReceiptRepository):
        def lock(self, receipt_id):
            waiting.set()
            return super().lock(receipt_id)

    def action(kind, repository_type):
        with get_session_factory()() as connection:
            handler = GoodsReceiptService(
                repository_type(connection),
                SqlAlchemyStockLedger(connection),
                SqlAlchemyUnitOfWork(connection),
                FixedClock(NOW),
            )
            handler.get(draft["id"])
            try:
                if kind == "confirm":
                    handler.confirm(draft["id"], operator_id=data["employee"])
                else:
                    handler.update(
                        draft["id"],
                        supplier_id=data["supplier"],
                        receipt_date=TODAY,
                        items=[
                            ReceiptItemInput(
                                data["ingredient"],
                                Decimal("9"),
                                None,
                                TODAY,
                                data["location"],
                                id=draft["items"][0]["id"],
                            )
                        ],
                    )
                return "ok"
            except DomainError as failure:
                return failure.code

    with ThreadPoolExecutor(max_workers=2) as executor:
        leading = executor.submit(action, first, HoldingRepository)
        assert locked.wait(10)
        following = executor.submit(
            action, "confirm" if first == "edit" else "edit", WaitingRepository
        )
        assert waiting.wait(10)
        release.set()
        assert leading.result(timeout=10) == "ok"
        assert following.result(timeout=10) == (
            "ok" if first == "edit" else ErrorCode.STATE_CONFLICT
        )
    batch = session.scalars(select(InventoryBatch)).one()
    assert batch.remaining_quantity == Decimal("9" if first == "edit" else "2.125")


def confirmed_admin(client, data, session, lines=2):
    session.get(Employee, data["employee"]).role = EmployeeRole.ADMIN
    session.commit()
    draft = client.post(URL, json=body(data, items=[item(data)] * lines)).json()
    response = client.post(f"{URL}/{draft['id']}/confirm")
    assert response.status_code == 200, response.text
    assert all(row["batch_id"] and row["batch_number"] for row in response.json()["items"])
    assert client.post(f"{URL}/{draft['id']}/confirm").json() == response.json()
    return response.json()


def test_fr07_query_filters_pagination_and_historical_options(client, data, session):
    first = client.post(
        URL,
        json=body(
            data, receipt_date=(TODAY - timedelta(days=1)).isoformat(), items=[item(data)] * 2
        ),
    ).json()
    second = client.post(URL, json=body(data)).json()
    session.get(Supplier, data["supplier"]).is_active = False
    session.get(Ingredient, data["ingredient"]).is_active = False
    session.commit()
    filters = {
        "supplier_id": data["supplier"],
        "ingredient_id": data["ingredient"],
        "date_from": (TODAY - timedelta(days=1)).isoformat(),
        "date_to": TODAY.isoformat(),
        "page_size": 1,
    }
    result = client.get(URL, params=filters).json()
    assert result["total"] == 2 and result["items"][0]["id"] == second["id"]
    assert client.get(URL, params=filters | {"page": 2}).json()["items"][0]["id"] == first["id"]
    assert (
        client.get(URL, params=filters | {"receipt_number": first["receipt_number"]}).json()[
            "total"
        ]
        == 1
    )
    assert (
        client.get(URL, params=filters | {"supplier_id": data["supplier"] + 1}).json()["total"] == 0
    )
    for number in ["bad", "GR-999999999999999999999999", "GR-00000000"]:
        assert client.get(URL, params={"receipt_number": number}).json()["total"] == 0
    for kind, key in [("suppliers", "supplier"), ("ingredients", "ingredient")]:
        assert data[key] in [
            row["id"]
            for row in client.get(
                f"{URL}/options/{kind}", params={"include_inactive": True}
            ).json()["items"]
        ]
    for filters in [
        {"date_from": "2026-12-01", "date_to": "2026-11-01"},
        {"supplier_id": 2**63},
        {"ingredient_id": 2**63},
        {"page_size": 101},
    ]:
        assert client.get(URL, params=filters).status_code == 422


def test_fr07_reversal_moved_batches_metadata_and_replay(client, data, session):
    from tests.integration.factories import op_for

    receipt = confirmed_admin(client, data, session)
    ledger = SqlAlchemyStockLedger(session)
    batches = ledger.lock_batches([row["batch_id"] for row in receipt["items"]])
    destination = add_location(session)
    ledger.move(batches[0], destination.id, op_for(data["employee"]))
    session.commit()
    result = client.post(f"{URL}/{receipt['id']}/reverse", json={"reason": "  輸入有誤  "})
    assert result.status_code == 200, result.text
    reversed_receipt = result.json()
    assert reversed_receipt["status"] == "REVERSED"
    assert reversed_receipt["reversal_reason"] == "輸入有誤"
    assert reversed_receipt["reversed_by_id"] == data["employee"]
    assert reversed_receipt["reversed_at"] and reversed_receipt["reversed_by_name"]
    assert (
        client.post(f"{URL}/{receipt['id']}/reverse", json={"reason": "重送"}).json()
        == reversed_receipt
    )
    assert client.get(f"{URL}/{receipt['id']}").json() == reversed_receipt
    session.expire_all()
    txs = list(session.scalars(select(InventoryTransaction)))
    reversals = [tx for tx in txs if tx.type is TransactionType.REVERSAL]
    originals = [tx for tx in txs if tx.type is TransactionType.RECEIPT]
    assert len(reversals) == 2
    assert {tx.reverses_transaction_id for tx in reversals} == {tx.id for tx in originals}
    assert len({tx.operation_group_id for tx in reversals}) == 1
    assert reversals[0].operation_group_id != originals[0].operation_group_id
    assert {tx.reason for tx in reversals} == {"輸入有誤"}
    assert {tx.occurred_at for tx in reversals} == {NOW}
    assert all(batch.remaining_quantity == 0 for batch in session.scalars(select(InventoryBatch)))


@pytest.mark.parametrize("kind", ["ISSUE", "WASTE", "ADJUSTMENT", "zero"])
def test_fr07_any_followup_blocks_even_restored_quantity(client, data, session, kind):
    from tests.integration.factories import op_for

    receipt = confirmed_admin(client, data, session)
    ledger = SqlAlchemyStockLedger(session)
    batch = ledger.lock_batches([receipt["items"][0]["batch_id"]])[0]
    if kind == "zero":
        # 歷史資料若存在零差額異動，仍然屬於後續數量異動。
        session.add(
            InventoryTransaction(
                operation_group_id=op_for(data["employee"]).operation_group_id,
                batch_id=batch.id,
                type=TransactionType.ADJUSTMENT,
                quantity_delta=Decimal(0),
                quantity_before=batch.remaining_quantity,
                quantity_after=batch.remaining_quantity,
                operator_id=data["employee"],
                occurred_at=NOW,
                reason="歷史零差額",
                is_non_fefo=False,
            )
        )
    elif kind == "ADJUSTMENT":
        ledger.adjust(batch, Decimal("1"), op_for(data["employee"]))
        ledger.adjust(batch, batch.initial_quantity, op_for(data["employee"]))
    else:
        ledger.deduct(batch, Decimal("1"), TransactionType(kind), op_for(data["employee"]))
        ledger.adjust(batch, batch.initial_quantity, op_for(data["employee"]))
    session.commit()
    before = count(session, InventoryTransaction)
    result = client.post(f"{URL}/{receipt['id']}/reverse", json={"reason": "更正"})
    assert result.status_code == 422 and result.json()["error"]["code"] == "RULE_VIOLATION"
    assert "盤點" in result.json()["error"]["message"]
    assert count(session, InventoryTransaction) == before
    assert client.get(f"{URL}/{receipt['id']}").json()["status"] == "CONFIRMED"


def test_fr07_reverse_permissions_reason_and_state(client, data, session):
    receipt = client.post(URL, json=body(data)).json()
    url = f"{URL}/{receipt['id']}/reverse"
    assert client.post(url, json={"reason": "更正"}).status_code == 403
    session.get(Employee, data["employee"]).role = EmployeeRole.ADMIN
    session.commit()
    for payload in [{"reason": "  "}, {"reason": "x" * 501}, {"reason": "更正", "extra": 1}]:
        assert client.post(url, json=payload).status_code == 422
    assert client.post(url, json={"reason": "更正"}).status_code == 409
    # 服務層直接呼叫也必須重新驗證角色。
    session.get(Employee, data["employee"]).role = EmployeeRole.STAFF
    session.commit()
    with pytest.raises(DomainError) as error:
        service(session).reverse(receipt["id"], operator_id=data["employee"], reason="更正")
    assert error.value.code is ErrorCode.FORBIDDEN


def test_fr07_second_reversal_failure_rolls_back_whole_receipt(client, data, session, monkeypatch):
    receipt = confirmed_admin(client, data, session)
    original = SqlAlchemyStockLedger.reverse
    calls = []

    def failing(self, tx, op):
        result = original(self, tx, op)
        calls.append(result.id)
        if len(calls) == 2:
            raise DomainError(ErrorCode.STATE_CONFLICT, "第二筆寫入失敗")
        return result

    monkeypatch.setattr(SqlAlchemyStockLedger, "reverse", failing)
    assert client.post(f"{URL}/{receipt['id']}/reverse", json={"reason": "更正"}).status_code == 409
    session.expire_all()
    assert count(session, InventoryTransaction) == 2
    assert all(
        row.remaining_quantity == row.initial_quantity
        for row in session.scalars(select(InventoryBatch))
    )
    assert session.get(GoodsReceipt, receipt["id"]).status is GoodsReceiptStatus.CONFIRMED


@pytest.mark.parametrize("missing", ["batch", "transaction"])
def test_fr07_incomplete_source_refuses_whole_reversal(client, data, session, monkeypatch, missing):
    receipt = confirmed_admin(client, data, session)
    method = "batches" if missing == "batch" else "transactions"
    original = getattr(SqlAlchemyGoodsReceiptRepository, method)
    monkeypatch.setattr(
        SqlAlchemyGoodsReceiptRepository, method, lambda self, ids: original(self, ids)[:1]
    )
    assert client.post(f"{URL}/{receipt['id']}/reverse", json={"reason": "更正"}).status_code == 422
    assert count(session, InventoryTransaction) == 2


def test_fr07_simultaneous_reverse_with_stale_reads(client, data, session):
    receipt = confirmed_admin(client, data, session)
    barrier = Barrier(2)

    def reverse():
        with get_session_factory()() as connection:
            handler = service(connection)
            handler.get(receipt["id"])
            list(connection.scalars(select(InventoryBatch)))
            barrier.wait(10)
            return handler.reverse(
                receipt["id"], operator_id=data["employee"], reason="更正"
            ).status

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert (
            list(executor.map(lambda _: reverse(), range(2))) == [GoodsReceiptStatus.REVERSED] * 2
        )
    assert count(session, InventoryTransaction) == 4


@pytest.mark.parametrize("first", ["reverse", "deduct"])
def test_fr07_reverse_and_deduct_serialize_and_refresh_stale_batch(client, data, session, first):
    from tests.integration.factories import op_for

    receipt = confirmed_admin(client, data, session, lines=1)
    batch_id = receipt["items"][0]["batch_id"]
    locked, release, waiting = Event(), Event(), Event()

    class HoldingLedger(SqlAlchemyStockLedger):
        def lock_batches(self, ids):
            result = super().lock_batches(ids)
            locked.set()
            assert release.wait(10)
            return result

    class WaitingLedger(SqlAlchemyStockLedger):
        def lock_batches(self, ids):
            waiting.set()
            return super().lock_batches(ids)

    def action(kind, ledger_type):
        with get_session_factory()() as connection:
            ledger = ledger_type(connection)
            uow = SqlAlchemyUnitOfWork(connection)
            handler = GoodsReceiptService(
                SqlAlchemyGoodsReceiptRepository(connection), ledger, uow, FixedClock(NOW)
            )
            handler.get(receipt["id"])
            connection.get(InventoryBatch, batch_id)
            try:
                if kind == "reverse":
                    handler.reverse(receipt["id"], operator_id=data["employee"], reason="更正")
                else:
                    with uow.transaction():
                        batch = ledger.lock_batches([batch_id])[0]
                        ledger.deduct(
                            batch, Decimal(1), TransactionType.ISSUE, op_for(data["employee"])
                        )
                return "ok"
            except DomainError as error:
                return error.code

    with ThreadPoolExecutor(max_workers=2) as executor:
        leading = executor.submit(action, first, HoldingLedger)
        assert locked.wait(10)
        following = executor.submit(
            action, "deduct" if first == "reverse" else "reverse", WaitingLedger
        )
        assert waiting.wait(10)
        release.set()
        assert leading.result(10) == "ok"
        assert following.result(10) == (
            ErrorCode.INSUFFICIENT_STOCK if first == "reverse" else ErrorCode.RULE_VIOLATION
        )
    session.expire_all()
    batch = session.get(InventoryBatch, batch_id)
    assert batch.remaining_quantity == (0 if first == "reverse" else Decimal("1.125"))
    assert count(session, InventoryTransaction) == 2


def test_fr07_unrelated_issue_reversal_is_not_receipt_metadata(client, data, session):
    from tests.integration.factories import op_for

    receipt = confirmed_admin(client, data, session, lines=1)
    ledger = SqlAlchemyStockLedger(session)
    batch = ledger.lock_batches([receipt["items"][0]["batch_id"]])[0]
    issue = ledger.deduct(batch, Decimal(1), TransactionType.ISSUE, op_for(data["employee"]))
    ledger.reverse(issue, op_for(data["employee"], "領用沖銷"))
    session.commit()
    for result in [client.get(f"{URL}/{receipt['id']}").json(), client.get(URL).json()["items"][0]]:
        assert result["status"] == "CONFIRMED"
        assert result["reversed_at"] is None
        assert result["reversal_reason"] is None
        assert result["reversed_by_name"] is None


@pytest.mark.parametrize("page", [2**63, 10**100])
def test_fr07_extreme_page_is_controlled_validation_error(client, page):
    for suffix in ["", "/options/suppliers"]:
        assert client.get(URL + suffix, params={"page": page, "page_size": 100}).status_code == 422


def test_fr07_independent_and_combined_filter_predicates(client, data, session):
    other_supplier = Supplier(name="其他供應商", is_active=True)
    session.add(other_supplier)
    other_ingredient = add_ingredient(session)
    session.commit()

    def add(day, supplier=None, ingredient=None, status="DRAFT"):
        result = client.post(
            URL,
            json=body(
                data,
                supplier_id=supplier or data["supplier"],
                receipt_date=day.isoformat(),
                items=[item(data, ingredient_id=ingredient or data["ingredient"])] * 2,
            ),
        ).json()
        if status != "DRAFT":
            assert client.post(f"{URL}/{result['id']}/confirm").status_code == 200
        if status == "REVERSED":
            assert (
                client.post(f"{URL}/{result['id']}/reverse", json={"reason": "更正"}).status_code
                == 200
            )
        return result["id"]

    session.get(Employee, data["employee"]).role = EmployeeRole.ADMIN
    session.commit()
    old = TODAY - timedelta(days=2)
    middle = TODAY - timedelta(days=1)
    a = add(old)
    b = add(middle, status="CONFIRMED")
    c = add(TODAY, status="REVERSED")
    d = add(middle, supplier=other_supplier.id)
    e = add(middle, ingredient=other_ingredient.id)
    cases = [
        ({}, [c, e, d, b, a]),
        ({"date_from": middle.isoformat()}, [c, e, d, b]),
        ({"date_to": middle.isoformat()}, [e, d, b, a]),
        ({"date_from": middle.isoformat(), "date_to": middle.isoformat()}, [e, d, b]),
        ({"supplier_id": data["supplier"]}, [c, e, b, a]),
        ({"ingredient_id": data["ingredient"]}, [c, d, b, a]),
        (
            {
                "date_from": middle.isoformat(),
                "date_to": middle.isoformat(),
                "supplier_id": data["supplier"],
                "ingredient_id": data["ingredient"],
            },
            [b],
        ),
        ({"receipt_number": f"GR-{c:08d}", "supplier_id": other_supplier.id}, []),
    ]
    # 日期降冪，同日 id 降冪。
    for filters, expected in cases:
        result = client.get(URL, params=filters).json()
        assert result["total"] == len(expected), filters
        assert [row["id"] for row in result["items"]] == expected, filters
    result = client.get(URL).json()
    assert {row["status"] for row in result["items"]} == {"DRAFT", "CONFIRMED", "REVERSED"}
