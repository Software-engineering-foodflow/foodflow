"""站內投遞介面，不觸發任何外部通知。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from app.modules.alerts.rules import AlertItem


@dataclass(frozen=True)
class AlertResult:
    items: tuple[AlertItem, ...]
    generated_at: datetime
    warning_days: int


class AlertNotifier(ABC):
    @abstractmethod
    def deliver(self, result: AlertResult) -> AlertResult: ...


class InAppNotifier(AlertNotifier):
    def deliver(self, result: AlertResult) -> AlertResult:
        return result
