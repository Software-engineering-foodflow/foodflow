"""數量使用 Decimal 字串；版本 nullable 但不可省略。"""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.types import NonNegativeQuantity, SignedQuantity

PositiveId = Annotated[int, Field(strict=True, gt=0)]


class StocktakeLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: PositiveId
    actual_quantity: NonNegativeQuantity
    reason: str = Field(default="", max_length=2000)
    reason_kind: Literal["DAILY", "PERIODIC", "ANOMALY", "OTHER"] | None = Field(
        default=None, exclude=True
    )
    period: Literal["WEEKLY", "MONTHLY", "QUARTERLY"] | None = Field(default=None, exclude=True)
    note: str | None = Field(default=None, max_length=1900, exclude=True)

    @model_validator(mode="after")
    def normalize_reason(self):
        if self.reason_kind is not None:
            labels = {
                "DAILY": "日常盤點",
                "PERIODIC": "定期盤點",
                "ANOMALY": "異常盤點",
                "OTHER": "其他",
            }
            periods = {"WEEKLY": "每週", "MONTHLY": "每月", "QUARTERLY": "每季"}
            note = (self.note or "").strip()
            if self.reason_kind == "PERIODIC" and not self.period:
                raise ValueError("定期盤點必須選擇每週、每月或每季")
            if self.reason_kind != "PERIODIC" and self.period:
                raise ValueError("只有定期盤點可以選擇週期")
            if self.reason_kind == "OTHER" and not note:
                raise ValueError("其他原因必須填寫說明")
            self.reason = labels[self.reason_kind]
            if self.period:
                self.reason += f"（{periods[self.period]}）"
            if note:
                self.reason += f"：{note}"
        elif self.period is not None or self.note is not None:
            raise ValueError("請選擇盤點原因類別")
        if not self.reason.strip():
            raise ValueError("請填寫盤點原因")
        self.reason = self.reason.strip()
        return self


class StocktakeConfirmLine(StocktakeLineInput):
    expected_quantity: NonNegativeQuantity
    expected_transaction_id: PositiveId | None


class StocktakePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[StocktakeLineInput] = Field(min_length=1, max_length=100)


class StocktakeConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[StocktakeConfirmLine] = Field(min_length=1, max_length=100)


class StocktakePreviewLine(StocktakeConfirmLine):
    model_config = ConfigDict(from_attributes=True)
    quantity_delta: SignedQuantity


class StocktakePreview(BaseModel):
    lines: list[StocktakePreviewLine]


class StocktakeResultLine(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    batch_id: int
    transaction_id: int | None
    quantity_before: NonNegativeQuantity
    quantity_delta: SignedQuantity
    quantity_after: NonNegativeQuantity


class StocktakeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    operation_group_id: UUID
    occurred_at: datetime
    lines: list[StocktakeResultLine]


class StocktakeBatch(BaseModel):
    id: int
    batch_number: str
    ingredient_name: str
    unit: str
    location_name: str
    expiry_date: date
    remaining_quantity: NonNegativeQuantity


class StocktakeBatchPage(BaseModel):
    items: list[StocktakeBatch]
    total: int
    page: int
    page_size: int


def batch_response(batch) -> StocktakeBatch:
    return StocktakeBatch(
        id=batch.id,
        batch_number=batch.batch_number,
        ingredient_name=batch.ingredient.name,
        unit=batch.ingredient.unit,
        location_name=batch.current_location.name,
        expiry_date=batch.expiry_date,
        **{"remaining_quantity": batch.remaining_quantity},
    )
