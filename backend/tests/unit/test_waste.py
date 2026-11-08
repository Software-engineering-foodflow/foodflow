"""報廢規則及 API 權限；fake 不宣稱驗證真實回滾。"""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.clock import FixedClock
from app.core.enums import EmployeeRole, ErrorCode, WasteReason
from app.core.errors import DomainError
from app.db.models import Employee, Ingredient, InventoryBatch
from app.main import create_app
from app.modules.auth.dependencies import get_current_employee
from app.modules.waste.dependencies import get_waste_service
from app.modules.waste.repository import WasteRepository
from app.modules.waste.schemas import waste_response
from app.modules.waste.service import WasteService
from tests.fakes.fake_stock_ledger import FakeStockLedger
from tests.fakes.fake_uow import FakeUnitOfWork

NOW = datetime(2026, 11, 6, tzinfo=UTC)


@pytest.fixture
def setup():
    employee = Employee(id=1, name="員工", role=EmployeeRole.STAFF)
    ingredient = Ingredient(id=1, name="雞肉", unit="公斤", is_active=False)
    batch = InventoryBatch(
        id=1,
        batch_number="B-1",
        ingredient_id=1,
        ingredient=ingredient,
        remaining_quantity=Decimal("2"),
        unit_price=Decimal("120"),
        expiry_date=date(2026, 11, 1),
    )
    ledger = FakeStockLedger()
    ledger.add_batch(batch)
    uow = FakeUnitOfWork(ledger)
    repo = Mock(spec=WasteRepository)
    records = []

    def add(record):
        record.id = len(records) + 1
        record.batch = batch
        record.operator = employee
        record.transaction = ledger.transactions[-1]
        records.append(record)
        return record

    repo.add.side_effect = add
    repo.by_transaction.side_effect = lambda tid: next(
        (r for r in records if r.transaction_id == tid), None
    )
    service = WasteService(repo, ledger, uow, FixedClock(NOW))
    return service, ledger, uow, repo, batch, employee


def create(setup, **kwargs):
    values = dict(
        batch_id=1,
        quantity=Decimal("2"),
        reason=WasteReason.EXPIRED,
        note=None,
        operator_id=1,
        key=uuid4(),
    )
    return setup[0].create(**(values | kwargs))


def test_all_waste_known_cost_and_inactive_ingredient_history(setup):
    result = create(setup)
    assert result.loss_amount == Decimal("240.00")
    assert result.occurred_at == NOW
    assert setup[4].remaining_quantity == 0
    assert len(setup[1].transactions) == 1
    assert setup[1].transactions[0].quantity_before == 2
    assert setup[1].transactions[0].reason == "過期"
    assert setup[2].commits == 1
    assert "loss_amount" not in waste_response(result, False).model_dump(mode="json")
    assert waste_response(result, True).model_dump(mode="json")["loss_amount"] == "240.00"


@pytest.mark.parametrize(("price", "expected"), [(None, None), ("0", "0.00"), ("1.01", "0.51")])
def test_unknown_zero_and_half_up(setup, price, expected):
    setup[4].unit_price = None if price is None else Decimal(price)
    result = create(setup, quantity=Decimal("0.5"))
    assert result.loss_amount == (None if expected is None else Decimal(expected))


@pytest.mark.parametrize("quantity", ["0", "-1", "1.2345", "1000000000", "NaN"])
def test_invalid_quantity_does_not_deduct(setup, quantity):
    with pytest.raises(DomainError) as caught:
        create(setup, quantity=Decimal(quantity))
    assert caught.value.code == ErrorCode.RULE_VIOLATION
    assert not setup[1].transactions
    assert setup[2].rollbacks == 1


def test_other_requires_non_blank_note(setup):
    with pytest.raises(DomainError) as caught:
        create(setup, reason=WasteReason.OTHER, note="  ")
    assert caught.value.fields[0].field == "note"
    assert not setup[1].transactions


def test_excess_returns_latest_quantity(setup):
    with pytest.raises(DomainError) as caught:
        create(setup, quantity=Decimal("3"))
    assert caught.value.code == ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details["remaining_quantity"] == "2.000"
    assert not setup[1].transactions


def test_replay_after_later_change_uses_original_quantity_after(setup):
    key = uuid4()
    first = create(setup, quantity=Decimal("1"), key=key)
    create(setup, quantity=Decimal("1"))
    replay = create(setup, quantity=Decimal("1.000"), key=key)
    assert replay.id == first.id
    assert replay.transaction.quantity_after == 1
    assert setup[4].remaining_quantity == 0
    assert len(setup[1].transactions) == 2


@pytest.mark.parametrize(
    "changed",
    [
        {"quantity": Decimal("1")},
        {"reason": WasteReason.SPOILED},
        {"note": "不同"},
        {"operator_id": 2},
        {"batch_id": 2},
    ],
)
def test_replay_changed_content_or_actor_is_duplicate(setup, changed):
    key = uuid4()
    create(setup, key=key)
    with pytest.raises(DomainError) as caught:
        create(setup, key=key, **changed)
    assert caught.value.code == ErrorCode.DUPLICATE
    assert len(setup[1].transactions) == 1


@pytest.fixture
def client(setup):
    app = create_app()
    app.dependency_overrides[get_current_employee] = lambda: setup[5]
    app.dependency_overrides[get_waste_service] = lambda: setup[0]
    return TestClient(app)


@pytest.mark.parametrize(
    "payload",
    [
        {"batch_id": True},
        {"batch_id": "1"},
        {"batch_id": 1.0},
        {"quantity": "0"},
        {"quantity": "-1"},
        {"quantity": "1.2345"},
        {"quantity": 1},
        {"quantity": "1e2"},
        {"reason": ""},
        {"reason": "OTHER", "note": " "},
    ],
)
def test_api_rejects_bad_fields(client, setup, payload):
    body = {"batch_id": 1, "quantity": "1", "reason": "EXPIRED"} | payload
    response = client.post(
        "/api/v1/waste-records", json=body, headers={"Idempotency-Key": str(uuid4())}
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"]
    assert not setup[1].transactions


def test_api_staff_create_list_detail_never_include_cost(client, setup):
    response = client.post(
        "/api/v1/waste-records",
        json={"batch_id": 1, "quantity": "2", "reason": "EXPIRED"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 200
    assert "loss_amount" not in response.json()
    record = setup[3].add.call_args.args[0]
    setup[3].get.return_value = record
    setup[3].list_records.return_value = ([record], 1)
    assert "loss_amount" not in client.get("/api/v1/waste-records/1").text
    assert "loss_amount" not in client.get("/api/v1/waste-records").text
    setup[5].role = EmployeeRole.ADMIN
    assert client.get("/api/v1/waste-records/1").json()["loss_amount"] == "240.00"


def test_staff_cannot_read_waste_distribution(client):
    assert (
        client.get("/api/v1/reports/waste?start_date=2026-11-01&end_date=2026-11-06").status_code
        == 403
    )


def test_header_required_and_replay_200(client):
    body = {"batch_id": 1, "quantity": "2", "reason": "EXPIRED"}
    assert client.post("/api/v1/waste-records", json=body).status_code == 422
    headers = {"Idempotency-Key": str(uuid4())}
    first = client.post("/api/v1/waste-records", json=body, headers=headers)
    second = client.post("/api/v1/waste-records", json=body, headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


def test_large_loss_amount_matches_published_response_schema(setup):
    import re

    from app.modules.waste.schemas import AdminWasteResponse

    setup[4].unit_price = Decimal("5000000000")
    result = waste_response(create(setup), True).model_dump(mode="json")
    assert result["loss_amount"] == "10000000000.00"
    schema = AdminWasteResponse.model_json_schema()["properties"]["loss_amount"]
    pattern = next(t["pattern"] for t in schema["anyOf"] if t["type"] == "string")
    assert re.fullmatch(pattern, result["loss_amount"])
