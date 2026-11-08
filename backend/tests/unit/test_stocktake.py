"""盤點規則及 API 契約；fake 只驗先驗後寫，不宣稱 PostgreSQL 回滾。"""

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.core.clock import FixedClock
from app.core.enums import EmployeeRole, ErrorCode, GoodsReceiptStatus
from app.core.errors import DomainError
from app.db.models import Employee, InventoryBatch
from app.main import create_app
from app.modules.auth.dependencies import get_current_employee
from app.modules.stocktake.dependencies import get_stocktake_service
from app.modules.stocktake.repository import StocktakeRepository
from app.modules.stocktake.service import ConfirmLine, CountLine, StocktakeService
from tests.fakes.fake_stock_ledger import FakeStockLedger
from tests.fakes.fake_uow import FakeUnitOfWork

NOW = datetime(2026, 11, 7, tzinfo=UTC)


@pytest.fixture
def setup():
    ledger = FakeStockLedger()
    for batch_id, quantity in [(1, "8"), (2, "2")]:
        ledger.add_batch(
            InventoryBatch(
                id=batch_id,
                batch_number=f"B-{batch_id}",
                remaining_quantity=Decimal(quantity),
            )
        )
    uow = FakeUnitOfWork(ledger)
    repo = Mock(spec=StocktakeRepository)

    def states(ids):
        assert uow.active
        return {bid: GoodsReceiptStatus.CONFIRMED for bid in ids}

    def versions(ids):
        assert uow.active
        return {tx.batch_id: tx.id for tx in ledger.transactions if tx.batch_id in ids}

    repo.source_states.side_effect = states
    repo.latest_transactions.side_effect = versions
    clock = Mock(wraps=FixedClock(NOW))
    service = StocktakeService(repo, ledger, uow, clock)
    employee = Employee(id=1, name="管理者", role=EmployeeRole.ADMIN)
    return service, ledger, uow, repo, clock, employee


def inputs():
    return [CountLine(1, Decimal("7"), "  重新秤重  "), CountLine(2, Decimal("3"), "核對")]


def confirmed(previews):
    return [
        ConfirmLine(
            p.batch_id,
            p.actual_quantity,
            p.reason,
            p.expected_quantity,
            p.expected_transaction_id,
        )
        for p in previews
    ]


def test_preview_does_not_write_and_confirm_uses_one_time_group(setup):
    service, ledger, uow, repo, clock, _ = setup
    preview = service.preview(inputs())
    assert [p.expected_quantity for p in preview] == [Decimal("8"), Decimal("2")]
    assert [p.quantity_delta for p in preview] == [Decimal("-1"), Decimal("1")]
    assert [p.expected_transaction_id for p in preview] == [None, None]
    assert not ledger.transactions
    clock.now.assert_not_called()
    result = service.confirm(confirmed(preview), 1)
    assert len(ledger.transactions) == 2
    assert {tx.operation_group_id for tx in ledger.transactions} == {result.operation_group_id}
    assert {tx.occurred_at for tx in ledger.transactions} == {NOW}
    assert [tx.reason for tx in ledger.transactions] == ["重新秤重", "核對"]
    assert [r.quantity_after for r in result.lines] == [Decimal("7"), Decimal("3")]
    assert uow.commits == 2
    clock.now.assert_called_once()


def test_no_difference_does_not_create_transaction_and_can_replay(setup):
    service, ledger, *_ = setup
    preview = service.preview([CountLine(1, Decimal("8"), "核對相符")])
    for _ in range(2):
        result = service.confirm(confirmed(preview), 1)
        assert result.lines[0].transaction_id is None
        assert result.lines[0].quantity_delta == 0
        assert result.lines[0].quantity_after == 8
    assert not ledger.transactions


def test_changed_successful_preview_cannot_replay(setup):
    service, ledger, *_ = setup
    preview = confirmed(service.preview(inputs()))
    first = service.confirm(preview, 1)
    with pytest.raises(DomainError, match="庫存已變更") as caught:
        service.confirm(preview, 1)
    assert caught.value.code == ErrorCode.STALE_QUANTITY
    assert caught.value.details["current_quantity"] == "7.000"
    assert len(ledger.transactions) == 2
    assert first.lines[0].quantity_after == 7


@pytest.mark.parametrize("aba", [False, True])
def test_stale_second_line_validates_all_before_first_adjust(setup, aba):
    service, ledger, uow, repo, *_ = setup
    original = confirmed(service.preview(inputs()))
    # 模擬另一已提交操作；同量改回時量相同但版本不相同。
    repo.latest_transactions.side_effect = None
    repo.latest_transactions.return_value = {2: 99}
    if not aba:
        original[1] = replace(original[1], expected_quantity=Decimal("1"))
    adjust = Mock(wraps=ledger.adjust)
    ledger.adjust = adjust
    with pytest.raises(DomainError) as caught:
        service.confirm(original, 1)
    assert caught.value.code == ErrorCode.STALE_QUANTITY
    assert caught.value.details == {
        "batch_id": 2,
        "current_quantity": "2.000",
        "current_transaction_id": 99,
    }
    adjust.assert_not_called()
    assert uow.rollbacks == 1


def test_reversed_second_batch_validates_all_before_adjust(setup):
    service, ledger, uow, repo, *_ = setup
    original = confirmed(service.preview(inputs()))
    repo.source_states.side_effect = None
    repo.source_states.return_value = {
        1: GoodsReceiptStatus.CONFIRMED,
        2: GoodsReceiptStatus.REVERSED,
    }
    with pytest.raises(DomainError) as caught:
        service.confirm(original, 1)
    assert caught.value.code == ErrorCode.RULE_VIOLATION
    assert not ledger.transactions
    assert uow.rollbacks == 1


@pytest.mark.parametrize("quantity", ["-1", "1.2345", "1000000000", "NaN", "Infinity"])
def test_invalid_decimal_rejected_without_writes(setup, quantity):
    service, ledger, *_ = setup
    with pytest.raises(DomainError):
        service.preview([CountLine(1, Decimal(quantity), "核對")])
    assert not ledger.transactions


def test_zero_actual_quantity_is_legal(setup):
    service, ledger, *_ = setup
    preview = service.preview([CountLine(1, Decimal("0"), "盤點為零")])
    result = service.confirm(confirmed(preview), 1)
    assert result.lines[0].quantity_after == 0
    assert ledger.transactions[0].quantity_delta == -8


def test_missing_batch_is_not_found(setup):
    with pytest.raises(DomainError) as caught:
        setup[0].preview([CountLine(999, Decimal("0"), "核對")])
    assert caught.value.code == ErrorCode.NOT_FOUND


@pytest.fixture
def client(setup):
    app = create_app()
    app.dependency_overrides[get_current_employee] = lambda: setup[5]
    app.dependency_overrides[get_stocktake_service] = lambda: setup[0]
    return TestClient(app)


def body(**overrides):
    return {"lines": [{"batch_id": 1, "actual_quantity": "7", "reason": "核對"} | overrides]}


@pytest.mark.parametrize(
    "change",
    [
        {"actual_quantity": "-1"},
        {"actual_quantity": "1.2345"},
        {"actual_quantity": 1},
        {"actual_quantity": "1e1"},
        {"actual_quantity": "1000000000"},
        {"reason": " \t "},
        {"reason": "x" * 2001},
        {"batch_id": 0},
        {"batch_id": True},
    ],
)
def test_api_invalid_fields(client, setup, change):
    response = client.post("/api/v1/stocktakes/preview", json=body(**change))
    assert response.status_code == 422
    assert response.json()["error"]["fields"]
    assert not setup[1].transactions


def test_api_duplicate_and_empty_lines(client):
    duplicate = body()
    duplicate["lines"] *= 2
    for payload in [duplicate, {"lines": []}]:
        assert client.post("/api/v1/stocktakes/preview", json=payload).status_code == 422


def test_api_preview_confirm_and_stale_serialization(client):
    preview = client.post("/api/v1/stocktakes/preview", json=body())
    assert preview.status_code == 200
    line = preview.json()["lines"][0]
    assert line["expected_quantity"] == "8.000"
    assert line["quantity_delta"] == "-1.000"
    assert line["expected_transaction_id"] is None
    line.pop("quantity_delta")
    response = client.post("/api/v1/stocktakes", json={"lines": [line]})
    assert response.status_code == 200
    assert response.json()["lines"][0]["quantity_after"] == "7.000"
    stale = client.post("/api/v1/stocktakes", json={"lines": [line]})
    assert stale.status_code == 409
    assert stale.json()["error"]["details"]["current_quantity"] == "7.000"


def test_api_reversed_returns_422(client, setup):
    setup[3].source_states.side_effect = None
    setup[3].source_states.return_value = {1: GoodsReceiptStatus.REVERSED}
    for path, payload in [
        ("/preview", body()),
        ("", body(expected_quantity="8", expected_transaction_id=None)),
    ]:
        response = client.post("/api/v1/stocktakes" + path, json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "RULE_VIOLATION"
    assert not setup[1].transactions


def test_api_version_is_required_nullable_positive_integer(client):
    for values in [{}, {"expected_transaction_id": 0}, {"expected_transaction_id": True}]:
        response = client.post(
            "/api/v1/stocktakes",
            json=body(expected_quantity="8", **values),
        )
        assert response.status_code == 422


@pytest.mark.parametrize("role", ["staff", "anonymous"])
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/batches"),
        ("post", "/preview"),
        ("post", ""),
    ],
)
def test_all_routes_enforce_admin(client, setup, role, method, path):
    if role == "staff":
        setup[5].role = EmployeeRole.STAFF
    else:

        def unauthenticated():
            raise DomainError(ErrorCode.UNAUTHENTICATED, "請登入")

        client.app.dependency_overrides[get_current_employee] = unauthenticated
    kwargs = (
        {"json": body(expected_quantity="8", expected_transaction_id=None)}
        if method == "post"
        else {}
    )
    response = getattr(client, method)("/api/v1/stocktakes" + path, **kwargs)
    assert response.status_code == (403 if role == "staff" else 401)
    assert not setup[1].transactions
    setup[3].source_states.assert_not_called()
