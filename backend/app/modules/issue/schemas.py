"""領用 API 契約（AD-9、AD-12）。數量以字串進出；格式錯、重複批次由這裡回 422 VALIDATION_ERROR。"""

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.enums import ExpiryStatus, StorageType
from app.core.types import NonNegativeQuantity, PositiveQuantity

IssueReason = Annotated[str | None, Field(default=None, max_length=500)]


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IssueLineRequest(StrictRequest):
    batch_id: int
    quantity: PositiveQuantity
    reason: IssueReason = None

    @field_validator("reason", mode="before")
    @classmethod
    def _blank_reason_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


def _reject_duplicate_batches(lines: list[IssueLineRequest] | None) -> None:
    if lines is None:
        return
    batch_ids = [line.batch_id for line in lines]
    if len(batch_ids) != len(set(batch_ids)):
        raise ValueError("同一批次不可重複出現，請合併成一行")


class IssueSuggestionRequest(StrictRequest):
    """quantity 與 lines 擇一：quantity 取得 FEFO 建議；lines 檢查員工改選的明細。"""

    ingredient_id: int
    quantity: PositiveQuantity | None = None
    lines: list[IssueLineRequest] | None = Field(default=None, min_length=1)

    @field_validator("lines")
    @classmethod
    def _unique_batches(cls, lines: list[IssueLineRequest] | None) -> list[IssueLineRequest] | None:
        _reject_duplicate_batches(lines)
        return lines

    @model_validator(mode="after")
    def _quantity_or_lines(self) -> Self:
        if (self.quantity is None) == (self.lines is None):
            raise ValueError("請填寫需要的數量，或選擇要領用的批次")
        return self


class IssueCreateRequest(StrictRequest):
    ingredient_id: int
    lines: list[IssueLineRequest] = Field(min_length=1)

    @field_validator("lines")
    @classmethod
    def _unique_batches(cls, lines: list[IssueLineRequest]) -> list[IssueLineRequest]:
        _reject_duplicate_batches(lines)
        return lines


class IssuableIngredientResponse(BaseModel):
    id: int
    name: str
    unit: str
    category_id: int
    category_name: str
    storage_method: StorageType
    available_quantity: NonNegativeQuantity
    is_active: bool
    nearest_expiry_date: date
    nearest_expiry_status: ExpiryStatus
    nearest_days_until_expiry: int
    is_low_stock: bool
    allows_fraction: bool


class IssuableIngredientList(BaseModel):
    items: list[IssuableIngredientResponse]


class SuggestionLineResponse(BaseModel):
    batch_id: int
    batch_number: str
    location_id: int
    location_code: str
    location_name: str
    remaining_quantity: NonNegativeQuantity
    expiry_date: date
    expiry_status: ExpiryStatus
    days_until_expiry: int
    fefo_quantity: NonNegativeQuantity
    quantity: NonNegativeQuantity
    is_non_fefo: bool


class IssueSuggestionResponse(BaseModel):
    """candidates 是全部可領用批次，依建議順序排列；quantity 為 0 的批次是這次沒有分配到的。"""

    ingredient_id: int
    ingredient_name: str
    unit: str
    requested_quantity: NonNegativeQuantity
    available_quantity: NonNegativeQuantity
    candidates: list[SuggestionLineResponse]
    allows_fraction: bool


class IssueLineResponse(BaseModel):
    transaction_id: int
    batch_id: int
    batch_number: str
    quantity: NonNegativeQuantity
    quantity_after: NonNegativeQuantity
    is_non_fefo: bool
    reason: str


class IssueResponse(BaseModel):
    operation_group_id: UUID
    lines: list[IssueLineResponse]


class IssueReversalRequest(StrictRequest):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class IssueReversalResponse(BaseModel):
    occurred_at: datetime
    operator_name: str
    reason: str


class IssueRecordResponse(BaseModel):
    operation_group_id: UUID
    occurred_at: datetime
    operator_name: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    lines: list[IssueLineResponse]
    reversal: IssueReversalResponse | None


class IssueRecordList(BaseModel):
    items: list[IssueRecordResponse]
