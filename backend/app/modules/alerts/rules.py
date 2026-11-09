"""四種獨立預警規則，共用效期與低庫存的 domain 定義。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.enums import ExpiryStatus
from app.domain.expiry import classify_expiry, days_until_expiry
from app.domain.stock import is_low_stock, shortfall
from app.modules.alerts.repository import BatchSnapshot, StockSnapshot


@dataclass(frozen=True)
class AlertAction:
    type: str
    ingredient_id: int
    batch_id: int | None = None
    quantity: Decimal | None = None
    reason: str | None = None


@dataclass(frozen=True)
class AlertItem:
    status: str
    rank: int
    ingredient_id: int
    ingredient_name: str
    unit: str
    actions: tuple[AlertAction, ...]
    batch_id: int | None = None
    batch_number: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    remaining_quantity: Decimal | None = None
    expiry_date: date | None = None
    days_until_expiry: int | None = None
    store_available_quantity: Decimal | None = None
    safety_stock_quantity: Decimal | None = None
    shortfall: Decimal | None = None
    location_available_quantity: Decimal | None = None


class AlertRule(ABC):
    @abstractmethod
    def evaluate(
        self, batches: tuple[BatchSnapshot, ...], stocks: tuple[StockSnapshot, ...], today: date
    ) -> list[AlertItem]: ...


class ExpiryRule(AlertRule):
    status: ExpiryStatus
    rank: int

    def __init__(self, warning_days: int) -> None:
        self.warning_days = warning_days

    def evaluate(self, batches, stocks, today) -> list[AlertItem]:
        result = []
        for batch in batches:
            if batch.remaining_quantity <= 0:
                continue
            status = classify_expiry(batch.expiry_date, today, self.warning_days)
            if status != self.status:
                continue
            actions = [
                AlertAction(
                    "WASTE",
                    batch.ingredient_id,
                    batch.batch_id,
                    batch.remaining_quantity,
                    "EXPIRED" if status == ExpiryStatus.EXPIRED else None,
                )
            ]
            if status != ExpiryStatus.EXPIRED:
                actions.insert(0, AlertAction("ISSUE", batch.ingredient_id, batch.batch_id))
            result.append(
                AlertItem(
                    status=status.value,
                    rank=self.rank,
                    ingredient_id=batch.ingredient_id,
                    ingredient_name=batch.ingredient_name,
                    unit=batch.unit,
                    actions=tuple(actions),
                    batch_id=batch.batch_id,
                    batch_number=batch.batch_number,
                    location_id=batch.location_id,
                    location_name=batch.location_name,
                    **{"remaining_quantity": batch.remaining_quantity},
                    expiry_date=batch.expiry_date,
                    days_until_expiry=days_until_expiry(batch.expiry_date, today),
                )
            )
        return result


class ExpiredRule(ExpiryRule):
    status = ExpiryStatus.EXPIRED
    rank = 0


class ExpiresTodayRule(ExpiryRule):
    status = ExpiryStatus.EXPIRES_TODAY
    rank = 1


class ExpiringSoonRule(ExpiryRule):
    status = ExpiryStatus.EXPIRING_SOON
    rank = 2


class LowStockRule(AlertRule):
    rank = 3

    def evaluate(self, batches, stocks, today) -> list[AlertItem]:
        return [
            AlertItem(
                status="LOW_STOCK",
                rank=self.rank,
                ingredient_id=stock.ingredient_id,
                ingredient_name=stock.ingredient_name,
                unit=stock.unit,
                actions=(AlertAction("CREATE_GOODS_RECEIPT", stock.ingredient_id),),
                store_available_quantity=stock.store_available_quantity,
                safety_stock_quantity=stock.safety_stock_quantity,
                shortfall=shortfall(stock.store_available_quantity, stock.safety_stock_quantity),
                location_available_quantity=stock.available_quantity,
            )
            for stock in stocks
            if stock.is_active
            and is_low_stock(stock.store_available_quantity, stock.safety_stock_quantity)
        ]


class AlertRuleFactory:
    def create(self, warning_days: int) -> tuple[AlertRule, ...]:
        return (
            ExpiredRule(warning_days),
            ExpiresTodayRule(warning_days),
            ExpiringSoonRule(warning_days),
            LowStockRule(),
        )
