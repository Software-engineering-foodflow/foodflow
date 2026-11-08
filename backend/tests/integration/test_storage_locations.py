"""FR-05 儲存位置 API，連真實 PostgreSQL：權限、唯一性、停用與刪除的引用檢查。"""

from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, ErrorCode, ExpiryStatus, StorageType, TransactionType
from app.core.errors import DomainError
from app.db.models import AlertSetting, BatchLocationChange, StorageLocation
from app.main import create_app
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.storage_location.repository_sqlalchemy import (
    SqlAlchemyStorageLocationRepository,
)
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

URL = "/api/v1/storage-locations"


@pytest.fixture
def app():
    app = create_app()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW)
    return app


def _client(app, role: EmployeeRole) -> TestClient:
    with get_session_factory()() as session:
        employee_id = add_employee(session, role=role).id
        session.commit()
    client = TestClient(app)
    client.cookies.set(get_settings().auth_cookie_name, make_token(employee_id))
    return client


@pytest.fixture
def admin(app) -> TestClient:
    return _client(app, EmployeeRole.ADMIN)


@pytest.fixture
def staff(app) -> TestClient:
    return _client(app, EmployeeRole.STAFF)


def _body(**overrides):
    return {"code": "A1", "name": "冷藏庫 A", "storage_type": "REFRIGERATED"} | overrides


def _update_body(location: dict, **overrides):
    keys = ("code", "name", "storage_type", "description", "is_active")
    return {key: location[key] for key in keys} | overrides


def _location_with_batch(quantity: str = "5", *, exhaust: bool = False) -> int:
    """建立一個位於新位置的批次；exhaust 時把剩餘量全部領用掉。回傳位置 id。"""
    with get_session_factory()() as session:
        employee = add_employee(session)
        location = add_location(session)
        batch = receive_batch(
            session,
            ingredient_id=add_ingredient(session).id,
            location_id=location.id,
            operator_id=employee.id,
            quantity=quantity,
        )
        if exhaust:
            ledger = SqlAlchemyStockLedger(session)
            [locked] = ledger.lock_batches([batch.id])
            ledger.deduct(locked, Decimal(quantity), TransactionType.ISSUE, op_for(employee.id))
        session.commit()
        return location.id


def _referenced_by_receipt_item() -> int:
    """只被進貨明細引用（沒有批次），等同草稿明細選了此位置。"""
    with get_session_factory()() as session:
        employee = add_employee(session)
        location = add_location(session)
        add_item(
            session,
            ingredient_id=add_ingredient(session).id,
            location_id=location.id,
            operator_id=employee.id,
        )
        session.commit()
        return location.id


def _referenced_only_by_location_change(side: str) -> int:
    """建立一個只出現在位置變更紀錄 from 或 to 欄位的位置。

    經正式流程換位置時，目標位置一定同時被批次引用，無法單獨驗證這兩個欄位，
    所以測試直接新增紀錄。
    """
    with get_session_factory()() as session:
        employee = add_employee(session)
        home = add_location(session)
        batch = receive_batch(
            session,
            ingredient_id=add_ingredient(session).id,
            location_id=home.id,
            operator_id=employee.id,
        )
        other = add_location(session)
        ends = (other.id, home.id) if side == "from" else (home.id, other.id)
        session.add(
            BatchLocationChange(
                batch_id=batch.id,
                from_location_id=ends[0],
                to_location_id=ends[1],
                operator_id=employee.id,
                occurred_at=NOW,
                reason="測試",
            )
        )
        session.commit()
        return other.id


def _get(client: TestClient, location_id: int) -> dict:
    items = client.get(URL, params={"page_size": 100}).json()["items"]
    return next(item for item in items if item["id"] == location_id)


def test_create_trims_input_and_starts_active(admin) -> None:
    response = admin.post(URL, json=_body(code="  A1 ", description="   "))

    assert response.status_code == 201
    body = response.json()
    assert (body["code"], body["is_active"], body["description"]) == ("A1", True, None)


def test_duplicate_code_on_create_and_update(admin) -> None:
    assert admin.post(URL, json=_body()).status_code == 201
    other = admin.post(URL, json=_body(code="B1")).json()

    for response in (
        admin.post(URL, json=_body(name="另一個")),
        admin.patch(f"{URL}/{other['id']}", json=_update_body(other, code="A1")),
    ):
        assert response.status_code == 409
        error = response.json()["error"]
        assert error["code"] == ErrorCode.DUPLICATE
        assert [field["field"] for field in error["fields"]] == ["code"]
    assert _get(admin, other["id"])["code"] == "B1"


def test_unique_constraint_is_last_line_of_defence(session) -> None:
    def location(name: str) -> StorageLocation:
        return StorageLocation(
            code="A1", name=name, storage_type=StorageType.AMBIENT, is_active=True
        )

    session.add(location("甲"))
    session.commit()

    with pytest.raises(DomainError) as exc_info:
        SqlAlchemyStorageLocationRepository(session).add(location("乙"))
    assert exc_info.value.code is ErrorCode.DUPLICATE
    assert [field.field for field in exc_info.value.fields] == ["code"]
    session.rollback()


@pytest.mark.parametrize(
    ("body", "fields"),
    [
        (_body(name="   "), {"name"}),
        ({"code": "A1", "name": "冷藏庫 A"}, {"storage_type"}),
        (_body(code="", storage_type="WARM"), {"code", "storage_type"}),
    ],
)
def test_missing_or_invalid_fields_are_reported(admin, body, fields) -> None:
    response = admin.post(URL, json=body)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == ErrorCode.VALIDATION_ERROR
    assert {field["field"] for field in error["fields"]} == fields


def test_deactivate_location_with_stock_is_rejected_with_batch_count(admin) -> None:
    location_id = _location_with_batch()
    location = _get(admin, location_id)

    response = admin.patch(f"{URL}/{location_id}", json=_update_body(location, is_active=False))

    assert response.status_code == 409
    error = response.json()["error"]
    assert (error["code"], error["details"]) == (ErrorCode.REFERENCED, {"batch_count": 1})
    assert _get(admin, location_id)["is_active"] is True


def test_location_with_only_exhausted_batches_can_be_deactivated(admin) -> None:
    location_id = _location_with_batch(exhaust=True)
    location = _get(admin, location_id)

    response = admin.patch(f"{URL}/{location_id}", json=_update_body(location, is_active=False))

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert admin.get(URL, params={"is_active": "true"}).json()["items"] == []


@pytest.mark.parametrize(
    "make_reference",
    [
        _referenced_by_receipt_item,
        lambda: _location_with_batch(exhaust=True),
        lambda: _referenced_only_by_location_change("from"),
        lambda: _referenced_only_by_location_change("to"),
    ],
    ids=["receipt-item", "batch", "location-change-from", "location-change-to"],
)
def test_referenced_location_cannot_be_deleted(admin, make_reference) -> None:
    location_id = make_reference()

    response = admin.delete(f"{URL}/{location_id}")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == ErrorCode.REFERENCED
    assert "停用" in error["message"]
    assert _get(admin, location_id)["id"] == location_id


def test_foreign_key_blocks_delete_even_if_check_is_skipped(session) -> None:
    location_id = _referenced_by_receipt_item()
    repository = SqlAlchemyStorageLocationRepository(session)

    with pytest.raises(DomainError) as exc_info:
        repository.delete(repository.lock(location_id))
    assert exc_info.value.code is ErrorCode.REFERENCED
    session.rollback()


def test_unreferenced_location_can_be_deleted(admin) -> None:
    location_id = admin.post(URL, json=_body()).json()["id"]

    assert admin.delete(f"{URL}/{location_id}").status_code == 204
    assert admin.get(URL).json()["total"] == 0


def test_list_filters_search_type_and_status(admin) -> None:
    admin.post(URL, json=_body(code="R-01", name="冷藏庫 A"))
    frozen = admin.post(URL, json=_body(code="F-01", name="冷凍庫 B", storage_type="FROZEN"))
    admin.patch(f"{URL}/{frozen.json()['id']}", json=_update_body(frozen.json(), is_active=False))

    def codes(**params):
        return [item["code"] for item in admin.get(URL, params=params).json()["items"]]

    assert codes() == ["F-01", "R-01"]
    assert codes(is_active="true") == ["R-01"]
    assert codes(storage_type="FROZEN") == ["F-01"]
    assert codes(search="冷凍") == ["F-01"]
    assert codes(search="%") == []
    assert codes(search="F-0") == ["F-01"]
    second_page = admin.get(URL, params={"page": 2, "page_size": 1}).json()
    assert ([item["code"] for item in second_page["items"]], second_page["total"]) == (["R-01"], 2)


def test_staff_can_list_but_not_write(admin, staff) -> None:
    location = admin.post(URL, json=_body()).json()

    assert staff.get(URL).json()["total"] == 1
    responses = [
        staff.post(URL, json=_body(code="B1")),
        staff.patch(f"{URL}/{location['id']}", json=_update_body(location, name="改")),
        staff.delete(f"{URL}/{location['id']}"),
    ]
    assert [response.status_code for response in responses] == [403, 403, 403]
    assert {response.json()["error"]["code"] for response in responses} == {ErrorCode.FORBIDDEN}
    # 清單列在建立回應之外另附批次統計，原有欄位要完全相同。
    listed = _get(admin, location["id"])
    assert listed.items() >= location.items()
    assert listed["batch_count"] == 0
    assert (
        listed["nearest_expiry_date"],
        listed["nearest_expiry_status"],
        listed["nearest_days_until_expiry"],
    ) == (None, None, None)
    assert set(listed) == set(location) | {
        "batch_count",
        "nearest_expiry_date",
        "nearest_expiry_status",
        "nearest_days_until_expiry",
    }


def test_unknown_location_is_not_found(admin) -> None:
    body = _body(description=None, is_active=True)

    assert admin.patch(f"{URL}/999999", json=body).status_code == 404
    assert admin.delete(f"{URL}/999999").status_code == 404


def test_anonymous_request_is_unauthenticated(app) -> None:
    assert TestClient(app).get(URL).status_code == 401


def _stock(session, location_id: int, operator_id: int, ingredient_id: int, *offsets: int) -> None:
    for offset in offsets:
        receive_batch(
            session,
            ingredient_id=ingredient_id,
            location_id=location_id,
            operator_id=operator_id,
            expiry_date=TODAY + timedelta(days=offset),
        )


def _typed_location(session, storage_type: StorageType) -> int:
    location = add_location(session)
    location.storage_type = storage_type
    session.flush()
    return location.id


def test_list_includes_batch_count_and_nearest_expiry(admin) -> None:
    exhausted_id = _location_with_batch(exhaust=True)
    with get_session_factory()() as session:
        employee = add_employee(session)
        ingredient_id = add_ingredient(session).id
        stocked_id = add_location(session).id
        empty_id = add_location(session).id
        _stock(session, stocked_id, employee.id, ingredient_id, 5, 0, 2)
        session.commit()

    stocked = _get(admin, stocked_id)
    assert stocked["batch_count"] == 3
    assert stocked["nearest_expiry_date"] == TODAY.isoformat()
    assert stocked["nearest_expiry_status"] == ExpiryStatus.EXPIRES_TODAY
    assert stocked["nearest_days_until_expiry"] == 0
    for location_id in (empty_id, exhausted_id):
        location = _get(admin, location_id)
        assert location["batch_count"] == 0
        assert (
            location["nearest_expiry_date"],
            location["nearest_expiry_status"],
            location["nearest_days_until_expiry"],
        ) == (None, None, None)


@pytest.mark.parametrize(
    ("warning_days", "statuses"),
    [
        (3, ["EXPIRED", "EXPIRES_TODAY", "EXPIRING_SOON", "NORMAL"]),
        (5, ["EXPIRED", "EXPIRES_TODAY", "EXPIRING_SOON", "EXPIRING_SOON"]),
    ],
)
def test_batch_and_nearest_status_use_clock_and_first_alert_setting(
    admin, warning_days, statuses
) -> None:
    offsets = (-1, 0, 3, 4)
    with get_session_factory()() as session:
        session.execute(update(AlertSetting).values(warning_days=warning_days))
        employee = add_employee(session)
        ingredient_id = add_ingredient(session).id
        location_ids = [add_location(session).id for _ in offsets]
        for location_id, offset in zip(location_ids, offsets, strict=True):
            _stock(session, location_id, employee.id, ingredient_id, offset)
        all_in_one = add_location(session).id
        _stock(session, all_in_one, employee.id, ingredient_id, *offsets)
        session.commit()

    nearest = [_get(admin, location_id) for location_id in location_ids]
    assert [item["nearest_expiry_status"] for item in nearest] == statuses
    assert [item["nearest_days_until_expiry"] for item in nearest] == list(offsets)

    items = admin.get(f"{URL}/{all_in_one}/batches").json()["items"]
    assert [item["expiry_status"] for item in items] == statuses
    assert [item["days_until_expiry"] for item in items] == list(offsets)


def test_summary_counts_active_locations_and_their_batches(staff) -> None:
    with get_session_factory()() as session:
        employee = add_employee(session)
        ingredient_id = add_ingredient(session).id
        fridge = _typed_location(session, StorageType.REFRIGERATED)
        _typed_location(session, StorageType.REFRIGERATED)
        freezer = _typed_location(session, StorageType.FROZEN)
        shelf = _typed_location(session, StorageType.AMBIENT)
        _stock(session, fridge, employee.id, ingredient_id, 0, *[10] * 5)
        _stock(session, freezer, employee.id, ingredient_id, 2, 3, *[30] * 7)
        _stock(session, shelf, employee.id, ingredient_id, -1, *[20] * 4)
        # 停用位置的批次不算：先入庫再停用（正式流程會擋，這裡直接改欄位）。
        retired = _typed_location(session, StorageType.AMBIENT)
        _stock(session, retired, employee.id, ingredient_id, -5, -5)
        session.get_one(StorageLocation, retired).is_active = False
        session.commit()

    response = staff.get(f"{URL}/summary")

    assert response.status_code == 200
    body = response.json()
    assert (body["active_count"], body["total_count"]) == (4, 5)
    assert body["by_type"] == [
        {
            "storage_type": "REFRIGERATED",
            "location_count": 2,
            "batch_count": 6,
            "expired_count": 0,
            "expires_today_count": 1,
            "expiring_soon_count": 0,
        },
        {
            "storage_type": "FROZEN",
            "location_count": 1,
            "batch_count": 9,
            "expired_count": 0,
            "expires_today_count": 0,
            "expiring_soon_count": 2,
        },
        {
            "storage_type": "AMBIENT",
            "location_count": 1,
            "batch_count": 5,
            "expired_count": 1,
            "expires_today_count": 0,
            "expiring_soon_count": 0,
        },
    ]


def test_summary_requires_login(app) -> None:
    assert TestClient(app).get(f"{URL}/summary").status_code == 401
