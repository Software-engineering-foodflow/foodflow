from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from app.core.clock import FixedClock
from app.modules.alerts.notifier import InAppNotifier
from app.modules.alerts.repository import BatchSnapshot, SettingSnapshot, StockSnapshot
from app.modules.alerts.rules import AlertItem, AlertRule, AlertRuleFactory, LowStockRule
from app.modules.alerts.schemas import AlertList, AlertSettingUpdate
from app.modules.alerts.service import AlertService

TODAY = date(2026, 11, 9)


@pytest.mark.parametrize(
    "days,warning,status",
    [
        (-1, 3, "EXPIRED"),
        (0, 0, "EXPIRES_TODAY"),
        (1, 3, "EXPIRING_SOON"),
        (3, 3, "EXPIRING_SOON"),
        (4, 3, None),
        (1, 0, None),
    ],
)
def test_expiry_boundaries_and_actions(days, warning, status):
    batch = BatchSnapshot(
        1, "B-1", 2, "鮮奶", "L", 3, "冷藏", Decimal("1.125"), TODAY + timedelta(days=days)
    )
    items = [
        item
        for rule in AlertRuleFactory().create(warning)
        for item in rule.evaluate((batch,), (), TODAY)
    ]
    assert [item.status for item in items] == ([status] if status else [])
    if items:
        assert items[0].days_until_expiry == days
        assert [action.type for action in items[0].actions] == (
            ["WASTE"] if days < 0 else ["ISSUE", "WASTE"]
        )
        result = AlertList.model_validate(
            dict(items=items, generated_at=datetime(2026, 11, 9, tzinfo=UTC), warning_days=warning)
        ).model_dump(mode="json")
        assert result["items"][0]["remaining_quantity"] == "1.125"
        if days < 0:
            assert result["items"][0]["actions"][0]["reason"] == "EXPIRED"
            assert result["items"][0]["actions"][0]["quantity"] == "1.125"


def test_zero_remaining_batch_never_alerts():
    batch = BatchSnapshot(1, "B", 1, "食材", "kg", 1, "位置", Decimal(0), TODAY)
    assert all(not rule.evaluate((batch,), (), TODAY) for rule in AlertRuleFactory().create(3))


@pytest.mark.parametrize(
    "available,safety,active,expected,gap",
    [
        ("0", "5", True, True, "5"),
        ("5", "5", True, True, "0"),
        ("6", "5", True, False, None),
        ("0", "0", True, False, None),
        ("0", "5", False, False, None),
    ],
)
def test_low_stock_matrix(available, safety, active, expected, gap):
    stock = StockSnapshot(
        1, "食材", "kg", active, Decimal(safety), Decimal(available), Decimal("10"), Decimal("1")
    )
    items = LowStockRule().evaluate((), (stock,), TODAY)
    assert bool(items) == expected
    if expected:
        assert items[0].shortfall == Decimal(gap)
        assert items[0].store_available_quantity == Decimal(available)
        assert items[0].location_available_quantity == Decimal("1")


@pytest.mark.parametrize("value", [-1, 1.5, "3", "no", True, None])
def test_settings_reject_invalid_values(value):
    with pytest.raises(ValidationError):
        AlertSettingUpdate(warning_days=value)


def test_new_rule_priority_and_pure_evaluate_need_no_service_change():
    class NewRule(AlertRule):
        def evaluate(self, batches, stocks, today):
            return [AlertItem("NEW_RULE", -1, 1, "新規則", "kg", ())]

    class ExtendedFactory(AlertRuleFactory):
        def create(self, warning_days):
            return (*super().create(warning_days), NewRule())

    now = datetime(2026, 11, 9, tzinfo=UTC)
    repository = Mock()
    repository.setting.return_value = SettingSnapshot(1, 3, now, None)
    repository.batches.return_value = [
        BatchSnapshot(
            1,
            "B",
            1,
            "食材",
            "kg",
            1,
            "位置",
            Decimal("1"),
            TODAY,
        )
    ]
    repository.stocks.return_value = []
    notifier = Mock(wraps=InAppNotifier())
    service = AlertService(repository, Mock(), FixedClock(now), ExtendedFactory(), notifier)
    assert [item.status for item in service.evaluate().items] == ["NEW_RULE", "EXPIRES_TODAY"]
    notifier.deliver.assert_not_called()
    assert service.list_alerts().items[0].status == "NEW_RULE"
    notifier.deliver.assert_called_once()
