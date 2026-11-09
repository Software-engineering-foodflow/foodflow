"""ManualStrategy（AD-12），不連資料庫。"""

from datetime import date
from decimal import Decimal

import pytest

from app.core.enums import ErrorCode
from app.core.errors import DomainError
from app.modules.issue.strategies import (
    Allocation,
    BatchCandidate,
    ManualStrategy,
    SelectionLine,
    SelectionRequest,
)

A = BatchCandidate(1, "B-00000001", date(2026, 11, 1), date(2026, 10, 25), Decimal("5"))
B = BatchCandidate(2, "B-00000002", date(2026, 11, 7), date(2026, 10, 26), Decimal("8"))


def select(*lines: tuple[int, str]) -> list[Allocation]:
    selection = tuple(SelectionLine(batch_id, Decimal(quantity)) for batch_id, quantity in lines)
    total = sum((line.quantity for line in selection), Decimal("0"))
    return ManualStrategy().select([A, B], SelectionRequest(total, selection))


def test_returns_the_employee_lines_in_their_order() -> None:
    assert select((2, "1"), (1, "2")) == [Allocation(2, Decimal("1")), Allocation(1, Decimal("2"))]


def test_line_may_take_the_whole_remaining_quantity() -> None:
    assert select((1, "5")) == [Allocation(1, Decimal("5"))]


def test_line_over_remaining_raises_with_latest_quantities() -> None:
    with pytest.raises(DomainError) as caught:
        select((1, "2"), (2, "9"))

    assert caught.value.code is ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details == {
        "batch_id": 2,
        "remaining_quantity": "8.000",
        "available_quantity": "13.000",
    }


def test_batch_outside_the_candidates_counts_as_empty() -> None:
    with pytest.raises(DomainError) as caught:
        select((99, "1"))

    assert caught.value.details["batch_id"] == 99
    assert caught.value.details["remaining_quantity"] == "0.000"


def test_requires_lines_and_rejects_duplicates() -> None:
    with pytest.raises(ValueError):
        ManualStrategy().select([A], SelectionRequest(Decimal("1")))
    with pytest.raises(ValueError):
        select((1, "1"), (1, "1"))
