"""AD-12：先到期先使用。到期日相同時依進貨日，再依批號。"""

from collections.abc import Sequence

from app.core.errors import insufficient_stock
from app.modules.issue.strategies.base import (
    Allocation,
    BatchCandidate,
    BatchSelectionStrategy,
    SelectionRequest,
    available_quantity,
)


class FefoStrategy(BatchSelectionStrategy):
    def order(self, candidates: Sequence[BatchCandidate]) -> list[BatchCandidate]:
        return sorted(
            candidates,
            key=lambda item: (
                item.expiry_date,
                item.received_date,
                item.batch_number,
                item.batch_id,
            ),
        )

    def select(
        self, candidates: Sequence[BatchCandidate], request: SelectionRequest
    ) -> list[Allocation]:
        available = available_quantity(candidates)
        if request.total_quantity > available:
            raise insufficient_stock(available_quantity=available)
        allocations: list[Allocation] = []
        needed = request.total_quantity
        for candidate in self.order(candidates):
            if needed <= 0:
                break
            take = min(needed, candidate.remaining_quantity)
            allocations.append(Allocation(candidate.batch_id, take))
            needed -= take
        return allocations
