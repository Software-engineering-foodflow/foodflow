"""預警共用全店量查詢；批次與庫存一律唯讀。"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.db import for_update
from app.db.models import AlertSetting, InventoryBatch
from app.db.queries.stock_levels import stock_level_stmt
from app.modules.alerts.repository import (
    AlertRepository,
    BatchSnapshot,
    SettingSnapshot,
    StockSnapshot,
)


def _setting_snapshot(row: AlertSetting) -> SettingSnapshot:
    return SettingSnapshot(row.id, row.warning_days, row.updated_at, row.updated_by_id)


class SqlAlchemyAlertRepository(AlertRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def batches(self, location_id: int | None) -> list[BatchSnapshot]:
        stmt = (
            select(InventoryBatch)
            .where(InventoryBatch.remaining_quantity > 0)
            .options(
                joinedload(InventoryBatch.ingredient), joinedload(InventoryBatch.current_location)
            )
        )
        if location_id is not None:
            stmt = stmt.where(InventoryBatch.current_location_id == location_id)
        return [
            BatchSnapshot(
                row.id,
                row.batch_number,
                row.ingredient_id,
                row.ingredient.name,
                row.ingredient.unit,
                row.current_location_id,
                row.current_location.name,
                row.remaining_quantity,
                row.expiry_date,
            )
            for row in self._session.scalars(stmt)
        ]

    def stocks(self, today: date, location_id: int | None) -> list[StockSnapshot]:
        return [
            StockSnapshot(
                row.ingredient_id,
                row.ingredient_name,
                row.unit,
                row.is_active,
                row.safety_stock_quantity,
                row.store_available_quantity,
                row.physical_quantity,
                row.available_quantity,
            )
            for row in self._session.execute(stock_level_stmt(today, location_id))
            if location_id is None or row.physical_quantity > 0
        ]

    def setting(self) -> SettingSnapshot:
        row = self._session.scalars(select(AlertSetting).order_by(AlertSetting.id).limit(1)).one()
        return _setting_snapshot(row)

    def update_setting(
        self, warning_days: int, operator_id: int, updated_at: datetime
    ) -> SettingSnapshot:
        row = self._session.scalars(
            for_update(select(AlertSetting).order_by(AlertSetting.id).limit(1))
        ).one()
        row.warning_days = warning_days
        row.updated_by_id = operator_id
        row.updated_at = updated_at
        self._session.flush()
        return _setting_snapshot(row)
