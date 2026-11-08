"""報廢登記、歷史與批次選擇。"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_idempotency_key
from app.core.enums import EmployeeRole
from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee
from app.modules.auth.dependencies import get_current_employee
from app.modules.waste.dependencies import get_waste_service
from app.modules.waste.schemas import (
    AdminWasteResponse,
    WasteBatchPage,
    WasteBatchResponse,
    WasteCreate,
    WastePage,
    WasteResponse,
    batch_response,
    waste_response,
)
from app.modules.waste.service import WasteService

router = APIRouter(prefix="/waste-records", tags=["waste"], responses=ERROR_RESPONSES)


@router.get("/batches", response_model=WasteBatchPage)
def batches(
    search: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: WasteService = Depends(get_waste_service),
):
    items, total = service.batches(search, page, page_size)
    return WasteBatchPage(
        items=[batch_response(b) for b in items], total=total, page=page, page_size=page_size
    )


@router.get("/batches/{batch_id}", response_model=WasteBatchResponse)
def batch(batch_id: int, service: WasteService = Depends(get_waste_service)):
    return batch_response(service.batch(batch_id))


@router.post("", response_model=AdminWasteResponse | WasteResponse)
def create(
    body: WasteCreate,
    key: UUID = Depends(get_idempotency_key),
    employee: Employee = Depends(get_current_employee),
    service: WasteService = Depends(get_waste_service),
):
    record = service.create(body.batch_id, body.quantity, body.reason, body.note, employee.id, key)
    return waste_response(record, employee.role == EmployeeRole.ADMIN)


@router.get("", response_model=WastePage)
def records(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    employee: Employee = Depends(get_current_employee),
    service: WasteService = Depends(get_waste_service),
):
    items, total = service.list_records(page, page_size)
    return WastePage(
        items=[waste_response(r, employee.role == EmployeeRole.ADMIN) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{record_id}", response_model=AdminWasteResponse | WasteResponse)
def record(
    record_id: int,
    employee: Employee = Depends(get_current_employee),
    service: WasteService = Depends(get_waste_service),
):
    return waste_response(service.get(record_id), employee.role == EmployeeRole.ADMIN)
