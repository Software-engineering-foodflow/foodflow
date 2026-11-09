"""FefoStrategy（AD-12），不連資料庫。"""

from datetime import date
from decimal import Decimal

import pytest

from app.core.enums import ErrorCode
from app.core.errors import DomainError
from app.modules.issue.strategies import (
    Allocation,
    BatchCandidate,
    FefoStrategy,
    SelectionRequest,
)

A = BatchCandidate(1, "B-00000001", date(2026, 11, 1), date(2026, 10, 25), Decimal("5"))
B = BatchCandidate(2, "B-00000002", date(2026, 11, 7), date(2026, 10, 26), Decimal("8"))


def select(candidates, quantity: str) -> list[Allocation]:
    return FefoStrategy().select(candidates, SelectionRequest(Decimal(quantity)))


def test_takes_everything_from_the_earliest_batch_when_it_is_enough() -> None:
    assert select([B, A], "3") == [Allocation(1, Decimal("3"))]


def test_spills_over_to_the_next_batch_in_expiry_order() -> None:
    assert select([B, A], "7") == [Allocation(1, Decimal("5")), Allocation(2, Decimal("2"))]


def test_exactly_the_available_quantity_uses_every_batch() -> None:
    assert select([A, B], "13") == [Allocation(1, Decimal("5")), Allocation(2, Decimal("8"))]


def test_same_expiry_orders_by_received_date_then_batch_number() -> None:
    later_received = BatchCandidate(
        3, "B-00000003", date(2026, 11, 1), date(2026, 10, 28), Decimal("2")
    )
    same_day_higher_number = BatchCandidate(
        4, "B-00000009", date(2026, 11, 1), date(2026, 10, 25), Decimal("2")
    )
    strategy = FefoStrategy()

    ordered = strategy.order([later_received, same_day_higher_number, A])

    assert [item.batch_id for item in ordered] == [1, 4, 3]
    assert select([later_received, same_day_higher_number, A], "6") == [
        Allocation(1, Decimal("5")),
        Allocation(4, Decimal("1")),
    ]


def test_more_than_available_raises_insufficient_stock_with_available_quantity() -> None:
    with pytest.raises(DomainError) as caught:
        select([A, B], "13.001")

    assert caught.value.code is ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details["available_quantity"] == "13.000"


def test_no_candidates_is_insufficient_stock() -> None:
    with pytest.raises(DomainError) as caught:
        select([], "1")

    assert caught.value.details["available_quantity"] == "0.000"


def test_ignores_requested_lines() -> None:
    request = SelectionRequest(Decimal("1"), lines=())
    assert FefoStrategy().select([B, A], request) == [Allocation(1, Decimal("1"))]
