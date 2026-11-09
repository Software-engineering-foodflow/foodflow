from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, GoodsReceiptStatus, TransactionType
from app.db.base import Base
from app.db.models import (
    AlertSetting,
    Employee,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryTransaction,
    StorageLocation,
)
from app.domain.expiry import classify_expiry
from app.main import create_app
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from tests.integration.factories import (
    NOW,
    TODAY,
    add_employee,
    add_ingredient,
    add_item,
    add_location,
    make_token,
    op_for,
    receive_batch,
)

URL = "/api/v1/inventory"


@pytest.fixture
def data(session):
    employee = add_employee(session)
    ingredient = add_ingredient(session, safety="10")
    location = add_location(session)
    other_location = add_location(session)
    ledger = SqlAlchemyStockLedger(session)
    expired = receive_batch(
        session,
        ingredient_id=ingredient.id,
        location_id=location.id,
        operator_id=employee.id,
        quantity="5",
        expiry_date=TODAY - timedelta(days=1),
    )
    available = receive_batch(
        session,
        ingredient_id=ingredient.id,
        location_id=other_location.id,
        operator_id=employee.id,
        quantity="8",
        expiry_date=TODAY,
    )
    ledger.lock_batches([expired.id, available.id])
    ledger.deduct(expired, Decimal("3"), TransactionType.WASTE, op_for(employee.id, "已變質"))
    ledger.deduct(
        available,
        Decimal("1"),
        TransactionType.ISSUE,
        op_for(employee.id, "特別備料"),
        is_non_fefo=True,
    )
    empty = add_ingredient(session, safety="1")
    disabled = add_ingredient(session, safety="100", is_active=False)
    zero_safety = add_ingredient(session)
    session.commit()
    return dict(
        employee=employee.id,
        ingredient=ingredient.id,
        category=ingredient.category_id,
        location=location.id,
        other_location=other_location.id,
        expired=expired.id,
        available=available.id,
        empty=empty.id,
        disabled=disabled.id,
        zero_safety=zero_safety.id,
    )


@pytest.fixture
def app():
    app = create_app()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW)
    return app


@pytest.fixture
def client(app, data):
    client = TestClient(app)
    client.cookies.set(get_settings().auth_cookie_name, make_token(data["employee"]))
    return client


def find(response, ingredient_id):
    assert response.status_code == 200, response.text
    return next(
        item for item in response.json()["items"] if item["ingredient_id"] == str(ingredient_id)
    )


def test_overview_quantities_and_zero_history(client, data):
    response = client.get(URL)
    item = find(response, data["ingredient"])
    assert [
        item[key]
        for key in (
            "physical_quantity",
            "available_quantity",
            "expired_quantity",
            "store_available_quantity",
        )
    ] == ["9.000", "7.000", "2.000", "7.000"]
    assert item["is_low_stock"] and item["shortfall_quantity"] == "3.000"
    assert find(response, data["empty"])["physical_quantity"] == "0.000"
    assert find(response, data["empty"])["is_low_stock"]
    assert not find(response, data["disabled"])["is_low_stock"]
    assert not find(response, data["zero_safety"])["is_low_stock"]


def test_filters_and_count_location_scope_and_low_stock(client, data, session):
    response = client.get(URL, params={"location_id": data["location"]})
    assert response.json()["total"] == 1
    item = find(response, data["ingredient"])
    assert item["physical_quantity"] == "2.000" and item["available_quantity"] == "0.000"
    assert item["store_available_quantity"] == "7.000"
    # Whole-store quantity prevents a low-stock false positive at a small location.
    ingredient = session.get_one(Ingredient, data["ingredient"])
    ingredient.safety_stock_quantity = Decimal("3")
    session.commit()
    assert (
        client.get(URL, params={"location_id": data["location"], "status": "LOW_STOCK"}).json()[
            "total"
        ]
        == 0
    )
    ingredient.safety_stock_quantity = Decimal("7")
    session.commit()
    assert (
        client.get(URL, params={"location_id": data["location"], "status": "LOW_STOCK"}).json()[
            "total"
        ]
        == 1
    )
    params = {
        "search": ingredient.name,
        "category_id": data["category"],
        "storage_method": "REFRIGERATED",
        "location_id": data["location"],
        "status": "EXPIRED",
        "page_size": 1,
    }
    assert client.get(URL, params=params).json()["total"] == 1
    for key, value in (
        ("category_id", 2**63 - 1),
        ("storage_method", "FROZEN"),
        ("status", "EXPIRES_TODAY"),
        ("search", "不存在"),
    ):
        assert client.get(URL, params=params | {key: value}).json()["total"] == 0
    assert client.get(URL, params=params | {"page": 2}).json()["items"] == []


@pytest.mark.parametrize("warning_days", [0, 3, 8])
def test_sql_expiry_filters_match_domain_and_ignore_depleted(client, data, session, warning_days):
    setting = session.scalars(select(AlertSetting).order_by(AlertSetting.id)).first()
    setting.warning_days = warning_days
    employee_id, location_id = data["employee"], data["location"]
    expected = {status: set() for status in ("EXPIRED", "EXPIRES_TODAY", "EXPIRING_SOON", "NORMAL")}
    for days in [-2, -1, 0, 1, 3, 4, 8, 9]:
        ingredient = add_ingredient(session)
        expiry_date = TODAY + timedelta(days=days)
        receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=location_id,
            operator_id=employee_id,
            expiry_date=expiry_date,
        )
        expected[classify_expiry(expiry_date, TODAY, warning_days)].add(ingredient.id)
    depleted_ingredient = add_ingredient(session)
    batch = receive_batch(
        session,
        ingredient_id=depleted_ingredient.id,
        location_id=location_id,
        operator_id=employee_id,
    )
    ledger = SqlAlchemyStockLedger(session)
    ledger.lock_batches([batch.id])
    ledger.deduct(batch, Decimal("10"), TransactionType.ISSUE, op_for(employee_id))
    session.commit()
    expected["EXPIRED"].add(data["ingredient"])
    expected["EXPIRES_TODAY"].add(data["ingredient"])
    for status, ids in expected.items():
        result = client.get(URL, params={"status": status}).json()
        assert {item["ingredient_id"] for item in result["items"]} == {str(id) for id in ids}
        assert result["total"] == len(ids)


def test_cross_midnight_changes_today_and_stock(client, data, app):
    client.cookies.set(
        get_settings().auth_cookie_name,
        make_token(data["employee"], expires_at=NOW + timedelta(days=2)),
    )
    before = find(client.get(URL), data["ingredient"])
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW + timedelta(days=1))
    after = find(client.get(URL), data["ingredient"])
    assert before["available_quantity"] == "7.000"
    assert after["available_quantity"] == "0.000" and after["expired_quantity"] == "9.000"
    detail = client.get(f"{URL}/batches/{data['available']}").json()
    assert detail["expiry_status"] == "EXPIRED" and detail["days_until_expiry"] == -1


def test_batches_source_sort_depleted_and_history_paging(client, data, session):
    ledger = SqlAlchemyStockLedger(session)
    original = receive_batch(
        session,
        ingredient_id=data["ingredient"],
        location_id=data["location"],
        operator_id=data["employee"],
    )
    ledger.lock_batches([original.id])
    tx = session.scalars(
        select(InventoryTransaction).where(InventoryTransaction.batch_id == original.id)
    ).one()
    reversal = ledger.reverse(tx, op_for(data["employee"], "進貨錯誤"))

    source = session.get_one(GoodsReceiptItem, original.source_item_id)
    session.get_one(GoodsReceipt, source.receipt_id).status = GoodsReceiptStatus.REVERSED
    moving = ledger.lock_batches([data["available"]])[0]
    first_move = ledger.move(moving, data["location"], op_for(data["employee"], "移至前架"))
    last_move = ledger.move(moving, data["other_location"], op_for(data["employee"], "放回冷藏"))
    session.commit()
    batches = client.get(f"{URL}/{data['ingredient']}/batches").json()
    assert [row["id"] for row in batches["items"]] == [
        str(data["expired"]),
        str(data["available"]),
        str(original.id),
    ]
    assert (
        batches["items"][-1]["is_depleted"] and batches["items"][-1]["receipt_status"] == "REVERSED"
    )
    assert batches["items"][-1]["receipt_number"] == f"GR-{source.receipt_id:08d}"
    assert batches["items"][-1]["source_item_id"] == str(source.id)
    assert (
        client.get(
            f"{URL}/{data['ingredient']}/batches", params={"location_id": data["other_location"]}
        ).json()["total"]
        == 1
    )
    history = client.get(
        f"{URL}/batches/{original.id}/transactions", params={"page_size": 1}
    ).json()
    assert history["total"] == 2 and history["items"][0]["id"] == str(reversal.id)
    assert history["items"][0]["reverses_transaction_id"] == str(tx.id)
    for field in ("quantity_delta", "quantity_before", "quantity_after"):
        assert history["items"][0][field] == f"{getattr(reversal, field):.3f}"
    assert client.get(
        f"{URL}/batches/{original.id}/transactions", params={"page_size": 1, "page": 2}
    ).json()["items"][0]["id"] == str(tx.id)
    changes = client.get(
        f"{URL}/batches/{data['available']}/location-changes", params={"page_size": 1}
    ).json()
    assert changes["total"] == 2 and changes["items"][0]["reason"] == "放回冷藏"
    for page, persisted in ((1, last_move), (2, first_move)):
        actual = client.get(
            f"{URL}/batches/{data['available']}/location-changes",
            params={"page_size": 1, "page": page},
        ).json()["items"][0]
        assert actual["id"] == str(persisted.id)
        assert actual["from_location_id"] == str(persisted.from_location_id)
        assert actual["to_location_id"] == str(persisted.to_location_id)
        assert (
            actual["from_location_name"]
            == session.get_one(StorageLocation, persisted.from_location_id).name
        )
        assert (
            actual["to_location_name"]
            == session.get_one(StorageLocation, persisted.to_location_id).name
        )
    assert (
        client.get(
            f"{URL}/batches/{data['available']}/location-changes",
            params={"page_size": 1, "page": 2},
        ).json()["items"][0]["reason"]
        == "移至前架"
    )
    issue = client.get(f"{URL}/batches/{data['available']}/transactions").json()["items"][0]
    assert issue["is_non_fefo"] and issue["operator_name"]
    persisted_issue = session.get_one(InventoryTransaction, int(issue["id"]))
    for field in ("quantity_delta", "quantity_before", "quantity_after"):
        assert issue[field] == f"{getattr(persisted_issue, field):.3f}"
    assert client.get(f"{URL}/batches/{data['expired']}/location-changes").json()["items"] == []


@pytest.mark.parametrize("role", [EmployeeRole.ADMIN, EmployeeRole.STAFF])
def test_every_endpoint_both_roles_readonly_and_no_secrets(client, data, session, role):

    session.get_one(Employee, data["employee"]).role = role
    location = session.get_one(
        StorageLocation,
        data["other_location"],
    )
    location.is_active = False
    session.commit()

    def snapshot():
        return {
            table.name: list(session.execute(select(table).order_by(table.c.id)))
            for table in Base.metadata.sorted_tables
        }

    before = snapshot()
    paths = [
        URL,
        f"{URL}/options/categories",
        f"{URL}/options/locations",
        f"{URL}/{data['ingredient']}/batches",
        f"{URL}/batches/{data['available']}",
        f"{URL}/batches/{data['available']}/transactions",
        f"{URL}/batches/{data['available']}/location-changes",
    ]
    for path in paths:
        response = client.get(path)
        assert response.status_code == 200, response.text
        assert not any(
            secret in response.text for secret in ("password", "token", "loss_amount", "unit_price")
        )
        assert client.post(path, json={}).status_code == 405
        assert TestClient(client.app).get(path).status_code == 401
    assert any(
        row["id"] == str(location.id) and not row["is_active"]
        for row in client.get(f"{URL}/options/locations").json()["items"]
    )
    assert snapshot() == before


@pytest.mark.parametrize(
    "suffix",
    [
        "/999999/batches",
        "/batches/999999",
        "/batches/999999/transactions",
        "/batches/999999/location-changes",
    ],
)
def test_missing_resources_404(client, suffix):
    assert client.get(URL + suffix).status_code == 404


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=92233720368547760",
        "page_size=101",
        "category_id=0",
        "location_id=9223372036854775808",
        "status=INVALID",
        "storage_method=INVALID",
    ],
)
def test_invalid_queries_422(client, query):
    assert client.get(URL + "?" + query).status_code == 422


@pytest.mark.parametrize("value", ["0", "-1", "9223372036854775808", "wrong"])
def test_invalid_path_ids_422(client, value):
    for suffix in (
        f"/{value}/batches",
        f"/batches/{value}",
        f"/batches/{value}/transactions",
        f"/batches/{value}/location-changes",
    ):
        assert client.get(URL + suffix).status_code == 422


def test_max_safe_offset_and_options_paging(client):
    assert (
        client.get(URL, params={"page": (2**63 - 1) // 100 + 1, "page_size": 100}).status_code
        == 200
    )
    page = client.get(URL + "/options/categories", params={"page_size": 1}).json()
    assert len(page["items"]) == 1 and page["total"] == 4
    assert (
        client.get(URL + "/options/categories", params={"page_size": 1, "page": 2}).json()["items"][
            0
        ]
        != page["items"][0]
    )


@pytest.mark.parametrize("credential", ["inactive", "expired", "old_version", "malformed"])
def test_invalid_credentials_rejected_on_every_endpoint(client, data, session, credential):
    employee = session.get_one(Employee, data["employee"])
    token = make_token(employee.id)
    if credential == "inactive":
        employee.is_active = False
    elif credential == "expired":
        token = make_token(employee.id, expires_at=NOW - timedelta(seconds=1))
    elif credential == "old_version":
        employee.token_version += 1
    else:
        token = "not-a-valid-token"
    session.commit()
    client.cookies.set(get_settings().auth_cookie_name, token)
    paths = [
        URL,
        f"{URL}/options/categories",
        f"{URL}/options/locations",
        f"{URL}/{data['ingredient']}/batches",
        f"{URL}/batches/{data['available']}",
        f"{URL}/batches/{data['available']}/transactions",
        f"{URL}/batches/{data['available']}/location-changes",
    ]
    for path in paths:
        assert client.get(path).status_code == 401


def test_warning_settings_use_smallest_id_and_never_insert(client, session):
    first = session.scalars(select(AlertSetting).order_by(AlertSetting.id)).first()
    first.warning_days = 0
    additional = AlertSetting(name="other", warning_days=99, created_at=NOW, updated_at=NOW)
    session.add(additional)
    session.commit()
    before = session.scalar(select(func.count()).select_from(AlertSetting))
    try:
        assert client.get(URL).json()["warning_days"] == 0
        assert session.scalar(select(func.count()).select_from(AlertSetting)) == before
    finally:
        session.delete(additional)
        session.commit()


def test_batch_relations_load_in_bounded_queries(session, data):
    from sqlalchemy import event

    from app.modules.inventory.dependencies import build_inventory_service

    for _ in range(15):
        receive_batch(
            session,
            ingredient_id=data["ingredient"],
            location_id=data["location"],
            operator_id=data["employee"],
        )
    session.commit()
    session.expunge_all()
    executed = []

    def capture(conn, cursor, statement, parameters, context, many):
        executed.append(statement)

    engine = session.get_bind()
    event.listen(engine, "before_cursor_execute", capture)
    try:
        result = build_inventory_service(session, FixedClock(NOW)).batches(
            data["ingredient"], None, 1, 20
        )
        assert len(result["items"]) == 17
        assert len(executed) <= 9
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def test_response_ids_above_javascript_safe_integer_remain_exact(client, session):
    from itertools import count

    from sqlalchemy import event

    identifiers = count(2**53 + 1, 2)

    def assign_large_ids(db_session, flush_context, instances):
        for record in db_session.new:
            if record.id is None:
                record.id = next(identifiers)

    event.listen(session, "before_flush", assign_large_ids)
    try:
        employee = add_employee(session)
        ingredient = add_ingredient(session)
        location = add_location(session)
        destination = add_location(session)
        batch = receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=location.id,
            operator_id=employee.id,
        )
        ledger = SqlAlchemyStockLedger(session)
        ledger.lock_batches([batch.id])
        issue = ledger.deduct(batch, Decimal("1"), TransactionType.ISSUE, op_for(employee.id))
        move = ledger.move(batch, destination.id, op_for(employee.id, "移位"))
        reversed_batch = receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=location.id,
            operator_id=employee.id,
        )
        receipt_tx = session.scalars(
            select(InventoryTransaction).where(InventoryTransaction.batch_id == reversed_batch.id)
        ).one()
        ledger.lock_batches([reversed_batch.id])
        reversal = ledger.reverse(receipt_tx, op_for(employee.id, "沖銷"))
        session.commit()
    finally:
        event.remove(session, "before_flush", assign_large_ids)

    stock = find(client.get(URL), ingredient.id)
    assert stock["ingredient_id"] == str(ingredient.id)
    assert stock["category_id"] == str(ingredient.category_id)
    batches = client.get(f"{URL}/{ingredient.id}/batches").json()
    assert batches["ingredient_id"] == str(ingredient.id)
    actual = client.get(f"{URL}/batches/{batch.id}").json()
    source = session.get_one(GoodsReceiptItem, batch.source_item_id)
    receipt = session.get_one(GoodsReceipt, source.receipt_id)
    expected = {
        "id": batch.id,
        "ingredient_id": ingredient.id,
        "source_item_id": source.id,
        "receipt_id": receipt.id,
        "supplier_id": receipt.supplier_id,
        "location_id": destination.id,
    }
    for field, value in expected.items():
        assert value > 2**53 and actual[field] == str(value)
    history = client.get(f"{URL}/batches/{batch.id}/transactions").json()["items"][0]
    assert history["id"] == str(issue.id) and history["operator_id"] == str(employee.id)
    assert history["reverses_transaction_id"] is None
    history = client.get(f"{URL}/batches/{reversed_batch.id}/transactions").json()["items"][0]
    assert history["id"] == str(reversal.id)
    assert history["reverses_transaction_id"] == str(receipt_tx.id)
    change = client.get(f"{URL}/batches/{batch.id}/location-changes").json()["items"][0]
    assert change["id"] == str(move.id) and change["operator_id"] == str(employee.id)
    assert change["from_location_id"] == str(location.id)
    assert change["to_location_id"] == str(destination.id)
    assert any(
        item["id"] == str(location.id)
        for item in client.get(URL + "/options/locations").json()["items"]
    )
    assert any(
        item["id"] == str(ingredient.category_id)
        for item in client.get(URL + "/options/categories").json()["items"]
    )


@pytest.mark.parametrize("expired", [False, True])
def test_aggregate_quantities_can_exceed_single_batch_bounds(client, session, data, expired):
    ingredient = add_ingredient(session)
    for _ in range(2):
        receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=data["location"],
            operator_id=data["employee"],
            quantity="999999999.999",
            expiry_date=TODAY + timedelta(days=-1 if expired else 1),
        )
    session.commit()
    actual = find(client.get(URL), ingredient.id)
    assert actual["physical_quantity"] == "1999999999.998"
    assert actual["expired_quantity"] == ("1999999999.998" if expired else "0.000")
    for field in ("available_quantity", "store_available_quantity"):
        assert actual[field] == ("0.000" if expired else "1999999999.998")
    batches = client.get(f"{URL}/{ingredient.id}/batches").json()["items"]
    assert [item["remaining_quantity"] for item in batches] == ["999999999.999"] * 2


def test_openapi_inventory_identifier_and_aggregate_contracts(app):
    import re

    schemas = app.openapi()["components"]["schemas"]
    for schema_name in (
        "InventoryStock",
        "InventoryBatchResponse",
        "InventoryBatchList",
        "InventoryTransactionResponse",
        "InventoryLocationChange",
        "InventoryOptionResponse",
    ):
        for name, field in schemas[schema_name]["properties"].items():
            if name == "id" or name.endswith("_id"):
                options = field.get("anyOf", [field])
                assert all(option["type"] in ("string", "null") for option in options)
    stock = schemas["InventoryStock"]["properties"]
    for name in (
        "physical_quantity",
        "available_quantity",
        "expired_quantity",
        "store_available_quantity",
    ):
        field = stock[name]
        assert field["type"] == "string"
        assert re.fullmatch(field["pattern"], "1999999999.998")
        assert not re.fullmatch(field["pattern"], "-1.000")
        assert not re.fullmatch(field["pattern"], "1.1")
    single = schemas["InventoryBatchResponse"]["properties"]["remaining_quantity"]
    assert not re.fullmatch(single["pattern"], "1999999999.998")


def test_batch_sort_ties_across_page_boundaries(client, session, data):

    from sqlalchemy import event

    ingredient = add_ingredient(session)
    # Identity assignment keeps Ledger-generated batch numbers deterministic while insertion
    # order deliberately differs from lexical batch-number order.
    source_ids = iter([800000003, 800000001, 800000002, 800000004, 800000005])

    def assign_source_id(db_session, flush_context, instances):
        for record in db_session.new:
            if isinstance(record, GoodsReceiptItem):
                record.id = next(source_ids)

    event.listen(session, "before_flush", assign_source_id)
    ledger = SqlAlchemyStockLedger(session)
    inserted = []
    try:
        for expiry_offset, received_offset in [(2, -1), (2, -1), (2, -1), (2, -2), (1, 0)]:
            item = add_item(
                session,
                ingredient_id=ingredient.id,
                location_id=data["location"],
                operator_id=data["employee"],
                expiry_date=TODAY + timedelta(days=expiry_offset),
                receipt_date=TODAY + timedelta(days=received_offset),
            )
            inserted.append(ledger.receive(item, op_for(data["employee"])).batch_id)
        session.commit()
    finally:
        event.remove(session, "before_flush", assign_source_id)
    expected = [inserted[index] for index in [4, 3, 1, 2, 0]]
    actual = []
    for page in [1, 2, 3]:
        response = client.get(
            f"{URL}/{ingredient.id}/batches", params={"page": page, "page_size": 2}
        ).json()
        assert response["total"] == 5
        actual.extend(item["id"] for item in response["items"])
    assert actual == [str(id) for id in expected]
    assert len(set(actual)) == 5
