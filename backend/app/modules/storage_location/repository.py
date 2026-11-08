"""儲存位置的資料存取介面。引用與剩餘批次只讀取，不寫入其他模組的表（AD-4）。"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.core.enums import GoodsReceiptStatus, StorageType
from app.db.models import InventoryBatch, StorageLocation


@dataclass(frozen=True)
class LocationBatchStats:
    """位置上剩餘量大於 0 的批次數與其中最早的到期日（定義同 count_stocked_batches）。"""

    batch_count: int
    nearest_expiry_date: date


@dataclass(frozen=True)
class LocationCount:
    storage_type: StorageType
    is_active: bool
    count: int


@dataclass(frozen=True)
class ExpiryBucket:
    """啟用位置上剩餘量大於 0 的批次，依類型與到期日分組的筆數。"""

    storage_type: StorageType
    expiry_date: date
    count: int


class StorageLocationRepository(ABC):
    @abstractmethod
    def list_locations(
        self,
        search: str,
        storage_type: StorageType | None,
        is_active: bool | None,
        page: int,
        page_size: int,
    ) -> tuple[list[StorageLocation], int]: ...

    @abstractmethod
    def get(self, location_id: int) -> StorageLocation | None: ...

    @abstractmethod
    def lock(self, location_id: int) -> StorageLocation | None: ...

    @abstractmethod
    def lock_as_move_target(self, location_id: int) -> StorageLocation | None:
        """換位置的目標鎖：與停用、刪除的鎖互斥，但不擋其他交易的 FK 檢查。"""

    @abstractmethod
    def find_code(self, code: str) -> StorageLocation | None: ...

    @abstractmethod
    def count_stocked_batches(self, location_id: int) -> int:
        """目前位於此位置、剩餘量大於 0 的批次數。"""

    @abstractmethod
    def batch_stats(self, location_ids: Sequence[int]) -> dict[int, LocationBatchStats]:
        """一次查詢多個位置的批次統計；沒有剩餘批次的位置不在結果中。"""

    @abstractmethod
    def location_counts(self) -> list[LocationCount]:
        """各類型、啟用狀態的位置數。"""

    @abstractmethod
    def active_batch_expiry_buckets(self) -> list[ExpiryBucket]:
        """只算啟用位置；狀態由 Service 以 classify_expiry 判定（AD-11）。"""

    @abstractmethod
    def warning_days(self) -> int:
        """預警天數，讀 alert_setting 中 id 最小的一列（AD-13，只讀）。"""

    @abstractmethod
    def is_referenced(self, location_id: int) -> bool:
        """是否曾被進貨明細、批次或位置變更紀錄引用。"""

    @abstractmethod
    def add(self, location: StorageLocation) -> None: ...

    @abstractmethod
    def delete(self, location: StorageLocation) -> None: ...

    @abstractmethod
    def flush(self) -> None: ...

    @abstractmethod
    def list_location_batches(
        self, location_id: int, page: int, page_size: int
    ) -> tuple[list[InventoryBatch], int]:
        """位於此位置、剩餘量大於 0 的批次，依到期日、id 排序；已載入顯示所需關聯。"""

    @abstractmethod
    def load_batch(self, batch_id: int) -> InventoryBatch:
        """重新讀取批次並載入食材、目前位置、來源明細與單頭，供回應使用。"""

    @abstractmethod
    def source_status(self, source_item_id: int) -> GoodsReceiptStatus:
        """來源進貨單狀態。一般讀取不上鎖：呼叫端已持有批次鎖，鎖單頭會違反 AD-7 鎖序。"""
