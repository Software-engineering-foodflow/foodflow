"""盤點讀取契約；庫存寫入僅走 StockLedger。"""

from abc import ABC, abstractmethod

from app.core.enums import GoodsReceiptStatus
from app.db.models import InventoryBatch


class StocktakeRepository(ABC):
    @abstractmethod
    def batches(
        self, search: str, page: int, page_size: int
    ) -> tuple[list[InventoryBatch], int]: ...

    @abstractmethod
    def source_states(self, batch_ids: list[int]) -> dict[int, GoodsReceiptStatus]:
        """在批次鎖內重新讀取來源狀態，不使用 identity map 快取。"""

    @abstractmethod
    def latest_transactions(self, batch_ids: list[int]) -> dict[int, int]:
        """在批次鎖內讀取 max(id)；無異動的批次不出現在結果。"""
