"""AD-12：驗證員工自己選的批次與數量，不改分配到其他批次。"""

from collections.abc import Sequence
from decimal import Decimal

from app.core.errors import insufficient_stock
from app.modules.issue.strategies.base import (
    Allocation,
    BatchCandidate,
    BatchSelectionStrategy,
    SelectionRequest,
    available_quantity,
)


class ManualStrategy(BatchSelectionStrategy):
    def select(
        self, candidates: Sequence[BatchCandidate], request: SelectionRequest
    ) -> list[Allocation]:
        """lines 必填且批次不重複；不在候選中的批次視為剩餘量 0。"""
        if request.lines is None:
            raise ValueError("ManualStrategy 需要員工選的明細")
        batch_ids = [line.batch_id for line in request.lines]
        if len(batch_ids) != len(set(batch_ids)):
            raise ValueError("同一批次不可重複出現")
        by_id = {candidate.batch_id: candidate for candidate in candidates}
        available = available_quantity(candidates)
        for line in request.lines:
            candidate = by_id.get(line.batch_id)
            remaining = candidate.remaining_quantity if candidate else Decimal("0")
            if line.quantity > remaining:
                # 位置參數依序是 batch_id、remaining_quantity、available_quantity；
                # AD-5 的架構測試會把 remaining_quantity= 關鍵字參數視為寫入批次。
                raise insufficient_stock(line.batch_id, remaining, available)
        return [Allocation(line.batch_id, line.quantity) for line in request.lines]
