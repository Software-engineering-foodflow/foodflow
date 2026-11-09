"""報廢資料存取契約。"""

from abc import ABC, abstractmethod
from uuid import UUID

from app.db.models import InventoryBatch, WasteRecord


class WasteRepository(ABC):
    @abstractmethod
    def serialize_operation(self, key: UUID) -> None: ...

    @abstractmethod
    def add(self, record: WasteRecord) -> WasteRecord: ...

    @abstractmethod
    def by_transaction(self, transaction_id: int) -> WasteRecord | None: ...

    @abstractmethod
    def get(self, record_id: int) -> WasteRecord | None: ...

    @abstractmethod
    def list_records(self, page: int, page_size: int) -> tuple[list[WasteRecord], int]: ...

    @abstractmethod
    def batches(
        self, search: str, page: int, page_size: int
    ) -> tuple[list[InventoryBatch], int]: ...

    @abstractmethod
    def batch(self, batch_id: int) -> InventoryBatch | None: ...
