"""報廢組裝點。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.waste.repository_sqlalchemy import SqlAlchemyWasteRepository
from app.modules.waste.service import WasteService


def build_waste_service(session: Session, uow: UnitOfWork, clock: Clock) -> WasteService:
    return WasteService(
        SqlAlchemyWasteRepository(session), SqlAlchemyStockLedger(session), uow, clock
    )


def get_waste_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> WasteService:
    return build_waste_service(session, uow, clock)
