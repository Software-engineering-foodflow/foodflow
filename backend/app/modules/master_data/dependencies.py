from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.master_data.repository_sqlalchemy import SqlAlchemyMasterDataRepository
from app.modules.master_data.service import MasterDataService


def get_master_data_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> MasterDataService:
    return MasterDataService(SqlAlchemyMasterDataRepository(session), uow, clock)
