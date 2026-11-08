"""整批換位置規則（FR-05、A3），不連資料庫；列鎖等待與真實寫入在 PostgreSQL 整合測試驗證。"""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.core.clock import FixedClock
from app.core.enums import ErrorCode, ExpiryStatus, GoodsReceiptStatus, StorageType
from app.core.errors import DomainError
from app.db.models import InventoryBatch, StorageLocation
from app.modules.storage_location.service import BatchRelocationService
from tests.fakes.fake_stock_ledger import FakeStockLedger
from tests.fakes.fake_uow import FakeUnitOfWork
from tests.unit.test_storage_location_service import FakeRepository

NOW = datetime(2026, 11, 6, 2, 0, tzinfo=UTC)
OPERATOR_ID = 7


class FakeRelocationRepository(FakeRepository):
    def __init__(self, ledger: FakeStockLedger) -> None:
        super().__init__()
        self.ledger = ledger
        self.statuses: dict[int, GoodsReceiptStatus] = {}

    def list_location_batches(self, location_id, page, page_size):
        items = sorted(
            (
                batch
                for batch in self.ledger.batches.values()
                if batch.current_location_id == location_id and batch.remaining_quantity > 0
            ),
            key=lambda batch: (batch.expiry_date, batch.id),
        )
        return items, len(items)

    def load_batch(self, batch_id):
        return self.ledger.batches[batch_id]

    def source_status(self, source_item_id):
        return self.statuses.get(source_item_id, GoodsReceiptStatus.CONFIRMED)


@pytest.fixture
def ledger() -> FakeStockLedger:
    return FakeStockLedger()


@pytest.fixture
def uow(ledger) -> FakeUnitOfWork:
    return FakeUnitOfWork(ledger)


@pytest.fixture
def repo(ledger) -> FakeRelocationRepository:
    repo = FakeRelocationRepository(ledger)
    for code in ("A", "B"):
        repo.add(
            StorageLocation(
                code=code, name=f"位置{code}", storage_type=StorageType.REFRIGERATED, is_active=True
            )
        )
    return repo


@pytest.fixture
def service(repo, ledger, uow) -> BatchRelocationService:
    return BatchRelocationService(repo, ledger, uow, FixedClock(NOW))


def _batch(ledger, *, location_id=1, remaining="5", expiry=date(2026, 11, 20), item_id=None):
    batch = InventoryBatch(
        batch_number="B-1",
        source_item_id=item_id or len(ledger.batches) + 100,
        ingredient_id=1,
        expiry_date=expiry,
        received_date=date(2026, 11, 1),
        current_location_id=location_id,
        unit_price=None,
        initial_quantity=Decimal("5"),
        remaining_quantity=Decimal(remaining),
    )
    return ledger.add_batch(batch)


def _move(service, batch_id, to_location_id=2, reason="冷藏庫整理"):
    return service.move(
        batch_id, to_location_id=to_location_id, reason=reason, operator_id=OPERATOR_ID
    )


def _code(exc_info) -> ErrorCode:
    return exc_info.value.code


def test_move_records_change_and_keeps_quantity(service, ledger, uow) -> None:
    batch = _batch(ledger)

    result = _move(service, batch.id)

    assert result is batch
    assert (batch.current_location_id, batch.remaining_quantity) == (2, Decimal("5"))
    assert batch.expiry_date == date(2026, 11, 20)
    [change] = ledger.location_changes
    assert (change.from_location_id, change.to_location_id) == (1, 2)
    assert (change.operator_id, change.occurred_at, change.reason) == (
        OPERATOR_ID,
        NOW,
        "冷藏庫整理",
    )
    assert ledger.transactions == []
    assert uow.commits == 1


def test_same_location_returns_batch_without_record(service, ledger, repo) -> None:
    batch = _batch(ledger, location_id=2)
    repo.locations[1].is_active = False  # 同位置時不檢查目標，也不鎖位置

    assert _move(service, batch.id).current_location_id == 2
    assert ledger.location_changes == []
    assert repo.locked == []


@pytest.mark.parametrize("target", ["missing", "inactive"])
def test_invalid_target_is_rule_violation(service, ledger, repo, uow, target) -> None:
    batch = _batch(ledger)
    to_location_id = 99 if target == "missing" else 2
    repo.locations[1].is_active = False

    with pytest.raises(DomainError) as exc_info:
        _move(service, batch.id, to_location_id=to_location_id)

    assert _code(exc_info) is ErrorCode.RULE_VIOLATION
    assert [field.field for field in exc_info.value.fields] == ["to_location_id"]
    assert batch.current_location_id == 1
    assert repo.locked == [to_location_id]
    assert (uow.commits, uow.rollbacks) == (0, 1)


def test_reversed_source_is_rule_violation(service, ledger, repo, uow) -> None:
    batch = _batch(ledger, item_id=500)
    repo.statuses[500] = GoodsReceiptStatus.REVERSED

    with pytest.raises(DomainError) as exc_info:
        _move(service, batch.id)

    assert _code(exc_info) is ErrorCode.RULE_VIOLATION
    assert "沖銷" in exc_info.value.message
    assert ledger.location_changes == []
    assert (uow.commits, uow.rollbacks) == (0, 1)


def test_exhausted_batch_is_rule_violation(service, ledger, uow) -> None:
    batch = _batch(ledger, remaining="0")

    with pytest.raises(DomainError) as exc_info:
        _move(service, batch.id)

    assert _code(exc_info) is ErrorCode.RULE_VIOLATION
    assert ledger.location_changes == []
    assert (uow.commits, uow.rollbacks) == (0, 1)


def test_unknown_batch_is_not_found(service, uow) -> None:
    with pytest.raises(DomainError) as exc_info:
        _move(service, 999)
    assert _code(exc_info) is ErrorCode.NOT_FOUND
    assert (uow.commits, uow.rollbacks) == (0, 1)


def test_list_batches_only_stocked_sorted_by_expiry(service, ledger) -> None:
    later = _batch(ledger, expiry=date(2026, 12, 1))
    sooner = _batch(ledger, expiry=date(2026, 11, 10))
    _batch(ledger, remaining="0")
    _batch(ledger, location_id=2)

    items, total = service.list_batches(1, 1, 50)

    assert ([item.batch for item in items], total) == ([sooner, later], 2)


@pytest.mark.parametrize(
    ("expiry", "status", "days"),
    [
        (date(2026, 11, 5), ExpiryStatus.EXPIRED, -1),
        (date(2026, 11, 6), ExpiryStatus.EXPIRES_TODAY, 0),
        (date(2026, 11, 9), ExpiryStatus.EXPIRING_SOON, 3),
        (date(2026, 11, 10), ExpiryStatus.NORMAL, 4),
    ],
)
def test_list_batches_classifies_expiry_with_clock_and_warning_days(
    service, ledger, expiry, status, days
) -> None:
    _batch(ledger, expiry=expiry)

    [item], _ = service.list_batches(1, 1, 50)

    assert (item.expiry_status, item.days_until_expiry) == (status, days)


def test_list_batches_of_unknown_location_is_not_found(service) -> None:
    with pytest.raises(DomainError) as exc_info:
        service.list_batches(99, 1, 50)
    assert _code(exc_info) is ErrorCode.NOT_FOUND
