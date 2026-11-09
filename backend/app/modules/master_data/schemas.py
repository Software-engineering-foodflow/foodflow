from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.enums import StorageType
from app.core.types import NonNegativeQuantity

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Unit = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)]


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class IngredientCategoryCreate(StrictRequest):
    code: Code
    name: Name
    description: str | None = Field(default=None, max_length=500)

    @field_validator("description")
    @classmethod
    def blank(cls, value: str | None) -> str | None:
        return value or None


class IngredientCategoryUpdate(IngredientCategoryCreate):
    is_active: bool


class IngredientCreate(StrictRequest):
    name: Name
    category_id: int = Field(gt=0)
    unit: Unit
    storage_method: StorageType
    safety_stock_quantity: NonNegativeQuantity = Decimal("0.000")

    @field_validator("safety_stock_quantity", mode="before")
    @classmethod
    def blank_quantity(cls, value: object) -> object:
        return "0.000" if isinstance(value, str) and not value.strip() else value


class IngredientUpdate(IngredientCreate):
    is_active: bool


class SupplierCreate(StrictRequest):
    name: Name
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    other_contact: str | None = Field(default=None, max_length=255)

    @field_validator("contact_person", "phone", "other_contact")
    @classmethod
    def blank_contact(cls, value: str | None) -> str | None:
        return value or None


class SupplierUpdate(SupplierCreate):
    is_active: bool


class IngredientCategoryResponse(IngredientCategoryUpdate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class IngredientResponse(IngredientUpdate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_name: str
    safety_stock_quantity: NonNegativeQuantity


class SupplierResponse(SupplierUpdate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class IngredientCategoryList(BaseModel):
    items: list[IngredientCategoryResponse]
    total: int
    page: int
    page_size: int


class IngredientList(BaseModel):
    items: list[IngredientResponse]
    total: int
    page: int
    page_size: int


class SupplierList(BaseModel):
    items: list[SupplierResponse]
    total: int
    page: int
    page_size: int
