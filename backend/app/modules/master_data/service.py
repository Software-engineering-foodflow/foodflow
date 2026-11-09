from app.core.clock import Clock
from app.core.enums import ErrorCode
from app.core.errors import DomainError, FieldError
from app.core.uow import UnitOfWork
from app.db.models import Ingredient, IngredientCategory, Supplier
from app.modules.master_data.errors import duplicate, invalid_category, not_found, referenced
from app.modules.master_data.repository import Master, MasterDataRepository, Resource


class MasterDataService:
    def __init__(self, repository: MasterDataRepository, uow: UnitOfWork, clock: Clock) -> None:
        self._repository = repository
        self._uow = uow
        self._clock = clock

    def list(self, resource: Resource, **filters):
        filters["search"] = filters["search"].strip()
        return self._repository.list(resource, **filters)

    def save(self, resource: Resource, values: dict, record_id: int | None = None) -> Master:
        with self._uow.transaction():
            # 同一鎖序：分類 → 食材；分類停用先鎖分類再檢查啟用食材。
            category = None
            if resource == "ingredients":
                category = self._repository.get(
                    "ingredient-categories", values["category_id"], lock=True
                )
            record = (
                self._repository.get(resource, record_id, lock=True)
                if record_id is not None
                else None
            )
            if record_id is not None and record is None:
                raise not_found()
            if resource != "suppliers":
                field = "code" if resource == "ingredient-categories" else "name"
                if self._repository.duplicate(resource, values[field], record_id):
                    raise duplicate(field)
            if resource == "ingredients":
                retaining_inactive = (
                    record is not None
                    and not record.is_active
                    and not values.get("is_active", True)
                    and record.category_id == values["category_id"]
                )
                if category is None or (not category.is_active and not retaining_inactive):
                    raise invalid_category()
                if (
                    record
                    and record.unit != values["unit"]
                    and self._repository.referenced(resource, record.id)
                ):
                    raise referenced()
            if resource == "ingredient-categories" and record and not values["is_active"]:
                if self._repository.referenced(resource, record.id, active_only=True):
                    raise referenced()
            if resource == "suppliers" and not any(
                values.get(key) for key in ("contact_person", "phone", "other_contact")
            ):
                raise DomainError(
                    ErrorCode.VALIDATION_ERROR,
                    "至少填寫一種聯絡方式",
                    fields=[FieldError("contact_person", "聯絡人、電話或其他聯絡資訊至少填寫一項")],
                )
            if record is None:
                model = {
                    "ingredient-categories": IngredientCategory,
                    "ingredients": Ingredient,
                    "suppliers": Supplier,
                }[resource]
                extra = {"created_at": self._clock.now()} if resource != "suppliers" else {}
                record = model(**values, is_active=True, **extra)
                self._repository.add(record)
            else:
                for key, value in values.items():
                    setattr(record, key, value)
                self._repository.flush()
            if resource == "ingredients":
                record.category = category
            return record

    def delete(self, resource: Resource, record_id: int) -> None:
        with self._uow.transaction():
            record = self._repository.get(resource, record_id, lock=True)
            if record is None:
                raise not_found()
            if self._repository.referenced(resource, record_id):
                raise referenced()
            self._repository.delete(record)
