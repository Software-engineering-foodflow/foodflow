"""AD-12：批次挑選 Strategy 的共用型別。

Strategy 只接收已過濾（未過期、剩餘量大於 0）的不可變候選，不查資料庫、不讀時間。
"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class BatchCandidate:
    batch_id: int
    batch_number: str
    expiry_date: date
    received_date: date
    remaining_quantity: Decimal


@dataclass(frozen=True)
class SelectionLine:
    batch_id: int
    quantity: Decimal


@dataclass(frozen=True)
class SelectionRequest:
    """lines 為 None 時由策略自行分配 total_quantity；有 lines 時 total_quantity 是 lines 合計。"""

    total_quantity: Decimal
    lines: tuple[SelectionLine, ...] | None = None


@dataclass(frozen=True)
class Allocation:
    batch_id: int
    quantity: Decimal


def available_quantity(candidates: Sequence[BatchCandidate]) -> Decimal:
    return sum((candidate.remaining_quantity for candidate in candidates), Decimal("0"))


class BatchSelectionStrategy(ABC):
    def order(self, candidates: Sequence[BatchCandidate]) -> list[BatchCandidate]:
        """建議的拿取順序，用在畫面排序；預設維持傳入順序。"""
        return list(candidates)

    @abstractmethod
    def select(
        self, candidates: Sequence[BatchCandidate], request: SelectionRequest
    ) -> list[Allocation]:
        """回傳各批次的分配量（皆大於 0）；可用量不足時丟 INSUFFICIENT_STOCK。"""
