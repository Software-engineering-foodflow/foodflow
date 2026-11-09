"""領用模組的唯讀查詢介面。issue 沒有自己的資料表，寫庫存一律經由 StockLedger（AD-4、AD-5）。"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.core.enums import StorageType
from app.db.models import Ingredient, InventoryBatch, InventoryTransaction


@dataclass(frozen=True)
class IssuableIngredient:
    id: int
    name: str
    unit: str
    category_id: int
    category_name: str
    storage_method: StorageType
    available_quantity: Decimal
    safety_stock_quantity: Decimal
    is_active: bool
    nearest_expiry_date: date  # 可用批次中最早的到期日


class IssueRepository(ABC):
    @abstractmethod
    def issuable_ingredients(self, today: date) -> list[IssuableIngredient]:
        """全店可用量大於 0 的食材（含停用），依分類名稱、食材名稱、id 排序。"""

    @abstractmethod
    def get_ingredient(self, ingredient_id: int) -> Ingredient | None: ...

    @abstractmethod
    def remaining_batches(self, ingredient_id: int) -> list[InventoryBatch]:
        """不上鎖：該食材 remaining_quantity > 0 的批次，已載入 current_location，依 id 排序。"""

    @abstractmethod
    def get_batches(self, batch_ids: Sequence[int]) -> list[InventoryBatch]:
        """不上鎖：依 id 取批次，不存在的 id 略過。批號、食材、到期日建立後不會改變。"""

    @abstractmethod
    def warning_days(self) -> int:
        """預警天數，取 alert_setting 中 id 最小的一列（AD-13）。"""

    @abstractmethod
    def recent_issues(self, limit: int) -> list[InventoryTransaction]:
        """最近 limit 次領用的全部 ISSUE 異動（新到舊、同次依 id），已載入批次的食材與操作者。"""

    @abstractmethod
    def issue_operation(self, group_id: UUID) -> list[InventoryTransaction]:
        """某次領用的全部 ISSUE 異動（依 id），已載入批次的食材與操作者；查無回空清單。"""

    @abstractmethod
    def reversals_of(self, transaction_ids: Sequence[int]) -> list[InventoryTransaction]:
        """沖銷這些異動的 REVERSAL 異動，已載入操作者。"""
