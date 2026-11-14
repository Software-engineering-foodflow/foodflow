"""同一 Session 內儲存報廢；批次僅讀取，寫入由帳本負責。"""

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import for_update
from app.core.errors import flush_or_raise
from app.db.models import (
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    WasteRecord,
    WasteRequest,
)
from app.modules.waste.repository import WasteRepository


def batch_options():
    return (
        selectinload(InventoryBatch.ingredient),
        selectinload(InventoryBatch.current_location),
        selectinload(InventoryBatch.source_item).selectinload(GoodsReceiptItem.receipt),
    )


def record_options():
    return (
        selectinload(WasteRecord.batch).selectinload(InventoryBatch.ingredient),
        selectinload(WasteRecord.transaction),
        selectinload(WasteRecord.operator),
    )


class SqlAlchemyWasteRepository(WasteRepository):
    def __init__(self, session: Session):
        self._session = session

    def _requests(self):
        return select(WasteRequest).options(
            selectinload(WasteRequest.batch).selectinload(InventoryBatch.ingredient),
            selectinload(WasteRequest.batch).selectinload(InventoryBatch.current_location),
            selectinload(WasteRequest.operator),
            selectinload(WasteRequest.reviewer),
            selectinload(WasteRequest.record).options(*record_options()),
        )

    def request_by_key(self, key):
        return self._session.scalar(self._requests().where(WasteRequest.request_key == key))

    def get_request(self, request_id, *, lock=False):
        stmt = (
            self._requests()
            .where(WasteRequest.id == request_id)
            .execution_options(populate_existing=True)
        )
        if lock:
            stmt = for_update(stmt).execution_options(populate_existing=True)
        return self._session.scalar(stmt)

    def save_request(self, request):
        self._session.add(request)
        flush_or_raise(self._session)
        return self.get_request(request.id)

    def list_requests(self, page, page_size):
        total = self._session.scalar(select(func.count()).select_from(WasteRequest))
        items = self._session.scalars(
            self._requests()
            .order_by(WasteRequest.occurred_at.desc(), WasteRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def source_status(self, batch_id):
        return self._session.scalar(
            select(GoodsReceipt.status)
            .join(GoodsReceiptItem, GoodsReceiptItem.receipt_id == GoodsReceipt.id)
            .join(InventoryBatch, InventoryBatch.source_item_id == GoodsReceiptItem.id)
            .where(InventoryBatch.id == batch_id)
        )

    def serialize_operation(self, key: UUID) -> None:
        # 跨批次相同 key 也必須序列化；不變更 schema，交易結束自動釋放。
        lock_id = int.from_bytes(key.bytes[:8], byteorder="big", signed=True)
        self._session.execute(select(func.pg_advisory_xact_lock(lock_id)))

    def add(self, record):
        self._session.add(record)
        flush_or_raise(self._session)
        return self.get(record.id)

    def by_transaction(self, transaction_id):
        return self._session.scalar(
            select(WasteRecord)
            .where(WasteRecord.transaction_id == transaction_id)
            .options(*record_options())
        )

    def get(self, record_id):
        return self._session.scalar(
            select(WasteRecord).where(WasteRecord.id == record_id).options(*record_options())
        )

    def list_records(self, page, page_size):
        total = self._session.scalar(select(func.count()).select_from(WasteRecord))
        items = self._session.scalars(
            select(WasteRecord)
            .options(*record_options())
            .order_by(WasteRecord.occurred_at.desc(), WasteRecord.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def batches(self, search, page, page_size):
        stmt = (
            select(InventoryBatch)
            .join(InventoryBatch.ingredient)
            .where(InventoryBatch.remaining_quantity > 0)
        )
        if search:
            stmt = stmt.where(
                or_(
                    Ingredient.name.contains(search, autoescape=True),
                    InventoryBatch.batch_number.contains(search, autoescape=True),
                )
            )
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery()))
        items = self._session.scalars(
            stmt.options(*batch_options())
            .order_by(InventoryBatch.expiry_date, InventoryBatch.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def batch(self, batch_id):
        return self._session.scalar(
            select(InventoryBatch).where(InventoryBatch.id == batch_id).options(*batch_options())
        )
