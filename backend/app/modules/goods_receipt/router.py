from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee, GoodsReceipt
from app.modules.auth.dependencies import get_current_employee, require_admin
from app.modules.goods_receipt.dependencies import get_goods_receipt_service
from app.modules.goods_receipt.schemas import (
    BIGINT_MAX,
    ReceiptDraftRequest,
    ReceiptItemResponse,
    ReceiptList,
    ReceiptOption,
    ReceiptOptionList,
    ReceiptResponse,
    ReceiptReverseRequest,
)
from app.modules.goods_receipt.service import GoodsReceiptService, ReceiptItemInput

router = APIRouter(prefix="/goods-receipts", tags=["goods-receipts"], responses=ERROR_RESPONSES)
ReceiptId = Annotated[int, Path(gt=0, le=BIGINT_MAX)]


def _response(receipt: GoodsReceipt) -> ReceiptResponse:
    reversal = getattr(receipt, "reversal", None)
    batches = getattr(receipt, "source_batches", {})
    return ReceiptResponse(
        id=receipt.id,
        receipt_number=receipt.receipt_number,
        supplier_id=receipt.supplier_id,
        supplier_name=receipt.supplier.name,
        receipt_date=receipt.receipt_date,
        status=receipt.status,
        created_by_id=receipt.created_by_id,
        created_by_name=receipt.created_by.name,
        created_at=receipt.created_at,
        confirmed_at=receipt.confirmed_at,
        reversed_at=reversal.occurred_at if reversal else None,
        reversed_by_id=reversal.operator_id if reversal else None,
        reversed_by_name=reversal.operator.name if reversal else None,
        reversal_reason=reversal.reason if reversal else None,
        items=[
            ReceiptItemResponse(
                id=item.id,
                batch_id=batches[item.id].id if item.id in batches else None,
                batch_number=batches[item.id].batch_number if item.id in batches else None,
                ingredient_id=item.ingredient_id,
                ingredient_name=item.ingredient.name,
                unit=item.ingredient.unit,
                quantity=item.quantity,
                unit_price=item.unit_price,
                expiry_date=item.expiry_date,
                location_id=item.location_id,
                location_name=item.location.name if item.location is not None else None,
                note=item.note,
            )
            for item in receipt.items
        ],
    )


@router.get("/options/{kind}", response_model=ReceiptOptionList)
def options(
    kind: Literal["suppliers", "ingredients", "locations"],
    search: str = Query(default="", max_length=100),
    include_inactive: bool = False,
    page: int = Query(default=1, ge=1, le=BIGINT_MAX // 100 + 1),
    page_size: int = Query(default=100, ge=1, le=100),
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
) -> ReceiptOptionList:
    items, total = service.options(kind, search, page, page_size, include_inactive)
    return ReceiptOptionList(
        items=[
            ReceiptOption(
                id=item.id,
                name=item.name,
                unit=getattr(item, "unit", None),
                code=getattr(item, "code", None),
            )
            for item in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", status_code=201, response_model=ReceiptResponse)
def create(
    body: ReceiptDraftRequest,
    employee: Employee = Depends(get_current_employee),
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
) -> ReceiptResponse:
    return _response(
        service.create(
            supplier_id=body.supplier_id,
            receipt_date=body.receipt_date,
            items=[ReceiptItemInput(**item.model_dump()) for item in body.items],
            operator_id=employee.id,
        )
    )


@router.get("", response_model=ReceiptList)
def list_receipts(
    receipt_number: str = Query(default="", max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    supplier_id: Annotated[int | None, Query(gt=0, le=BIGINT_MAX)] = None,
    ingredient_id: Annotated[int | None, Query(gt=0, le=BIGINT_MAX)] = None,
    page: int = Query(default=1, ge=1, le=BIGINT_MAX // 100 + 1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
):
    items, total = service.list(
        receipt_number=receipt_number,
        date_from=date_from,
        date_to=date_to,
        supplier_id=supplier_id,
        ingredient_id=ingredient_id,
        page=page,
        page_size=page_size,
    )
    return ReceiptList(
        items=[_response(item) for item in items], total=total, page=page, page_size=page_size
    )


@router.get("/{receipt_id}", response_model=ReceiptResponse)
def get(receipt_id: ReceiptId, service: GoodsReceiptService = Depends(get_goods_receipt_service)):
    return _response(service.get(receipt_id))


@router.patch("/{receipt_id}", response_model=ReceiptResponse)
def update(
    receipt_id: ReceiptId,
    body: ReceiptDraftRequest,
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
):
    return _response(
        service.update(
            receipt_id,
            supplier_id=body.supplier_id,
            receipt_date=body.receipt_date,
            items=[ReceiptItemInput(**item.model_dump()) for item in body.items],
        )
    )


@router.delete("/{receipt_id}", status_code=204)
def delete(
    receipt_id: ReceiptId, service: GoodsReceiptService = Depends(get_goods_receipt_service)
):
    service.delete(receipt_id)
    return Response(status_code=204)


@router.post("/{receipt_id}/confirm", response_model=ReceiptResponse)
def confirm(
    receipt_id: ReceiptId,
    employee: Employee = Depends(get_current_employee),
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
):
    return _response(service.confirm(receipt_id, operator_id=employee.id))


@router.post("/{receipt_id}/reverse", response_model=ReceiptResponse)
def reverse(
    receipt_id: ReceiptId,
    body: ReceiptReverseRequest,
    employee: Employee = Depends(require_admin),
    service: GoodsReceiptService = Depends(get_goods_receipt_service),
):
    return _response(service.reverse(receipt_id, operator_id=employee.id, reason=body.reason))
