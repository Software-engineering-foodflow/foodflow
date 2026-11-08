"""數量源自帳本；報廢成本源自原報廢紀錄。"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    BatchLocationChange,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    InventoryTransaction,
    WasteRecord,
)
from app.modules.reports.repository import ReportsRepository


def transaction_options():
    return (
        selectinload(InventoryTransaction.batch).selectinload(InventoryBatch.ingredient),
        selectinload(InventoryTransaction.batch)
        .selectinload(InventoryBatch.source_item)
        .selectinload(GoodsReceiptItem.receipt),
        selectinload(InventoryTransaction.operator),
        selectinload(InventoryTransaction.reverses),
    )


class SqlAlchemyReportsRepository(ReportsRepository):
    def __init__(self, session: Session):
        self._session = session

    def _filters(self, stmt, model, start, end, ingredient_id, batch_id, operator_id):
        if start is not None:
            stmt = stmt.where(model.occurred_at >= start)
        if end is not None:
            stmt = stmt.where(model.occurred_at < end)
        if ingredient_id is not None:
            stmt = stmt.where(InventoryBatch.ingredient_id == ingredient_id)
        if batch_id is not None:
            stmt = stmt.where(model.batch_id == batch_id)
        if operator_id is not None:
            stmt = stmt.where(model.operator_id == operator_id)
        return stmt

    def _page(self, stmt, model, options, page, page_size):
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = self._session.scalars(
            stmt.options(*options)
            .order_by(model.occurred_at.desc(), model.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(rows), total

    def transactions(
        self, start, end, ingredient_id, batch_id, tx_type, operator_id, page, page_size
    ):
        stmt = self._filters(
            select(InventoryTransaction).join(InventoryTransaction.batch),
            InventoryTransaction,
            start,
            end,
            ingredient_id,
            batch_id,
            operator_id,
        )
        if tx_type is not None:
            stmt = stmt.where(InventoryTransaction.type == tx_type)
        return self._page(stmt, InventoryTransaction, transaction_options(), page, page_size)

    def transaction(self, transaction_id):
        return self._session.scalar(
            select(InventoryTransaction)
            .where(InventoryTransaction.id == transaction_id)
            .options(*transaction_options())
        )

    def locations(self, start, end, ingredient_id, batch_id, operator_id, page, page_size):
        stmt = self._filters(
            select(BatchLocationChange).join(BatchLocationChange.batch),
            BatchLocationChange,
            start,
            end,
            ingredient_id,
            batch_id,
            operator_id,
        )
        options = (
            selectinload(BatchLocationChange.batch).selectinload(InventoryBatch.ingredient),
            selectinload(BatchLocationChange.operator),
            selectinload(BatchLocationChange.from_location),
            selectinload(BatchLocationChange.to_location),
        )
        return self._page(stmt, BatchLocationChange, options, page, page_size)

    def history_before(self, end):
        return list(
            self._session.scalars(
                select(InventoryTransaction)
                .where(InventoryTransaction.occurred_at < end)
                .options(*transaction_options())
                .order_by(InventoryTransaction.id)
            )
        )

    def waste_events(self, start, end):
        # 原報廢與其沖銷各是一個事件，以事件確認日進入區間。
        stmt = (
            select(WasteRecord, InventoryTransaction)
            .join(
                InventoryTransaction,
                or_(
                    InventoryTransaction.id == WasteRecord.transaction_id,
                    InventoryTransaction.reverses_transaction_id == WasteRecord.transaction_id,
                ),
            )
            .where(
                InventoryTransaction.occurred_at >= start, InventoryTransaction.occurred_at < end
            )
            .options(
                selectinload(WasteRecord.batch)
                .selectinload(InventoryBatch.ingredient)
                .selectinload(Ingredient.category),
                selectinload(InventoryTransaction.operator),
            )
            .order_by(InventoryTransaction.occurred_at, InventoryTransaction.id)
        )
        return list(self._session.execute(stmt).tuples())
