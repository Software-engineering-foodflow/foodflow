from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, PlainSerializer, WithJsonSchema

from app.core.enums import ExpiryStatus, GoodsReceiptStatus, StorageType, TransactionType
from app.core.types import NonNegativeQuantity, SignedQuantity

BIGINT_MAX = 2**63 - 1
MAX_PAGE = BIGINT_MAX // 100 + 1
ResponseId = Annotated[
    int,
    Field(gt=0, le=BIGINT_MAX),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[1-9][0-9]*$"}),
]
AggregateQuantity = Annotated[
    Decimal,
    Field(ge=0, decimal_places=3),
    PlainSerializer(lambda value: f"{value:.3f}", return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": r"^[0-9]+\.[0-9]{3}$"}),
]
InventoryStatus = Literal["NORMAL", "EXPIRING_SOON", "EXPIRES_TODAY", "EXPIRED", "LOW_STOCK"]


class InventoryStock(BaseModel):
    ingredient_id: ResponseId
    ingredient_name: str
    category_id: ResponseId
    category_name: str
    unit: str
    storage_method: StorageType
    safety_stock_quantity: NonNegativeQuantity
    is_active: bool
    physical_quantity: AggregateQuantity
    available_quantity: AggregateQuantity
    expired_quantity: AggregateQuantity
    store_available_quantity: AggregateQuantity
    is_low_stock: bool
    shortfall_quantity: NonNegativeQuantity


class InventoryList(BaseModel):
    items: list[InventoryStock]
    total: int
    page: int
    page_size: int
    today: date
    warning_days: int


class InventoryBatchResponse(BaseModel):
    id: ResponseId
    batch_number: str
    ingredient_id: ResponseId
    ingredient_name: str
    unit: str
    source_item_id: ResponseId
    receipt_id: ResponseId
    receipt_number: str
    receipt_status: GoodsReceiptStatus
    supplier_id: ResponseId
    supplier_name: str
    received_date: date
    expiry_date: date
    days_until_expiry: int
    expiry_status: ExpiryStatus
    location_id: ResponseId
    location_name: str
    initial_quantity: NonNegativeQuantity
    remaining_quantity: NonNegativeQuantity
    is_depleted: bool


class InventoryBatchList(BaseModel):
    items: list[InventoryBatchResponse]
    total: int
    page: int
    page_size: int
    ingredient_id: ResponseId
    ingredient_name: str
    unit: str
    today: date
    warning_days: int


class InventoryTransactionResponse(BaseModel):
    id: ResponseId
    type: TransactionType
    quantity_delta: SignedQuantity
    quantity_before: NonNegativeQuantity
    quantity_after: NonNegativeQuantity
    operator_id: ResponseId
    operator_name: str
    occurred_at: datetime
    reason: str
    is_non_fefo: bool
    reverses_transaction_id: ResponseId | None


class InventoryTransactionList(BaseModel):
    items: list[InventoryTransactionResponse]
    total: int
    page: int
    page_size: int


class InventoryLocationChange(BaseModel):
    id: ResponseId
    from_location_id: ResponseId
    from_location_name: str
    to_location_id: ResponseId
    to_location_name: str
    operator_id: ResponseId
    operator_name: str
    occurred_at: datetime
    reason: str


class InventoryLocationChangeList(BaseModel):
    items: list[InventoryLocationChange]
    total: int
    page: int
    page_size: int


class InventoryOptionResponse(BaseModel):
    id: ResponseId
    name: str
    is_active: bool


class InventoryOptionList(BaseModel):
    items: list[InventoryOptionResponse]
    total: int
    page: int
    page_size: int
