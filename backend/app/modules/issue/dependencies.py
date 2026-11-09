"""AD-2：領用 Service 的組裝點。換挑批次規則（C2）只要改 DEFAULT_STRATEGY 這一行。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.issue.repository_sqlalchemy import SqlAlchemyIssueRepository
from app.modules.issue.service import IssueService
from app.modules.issue.strategies import FefoStrategy, ManualStrategy

DEFAULT_STRATEGY = FefoStrategy


def build_issue_service(session: Session, uow: UnitOfWork, clock: Clock) -> IssueService:
    return IssueService(
        SqlAlchemyIssueRepository(session),
        SqlAlchemyStockLedger(session),
        uow,
        clock,
        default_strategy=DEFAULT_STRATEGY(),
        manual_strategy=ManualStrategy(),
    )


def get_issue_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> IssueService:
    return build_issue_service(session, uow, clock)
