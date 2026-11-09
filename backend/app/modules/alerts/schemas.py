"""預警數量只以固定三位小數字串傳輸。"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.types import NonNegativeQuantity

AlertStatus = Literal["EXPIRED", "EXPIRES_TODAY", "EXPIRING_SOON", "LOW_STOCK"]


class AlertAction(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    type: Literal["ISSUE", "WASTE", "CREATE_GOODS_RECEIPT"]
    ingredient_id: int
    batch_id: int | None = None
    quantity: NonNegativeQuantity | None = None
    reason: Literal["EXPIRED"] | None = None


class AlertItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: AlertStatus
    ingredient_id: int
    ingredient_name: str
    unit: str
    actions: list[AlertAction]
    batch_id: int | None = None
    batch_number: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    remaining_quantity: NonNegativeQuantity | None = None
    expiry_date: date | None = None
    days_until_expiry: int | None = None
    store_available_quantity: NonNegativeQuantity | None = None
    safety_stock_quantity: NonNegativeQuantity | None = None
    shortfall: NonNegativeQuantity | None = None
    location_available_quantity: NonNegativeQuantity | None = None


class AlertList(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: list[AlertItem]
    generated_at: datetime
    warning_days: int


class AlertSettingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    warning_days: int
    updated_at: datetime
    updated_by_id: int | None


class AlertSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    warning_days: int = Field(strict=True, ge=0, le=2147483647)
