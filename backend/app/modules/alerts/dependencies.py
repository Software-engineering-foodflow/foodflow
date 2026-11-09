"""預警 service 的單一組裝點。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.alerts.notifier import InAppNotifier
from app.modules.alerts.repository_sqlalchemy import SqlAlchemyAlertRepository
from app.modules.alerts.rules import AlertRuleFactory
from app.modules.alerts.service import AlertService


def get_alert_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> AlertService:
    return AlertService(
        SqlAlchemyAlertRepository(session), uow, clock, AlertRuleFactory(), InAppNotifier()
    )
