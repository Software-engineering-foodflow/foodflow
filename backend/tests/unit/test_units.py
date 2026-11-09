"""數量單位規則（A2），不連資料庫。"""

from decimal import Decimal

import pytest

from app.domain.units import allows_fraction, is_whole


@pytest.mark.parametrize(
    ("unit", "expected"),
    [("顆", False), ("個", False), (" 顆 ", False), ("盒", True), ("公斤", True), ("瓶", True)],
)
def test_only_indivisible_units_forbid_fractions(unit: str, expected: bool) -> None:
    assert allows_fraction(unit) is expected


@pytest.mark.parametrize(
    ("quantity", "expected"), [("3", True), ("3.000", True), ("2.5", False), ("0.001", False)]
)
def test_is_whole(quantity: str, expected: bool) -> None:
    assert is_whole(Decimal(quantity)) is expected
