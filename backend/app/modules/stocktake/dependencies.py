"""盤點組裝點。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.stocktake.repository_sqlalchemy import SqlAlchemyStocktakeRepository
from app.modules.stocktake.service import StocktakeService


def build_stocktake_service(session: Session, uow: UnitOfWork, clock: Clock) -> StocktakeService:
    return StocktakeService(
        SqlAlchemyStocktakeRepository(session), SqlAlchemyStockLedger(session), uow, clock
    )


def get_stocktake_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> StocktakeService:
    return build_stocktake_service(session, uow, clock)
