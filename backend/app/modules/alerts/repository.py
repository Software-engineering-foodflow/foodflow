"""預警只讀不可變快照；設定寫入由 UoW 管理。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True)
class BatchSnapshot:
    batch_id: int
    batch_number: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    location_id: int
    location_name: str
    remaining_quantity: Decimal
    expiry_date: date


@dataclass(frozen=True)
class StockSnapshot:
    ingredient_id: int
    ingredient_name: str
    unit: str
    is_active: bool
    safety_stock_quantity: Decimal
    store_available_quantity: Decimal
    physical_quantity: Decimal
    available_quantity: Decimal


@dataclass(frozen=True)
class SettingSnapshot:
    id: int
    warning_days: int
    updated_at: datetime
    updated_by_id: int | None


class AlertRepository(ABC):
    @abstractmethod
    def batches(self, location_id: int | None) -> list[BatchSnapshot]: ...

    @abstractmethod
    def stocks(self, today: date, location_id: int | None) -> list[StockSnapshot]: ...

    @abstractmethod
    def setting(self) -> SettingSnapshot: ...

    @abstractmethod
    def update_setting(
        self, warning_days: int, operator_id: int, updated_at: datetime
    ) -> SettingSnapshot: ...
