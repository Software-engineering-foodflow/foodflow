"""全員可查數量；管理者才可查報廢分布。"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.enums import TransactionType
from app.core.errors import ERROR_RESPONSES
from app.modules.auth.dependencies import require_admin
from app.modules.reports.dependencies import get_reports_service
from app.modules.reports.schemas import (
    LocationPage,
    StockReportRow,
    TransactionPage,
    TransactionResponse,
    WasteReportGroup,
    location_response,
    transaction_response,
)
from app.modules.reports.service import ReportsService

router = APIRouter(tags=["reports"], responses=ERROR_RESPONSES)


@router.get("/inventory-transactions", response_model=TransactionPage)
def transactions(
    start_date: date | None = None,
    end_date: date | None = None,
    ingredient_id: int | None = Query(None, gt=0),
    batch_id: int | None = Query(None, gt=0),
    type: TransactionType | None = None,
    operator_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: ReportsService = Depends(get_reports_service),
):
    items, total = service.transactions(
        start_date, end_date, ingredient_id, batch_id, type, operator_id, page, page_size
    )
    return TransactionPage(
        items=[transaction_response(t) for t in items], total=total, page=page, page_size=page_size
    )


@router.get("/inventory-transactions/{transaction_id}", response_model=TransactionResponse)
def transaction(transaction_id: int, service: ReportsService = Depends(get_reports_service)):
    return transaction_response(service.transaction(transaction_id))


@router.get("/batch-location-changes", response_model=LocationPage)
def locations(
    start_date: date | None = None,
    end_date: date | None = None,
    ingredient_id: int | None = Query(None, gt=0),
    batch_id: int | None = Query(None, gt=0),
    operator_id: int | None = Query(None, gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: ReportsService = Depends(get_reports_service),
):
    items, total = service.locations(
        start_date, end_date, ingredient_id, batch_id, operator_id, page, page_size
    )
    return LocationPage(
        items=[location_response(t) for t in items], total=total, page=page, page_size=page_size
    )


@router.get("/reports/stock", response_model=list[StockReportRow])
def stock(start_date: date, end_date: date, service: ReportsService = Depends(get_reports_service)):
    return service.stock(start_date, end_date)


@router.get(
    "/reports/waste", response_model=list[WasteReportGroup], dependencies=[Depends(require_admin)]
)
def waste(
    start_date: date,
    end_date: date,
    group_by: Literal["ingredient", "category", "reason"] = "ingredient",
    service: ReportsService = Depends(get_reports_service),
):
    return service.waste(start_date, end_date, group_by)
