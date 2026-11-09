"""所有盤點端點均只開放管理者。"""

from fastapi import APIRouter, Depends, Query

from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee
from app.modules.auth.dependencies import require_admin
from app.modules.stocktake.dependencies import get_stocktake_service
from app.modules.stocktake.schemas import (
    StocktakeBatchPage,
    StocktakeConfirmRequest,
    StocktakePreview,
    StocktakePreviewLine,
    StocktakePreviewRequest,
    StocktakeResponse,
    batch_response,
)
from app.modules.stocktake.service import ConfirmLine, CountLine, StocktakeService

router = APIRouter(
    prefix="/stocktakes",
    tags=["stocktake"],
    responses=ERROR_RESPONSES,
    dependencies=[Depends(require_admin)],
)


@router.get("/batches", response_model=StocktakeBatchPage)
def batches(
    search: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: StocktakeService = Depends(get_stocktake_service),
):
    items, total = service.batches(search, page, page_size)
    return StocktakeBatchPage(
        items=[batch_response(batch) for batch in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/preview", response_model=StocktakePreview)
def preview(
    body: StocktakePreviewRequest,
    service: StocktakeService = Depends(get_stocktake_service),
):
    lines = service.preview([CountLine(**line.model_dump()) for line in body.lines])
    return StocktakePreview(lines=[StocktakePreviewLine.model_validate(line) for line in lines])


@router.post("", response_model=StocktakeResponse)
def confirm(
    body: StocktakeConfirmRequest,
    employee: Employee = Depends(require_admin),
    service: StocktakeService = Depends(get_stocktake_service),
):
    return service.confirm([ConfirmLine(**line.model_dump()) for line in body.lines], employee.id)
