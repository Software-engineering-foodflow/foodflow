"""FR-05 儲存位置規則，不連資料庫；鎖與 FK 防線在 PostgreSQL 整合測試驗證。"""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.core.clock import FixedClock
from app.core.enums import ErrorCode, ExpiryStatus, StorageType
from app.core.errors import DomainError
from app.db.models import StorageLocation
from app.modules.storage_location.repository import (
    ExpiryBucket,
    LocationBatchStats,
    LocationCount,
    StorageLocationRepository,
)
from app.modules.storage_location.service import StorageLocationService
from tests.fakes.fake_uow import FakeUnitOfWork

NOW = datetime(2026, 11, 6, 2, 0, tzinfo=UTC)
TODAY = date(2026, 11, 6)  # NOW 在 Asia/Taipei 的日期


class FakeRepository(StorageLocationRepository):
    def __init__(self) -> None:
        self.locations: list[StorageLocation] = []
        self.stocked: dict[int, int] = {}
        self.referenced: set[int] = set()
        self.locked: list[int] = []
        # 位置 id → 剩餘量大於 0 的批次到期日；summary 依此推出各類型的分組。
        self.batch_expiries: dict[int, list[date]] = {}
        self.warning = 3
        self.warning_reads = 0

    def list_locations(self, search, storage_type, is_active, page, page_size):
        items = [
            loc
            for loc in self.locations
            if (is_active is None or loc.is_active == is_active)
            and (storage_type is None or loc.storage_type == storage_type)
            and (not search or search in loc.code or search in loc.name)
        ]
        return items, len(items)

    def get(self, location_id):
        return next((loc for loc in self.locations if loc.id == location_id), None)

    def lock(self, location_id):
        self.locked.append(location_id)
        return next((loc for loc in self.locations if loc.id == location_id), None)

    def lock_as_move_target(self, location_id):
        return self.lock(location_id)

    def find_code(self, code):
        return next((loc for loc in self.locations if loc.code == code), None)

    def count_stocked_batches(self, location_id):
        return self.stocked.get(location_id, 0)

    def batch_stats(self, location_ids):
        return {
            location_id: LocationBatchStats(len(dates), min(dates))
            for location_id, dates in self.batch_expiries.items()
            if location_id in location_ids and dates
        }

    def location_counts(self):
        counts: dict[tuple[StorageType, bool], int] = {}
        for loc in self.locations:
            key = (loc.storage_type, loc.is_active)
            counts[key] = counts.get(key, 0) + 1
        return [LocationCount(kind, active, n) for (kind, active), n in counts.items()]

    def active_batch_expiry_buckets(self):
        buckets: dict[tuple[StorageType, date], int] = {}
        for loc in self.locations:
            if not loc.is_active:
                continue
            for expiry in self.batch_expiries.get(loc.id, []):
                key = (loc.storage_type, expiry)
                buckets[key] = buckets.get(key, 0) + 1
        return [ExpiryBucket(kind, expiry, n) for (kind, expiry), n in buckets.items()]

    def warning_days(self):
        self.warning_reads += 1
        return self.warning

    def is_referenced(self, location_id):
        return location_id in self.referenced

    def add(self, location):
        location.id = len(self.locations) + 1
        self.locations.append(location)

    def delete(self, location):
        self.locations.remove(location)

    def flush(self):
        pass

    # 換位置用的查詢由 test_batch_relocation_service.py 測試。
    def list_location_batches(self, location_id, page, page_size):
        raise NotImplementedError

    def load_batch(self, batch_id):
        raise NotImplementedError

    def source_status(self, source_item_id):
        raise NotImplementedError


@pytest.fixture
def repo() -> FakeRepository:
    return FakeRepository()


@pytest.fixture
def uow() -> FakeUnitOfWork:
    return FakeUnitOfWork()


@pytest.fixture
def service(repo, uow) -> StorageLocationService:
    return StorageLocationService(repo, uow, FixedClock(NOW))


def _create(service, code="A1", **overrides):
    values = {
        "code": code,
        "name": "冷藏庫 A",
        "storage_type": StorageType.REFRIGERATED,
        "description": None,
    } | overrides
    return service.create(**values)


def _update(service, location, **overrides):
    values = {
        "code": location.code,
        "name": location.name,
        "storage_type": location.storage_type,
        "description": location.description,
        "is_active": location.is_active,
    } | overrides
    return service.update(location.id, **values)


def _assert_error(exc_info, code: ErrorCode) -> DomainError:
    assert exc_info.value.code is code
    return exc_info.value


def test_create_is_active_and_committed(service, uow) -> None:
    location = _create(service, description="靠門口")

    assert location.is_active is True
    assert (location.code, location.description) == ("A1", "靠門口")
    assert uow.commits == 1


def test_create_duplicate_code_rolls_back_and_points_at_code(service, uow, repo) -> None:
    _create(service)

    with pytest.raises(DomainError) as exc_info:
        _create(service, name="另一個")

    error = _assert_error(exc_info, ErrorCode.DUPLICATE)
    assert [field.field for field in error.fields] == ["code"]
    assert (uow.commits, uow.rollbacks, len(repo.locations)) == (1, 1, 1)


def test_update_to_existing_code_is_duplicate_but_keeping_own_code_is_fine(service) -> None:
    first = _create(service, "A1")
    second = _create(service, "B1")

    with pytest.raises(DomainError) as exc_info:
        _update(service, second, code="A1")
    _assert_error(exc_info, ErrorCode.DUPLICATE)

    assert _update(service, first, name="冷藏庫 A（新）").name == "冷藏庫 A（新）"


def test_deactivate_with_stocked_batches_is_referenced_with_count(service, repo, uow) -> None:
    location = _create(service)
    repo.stocked[location.id] = 2

    with pytest.raises(DomainError) as exc_info:
        _update(service, location, is_active=False, name="改名不應生效")

    error = _assert_error(exc_info, ErrorCode.REFERENCED)
    assert error.details == {"batch_count": 2}
    assert "2 個批次" in error.message
    assert repo.locked[-1] == location.id
    assert (location.is_active, location.name) == (True, "冷藏庫 A")
    assert uow.rollbacks == 1


def test_deactivate_without_stocked_batches_succeeds_and_can_reactivate(service) -> None:
    location = _create(service)

    assert _update(service, location, is_active=False).is_active is False
    assert _update(service, location, is_active=True).is_active is True


def test_inactive_location_with_stock_can_still_be_edited(service, repo) -> None:
    location = _create(service)
    _update(service, location, is_active=False)
    repo.stocked[location.id] = 1

    assert _update(service, location, name="新名稱").name == "新名稱"


def test_delete_referenced_location_is_rejected(service, repo, uow) -> None:
    location = _create(service)
    repo.referenced.add(location.id)

    with pytest.raises(DomainError) as exc_info:
        service.delete(location.id)

    assert "停用" in _assert_error(exc_info, ErrorCode.REFERENCED).message
    assert repo.locations == [location]
    assert uow.rollbacks == 1


def test_delete_unreferenced_location(service, repo) -> None:
    location = _create(service)

    service.delete(location.id)

    assert repo.locations == []
    assert repo.locked[-1] == location.id


@pytest.mark.parametrize("action", ["update", "delete"])
def test_missing_location_is_not_found(service, action) -> None:
    ghost = StorageLocation(
        id=99,
        code="X",
        name="X",
        storage_type=StorageType.AMBIENT,
        description=None,
        is_active=True,
    )
    with pytest.raises(DomainError) as exc_info:
        _update(service, ghost) if action == "update" else service.delete(99)
    _assert_error(exc_info, ErrorCode.NOT_FOUND)


def test_list_only_active(service) -> None:
    active = _create(service, "A1")
    inactive = _create(service, "B1")
    _update(service, inactive, is_active=False)

    items, total = service.list_locations("  ", None, True, 1, 20)

    assert ([item.location for item in items], total) == ([active], 1)


def _days(n: int) -> date:
    return TODAY + timedelta(days=n)


def test_list_reports_batch_count_and_nearest_expiry_status(service, repo) -> None:
    stocked = _create(service, "R-01")
    empty = _create(service, "R-02")
    repo.batch_expiries[stocked.id] = [_days(5), _days(0), _days(2)]

    items, _ = service.list_locations("", None, None, 1, 20)

    first, second = items
    assert (first.location, first.batch_count) == (stocked, 3)
    assert first.nearest_expiry_date == TODAY
    assert first.nearest_expiry_status is ExpiryStatus.EXPIRES_TODAY
    assert first.nearest_days_until_expiry == 0
    assert (second.location, second.batch_count) == (empty, 0)
    assert (
        second.nearest_expiry_date,
        second.nearest_expiry_status,
        second.nearest_days_until_expiry,
    ) == (None, None, None)


@pytest.mark.parametrize(
    ("offset", "status"),
    [
        (-1, ExpiryStatus.EXPIRED),
        (0, ExpiryStatus.EXPIRES_TODAY),
        (3, ExpiryStatus.EXPIRING_SOON),
        (4, ExpiryStatus.NORMAL),
    ],
)
def test_nearest_status_boundaries_follow_warning_days(service, repo, offset, status) -> None:
    location = _create(service)
    repo.batch_expiries[location.id] = [_days(offset)]

    [item] = service.list_locations("", None, None, 1, 20)[0]

    assert (item.nearest_expiry_status, item.nearest_days_until_expiry) == (status, offset)


def test_list_without_batches_does_not_read_warning_days(service, repo) -> None:
    _create(service)

    service.list_locations("", None, None, 1, 20)

    assert repo.warning_reads == 0


def test_summary_counts_only_active_locations(service, repo) -> None:
    fridge = _create(service, "R-01")
    _create(service, "R-02")
    freezer = _create(service, "F-01", storage_type=StorageType.FROZEN)
    shelf = _create(service, "A-01", storage_type=StorageType.AMBIENT)
    retired = _create(service, "A-02", storage_type=StorageType.AMBIENT)
    _update(service, retired, is_active=False)
    repo.batch_expiries = {
        fridge.id: [_days(0)] + [_days(10)] * 5,
        freezer.id: [_days(2), _days(3)] + [_days(30)] * 7,
        shelf.id: [_days(-1)] + [_days(20)] * 4,
        retired.id: [_days(-5)] * 4,  # 停用位置的批次不算
    }

    summary = service.summary()

    assert (summary.active_count, summary.total_count) == (4, 5)
    assert [row.storage_type for row in summary.by_type] == list(StorageType)
    by_type = {row.storage_type: row for row in summary.by_type}

    def counts(kind):
        row = by_type[kind]
        return (
            row.location_count,
            row.batch_count,
            row.expired_count,
            row.expires_today_count,
            row.expiring_soon_count,
        )

    # 今日到期只算在 expires_today_count，不算即期。
    assert counts(StorageType.REFRIGERATED) == (2, 6, 0, 1, 0)
    assert counts(StorageType.FROZEN) == (1, 9, 0, 0, 2)
    assert counts(StorageType.AMBIENT) == (1, 5, 1, 0, 0)


def test_summary_without_locations_lists_every_type_as_zero(service) -> None:
    summary = service.summary()

    assert (summary.active_count, summary.total_count) == (0, 0)
    rows = [(row.storage_type, row.location_count, row.batch_count) for row in summary.by_type]
    assert rows == [(kind, 0, 0) for kind in StorageType]
