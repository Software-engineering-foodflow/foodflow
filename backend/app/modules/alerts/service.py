"""即時計算、後端排序與設定交易。evaluate 不做通知投遞。"""

from app.core.clock import Clock, FixedClock
from app.core.uow import UnitOfWork
from app.modules.alerts.notifier import AlertNotifier, AlertResult
from app.modules.alerts.repository import AlertRepository, SettingSnapshot
from app.modules.alerts.rules import AlertRuleFactory


class AlertService:
    def __init__(
        self,
        repository: AlertRepository,
        uow: UnitOfWork,
        clock: Clock,
        factory: AlertRuleFactory,
        notifier: AlertNotifier,
    ) -> None:
        self._repository = repository
        self._uow = uow
        self._clock = clock
        self._factory = factory
        self._notifier = notifier

    def evaluate(self, status: str | None = None, location_id: int | None = None) -> AlertResult:
        generated_at = self._clock.now()
        today = FixedClock(generated_at).today()
        setting = self._repository.setting()
        batches = tuple(self._repository.batches(location_id))
        stocks = tuple(self._repository.stocks(today, location_id))
        items = [
            item
            for rule in self._factory.create(setting.warning_days)
            for item in rule.evaluate(batches, stocks, today)
            if status is None or item.status == status
        ]
        items.sort(
            key=lambda item: (
                item.rank,
                item.expiry_date or today,
                item.ingredient_id,
                item.batch_id or 0,
            )
        )
        return AlertResult(tuple(items), generated_at, setting.warning_days)

    def list_alerts(self, status: str | None = None, location_id: int | None = None) -> AlertResult:
        return self._notifier.deliver(self.evaluate(status, location_id))

    def setting(self) -> SettingSnapshot:
        return self._repository.setting()

    def update_setting(self, warning_days: int, operator_id: int) -> SettingSnapshot:
        with self._uow.transaction():
            return self._repository.update_setting(warning_days, operator_id, self._clock.now())
