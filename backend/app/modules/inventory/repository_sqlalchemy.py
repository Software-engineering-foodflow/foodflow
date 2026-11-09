from datetime import date, timedelta

from sqlalchemy import and_, false, func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    AlertSetting,
    BatchLocationChange,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    IngredientCategory,
    InventoryBatch,
    InventoryTransaction,
    StorageLocation,
)
from app.db.queries.stock_levels import stock_level_stmt
from app.modules.inventory.repository import (
    InventoryFilters,
    InventoryOption,
    InventoryRepository,
    StockRow,
)


def expiry_condition(status: str, today: date, warning_days: int):
    """SQL equivalent of classify_expiry; remaining quantity is scoped by the caller."""
    expiry = InventoryBatch.expiry_date
    if status == "EXPIRED":
        return expiry < today
    if status == "EXPIRES_TODAY":
        return expiry == today
    # Warning settings are nonnegative integers. Avoid overflowing Python dates.
    last = today + timedelta(days=min(warning_days, (date.max - today).days))
    if status == "EXPIRING_SOON":
        return and_(expiry > today, expiry <= last) if warning_days else false()
    return and_(expiry > today, expiry > last)


class SqlAlchemyInventoryRepository(InventoryRepository):
    def __init__(self, session: Session):
        self.session = session

    def warning_days(self):
        # Migration owns the singleton and its default; GET must never create settings.
        return self.session.scalars(
            select(AlertSetting.warning_days).order_by(AlertSetting.id).limit(1)
        ).one()

    def _page(self, statement, page, page_size):
        total = self.session.scalar(
            select(func.count()).select_from(statement.order_by(None).subquery())
        )
        return statement.offset((page - 1) * page_size).limit(page_size), total

    def overview(self, filters: InventoryFilters, today: date, warning_days: int):
        levels = stock_level_stmt(today, filters.location_id).order_by(None).subquery()
        statement = select(levels, IngredientCategory.name.label("category_name")).join(
            IngredientCategory, IngredientCategory.id == levels.c.category_id
        )
        if filters.search.strip():
            statement = statement.where(
                levels.c.ingredient_name.icontains(filters.search.strip(), autoescape=True)
            )
        if filters.category_id is not None:
            statement = statement.where(levels.c.category_id == filters.category_id)
        if filters.storage_method is not None:
            statement = statement.where(levels.c.storage_method == filters.storage_method)
        if filters.location_id is not None:
            statement = statement.where(levels.c.physical_quantity > 0)
        if filters.status == "LOW_STOCK":
            statement = statement.where(
                levels.c.is_active,
                levels.c.safety_stock_quantity > 0,
                levels.c.store_available_quantity <= levels.c.safety_stock_quantity,
            )
        elif filters.status:
            matching = select(InventoryBatch.id).where(
                InventoryBatch.ingredient_id == levels.c.ingredient_id,
                InventoryBatch.remaining_quantity > 0,
                expiry_condition(filters.status, today, warning_days),
            )
            if filters.location_id is not None:
                matching = matching.where(InventoryBatch.current_location_id == filters.location_id)
            statement = statement.where(matching.exists())
        statement, total = self._page(
            statement.order_by(levels.c.ingredient_id), filters.page, filters.page_size
        )
        return [StockRow(**row) for row in self.session.execute(statement).mappings()], total

    def ingredient(self, ingredient_id):
        return self.session.get(Ingredient, ingredient_id)

    @staticmethod
    def _batch_stmt():
        return select(InventoryBatch).options(
            selectinload(InventoryBatch.ingredient),
            selectinload(InventoryBatch.current_location),
            selectinload(InventoryBatch.source_item)
            .selectinload(GoodsReceiptItem.receipt)
            .selectinload(GoodsReceipt.supplier),
        )

    def batches(self, ingredient_id, location_id, page, page_size):
        statement = self._batch_stmt().where(InventoryBatch.ingredient_id == ingredient_id)
        if location_id is not None:
            statement = statement.where(InventoryBatch.current_location_id == location_id)
        statement = statement.order_by(
            InventoryBatch.expiry_date,
            InventoryBatch.received_date,
            InventoryBatch.batch_number,
            InventoryBatch.id,
        )
        statement, total = self._page(statement, page, page_size)
        return list(self.session.scalars(statement)), total

    def batch(self, batch_id):
        return self.session.scalars(
            self._batch_stmt().where(InventoryBatch.id == batch_id)
        ).one_or_none()

    def transactions(self, batch_id, page, page_size):
        statement = (
            select(InventoryTransaction)
            .where(InventoryTransaction.batch_id == batch_id)
            .options(selectinload(InventoryTransaction.operator))
            .order_by(InventoryTransaction.occurred_at.desc(), InventoryTransaction.id.desc())
        )
        statement, total = self._page(statement, page, page_size)
        return list(self.session.scalars(statement)), total

    def location_changes(self, batch_id, page, page_size):
        statement = (
            select(BatchLocationChange)
            .where(BatchLocationChange.batch_id == batch_id)
            .options(
                selectinload(BatchLocationChange.operator),
                selectinload(BatchLocationChange.from_location),
                selectinload(BatchLocationChange.to_location),
            )
            .order_by(BatchLocationChange.occurred_at.desc(), BatchLocationChange.id.desc())
        )
        statement, total = self._page(statement, page, page_size)
        return list(self.session.scalars(statement)), total

    def options(self, kind, page, page_size):
        model = IngredientCategory if kind == "categories" else StorageLocation
        statement, total = self._page(select(model).order_by(model.id), page, page_size)
        return [
            InventoryOption(item.id, item.name, item.is_active)
            for item in self.session.scalars(statement)
        ], total
