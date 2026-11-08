"""報表跨表讀取契約。"""

from abc import ABC, abstractmethod
from datetime import datetime

from app.db.models import BatchLocationChange, InventoryTransaction, WasteRecord


class ReportsRepository(ABC):
    @abstractmethod
    def transactions(
        self,
        start: datetime | None,
        end: datetime | None,
        ingredient_id: int | None,
        batch_id: int | None,
        tx_type: str | None,
        operator_id: int | None,
        page: int,
        page_size: int,
    ) -> tuple[list[InventoryTransaction], int]: ...

    @abstractmethod
    def transaction(self, transaction_id: int) -> InventoryTransaction | None: ...

    @abstractmethod
    def locations(
        self,
        start: datetime | None,
        end: datetime | None,
        ingredient_id: int | None,
        batch_id: int | None,
        operator_id: int | None,
        page: int,
        page_size: int,
    ) -> tuple[list[BatchLocationChange], int]: ...

    @abstractmethod
    def history_before(self, end: datetime) -> list[InventoryTransaction]: ...

    @abstractmethod
    def waste_events(
        self, start: datetime, end: datetime
    ) -> list[tuple[WasteRecord, InventoryTransaction]]: ...
