"""唯讀報表回應。"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, PlainSerializer, WithJsonSchema

from app.core.enums import TransactionType, WasteReason

ReportQuantity = Annotated[
    Decimal,
    PlainSerializer(lambda v: f"{v:.3f}", return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": r"^-?[0-9]+\.[0-9]{3}$"}),
]

# 加總及沖銷可能為負且超過單筆上限；輸出仍為固定小數字串。
ReportMoney = Annotated[
    Decimal,
    PlainSerializer(lambda v: f"{v:.2f}", return_type=str, when_used="json"),
    WithJsonSchema({"type": "string"}),
]


class TransactionResponse(BaseModel):
    id: int
    operation_group_id: UUID
    batch_id: int
    batch_number: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    type: TransactionType
    quantity_delta: ReportQuantity
    quantity_before: ReportQuantity
    quantity_after: ReportQuantity
    operator_id: int
    operator_name: str
    occurred_at: datetime
    reason: str
    is_non_fefo: bool
    reverses_transaction_id: int | None
    source_receipt_id: int
    source_receipt_number: str
    source_item_id: int


class TransactionPage(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int


class LocationResponse(BaseModel):
    id: int
    batch_id: int
    batch_number: str
    ingredient_name: str
    from_location_name: str
    to_location_name: str
    operator_id: int
    operator_name: str
    occurred_at: datetime
    reason: str


class LocationPage(BaseModel):
    items: list[LocationResponse]
    total: int
    page: int
    page_size: int


class StockReportRow(BaseModel):
    ingredient_id: int
    ingredient_name: str
    unit: str
    opening: ReportQuantity
    receipt: ReportQuantity
    issue: ReportQuantity
    waste: ReportQuantity
    adjustment: ReportQuantity
    closing: ReportQuantity


class WasteReportDetail(BaseModel):
    waste_record_id: int
    transaction_id: int
    reverses_transaction_id: int | None
    batch_id: int
    batch_number: str
    ingredient_name: str
    quantity: ReportQuantity
    loss_amount: ReportMoney | None
    reason: WasteReason
    note: str | None
    occurred_at: datetime
    operator_name: str


class WasteReportGroup(BaseModel):
    key: str
    label: str
    unit: str
    quantity: ReportQuantity
    known_loss_amount: ReportMoney
    unknown_cost_count: int
    details: list[WasteReportDetail]


def transaction_response(tx):
    return TransactionResponse(
        id=tx.id,
        operation_group_id=tx.operation_group_id,
        batch_id=tx.batch_id,
        batch_number=tx.batch.batch_number,
        ingredient_id=tx.batch.ingredient_id,
        ingredient_name=tx.batch.ingredient.name,
        unit=tx.batch.ingredient.unit,
        type=tx.type,
        quantity_delta=tx.quantity_delta,
        quantity_before=tx.quantity_before,
        quantity_after=tx.quantity_after,
        operator_id=tx.operator_id,
        operator_name=tx.operator.name,
        occurred_at=tx.occurred_at,
        reason=tx.reason,
        is_non_fefo=tx.is_non_fefo,
        reverses_transaction_id=tx.reverses_transaction_id,
        source_receipt_id=tx.batch.source_item.receipt_id,
        source_receipt_number=tx.batch.source_item.receipt.receipt_number,
        source_item_id=tx.batch.source_item_id,
    )


def location_response(row):
    return LocationResponse(
        id=row.id,
        batch_id=row.batch_id,
        batch_number=row.batch.batch_number,
        ingredient_name=row.batch.ingredient.name,
        from_location_name=row.from_location.name,
        to_location_name=row.to_location.name,
        operator_id=row.operator_id,
        operator_name=row.operator.name,
        occurred_at=row.occurred_at,
        reason=row.reason,
    )
