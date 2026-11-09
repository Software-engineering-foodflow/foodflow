from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.dependencies import get_clock, get_session
from app.modules.inventory.repository_sqlalchemy import SqlAlchemyInventoryRepository
from app.modules.inventory.service import InventoryService


def build_inventory_service(session: Session, clock: Clock) -> InventoryService:
    return InventoryService(SqlAlchemyInventoryRepository(session), clock)


def get_inventory_service(
    session: Session = Depends(get_session), clock: Clock = Depends(get_clock)
) -> InventoryService:
    return build_inventory_service(session, clock)
