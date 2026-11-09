"""主檔規則使用 fake Repository 與 UnitOfWork，不連資料庫。"""

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.core.clock import FixedClock
from app.core.enums import ErrorCode
from app.core.errors import DomainError
from app.modules.master_data.repository import MasterDataRepository
from app.modules.master_data.schemas import IngredientCreate
from app.modules.master_data.service import MasterDataService
from tests.fakes.fake_uow import FakeUnitOfWork

NOW = datetime(2026, 11, 8, tzinfo=UTC)


class FakeRepository(MasterDataRepository):
    def __init__(self):
        self.records = {}
        self.references = set()
        self.active_references = set()
        self.locks = []

    def list(self, *args, **kwargs):
        return list(self.records.values()), len(self.records)

    def get(self, resource, record_id, *, lock=False):
        if lock:
            self.locks.append((resource, record_id))
        return self.records.get((resource, record_id))

    def duplicate(self, resource, value, own_id):
        field = "code" if resource == "ingredient-categories" else "name"
        return any(
            r == resource and record.id != own_id and getattr(record, field) == value
            for (r, _), record in self.records.items()
        )

    def referenced(self, resource, record_id, *, active_only=False):
        return (resource, record_id) in (self.active_references if active_only else self.references)

    def add(self, record):
        resource = {
            "ingredient_category": "ingredient-categories",
            "ingredient": "ingredients",
            "supplier": "suppliers",
        }[record.__tablename__]
        record.id = len(self.records) + 1
        self.records[resource, record.id] = record

    def delete(self, record):
        key = next(key for key, item in self.records.items() if item is record)
        del self.records[key]

    def flush(self):
        pass


@pytest.fixture
def setup():
    repo, uow = FakeRepository(), FakeUnitOfWork()
    return MasterDataService(repo, uow, FixedClock(NOW)), repo, uow


def make_category(service):
    return service.save(
        "ingredient-categories", {"name": "肉類", "code": "MEAT", "description": None}
    )


def make_ingredient(service, category_id):
    values = IngredientCreate(
        name="雞肉", category_id=category_id, unit="kg", storage_method="REFRIGERATED"
    ).model_dump()
    return service.save("ingredients", values), values


def test_created_at_and_decimal_default(setup):
    service, _, uow = setup
    category = make_category(service)
    ingredient, _ = make_ingredient(service, category.id)
    assert ingredient.is_active and category.is_active
    assert ingredient.created_at == category.created_at == NOW
    assert ingredient.safety_stock_quantity == Decimal("0.000")
    assert isinstance(ingredient.safety_stock_quantity, Decimal)
    assert uow.commits == 2


def test_category_lock_precedes_ingredient_lock_and_reactivation_rejected(setup):
    service, repo, uow = setup
    category = make_category(service)
    ingredient, values = make_ingredient(service, category.id)
    ingredient.is_active = False
    category.is_active = False
    service.save("ingredients", values | {"is_active": False, "name": "雞腿"}, ingredient.id)
    assert repo.locks[-2:] == [
        ("ingredient-categories", category.id),
        ("ingredients", ingredient.id),
    ]
    with pytest.raises(DomainError) as error:
        service.save("ingredients", values | {"is_active": True}, ingredient.id)
    assert error.value.code == ErrorCode.RULE_VIOLATION
    assert not ingredient.is_active
    assert uow.rollbacks == 1


@pytest.mark.parametrize("action", ["deactivate", "delete"])
def test_category_reference_protection(setup, action):
    service, repo, uow = setup
    category = make_category(service)
    repo.references.add(("ingredient-categories", category.id))
    repo.active_references.add(("ingredient-categories", category.id))
    with pytest.raises(DomainError) as error:
        if action == "delete":
            service.delete("ingredient-categories", category.id)
        else:
            service.save(
                "ingredient-categories",
                {"code": "MEAT", "name": "新名", "description": None, "is_active": False},
                category.id,
            )
    assert error.value.code == ErrorCode.REFERENCED
    assert category.is_active and category.name == "肉類"
    assert uow.rollbacks == 1


def test_duplicate_and_missing_record(setup):
    service, _, uow = setup
    make_category(service)
    with pytest.raises(DomainError) as error:
        make_category(service)
    assert error.value.code == ErrorCode.DUPLICATE
    assert error.value.fields[0].field == "code"
    with pytest.raises(DomainError) as error:
        service.delete("suppliers", 999)
    assert error.value.code == ErrorCode.NOT_FOUND
    assert uow.rollbacks == 2
