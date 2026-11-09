"""儲存位置與整批換位置的規則（FR-05、A3）與交易邊界。權限由路由層 require_admin 把關。"""

from dataclasses import dataclass, field
from datetime import date
from uuid import uuid4

from app.core.clock import Clock
from app.core.enums import ExpiryStatus, GoodsReceiptStatus, StorageType
from app.core.uow import UnitOfWork
from app.db.models import InventoryBatch, StorageLocation
from app.domain.expiry import classify_expiry, days_until_expiry
from app.modules.inventory.ledger import StockLedger, StockOp
from app.modules.storage_location.errors import (
    batch_not_found,
    duplicate_code,
    exhausted_batch,
    invalid_move_target,
    location_not_found,
    referenced_on_delete,
    reversed_source,
    stocked_on_deactivate,
)
from app.modules.storage_location.repository import StorageLocationRepository


@dataclass(frozen=True)
class LocationOverview:
    """清單列：位置本身加上批次數與最近到期狀態；沒有剩餘批次時 nearest 欄位皆為 None。"""

    location: StorageLocation
    batch_count: int
    nearest_expiry_date: date | None
    nearest_expiry_status: ExpiryStatus | None
    nearest_days_until_expiry: int | None


@dataclass
class StorageTypeSummary:
    """單一類型的啟用位置數，與其上剩餘批次的數量與效期分布。"""

    storage_type: StorageType
    location_count: int = 0
    batch_count: int = 0
    expired_count: int = 0
    expires_today_count: int = 0
    expiring_soon_count: int = 0


@dataclass
class LocationSummary:
    active_count: int
    total_count: int
    by_type: list[StorageTypeSummary] = field(default_factory=list)


@dataclass(frozen=True)
class BatchView:
    batch: InventoryBatch
    expiry_status: ExpiryStatus
    days_until_expiry: int


_STATUS_COUNTERS = {
    ExpiryStatus.EXPIRED: "expired_count",
    ExpiryStatus.EXPIRES_TODAY: "expires_today_count",
    ExpiryStatus.EXPIRING_SOON: "expiring_soon_count",
}


class StorageLocationService:
    def __init__(
        self, repository: StorageLocationRepository, uow: UnitOfWork, clock: Clock
    ) -> None:
        self._repository = repository
        self._uow = uow
        self._clock = clock

    def list_locations(
        self,
        search: str,
        storage_type: StorageType | None,
        is_active: bool | None,
        page: int,
        page_size: int,
    ) -> tuple[list[LocationOverview], int]:
        locations, total = self._repository.list_locations(
            search.strip(), storage_type, is_active, page, page_size
        )
        stats = self._repository.batch_stats([location.id for location in locations])
        today = self._clock.today()
        warning_days = self._repository.warning_days() if stats else 0
        items = []
        for location in locations:
            stat = stats.get(location.id)
            if stat is None:
                items.append(LocationOverview(location, 0, None, None, None))
                continue
            nearest = stat.nearest_expiry_date
            items.append(
                LocationOverview(
                    location,
                    stat.batch_count,
                    nearest,
                    classify_expiry(nearest, today, warning_days),
                    days_until_expiry(nearest, today),
                )
            )
        return items, total

    def summary(self) -> LocationSummary:
        """只算啟用位置；停用位置只計入總數。"""
        by_type = {storage_type: StorageTypeSummary(storage_type) for storage_type in StorageType}
        result = LocationSummary(active_count=0, total_count=0, by_type=list(by_type.values()))
        for row in self._repository.location_counts():
            result.total_count += row.count
            if row.is_active:
                result.active_count += row.count
                by_type[row.storage_type].location_count += row.count
        buckets = self._repository.active_batch_expiry_buckets()
        if not buckets:
            return result
        today = self._clock.today()
        warning_days = self._repository.warning_days()
        for bucket in buckets:
            summary = by_type[bucket.storage_type]
            summary.batch_count += bucket.count
            counter = _STATUS_COUNTERS.get(classify_expiry(bucket.expiry_date, today, warning_days))
            if counter is not None:
                setattr(summary, counter, getattr(summary, counter) + bucket.count)
        return result

    def create(
        self, *, code: str, name: str, storage_type: StorageType, description: str | None
    ) -> StorageLocation:
        with self._uow.transaction():
            self._ensure_code_free(code, None)
            location = StorageLocation(
                code=code,
                name=name,
                storage_type=storage_type,
                description=description,
                is_active=True,
            )
            self._repository.add(location)
            return location

    def update(
        self,
        location_id: int,
        *,
        code: str,
        name: str,
        storage_type: StorageType,
        description: str | None,
        is_active: bool,
    ) -> StorageLocation:
        with self._uow.transaction():
            location = self._lock(location_id)
            self._ensure_code_free(code, location.id)
            if location.is_active and not is_active:
                batch_count = self._repository.count_stocked_batches(location.id)
                if batch_count > 0:
                    raise stocked_on_deactivate(batch_count)
            location.code = code
            location.name = name
            location.storage_type = storage_type
            location.description = description
            location.is_active = is_active
            self._repository.flush()
            return location

    def delete(self, location_id: int) -> None:
        with self._uow.transaction():
            location = self._lock(location_id)
            if self._repository.is_referenced(location.id):
                raise referenced_on_delete()
            self._repository.delete(location)

    def _lock(self, location_id: int) -> StorageLocation:
        location = self._repository.lock(location_id)
        if location is None:
            raise location_not_found()
        return location

    def _ensure_code_free(self, code: str, own_id: int | None) -> None:
        existing = self._repository.find_code(code)
        if existing is not None and existing.id != own_id:
            raise duplicate_code()


class BatchRelocationService:
    """整批換位置：批次只經 StockLedger 鎖定與寫入，不產生數量異動（AD-5、AD-20）。"""

    def __init__(
        self,
        repository: StorageLocationRepository,
        ledger: StockLedger,
        uow: UnitOfWork,
        clock: Clock,
    ) -> None:
        self._repository = repository
        self._ledger = ledger
        self._uow = uow
        self._clock = clock

    def list_batches(
        self, location_id: int, page: int, page_size: int
    ) -> tuple[list[BatchView], int]:
        if self._repository.get(location_id) is None:
            raise location_not_found()
        batches, total = self._repository.list_location_batches(location_id, page, page_size)
        if not batches:
            return [], total
        today = self._clock.today()
        warning_days = self._repository.warning_days()
        views = [
            BatchView(
                batch,
                classify_expiry(batch.expiry_date, today, warning_days),
                days_until_expiry(batch.expiry_date, today),
            )
            for batch in batches
        ]
        return views, total

    def move(
        self, batch_id: int, *, to_location_id: int, reason: str, operator_id: int
    ) -> InventoryBatch:
        with self._uow.transaction():
            # 鎖序：inventory_batch → storage_location；來源單頭只讀不鎖（AD-7）。
            locked = self._ledger.lock_batches([batch_id])
            if not locked:
                raise batch_not_found()
            batch = locked[0]
            if self._repository.source_status(batch.source_item_id) is GoodsReceiptStatus.REVERSED:
                raise reversed_source()
            if batch.remaining_quantity <= 0:
                raise exhausted_batch()
            if batch.current_location_id != to_location_id:
                # 鎖住目標位置，與停用位置（先鎖位置再數批次）互斥。
                target = self._repository.lock_as_move_target(to_location_id)
                if target is None or not target.is_active:
                    raise invalid_move_target()
                op = StockOp(
                    operation_group_id=uuid4(),
                    operator_id=operator_id,
                    occurred_at=self._clock.now(),
                    reason=reason,
                )
                self._ledger.move(batch, to_location_id, op)
            return self._repository.load_batch(batch.id)
