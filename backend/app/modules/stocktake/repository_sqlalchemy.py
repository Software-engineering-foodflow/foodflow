"""盤點候選包含零量與停用食材，排除已沖銷來源。"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import GoodsReceiptStatus
from app.db.models import (
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    InventoryTransaction,
)
from app.modules.stocktake.repository import StocktakeRepository


class SqlAlchemyStocktakeRepository(StocktakeRepository):
    def __init__(self, session: Session):
        self._session = session

    def batches(self, search, page, page_size):
        stmt = (
            select(InventoryBatch)
            .join(InventoryBatch.ingredient)
            .join(InventoryBatch.source_item)
            .join(GoodsReceiptItem.receipt)
            .where(GoodsReceipt.status != GoodsReceiptStatus.REVERSED)
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
            stmt.options(
                selectinload(InventoryBatch.ingredient),
                selectinload(InventoryBatch.current_location),
            )
            .order_by(InventoryBatch.expiry_date, InventoryBatch.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def source_states(self, batch_ids):
        return dict(
            self._session.execute(
                select(InventoryBatch.id, GoodsReceipt.status)
                .join(InventoryBatch.source_item)
                .join(GoodsReceiptItem.receipt)
                .where(InventoryBatch.id.in_(batch_ids))
            ).all()
        )

    def latest_transactions(self, batch_ids):
        return dict(
            self._session.execute(
                select(InventoryTransaction.batch_id, func.max(InventoryTransaction.id))
                .where(InventoryTransaction.batch_id.in_(batch_ids))
                .group_by(InventoryTransaction.batch_id)
            ).all()
        )
