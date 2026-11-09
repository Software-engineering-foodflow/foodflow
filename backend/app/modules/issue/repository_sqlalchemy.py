"""IssueRepository 的 SQLAlchemy 實作。全部是一般讀取，批次的鎖只經由 StockLedger（AD-7）。"""

from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import TransactionType
from app.db.models import (
    AlertSetting,
    Ingredient,
    IngredientCategory,
    InventoryBatch,
    InventoryTransaction,
)
from app.db.queries.stock_levels import stock_level_stmt
from app.modules.issue.repository import IssuableIngredient, IssueRepository


class SqlAlchemyIssueRepository(IssueRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def issuable_ingredients(self, today: date) -> list[IssuableIngredient]:
        levels = stock_level_stmt(today).subquery()
        # 可用條件與 stock_level_stmt、domain.expiry.is_available 相同：expiry_date >= today。
        nearest = (
            select(
                InventoryBatch.ingredient_id,
                func.min(InventoryBatch.expiry_date).label("nearest_expiry_date"),
            )
            .where(InventoryBatch.remaining_quantity > 0, InventoryBatch.expiry_date >= today)
            .group_by(InventoryBatch.ingredient_id)
            .subquery()
        )
        stmt = (
            select(
                levels,
                IngredientCategory.name.label("category_name"),
                nearest.c.nearest_expiry_date,
            )
            .join(IngredientCategory, IngredientCategory.id == levels.c.category_id)
            .join(nearest, nearest.c.ingredient_id == levels.c.ingredient_id)
            .where(levels.c.store_available_quantity > 0)
            .order_by(IngredientCategory.name, levels.c.ingredient_name, levels.c.ingredient_id)
        )
        return [
            IssuableIngredient(
                id=row.ingredient_id,
                name=row.ingredient_name,
                unit=row.unit,
                category_id=row.category_id,
                category_name=row.category_name,
                storage_method=row.storage_method,
                available_quantity=row.store_available_quantity,
                safety_stock_quantity=row.safety_stock_quantity,
                is_active=row.is_active,
                nearest_expiry_date=row.nearest_expiry_date,
            )
            for row in self._session.execute(stmt)
        ]

    def get_ingredient(self, ingredient_id: int) -> Ingredient | None:
        return self._session.get(Ingredient, ingredient_id)

    def remaining_batches(self, ingredient_id: int) -> list[InventoryBatch]:
        stmt = (
            select(InventoryBatch)
            .where(
                InventoryBatch.ingredient_id == ingredient_id,
                InventoryBatch.remaining_quantity > 0,
            )
            .options(selectinload(InventoryBatch.current_location))
            .order_by(InventoryBatch.id)
        )
        return list(self._session.scalars(stmt))

    def get_batches(self, batch_ids: Sequence[int]) -> list[InventoryBatch]:
        if not batch_ids:
            return []
        stmt = (
            select(InventoryBatch)
            .where(InventoryBatch.id.in_(set(batch_ids)))
            .order_by(InventoryBatch.id)
        )
        return list(self._session.scalars(stmt))

    def warning_days(self) -> int:
        stmt = select(AlertSetting.warning_days).order_by(AlertSetting.id).limit(1)
        return self._session.scalars(stmt).one()

    def recent_issues(self, limit: int) -> list[InventoryTransaction]:
        is_issue = InventoryTransaction.type == TransactionType.ISSUE
        groups = (
            select(
                InventoryTransaction.operation_group_id,
                func.max(InventoryTransaction.occurred_at).label("occurred_at"),
                func.max(InventoryTransaction.id).label("last_id"),
            )
            .where(is_issue)
            .group_by(InventoryTransaction.operation_group_id)
            .order_by(
                func.max(InventoryTransaction.occurred_at).desc(),
                func.max(InventoryTransaction.id).desc(),
            )
            .limit(limit)
            .subquery()
        )
        stmt = (
            select(InventoryTransaction)
            .join(groups, groups.c.operation_group_id == InventoryTransaction.operation_group_id)
            .where(is_issue)
            .options(
                selectinload(InventoryTransaction.batch).selectinload(InventoryBatch.ingredient),
                selectinload(InventoryTransaction.operator),
            )
            .order_by(groups.c.occurred_at.desc(), groups.c.last_id.desc(), InventoryTransaction.id)
        )
        return list(self._session.scalars(stmt))

    def issue_operation(self, group_id: UUID) -> list[InventoryTransaction]:
        stmt = (
            select(InventoryTransaction)
            .where(
                InventoryTransaction.operation_group_id == group_id,
                InventoryTransaction.type == TransactionType.ISSUE,
            )
            .options(
                selectinload(InventoryTransaction.batch).selectinload(InventoryBatch.ingredient),
                selectinload(InventoryTransaction.operator),
            )
            .order_by(InventoryTransaction.id)
        )
        return list(self._session.scalars(stmt))

    def reversals_of(self, transaction_ids: Sequence[int]) -> list[InventoryTransaction]:
        if not transaction_ids:
            return []
        stmt = (
            select(InventoryTransaction)
            .where(InventoryTransaction.reverses_transaction_id.in_(set(transaction_ids)))
            .options(selectinload(InventoryTransaction.operator))
            .order_by(InventoryTransaction.id)
        )
        return list(self._session.scalars(stmt))
