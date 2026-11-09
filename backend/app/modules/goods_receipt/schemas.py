from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import GoodsReceiptStatus
from app.core.types import Money, PositiveQuantity

BIGINT_MAX = 2**63 - 1
ExternalId = Annotated[int, Field(gt=0, le=BIGINT_MAX)]


class ReceiptItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: ExternalId | None = None
    ingredient_id: ExternalId
    quantity: PositiveQuantity | None = None
    unit_price: Money | None = None
    expiry_date: date | None = None
    location_id: ExternalId | None = None
    note: str | None = Field(default=None, max_length=500)


class ReceiptDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_id: ExternalId
    receipt_date: date
    items: list[ReceiptItemRequest] = Field(min_length=1)


class ReceiptReverseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value):
        return value.strip() if isinstance(value, str) else value


class ReceiptItemResponse(BaseModel):
    id: int
    ingredient_id: int
    ingredient_name: str
    batch_id: int | None = None
    batch_number: str | None = None
    unit: str
    quantity: PositiveQuantity | None
    unit_price: Money | None
    expiry_date: date | None
    location_id: int | None
    location_name: str | None
    note: str | None


class ReceiptResponse(BaseModel):
    id: int
    receipt_number: str
    supplier_id: int
    supplier_name: str
    receipt_date: date
    status: GoodsReceiptStatus
    created_by_id: int
    created_by_name: str
    created_at: datetime
    confirmed_at: datetime | None
    items: list[ReceiptItemResponse]
    reversed_at: datetime | None = None
    reversed_by_id: int | None = None
    reversed_by_name: str | None = None
    reversal_reason: str | None = None


class ReceiptOption(BaseModel):
    id: int
    name: str
    unit: str | None = None
    code: str | None = None


class ReceiptOptionList(BaseModel):
    items: list[ReceiptOption]
    total: int
    page: int
    page_size: int


class ReceiptList(BaseModel):
    items: list[ReceiptResponse]
    total: int
    page: int
    page_size: int
