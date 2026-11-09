"""報表日期、跨期沖銷、單位與未知成本事件數。"""

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace as Obj
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.core.enums import EmployeeRole, WasteReason
from app.core.enums import TransactionType as T
from app.core.errors import DomainError
from app.main import create_app
from app.modules.auth.dependencies import get_current_employee
from app.modules.reports.dependencies import get_reports_service
from app.modules.reports.repository import ReportsRepository
from app.modules.reports.schemas import StockReportRow, WasteReportGroup
from app.modules.reports.service import ReportsService, date_range

START, END = date_range(date(2026, 11, 6), date(2026, 11, 6))


def ingredient(id=1, unit="公斤"):
    return Obj(id=id, name=f"食材{id}", unit=unit, category_id=7, category=Obj(name="肉類"))


def tx(id, at, quantity, type=T.RECEIPT, original=None, item=None):
    return Obj(
        id=id,
        occurred_at=at,
        quantity_delta=Decimal(quantity),
        type=type,
        reverses=original,
        reverses_transaction_id=original.id if original else None,
        batch=Obj(ingredient=item or ingredient()),
        operator=Obj(name="員工"),
    )


def test_taipei_half_open_range():
    assert START.isoformat() == "2026-11-06T00:00:00+08:00"
    assert END.isoformat() == "2026-11-07T00:00:00+08:00"


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (date(2026, 11, 7), date(2026, 11, 6)),
        (None, date(2026, 11, 6)),
        (date(2026, 11, 6), None),
        (date.max, date.max),
    ],
)
def test_invalid_dates(start, end):
    with pytest.raises(DomainError):
        date_range(start, end)


def test_opening_only_and_cross_period_reversal_balance():
    original = tx(1, START - timedelta(days=1), "10")
    reversed_tx = tx(2, START, "-10", T.REVERSAL, original)
    static = tx(3, START - timedelta(days=1), "7", item=ingredient(2))
    repo = Mock(spec=ReportsRepository)
    repo.history_before.return_value = [original, reversed_tx, static]
    rows = ReportsService(repo).stock(date(2026, 11, 6), date(2026, 11, 6))
    repo.history_before.assert_called_once_with(END)
    assert rows[0]["opening"] == 10
    assert rows[0]["receipt"] == -10
    assert rows[0]["closing"] == 0
    assert rows[1]["opening"] == rows[1]["closing"] == 7
    for row in rows:
        assert (
            row["opening"] + row["receipt"] - row["issue"] - row["waste"] + row["adjustment"]
            == row["closing"]
        )


def test_all_original_categories_with_reversal():
    rows = []
    for idx, (kind, delta) in enumerate(
        [(T.RECEIPT, "10"), (T.ISSUE, "-2"), (T.WASTE, "-3"), (T.ADJUSTMENT, "1")]
    ):
        original = tx(idx, START, delta, kind)
        rows.extend([original, tx(idx + 10, START, str(-Decimal(delta)), T.REVERSAL, original)])
    repo = Mock(spec=ReportsRepository)
    repo.history_before.return_value = rows
    row = ReportsService(repo).stock(date(2026, 11, 6), date(2026, 11, 6))[0]
    assert all(
        row[k] == 0 for k in ["opening", "receipt", "issue", "waste", "adjustment", "closing"]
    )


def event(id, item, amount, original=None):
    transaction = tx(
        id, START, "2" if original else "-2", T.REVERSAL if original else T.WASTE, original, item
    )
    record = Obj(
        id=id if original is None else original.id,
        batch_id=1,
        batch=Obj(ingredient=item, batch_number="B-1"),
        reason=WasteReason.EXPIRED,
        note=None,
        loss_amount=Decimal(amount) if amount is not None else None,
    )
    return record, transaction


@pytest.mark.parametrize("group_by", ["category", "reason", "ingredient"])
def test_units_known_total_unknown_event_count_and_details(group_by):
    unknown = event(1, ingredient(), None)
    reversal = event(2, ingredient(), None, unknown[1])
    repo = Mock(spec=ReportsRepository)
    repo.waste_events.return_value = [
        unknown,
        reversal,
        event(3, ingredient(), "240"),
        event(4, ingredient(2, "包"), "0"),
    ]
    rows = ReportsService(repo).waste(date(2026, 11, 6), date(2026, 11, 6), group_by)
    kg = next(r for r in rows if r["unit"] == "公斤")
    assert kg["unknown_cost_count"] == 2  # 兩個事件，但只是一筆報廢與其沖銷。
    assert kg["quantity"] == 2 and kg["known_loss_amount"] == 240
    assert len(kg["details"]) == 3
    assert sum(d["quantity"] for d in kg["details"]) == kg["quantity"]
    assert len(rows) == 2


def test_reversal_cost_is_negative_in_actual_period():
    original = event(1, ingredient(), "240")
    repo = Mock(spec=ReportsRepository)
    repo.waste_events.return_value = [event(2, ingredient(), "240", original[1])]
    row = ReportsService(repo).waste(date(2026, 11, 6), date(2026, 11, 6), "reason")[0]
    assert row["quantity"] == -2 and row["known_loss_amount"] == -240
    assert WasteReportGroup(**row).model_dump(mode="json")["known_loss_amount"] == "-240.00"


def test_aggregate_output_accepts_large_signed_values():
    row = StockReportRow(
        ingredient_id=1,
        ingredient_name="測試",
        unit="公斤",
        **{
            key: Decimal("-1234567890123.123")
            for key in ["opening", "receipt", "issue", "waste", "adjustment", "closing"]
        },
    )
    assert row.model_dump(mode="json")["receipt"] == "-1234567890123.123"
    assert "[0-9]+" in row.model_json_schema()["properties"]["receipt"]["pattern"]


def test_api_invalid_dates_422_and_staff_stock_allowed():
    repo = Mock(spec=ReportsRepository)
    repo.history_before.return_value = []
    app = create_app()
    app.dependency_overrides[get_current_employee] = lambda: Obj(id=1, role=EmployeeRole.STAFF)
    app.dependency_overrides[get_reports_service] = lambda: ReportsService(repo)
    client = TestClient(app)
    assert (
        client.get("/api/v1/reports/stock?start_date=2026-11-06&end_date=2026-11-06").json() == []
    )
    response = client.get("/api/v1/reports/stock?start_date=2026-11-07&end_date=2026-11-06")
    assert response.status_code == 422
    assert response.json()["error"]["fields"][0]["field"] == "end_date"


def test_nonzero_mixed_movements_and_cross_period_reversals():
    old_issue = tx(2, START - timedelta(days=1), "-2", T.ISSUE)
    old_waste = tx(3, START - timedelta(days=1), "-3", T.WASTE)
    old_adjustment = tx(4, START - timedelta(days=1), "-1", T.ADJUSTMENT)
    repo = Mock(spec=ReportsRepository)
    repo.history_before.return_value = [
        tx(1, START - timedelta(days=1), "20"),
        old_issue,
        old_waste,
        old_adjustment,
        tx(5, START, "10"),
        tx(6, START, "-4", T.ISSUE),
        tx(7, START, "-5", T.WASTE),
        tx(8, START, "3", T.ADJUSTMENT),
        tx(9, START, "-2", T.ADJUSTMENT),
        tx(10, START, "2", T.REVERSAL, old_issue),
        tx(11, START, "3", T.REVERSAL, old_waste),
        tx(12, START, "1", T.REVERSAL, old_adjustment),
    ]
    row = ReportsService(repo).stock(date(2026, 11, 6), date(2026, 11, 6))[0]
    assert {
        k: row[k] for k in ["opening", "receipt", "issue", "waste", "adjustment", "closing"]
    } == {
        "opening": 14,
        "receipt": 10,
        "issue": 2,
        "waste": 2,
        "adjustment": 2,
        "closing": 22,
    }
    assert (
        row["opening"] + row["receipt"] - row["issue"] - row["waste"] + row["adjustment"]
        == row["closing"]
    )


@pytest.mark.parametrize(
    "group_by,expected",
    [
        (
            "ingredient",
            {
                "1": ("食材1", 4, 15, 0, {1, 4}),
                "2": ("食材2", 2, 20, 0, {2}),
                "3": ("食材3", 2, 0, 1, {3}),
            },
        ),
        ("category", {"7": ("肉類", 6, 35, 0, {1, 2, 4}), "8": ("菜類", 2, 0, 1, {3})}),
        (
            "reason",
            {"EXPIRED": ("EXPIRED", 4, 10, 1, {1, 3}), "SPOILED": ("SPOILED", 4, 25, 0, {2, 4})},
        ),
    ],
)
def test_grouping_distinguishes_ingredients_categories_and_reasons(group_by, expected):
    first, second, third = ingredient(1), ingredient(2), ingredient(3)
    third.category_id, third.category = 8, Obj(name="菜類")
    events = [
        event(1, first, "10"),
        event(2, second, "20"),
        event(3, third, None),
        event(4, first, "5"),
    ]
    events[1][0].reason = events[3][0].reason = WasteReason.SPOILED
    repo = Mock(spec=ReportsRepository)
    repo.waste_events.return_value = events
    rows = ReportsService(repo).waste(date(2026, 11, 6), date(2026, 11, 6), group_by)
    assert {
        r["key"]: (
            r["label"],
            r["quantity"],
            r["known_loss_amount"],
            r["unknown_cost_count"],
            {d["transaction_id"] for d in r["details"]},
        )
        for r in rows
    } == expected
    assert all(r["unit"] == "公斤" for r in rows)
