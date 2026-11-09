from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import for_update
from app.core.errors import flush_or_raise
from app.db.models import (
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    IngredientCategory,
    InventoryBatch,
    Supplier,
)
from app.modules.master_data.errors import duplicate, invalid_category, referenced
from app.modules.master_data.repository import Master, MasterDataRepository, Resource

MODELS = {
    "ingredient-categories": IngredientCategory,
    "ingredients": Ingredient,
    "suppliers": Supplier,
}
CONSTRAINTS = {
    "uq_ingredient_category_code": duplicate("code"),
    "uq_ingredient_name": duplicate("name"),
    "fk_ingredient_category_id_ingredient_category": invalid_category(),
    "fk_goods_receipt_item_ingredient_id_ingredient": referenced(),
    "fk_inventory_batch_ingredient_id_ingredient": referenced(),
    "fk_goods_receipt_supplier_id_supplier": referenced(),
}


class SqlAlchemyMasterDataRepository(MasterDataRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self, resource, search, is_active, category_id, storage_method, page, page_size):
        model = MODELS[resource]
        stmt = select(model)
        if search:
            columns = [model.name]
            if resource == "ingredient-categories":
                columns.append(model.code)
            stmt = stmt.where(or_(*(c.contains(search, autoescape=True) for c in columns)))
        if is_active is not None:
            stmt = stmt.where(model.is_active == is_active)
        if resource == "ingredients":
            if category_id is not None:
                stmt = stmt.where(Ingredient.category_id == category_id)
            if storage_method is not None:
                stmt = stmt.where(Ingredient.storage_method == storage_method)
            stmt = stmt.options(selectinload(Ingredient.category))
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self._session.scalars(
            stmt.order_by(model.is_active.desc(), model.name, model.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(items), total

    def get(self, resource: Resource, record_id: int, *, lock: bool = False) -> Master | None:
        model = MODELS[resource]
        stmt = select(model).where(model.id == record_id).execution_options(populate_existing=True)
        if resource == "ingredients":
            stmt = stmt.options(selectinload(Ingredient.category))
        return self._session.scalar(for_update(stmt) if lock else stmt)

    def duplicate(self, resource, value, own_id):
        model = MODELS[resource]
        column = model.code if resource == "ingredient-categories" else model.name
        stmt = select(model.id).where(column == value)
        if own_id is not None:
            stmt = stmt.where(model.id != own_id)
        return self._session.scalar(stmt) is not None

    def referenced(self, resource, record_id, *, active_only=False):
        if resource == "ingredient-categories":
            query = exists().where(Ingredient.category_id == record_id)
            if active_only:
                query = query.where(Ingredient.is_active.is_(True))
        elif resource == "ingredients":
            query = or_(
                exists().where(GoodsReceiptItem.ingredient_id == record_id),
                exists().where(InventoryBatch.ingredient_id == record_id),
            )
        else:
            query = exists().where(GoodsReceipt.supplier_id == record_id)
        return bool(self._session.scalar(select(query)))

    def add(self, record):
        self._session.add(record)
        self.flush()

    def delete(self, record):
        self._session.delete(record)
        errors = CONSTRAINTS | {"fk_ingredient_category_id_ingredient_category": referenced()}
        flush_or_raise(self._session, errors)

    def flush(self):
        flush_or_raise(self._session, CONSTRAINTS)
