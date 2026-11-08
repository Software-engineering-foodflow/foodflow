"""報表組裝點。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_session
from app.modules.reports.repository_sqlalchemy import SqlAlchemyReportsRepository
from app.modules.reports.service import ReportsService


def build_reports_service(session: Session) -> ReportsService:
    return ReportsService(SqlAlchemyReportsRepository(session))


def get_reports_service(session: Session = Depends(get_session)) -> ReportsService:
    return build_reports_service(session)
