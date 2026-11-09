from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.enums import StorageType
from app.db.models import BatchLocationChange, Ingredient, InventoryBatch, InventoryTransaction


@dataclass(frozen=True)
class StockRow:
    ingredient_id: int
    ingredient_name: str
    category_id: int
    category_name: str
    unit: str
    storage_method: StorageType
    safety_stock_quantity: Decimal
    is_active: bool
    physical_quantity: Decimal
    available_quantity: Decimal
    expired_quantity: Decimal
    store_available_quantity: Decimal


@dataclass(frozen=True)
class InventoryFilters:
    search: str = ""
    category_id: int | None = None
    storage_method: StorageType | None = None
    location_id: int | None = None
    status: str | None = None
    page: int = 1
    page_size: int = 20


@dataclass(frozen=True)
class InventoryOption:
    id: int
    name: str
    is_active: bool


class InventoryRepository(ABC):
    @abstractmethod
    def warning_days(self) -> int: ...

    @abstractmethod
    def overview(
        self, filters: InventoryFilters, today: date, warning_days: int
    ) -> tuple[list[StockRow], int]: ...

    @abstractmethod
    def ingredient(self, ingredient_id: int) -> Ingredient | None: ...

    @abstractmethod
    def batches(
        self, ingredient_id: int, location_id: int | None, page: int, page_size: int
    ) -> tuple[list[InventoryBatch], int]: ...

    @abstractmethod
    def batch(self, batch_id: int) -> InventoryBatch | None: ...

    @abstractmethod
    def transactions(
        self, batch_id: int, page: int, page_size: int
    ) -> tuple[list[InventoryTransaction], int]: ...

    @abstractmethod
    def location_changes(
        self, batch_id: int, page: int, page_size: int
    ) -> tuple[list[BatchLocationChange], int]: ...

    @abstractmethod
    def options(
        self, kind: str, page: int, page_size: int
    ) -> tuple[list[InventoryOption], int]: ...
