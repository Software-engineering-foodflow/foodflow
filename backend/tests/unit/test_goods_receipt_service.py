from dataclasses import replace
from datetime import timedelta
from decimal import Decimal
from itertools import count

import pytest

from app.core.clock import FixedClock
from app.core.enums import EmployeeRole, ErrorCode, GoodsReceiptStatus
from app.core.errors import DomainError
from app.db.models import Employee, Ingredient, StorageLocation, Supplier
from app.modules.goods_receipt.repository import GoodsReceiptRepository
from app.modules.goods_receipt.service import GoodsReceiptService, ReceiptItemInput
from tests.fakes.fake_stock_ledger import FakeStockLedger
from tests.fakes.fake_uow import FakeUnitOfWork
from tests.integration.factories import NOW, TODAY


class FakeReceiptRepository(GoodsReceiptRepository):
    def __init__(self):
        self.receipts = {}
        self.employees = {}
        self.ledger = None
        self.list_filters = None
        self.suppliers = {1: Supplier(id=1, name="供應商", is_active=True)}
        self.ingredients = {1: Ingredient(id=1, name="食材", unit="kg", is_active=True)}
        self.locations = {1: StorageLocation(id=1, name="位置", is_active=True)}
        self.ids = count(1)
        self.item_ids = count(1)
        self.locks = []

    def list(self, **filters):
        self.list_filters = filters
        return list(self.receipts.values()), len(self.receipts)

    def employee(self, employee_id):
        return self.employees.get(employee_id)

    def batches(self, item_ids):
        return [batch for batch in self.ledger.batches.values() if batch.source_item_id in item_ids]

    def transactions(self, batch_ids):
        return [tx for tx in self.ledger.transactions if tx.batch_id in batch_ids]

    def get(self, receipt_id):
        return self.receipts.get(receipt_id)

    def lock(self, receipt_id):
        self.locks.append(receipt_id)
        return self.get(receipt_id)

    def supplier(self, supplier_id):
        return self.suppliers.get(supplier_id)

    def ingredient(self, ingredient_id):
        return self.ingredients.get(ingredient_id)

    def location(self, location_id):
        return self.locations.get(location_id)

    def options(self, kind, search, page, page_size, include_inactive=False):
        return [], 0

    def add(self, receipt):
        receipt.id = next(self.ids)
        self.receipts[receipt.id] = receipt
        self.flush()

    def delete_item(self, item):
        pass

    def delete(self, receipt):
        del self.receipts[receipt.id]

    def flush(self):
        for receipt in self.receipts.values():
            for item in receipt.items:
                if item.id is None:
                    item.id = next(self.item_ids)
                    item.receipt_id = receipt.id


@pytest.fixture
def setup():
    repo = FakeReceiptRepository()
    ledger = FakeStockLedger({1: TODAY})
    repo.ledger = ledger
    uow = FakeUnitOfWork(ledger)
    service = GoodsReceiptService(repo, ledger, uow, FixedClock(NOW))
    return service, repo, ledger, uow


def line(**overrides):
    return replace(ReceiptItemInput(1, Decimal("2.125"), Decimal("0"), TODAY, 1), **overrides)


def create(service, items=None, **overrides):
    return service.create(
        **(
            {"supplier_id": 1, "receipt_date": TODAY, "items": items or [line()], "operator_id": 7}
            | overrides
        )
    )


def test_draft_and_confirmation_share_operation_and_are_idempotent(setup):
    service, repo, ledger, uow = setup
    receipt = create(service, [line(), line(unit_price=None)])
    assert ledger.batches == {}
    service.confirm(receipt.id, operator_id=9)
    assert len(ledger.batches) == len(ledger.transactions) == 2
    assert {tx.operator_id for tx in ledger.transactions} == {9}
    assert {tx.occurred_at for tx in ledger.transactions} == {NOW}
    assert len({tx.operation_group_id for tx in ledger.transactions}) == 1
    assert [batch.unit_price for batch in ledger.batches.values()] == [Decimal("0"), None]
    repo.suppliers[1].is_active = False
    assert service.confirm(receipt.id, operator_id=10) is receipt
    assert len(ledger.transactions) == 2
    assert repo.locks == [receipt.id, receipt.id]
    assert uow.rollbacks == 0


@pytest.mark.parametrize(
    "override,field",
    [
        ({"quantity": Decimal("0")}, "quantity"),
        ({"quantity": Decimal("-1")}, "quantity"),
        ({"quantity": Decimal("1.2345")}, "quantity"),
        ({"unit_price": Decimal("-1")}, "unit_price"),
        ({"unit_price": Decimal("1.234")}, "unit_price"),
        ({"ingredient_id": 999}, "ingredient_id"),
        ({"location_id": 999}, "location_id"),
    ],
)
def test_invalid_line_is_rejected_before_write(setup, override, field):
    service, repo, ledger, uow = setup
    with pytest.raises(DomainError) as failure:
        create(service, [line(**override)])
    assert failure.value.fields[0].field == f"items.0.{field}"
    assert repo.receipts == {} and ledger.transactions == []
    assert uow.rollbacks == 1


def test_incomplete_draft_can_be_saved_but_not_confirmed(setup):
    service, _, ledger, _ = setup
    receipt = create(service, [ReceiptItemInput(1)])
    with pytest.raises(DomainError) as failure:
        service.confirm(receipt.id, operator_id=7)
    assert {field.field for field in failure.value.fields} == {
        "items.0.quantity",
        "items.0.expiry_date",
        "items.0.location_id",
    }
    assert receipt.status is GoodsReceiptStatus.DRAFT
    assert not ledger.transactions


@pytest.mark.parametrize("kind", ["supplier", "ingredient", "location"])
def test_confirmation_revalidates_deactivated_master_data(setup, kind):
    service, repo, ledger, _ = setup
    receipt = create(service)
    getattr(
        repo, {"supplier": "suppliers", "ingredient": "ingredients", "location": "locations"}[kind]
    )[1].is_active = False
    with pytest.raises(DomainError):
        service.confirm(receipt.id, operator_id=7)
    assert not ledger.transactions


def test_future_receipt_and_expired_confirmation_are_rejected(setup):
    service, _, _, _ = setup
    with pytest.raises(DomainError):
        create(service, receipt_date=TODAY + timedelta(days=1))
    receipt = create(service, [line(expiry_date=TODAY - timedelta(days=1))])
    with pytest.raises(DomainError) as failure:
        service.confirm(receipt.id, operator_id=7)
    assert failure.value.fields[0].field == "items.0.expiry_date"


def test_update_preserves_ids_and_rejects_foreign_or_duplicate_ids(setup):
    service, _, _, _ = setup
    receipt = create(service, [line(), line()])
    retained = receipt.items[1].id
    service.update(receipt.id, supplier_id=1, receipt_date=TODAY, items=[line(id=retained), line()])
    assert receipt.items[0].id == retained
    assert receipt.items[1].id > retained
    for items in ([line(id=999)], [line(id=retained), line(id=retained)]):
        with pytest.raises(DomainError):
            service.update(receipt.id, supplier_id=1, receipt_date=TODAY, items=items)


@pytest.mark.parametrize("status", [GoodsReceiptStatus.CONFIRMED, GoodsReceiptStatus.REVERSED])
def test_non_draft_update_delete_conflict_precedes_reference_validation(setup, status):
    service, _, _, _ = setup
    receipt = create(service)
    receipt.status = status
    for action in (
        lambda: service.update(receipt.id, supplier_id=999, receipt_date=TODAY, items=[line()]),
        lambda: service.delete(receipt.id),
    ):
        with pytest.raises(DomainError) as failure:
            action()
        assert failure.value.code is ErrorCode.STATE_CONFLICT
    if status is GoodsReceiptStatus.REVERSED:
        with pytest.raises(DomainError):
            service.confirm(receipt.id, operator_id=7)


def test_missing_receipt_is_404(setup):
    service, _, _, _ = setup
    for action in (
        lambda: service.get(999),
        lambda: service.delete(999),
        lambda: service.confirm(999, operator_id=7),
    ):
        with pytest.raises(DomainError) as failure:
            action()
        assert failure.value.code is ErrorCode.NOT_FOUND


@pytest.mark.parametrize(
    "operator",
    [
        None,
        Employee(id=8, role=EmployeeRole.ADMIN, is_active=False),
        Employee(id=8, role=EmployeeRole.STAFF, is_active=True),
    ],
)
def test_fr07_service_rejects_missing_inactive_and_non_admin(setup, operator):
    handler, repo, ledger, _ = setup
    receipt = create(handler)
    if operator:
        repo.employees[8] = operator
    with pytest.raises(DomainError) as error:
        handler.reverse(receipt.id, operator_id=8, reason="更正")
    assert error.value.code is ErrorCode.FORBIDDEN
    assert not ledger.transactions


@pytest.mark.parametrize("reason", ["", "  ", "x" * 501])
def test_fr07_service_invalid_reason_rejected_before_write(setup, reason):
    handler, _, ledger, _ = setup
    with pytest.raises(DomainError) as error:
        handler.reverse(1, operator_id=8, reason=reason)
    assert error.value.code is ErrorCode.VALIDATION_ERROR
    assert not ledger.transactions


def test_fr07_service_trim_reason_and_reversed_replay(setup):
    handler, repo, ledger, _ = setup
    repo.employees[8] = Employee(id=8, role=EmployeeRole.ADMIN, is_active=True)
    receipt = create(handler, [line(), line()])
    handler.confirm(receipt.id, operator_id=7)
    result = handler.reverse(receipt.id, operator_id=8, reason="  誤登  ")
    assert result.status is GoodsReceiptStatus.REVERSED
    assert [tx.reason for tx in ledger.transactions[2:]] == ["誤登", "誤登"]
    original_transactions = list(ledger.transactions)
    assert handler.reverse(receipt.id, operator_id=8, reason="另一原因") is result
    assert ledger.transactions == original_transactions


def test_fr07_service_missing_receipt_and_reversed_date_range(setup):
    handler, repo, ledger, _ = setup
    repo.employees[8] = Employee(id=8, role=EmployeeRole.ADMIN, is_active=True)
    with pytest.raises(DomainError) as error:
        handler.reverse(999, operator_id=8, reason="更正")
    assert error.value.code is ErrorCode.NOT_FOUND
    with pytest.raises(DomainError) as error:
        handler.list(
            receipt_number="",
            date_from=TODAY,
            date_to=TODAY - timedelta(days=1),
            supplier_id=None,
            ingredient_id=None,
            page=1,
            page_size=20,
        )
    assert error.value.code is ErrorCode.VALIDATION_ERROR
    assert repo.list_filters is None
    assert not ledger.transactions
