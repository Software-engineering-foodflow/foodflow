from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.goods_receipt.repository_sqlalchemy import SqlAlchemyGoodsReceiptRepository
from app.modules.goods_receipt.service import GoodsReceiptService
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger


def build_goods_receipt_service(
    session: Session,
    uow: UnitOfWork,
    clock: Clock,
) -> GoodsReceiptService:
    return GoodsReceiptService(
        SqlAlchemyGoodsReceiptRepository(session), SqlAlchemyStockLedger(session), uow, clock
    )


def get_goods_receipt_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> GoodsReceiptService:
    return build_goods_receipt_service(session, uow, clock)
