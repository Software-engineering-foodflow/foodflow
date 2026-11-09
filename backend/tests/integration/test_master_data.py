"""FR-03/04 API、資料庫引用與權限契約。"""

import pytest
from fastapi.testclient import TestClient

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, ErrorCode
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.models import IngredientCategory
from app.main import create_app
from app.modules.master_data.repository_sqlalchemy import SqlAlchemyMasterDataRepository
from app.modules.master_data.schemas import IngredientCreate
from app.modules.master_data.service import MasterDataService
from tests.integration.factories import (
    NOW,
    add_employee,
    add_ingredient,
    add_item,
    add_location,
    make_token,
)

BASE = "/api/v1/"
CATEGORIES = BASE + "ingredient-categories"
INGREDIENTS = BASE + "ingredients"
SUPPLIERS = BASE + "suppliers"


@pytest.fixture
def clients():
    app = create_app()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW)
    result = []
    for role in (EmployeeRole.ADMIN, EmployeeRole.STAFF):
        with get_session_factory()() as session:
            employee = add_employee(session, role=role)
            token = make_token(employee.id)
            session.commit()
        client = TestClient(app)
        client.cookies.set(get_settings().auth_cookie_name, token)
        result.append(client)
    return (*result, TestClient(app))


def category(admin, **values):
    return admin.post(CATEGORIES, json={"code": "MEAT", "name": "肉類"} | values).json()


def ingredient_body(category_id, **values):
    return {
        "name": "雞胸肉",
        "category_id": category_id,
        "unit": "kg",
        "storage_method": "REFRIGERATED",
    } | values


def update_body(record, **values):
    return {
        key: value for key, value in record.items() if key not in {"id", "category_name"}
    } | values


def test_category_and_ingredient_lifecycle(clients):
    admin, _, _ = clients
    cat = category(admin)
    response = admin.post(INGREDIENTS, json=ingredient_body(cat["id"], safety_stock_quantity=" "))
    assert response.status_code == 201
    item = response.json()
    assert (item["safety_stock_quantity"], item["category_name"], item["is_active"]) == (
        "0.000",
        "肉類",
        True,
    )
    assert (
        admin.patch(f"{CATEGORIES}/{cat['id']}", json=update_body(cat, is_active=False)).status_code
        == 409
    )
    assert admin.delete(f"{CATEGORIES}/{cat['id']}").status_code == 409
    assert (
        admin.patch(
            f"{INGREDIENTS}/{item['id']}", json=update_body(item, is_active=False)
        ).status_code
        == 200
    )
    assert (
        admin.patch(f"{CATEGORIES}/{cat['id']}", json=update_body(cat, is_active=False)).status_code
        == 200
    )
    inactive = update_body(item, is_active=False, name="雞肉")
    assert admin.patch(f"{INGREDIENTS}/{item['id']}", json=inactive).status_code == 200
    assert (
        admin.patch(f"{INGREDIENTS}/{item['id']}", json=inactive | {"is_active": True}).status_code
        == 422
    )
    assert admin.post(INGREDIENTS, json=ingredient_body(cat["id"], name="牛肉")).status_code == 422
    assert admin.get(INGREDIENTS, params={"is_active": True}).json()["items"] == []
    assert admin.delete(f"{INGREDIENTS}/{item['id']}").status_code == 204
    assert admin.delete(f"{CATEGORIES}/{cat['id']}").status_code == 204


@pytest.mark.parametrize("quantity", ["-1", "1.0001", 1, "1e3", None])
def test_invalid_quantities_are_not_truncated(clients, quantity):
    admin, _, _ = clients
    response = admin.post(
        INGREDIENTS, json=ingredient_body(category(admin)["id"], safety_stock_quantity=quantity)
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"][0]["field"] == "safety_stock_quantity"


def test_duplicates_filters_and_pagination(clients):
    admin, _, _ = clients
    cat = category(admin)
    assert admin.post(CATEGORIES, json={"code": "MEAT", "name": "新分類"}).status_code == 409
    first = admin.post(INGREDIENTS, json=ingredient_body(cat["id"])).json()
    second = admin.post(
        INGREDIENTS, json=ingredient_body(cat["id"], name="牛肉", storage_method="FROZEN")
    ).json()
    assert (
        admin.patch(
            f"{INGREDIENTS}/{second['id']}", json=update_body(second, name=first["name"])
        ).status_code
        == 409
    )
    assert admin.get(INGREDIENTS, params={"search": "%"}).json()["total"] == 0
    assert admin.get(
        INGREDIENTS, params={"category_id": cat["id"], "storage_method": "FROZEN"}
    ).json()["items"] == [second]
    assert admin.get(INGREDIENTS, params={"page_size": 1, "page": 2}).json()["total"] == 2


def test_supplier_contacts_and_permissions(clients):
    admin, staff, anonymous = clients
    for url, body in (
        (CATEGORIES, {"code": "A", "name": "A"}),
        (INGREDIENTS, ingredient_body(1)),
        (SUPPLIERS, {"name": "供應商", "phone": "123"}),
    ):
        assert anonymous.get(url).status_code == 401
        assert staff.get(url).status_code == 200
        assert staff.post(url, json=body).status_code == 403
        assert staff.patch(url + "/1", json=body | {"is_active": True}).status_code == 403
        assert staff.delete(url + "/1").status_code == 403
    invalid = admin.post(SUPPLIERS, json={"name": "供應商", "phone": " "})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == ErrorCode.VALIDATION_ERROR
    assert invalid.json()["error"]["fields"][0]["field"] == "contact_person"
    supplier = admin.post(SUPPLIERS, json={"name": "供應商", "contact_person": "小王"}).json()
    assert supplier["is_active"] is True
    assert (
        admin.patch(
            f"{SUPPLIERS}/{supplier['id']}", json=update_body(supplier, is_active=False)
        ).status_code
        == 200
    )
    assert admin.get(SUPPLIERS, params={"is_active": True}).json()["total"] == 0
    assert admin.delete(f"{SUPPLIERS}/{supplier['id']}").status_code == 204


def test_draft_item_blocks_unit_change_and_delete(clients):
    from app.core.enums import GoodsReceiptStatus
    from app.db.models import GoodsReceipt

    admin, _, _ = clients
    with get_session_factory()() as session:
        employee = add_employee(session)
        item = add_ingredient(session)
        receipt_item = add_item(
            session,
            ingredient_id=item.id,
            location_id=add_location(session).id,
            operator_id=employee.id,
        )
        session.get_one(GoodsReceipt, receipt_item.receipt_id).status = GoodsReceiptStatus.DRAFT
        item_id = item.id
        session.commit()
    item = admin.get(INGREDIENTS).json()["items"][0]
    assert (
        admin.patch(f"{INGREDIENTS}/{item_id}", json=update_body(item, unit="g")).status_code == 409
    )
    assert admin.delete(f"{INGREDIENTS}/{item_id}").status_code == 409
    supplier_id = admin.get(SUPPLIERS).json()["items"][0]["id"]
    assert admin.delete(f"{SUPPLIERS}/{supplier_id}").status_code == 409


def test_unique_constraint_maps_field_error(session):
    repo = SqlAlchemyMasterDataRepository(session)
    repo.add(IngredientCategory(code="A", name="A", is_active=True, created_at=NOW))
    session.commit()
    with pytest.raises(DomainError) as error:
        repo.add(IngredientCategory(code="A", name="B", is_active=True, created_at=NOW))
    assert error.value.code == ErrorCode.DUPLICATE
    assert error.value.fields[0].field == "code"
    session.rollback()


@pytest.mark.parametrize("exhaust", [False, True])
def test_batches_keep_references_after_deactivation(clients, exhaust):
    from decimal import Decimal

    from app.core.enums import TransactionType
    from app.db.models import GoodsReceiptItem, InventoryBatch
    from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
    from tests.integration.factories import op_for, receive_batch

    admin, _, _ = clients
    with get_session_factory()() as session:
        employee = add_employee(session)
        ingredient = add_ingredient(session)
        batch = receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=add_location(session).id,
            operator_id=employee.id,
            quantity="5",
        )
        if exhaust:
            ledger = SqlAlchemyStockLedger(session)
            [locked] = ledger.lock_batches([batch.id])
            ledger.deduct(locked, Decimal("5"), TransactionType.ISSUE, op_for(employee.id))
        batch_id, source_id, ingredient_id = batch.id, batch.source_item_id, ingredient.id
        session.commit()
    item = admin.get(INGREDIENTS).json()["items"][0]
    assert (
        admin.patch(f"{INGREDIENTS}/{ingredient_id}", json=update_body(item, unit="g")).status_code
        == 409
    )
    assert admin.delete(f"{INGREDIENTS}/{ingredient_id}").status_code == 409
    assert (
        admin.patch(
            f"{INGREDIENTS}/{ingredient_id}", json=update_body(item, is_active=False)
        ).status_code
        == 200
    )
    with get_session_factory()() as session:
        assert session.get_one(InventoryBatch, batch_id).ingredient_id == ingredient_id
        assert session.get_one(GoodsReceiptItem, source_id).ingredient_id == ingredient_id


def test_assignment_waits_for_category_deactivation():
    import threading

    from sqlalchemy import text

    from tests.integration.test_concurrency import wait_until_blocked_on_row_lock

    ready = threading.Event()
    result = {}
    with get_session_factory()() as holder:
        category = IngredientCategory(code="C", name="分類", is_active=True, created_at=NOW)
        holder.add(category)
        holder.commit()
        category_id = category.id
        holder_pid = holder.scalar(text("SELECT pg_backend_pid()"))
        repo = SqlAlchemyMasterDataRepository(holder)
        locked = repo.get("ingredient-categories", category_id, lock=True)
        locked.is_active = False
        repo.flush()

        def assign():
            try:
                with get_session_factory()() as waiter:
                    result["pid"] = waiter.scalar(text("SELECT pg_backend_pid()"))
                    ready.set()
                    service = MasterDataService(
                        SqlAlchemyMasterDataRepository(waiter),
                        SqlAlchemyUnitOfWork(waiter),
                        FixedClock(NOW),
                    )
                    service.save(
                        "ingredients",
                        IngredientCreate(
                            name="食材",
                            category_id=category_id,
                            unit="kg",
                            storage_method="AMBIENT",
                        ).model_dump(),
                    )
            except BaseException as error:
                result["error"] = error

        worker = threading.Thread(target=assign)
        worker.start()
        try:
            assert ready.wait(10)
            wait_until_blocked_on_row_lock(result["pid"], holder_pid)
        finally:
            holder.commit()
            worker.join(15)
        assert not worker.is_alive()
    assert isinstance(result.get("error"), DomainError)
    assert result["error"].code == ErrorCode.RULE_VIOLATION


@pytest.mark.parametrize("resource", ["ingredient-categories", "ingredients", "suppliers"])
def test_foreign_key_maps_referenced_even_if_precheck_is_skipped(session, resource):
    from app.db.models import GoodsReceipt

    employee = add_employee(session)
    ingredient = add_ingredient(session)
    item = add_item(
        session,
        ingredient_id=ingredient.id,
        location_id=add_location(session).id,
        operator_id=employee.id,
    )
    receipt = session.get_one(GoodsReceipt, item.receipt_id)
    receipt.status = "DRAFT"
    ids = {
        "ingredient-categories": ingredient.category_id,
        "ingredients": ingredient.id,
        "suppliers": receipt.supplier_id,
    }
    session.commit()
    repo = SqlAlchemyMasterDataRepository(session)
    with pytest.raises(DomainError) as error:
        repo.delete(repo.get(resource, ids[resource], lock=True))
    assert error.value.code == ErrorCode.REFERENCED
    session.rollback()


@pytest.mark.parametrize(
    ("url", "field"),
    [
        (CATEGORIES, "code"),
        (CATEGORIES, "name"),
        (INGREDIENTS, "name"),
        (INGREDIENTS, "category_id"),
        (INGREDIENTS, "unit"),
        (INGREDIENTS, "storage_method"),
        (SUPPLIERS, "name"),
    ],
)
@pytest.mark.parametrize("invalid", ["missing", "blank"])
@pytest.mark.parametrize("method", ["POST", "PATCH"])
def test_required_fields_reject_missing_and_blank(clients, url, field, invalid, method):
    admin, _, _ = clients
    if url == INGREDIENTS:
        valid = ingredient_body(category(admin)["id"])
    elif url == CATEGORIES:
        valid = {"code": "MEAT", "name": "肉類"}
    else:
        valid = {"name": "供應商", "phone": "02-12345678"}
    target = url
    if method == "PATCH":
        original = admin.post(url, json=valid).json()
        target = f"{url}/{original['id']}"
        body = update_body(original)
    else:
        body = valid.copy()
    if invalid == "missing":
        del body[field]
    else:
        body[field] = "   "

    response = admin.request(method, target, json=body)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == ErrorCode.VALIDATION_ERROR
    assert {entry["field"] for entry in error["fields"]} == {field}
    if method == "PATCH":
        assert admin.get(url).json()["items"] == [original]
    else:
        assert admin.get(url).json()["total"] == 0


@pytest.mark.parametrize("contact", ["contact_person", "phone", "other_contact"])
def test_each_supplier_contact_method_is_sufficient_on_create_and_update(clients, contact):
    admin, _, _ = clients
    create = admin.post(SUPPLIERS, json={"name": "供應商", contact: " 聯絡資料 "})
    assert create.status_code == 201
    supplier = create.json()
    assert supplier[contact] == "聯絡資料"
    assert all(
        supplier[field] is None
        for field in {"contact_person", "phone", "other_contact"} - {contact}
    )

    update = admin.patch(
        f"{SUPPLIERS}/{supplier['id']}",
        json=update_body(supplier, **{contact: " 更新聯絡資料 "}),
    )

    assert update.status_code == 200
    assert update.json()[contact] == "更新聯絡資料"


def test_supplier_update_cannot_clear_all_contact_methods(clients):
    admin, _, _ = clients
    supplier = admin.post(SUPPLIERS, json={"name": "供應商", "phone": "02-12345678"}).json()

    response = admin.patch(
        f"{SUPPLIERS}/{supplier['id']}",
        json=update_body(supplier, contact_person="  ", phone=" ", other_contact=""),
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == ErrorCode.VALIDATION_ERROR
    assert {entry["field"] for entry in error["fields"]} == {"contact_person"}
    assert admin.get(SUPPLIERS).json()["items"] == [supplier]


@pytest.mark.parametrize("resource", ["ingredient-categories", "ingredients", "suppliers"])
def test_patch_zero_id_is_not_found_instead_of_creating(clients, resource):
    admin, _, _ = clients
    if resource == "ingredients":
        body = ingredient_body(category(admin)["id"])
    elif resource == "ingredient-categories":
        body = {"code": "NEW", "name": "新分類"}
    else:
        body = {"name": "新供應商", "phone": "02-12345678"}
    response = admin.patch(f"{BASE}{resource}/0", json=body | {"is_active": True})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == ErrorCode.NOT_FOUND
    assert admin.get(f"{BASE}{resource}").json()["total"] == 0


@pytest.mark.parametrize("activation", [False, True], ids=["create", "activate"])
def test_deactivation_waits_for_ingredient_assignment_then_rejects(activation):
    import threading

    from sqlalchemy import select, text

    from app.db.models import Ingredient
    from tests.integration.test_concurrency import wait_until_blocked_on_row_lock

    held = threading.Event()
    waiter_ready = threading.Event()
    release = threading.Event()
    outcomes = {}
    with get_session_factory()() as session:
        ingredient = add_ingredient(session, is_active=False)
        category_id = ingredient.category_id
        ingredient_id = ingredient.id
        session.commit()

    class HoldingRepository(SqlAlchemyMasterDataRepository):
        def flush(self):
            super().flush()
            held.set()
            assert release.wait(15)

    def assign():
        try:
            with get_session_factory()() as session:
                outcomes["holder_pid"] = session.scalar(text("SELECT pg_backend_pid()"))
                service = MasterDataService(
                    HoldingRepository(session), SqlAlchemyUnitOfWork(session), FixedClock(NOW)
                )
                values = IngredientCreate(
                    name="已啟用食材", category_id=category_id, unit="kg", storage_method="AMBIENT"
                ).model_dump()
                if activation:
                    values["is_active"] = True
                service.save("ingredients", values, ingredient_id if activation else None)
        except BaseException as error:
            outcomes["holder_error"] = error

    def deactivate():
        try:
            with get_session_factory()() as session:
                outcomes["waiter_pid"] = session.scalar(text("SELECT pg_backend_pid()"))
                waiter_ready.set()
                service = MasterDataService(
                    SqlAlchemyMasterDataRepository(session),
                    SqlAlchemyUnitOfWork(session),
                    FixedClock(NOW),
                )
                service.save(
                    "ingredient-categories",
                    {"code": "C", "name": "分類", "description": None, "is_active": False},
                    category_id,
                )
        except BaseException as error:
            outcomes["waiter_error"] = error

    holder = threading.Thread(target=assign)
    waiter = threading.Thread(target=deactivate)
    holder.start()
    try:
        assert held.wait(10), outcomes.get("holder_error")
        waiter.start()
        assert waiter_ready.wait(10)
        wait_until_blocked_on_row_lock(outcomes["waiter_pid"], outcomes["holder_pid"])
    finally:
        release.set()
        holder.join(15)
        if waiter.ident is not None:
            waiter.join(15)
    assert not holder.is_alive() and not waiter.is_alive()
    assert "holder_error" not in outcomes
    assert isinstance(outcomes.get("waiter_error"), DomainError)
    assert outcomes["waiter_error"].code == ErrorCode.REFERENCED
    with get_session_factory()() as session:
        assert session.get_one(IngredientCategory, category_id).is_active
        assert (
            session.scalars(
                select(Ingredient).where(
                    Ingredient.category_id == category_id, Ingredient.is_active.is_(True)
                )
            )
            .one()
            .name
            == "已啟用食材"
        )
