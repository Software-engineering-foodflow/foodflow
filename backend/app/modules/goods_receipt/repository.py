from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from app.db.models import (
    Employee,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    InventoryTransaction,
    StorageLocation,
    Supplier,
)


class GoodsReceiptRepository(ABC):
    @abstractmethod
    def list(
        self,
        *,
        receipt_number: str,
        date_from: date | None,
        date_to: date | None,
        supplier_id: int | None,
        ingredient_id: int | None,
        page: int,
        page_size: int,
    ) -> tuple[list[GoodsReceipt], int]: ...

    @abstractmethod
    def employee(self, employee_id: int) -> Employee | None: ...

    @abstractmethod
    def batches(self, item_ids: list[int]) -> list[InventoryBatch]: ...

    @abstractmethod
    def transactions(self, batch_ids: list[int]) -> list[InventoryTransaction]: ...

    @abstractmethod
    def get(self, receipt_id: int) -> GoodsReceipt | None: ...

    @abstractmethod
    def lock(self, receipt_id: int) -> GoodsReceipt | None: ...

    @abstractmethod
    def supplier(self, supplier_id: int) -> Supplier | None: ...

    @abstractmethod
    def ingredient(self, ingredient_id: int) -> Ingredient | None: ...

    @abstractmethod
    def location(self, location_id: int) -> StorageLocation | None: ...

    @abstractmethod
    def options(
        self, kind: str, search: str, page: int, page_size: int, include_inactive: bool = False
    ) -> tuple[list[Supplier | Ingredient | StorageLocation], int]: ...

    @abstractmethod
    def add(self, receipt: GoodsReceipt) -> None: ...

    @abstractmethod
    def delete_item(self, item: GoodsReceiptItem) -> None: ...

    @abstractmethod
    def delete(self, receipt: GoodsReceipt) -> None: ...

    @abstractmethod
    def flush(self) -> None: ...
