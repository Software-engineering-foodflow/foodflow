"""數量使用 Decimal 字串；版本 nullable 但不可省略。"""

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import NonNegativeQuantity, SignedQuantity

PositiveId = Annotated[int, Field(strict=True, gt=0)]


class StocktakeLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: PositiveId
    actual_quantity: NonNegativeQuantity
    reason: str = Field(min_length=1, max_length=2000)

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("請填寫盤點原因")
        return value.strip()


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
