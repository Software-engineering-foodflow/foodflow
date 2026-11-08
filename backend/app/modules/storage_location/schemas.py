"""儲存位置 API 契約：只接受明列欄位，回應不含內部欄位。"""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.enums import ExpiryStatus, GoodsReceiptStatus, StorageType
from app.core.types import NonNegativeQuantity

LocationCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
LocationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StorageLocationCreate(StrictRequest):
    code: LocationCode
    name: LocationName
    storage_type: StorageType
    description: str | None = Field(default=None, max_length=500)

    @field_validator("description", mode="before")
    @classmethod
    def _blank_description_is_none(cls, value: object) -> object:
        # 空白說明一律存成 null，避免清單出現看不見的內容。
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class StorageLocationUpdate(StorageLocationCreate):
    is_active: bool


class StorageLocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    storage_type: StorageType
    description: str | None
    is_active: bool


class StorageLocationListItem(StorageLocationResponse):
    """清單列另附批次統計；狀態與天數由後端 classify_expiry 判定（AD-11）。"""

    batch_count: int = Field(description="位於此位置、剩餘量大於 0 的批次數")
    nearest_expiry_date: date | None
    nearest_expiry_status: ExpiryStatus | None
    nearest_days_until_expiry: int | None


class StorageLocationList(BaseModel):
    items: list[StorageLocationListItem]
    total: int
    page: int
    page_size: int


MoveReason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class BatchMoveRequest(StrictRequest):
    to_location_id: int
    reason: MoveReason


class LocationBatchResponse(BaseModel):
    id: int
    batch_number: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    remaining_quantity: NonNegativeQuantity
    expiry_date: date
    current_location_id: int
    current_location_code: str
    current_location_name: str
    source_status: GoodsReceiptStatus


class LocationBatchItem(LocationBatchResponse):
    expiry_status: ExpiryStatus
    days_until_expiry: int


class LocationBatchList(BaseModel):
    items: list[LocationBatchItem]
    total: int
    page: int
    page_size: int


class StorageTypeSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    storage_type: StorageType
    location_count: int = Field(description="此類型的啟用位置數")
    batch_count: int
    expired_count: int
    expires_today_count: int
    expiring_soon_count: int


class StorageLocationSummaryResponse(BaseModel):
    """只算啟用位置；total_count 含停用位置。by_type 固定列出全部類型。"""

    model_config = ConfigDict(from_attributes=True)

    active_count: int
    total_count: int
    by_type: list[StorageTypeSummaryResponse]
