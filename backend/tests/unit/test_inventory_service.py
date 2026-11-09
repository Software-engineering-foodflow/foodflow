from datetime import timedelta
from decimal import Decimal
from unittest.mock import create_autospec

import pytest

from app.core.clock import Clock, FixedClock
from app.core.enums import StorageType
from app.core.errors import DomainError
from app.modules.inventory.repository import InventoryFilters, InventoryRepository, StockRow
from app.modules.inventory.service import InventoryService
from tests.integration.factories import NOW, TODAY


def row(available="7", safety="10", active=True):
    return StockRow(
        1,
        "雞胸肉",
        2,
        "肉類",
        "kg",
        StorageType.REFRIGERATED,
        Decimal(safety),
        active,
        Decimal("9"),
        Decimal(available),
        Decimal("2"),
        Decimal(available),
    )


@pytest.mark.parametrize(
    "available,safety,active,low,gap",
    [
        ("7", "10", True, True, "3"),
        ("10", "10", True, True, "0"),
        ("11", "10", True, False, "0"),
        ("0", "0", True, False, "0"),
        ("0", "10", False, False, "10"),
    ],
)
def test_stock_uses_shared_rules(available, safety, active, low, gap):
    repository = create_autospec(InventoryRepository, instance=True)
    repository.warning_days.return_value = 0
    repository.overview.return_value = ([row(available, safety, active)], 1)
    service = InventoryService(repository, FixedClock(NOW))
    result = service.overview(InventoryFilters())
    assert result["items"][0]["is_low_stock"] is low
    assert result["items"][0]["shortfall_quantity"] == Decimal(gap)
    assert result["today"] == TODAY and result["warning_days"] == 0
    repository.overview.assert_called_once_with(InventoryFilters(), TODAY, 0)


class MidnightClock(Clock):
    reads = 0

    def now(self):
        self.reads += 1
        return NOW + timedelta(days=self.reads - 1)


def test_overview_reads_clock_once_and_does_not_mix_days():
    repository = create_autospec(InventoryRepository, instance=True)
    repository.warning_days.return_value = 3
    repository.overview.return_value = ([], 0)
    clock = MidnightClock()
    service = InventoryService(repository, clock)
    result = service.overview(InventoryFilters())
    assert clock.reads == 1 and result["today"] == TODAY
    repository.overview.assert_called_once_with(InventoryFilters(), TODAY, 3)


@pytest.mark.parametrize(
    "method,args",
    [
        ("batches", (1, None, 1, 20)),
        ("batch", (1,)),
        ("transactions", (1, 1, 20)),
        ("location_changes", (1, 1, 20)),
    ],
)
def test_unknown_resources(method, args):
    repository = create_autospec(InventoryRepository, instance=True)
    repository.ingredient.return_value = None
    repository.batch.return_value = None
    with pytest.raises(DomainError) as error:
        getattr(InventoryService(repository, FixedClock(NOW)), method)(*args)
    assert error.value.status_code == 404
