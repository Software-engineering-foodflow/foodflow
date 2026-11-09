"""數量單位規則：每項食材一種單位、最多三位小數、不換算（A2）。

不可分割的計數單位（一顆蛋、一個便當盒）只能是整數；盒、包、瓶這類可能拆開使用的單位允許小數。
進貨、報廢、盤點之後也應該共用這裡；若 Epic 1 在食材主檔加上「允許小數」欄位，改由欄位決定即可。
"""

from decimal import Decimal

INDIVISIBLE_UNITS = frozenset({"顆", "個"})


def allows_fraction(unit: str) -> bool:
    return unit.strip() not in INDIVISIBLE_UNITS


def is_whole(quantity: Decimal) -> bool:
    return quantity == quantity.to_integral_value()
