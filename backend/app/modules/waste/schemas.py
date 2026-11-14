"""員工及管理者分開的回應，避免成本欄位洩漏。"""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema

from app.core.enums import GoodsReceiptStatus, WasteReason
from app.core.types import NonNegativeQuantity, PositiveQuantity

LossAmount = Annotated[
    Decimal,
    Field(ge=0, lt=Decimal("1000000000000")),
    PlainSerializer(lambda value: f"{value:.2f}", return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": r"^[0-9]{1,12}\.[0-9]{2}$"}),
]


class WasteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: int = Field(strict=True, gt=0)
    quantity: PositiveQuantity
    reason: WasteReason
    note: str | None = Field(default=None, max_length=2000)


class WasteReject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=2000)


class WasteRequestResponse(BaseModel):
    id: int
    batch_id: int
    batch_number: str
    ingredient_name: str
    unit: str
    location_name: str
    quantity: PositiveQuantity
    reason: WasteReason
    note: str | None
    operator_id: int
    operator_name: str
    occurred_at: datetime
    status: Literal["PENDING", "APPROVED", "REJECTED"]
    reviewer_name: str | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    record_id: int | None
    transaction_id: int | None


class WasteRequestPage(BaseModel):
    items: list[WasteRequestResponse]
    total: int
    page: int
    page_size: int


def request_response(request):
    return WasteRequestResponse(
        id=request.id,
        batch_id=request.batch_id,
        batch_number=request.batch.batch_number,
        ingredient_name=request.batch.ingredient.name,
        unit=request.batch.ingredient.unit,
        location_name=request.batch.current_location.name,
        quantity=request.quantity,
        reason=request.reason,
        note=request.note,
        operator_id=request.operator_id,
        operator_name=request.operator.name,
        occurred_at=request.occurred_at,
        status=request.status,
        reviewer_name=request.reviewer.name if request.reviewer else None,
        reviewed_at=request.reviewed_at,
        rejection_reason=request.rejection_reason,
        record_id=request.record_id,
        transaction_id=request.record.transaction_id if request.record else None,
    )


class WasteResponse(BaseModel):
    id: int
    transaction_id: int
    operation_group_id: UUID
    batch_id: int
    batch_number: str
    ingredient_name: str
    unit: str
    quantity: PositiveQuantity
    quantity_after: NonNegativeQuantity
    reason: WasteReason
    note: str | None
    operator_id: int
    operator_name: str
    occurred_at: datetime


class AdminWasteResponse(WasteResponse):
    loss_amount: LossAmount | None


class WastePage(BaseModel):
    items: list[AdminWasteResponse | WasteResponse]
    total: int
    page: int
    page_size: int


class WasteBatchResponse(BaseModel):
    id: int
    batch_number: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    remaining_quantity: NonNegativeQuantity
    expiry_date: date
    location_name: str
    source_receipt_id: int
    source_status: GoodsReceiptStatus


class WasteBatchPage(BaseModel):
    items: list[WasteBatchResponse]
    total: int
    page: int
    page_size: int


def waste_response(record, admin: bool):
    fields = dict(
        id=record.id,
        transaction_id=record.transaction_id,
        operation_group_id=record.transaction.operation_group_id,
        batch_id=record.batch_id,
        batch_number=record.batch.batch_number,
        ingredient_name=record.batch.ingredient.name,
        unit=record.batch.ingredient.unit,
        quantity=record.quantity,
        quantity_after=record.transaction.quantity_after,
        reason=record.reason,
        note=record.note,
        operator_id=record.operator_id,
        operator_name=record.operator.name,
        occurred_at=record.occurred_at,
    )
    if admin:
        return AdminWasteResponse(**fields, loss_amount=record.loss_amount)
    return WasteResponse(**fields)


def batch_response(batch):
    return WasteBatchResponse(
        id=batch.id,
        batch_number=batch.batch_number,
        ingredient_id=batch.ingredient_id,
        ingredient_name=batch.ingredient.name,
        unit=batch.ingredient.unit,
        **{"remaining_quantity": batch.remaining_quantity},
        expiry_date=batch.expiry_date,
        location_name=batch.current_location.name,
        source_receipt_id=batch.source_item.receipt_id,
        source_status=batch.source_item.receipt.status,
    )
