"""AD-2：儲存位置 Service 的組裝點。"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session, get_uow
from app.core.uow import UnitOfWork
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.storage_location.repository_sqlalchemy import (
    SqlAlchemyStorageLocationRepository,
)
from app.modules.storage_location.service import BatchRelocationService, StorageLocationService


def build_storage_location_service(
    session: Session, uow: UnitOfWork, clock: Clock
) -> StorageLocationService:
    return StorageLocationService(SqlAlchemyStorageLocationRepository(session), uow, clock)


def build_batch_relocation_service(
    session: Session, uow: UnitOfWork, clock: Clock
) -> BatchRelocationService:
    return BatchRelocationService(
        SqlAlchemyStorageLocationRepository(session), SqlAlchemyStockLedger(session), uow, clock
    )


def get_storage_location_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> StorageLocationService:
    return build_storage_location_service(session, uow, clock)


def get_batch_relocation_service(
    session: Session = Depends(get_session),
    uow: UnitOfWork = Depends(get_uow),
    clock: Clock = Depends(get_clock),
) -> BatchRelocationService:
    return build_batch_relocation_service(session, uow, clock)
