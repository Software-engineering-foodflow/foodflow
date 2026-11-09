"""SQLAlchemy 儲存位置存取；不 commit、不判斷規則。"""

from collections.abc import Sequence

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import for_update
from app.core.enums import GoodsReceiptStatus, StorageType
from app.core.errors import flush_or_raise
from app.db.models import (
    AlertSetting,
    BatchLocationChange,
    GoodsReceipt,
    GoodsReceiptItem,
    InventoryBatch,
    StorageLocation,
)
from app.modules.storage_location.errors import duplicate_code, referenced_on_delete
from app.modules.storage_location.repository import (
    ExpiryBucket,
    LocationBatchStats,
    LocationCount,
    StorageLocationRepository,
)

# 檢查後仍被併發寫入引用時，由 FK 擋下刪除（最後防線）。
_REFERENCING_FOREIGN_KEYS = (
    "fk_goods_receipt_item_location_id_storage_location",
    "fk_inventory_batch_current_location_id_storage_location",
    "fk_batch_location_change_from_location_id_storage_location",
    "fk_batch_location_change_to_location_id_storage_location",
)


class SqlAlchemyStorageLocationRepository(StorageLocationRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_locations(
        self,
        search: str,
        storage_type: StorageType | None,
        is_active: bool | None,
        page: int,
        page_size: int,
    ) -> tuple[list[StorageLocation], int]:
        stmt = select(StorageLocation)
        if search:
            # contains(autoescape) 把輸入當文字，不當 LIKE 萬用字元。
            stmt = stmt.where(
                or_(
                    StorageLocation.code.contains(search, autoescape=True),
                    StorageLocation.name.contains(search, autoescape=True),
                )
            )
        if storage_type is not None:
            stmt = stmt.where(StorageLocation.storage_type == storage_type)
        if is_active is not None:
            stmt = stmt.where(StorageLocation.is_active == is_active)
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self._session.scalars(
            stmt.order_by(StorageLocation.code, StorageLocation.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def get(self, location_id: int) -> StorageLocation | None:
        return self._session.get(StorageLocation, location_id)

    def lock(self, location_id: int) -> StorageLocation | None:
        return self._session.scalar(
            for_update(select(StorageLocation).where(StorageLocation.id == location_id))
        )

    def lock_as_move_target(self, location_id: int) -> StorageLocation | None:
        # FOR NO KEY UPDATE：與停用時的 FOR UPDATE 互斥，但不擋 FK 檢查的 KEY SHARE，
        # 兩個批次對向換位置（A→B、B→A）才不會死結。
        return self._session.scalar(
            for_update(
                select(StorageLocation).where(StorageLocation.id == location_id), key_share=True
            )
        )

    def find_code(self, code: str) -> StorageLocation | None:
        return self._session.scalar(select(StorageLocation).where(StorageLocation.code == code))

    def count_stocked_batches(self, location_id: int) -> int:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(InventoryBatch)
                .where(
                    InventoryBatch.current_location_id == location_id,
                    InventoryBatch.remaining_quantity > 0,
                )
            )
            or 0
        )

    def batch_stats(self, location_ids: Sequence[int]) -> dict[int, LocationBatchStats]:
        if not location_ids:
            return {}
        rows = self._session.execute(
            select(
                InventoryBatch.current_location_id,
                func.count(),
                func.min(InventoryBatch.expiry_date),
            )
            .where(
                InventoryBatch.current_location_id.in_(set(location_ids)),
                InventoryBatch.remaining_quantity > 0,
            )
            .group_by(InventoryBatch.current_location_id)
        )
        return {
            location_id: LocationBatchStats(batch_count=count, nearest_expiry_date=nearest)
            for location_id, count, nearest in rows
        }

    def location_counts(self) -> list[LocationCount]:
        rows = self._session.execute(
            select(StorageLocation.storage_type, StorageLocation.is_active, func.count()).group_by(
                StorageLocation.storage_type, StorageLocation.is_active
            )
        )
        return [LocationCount(kind, active, count) for kind, active, count in rows]

    def active_batch_expiry_buckets(self) -> list[ExpiryBucket]:
        rows = self._session.execute(
            select(StorageLocation.storage_type, InventoryBatch.expiry_date, func.count())
            .join(StorageLocation, StorageLocation.id == InventoryBatch.current_location_id)
            .where(StorageLocation.is_active.is_(True), InventoryBatch.remaining_quantity > 0)
            .group_by(StorageLocation.storage_type, InventoryBatch.expiry_date)
        )
        return [ExpiryBucket(storage_type, expiry, count) for storage_type, expiry, count in rows]

    def warning_days(self) -> int:
        stmt = select(AlertSetting.warning_days).order_by(AlertSetting.id).limit(1)
        return self._session.scalars(stmt).one()

    def is_referenced(self, location_id: int) -> bool:
        references = (
            exists().where(GoodsReceiptItem.location_id == location_id),
            exists().where(InventoryBatch.current_location_id == location_id),
            exists().where(
                or_(
                    BatchLocationChange.from_location_id == location_id,
                    BatchLocationChange.to_location_id == location_id,
                )
            ),
        )
        return bool(self._session.scalar(select(or_(*references))))

    def add(self, location: StorageLocation) -> None:
        self._session.add(location)
        self.flush()

    def delete(self, location: StorageLocation) -> None:
        self._session.delete(location)
        flush_or_raise(
            self._session, {name: referenced_on_delete() for name in _REFERENCING_FOREIGN_KEYS}
        )

    def flush(self) -> None:
        flush_or_raise(self._session, {"uq_storage_location_code": duplicate_code()})

    def list_location_batches(
        self, location_id: int, page: int, page_size: int
    ) -> tuple[list[InventoryBatch], int]:
        stmt = select(InventoryBatch).where(
            InventoryBatch.current_location_id == location_id,
            InventoryBatch.remaining_quantity > 0,
        )
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self._session.scalars(
            stmt.options(*_BATCH_VIEW_OPTIONS)
            .order_by(InventoryBatch.expiry_date, InventoryBatch.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def load_batch(self, batch_id: int) -> InventoryBatch:
        return self._session.scalars(
            select(InventoryBatch)
            .where(InventoryBatch.id == batch_id)
            .options(*_BATCH_VIEW_OPTIONS)
            .execution_options(populate_existing=True)
        ).one()

    def source_status(self, source_item_id: int) -> GoodsReceiptStatus:
        return self._session.scalars(
            select(GoodsReceipt.status)
            .join(GoodsReceiptItem, GoodsReceiptItem.receipt_id == GoodsReceipt.id)
            .where(GoodsReceiptItem.id == source_item_id)
        ).one()


_BATCH_VIEW_OPTIONS = (
    selectinload(InventoryBatch.ingredient),
    selectinload(InventoryBatch.current_location),
    selectinload(InventoryBatch.source_item).selectinload(GoodsReceiptItem.receipt),
)
