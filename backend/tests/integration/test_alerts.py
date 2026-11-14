from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, WasteReason
from app.core.uow import SqlAlchemyUnitOfWork
from app.main import create_app
from app.modules.alerts.notifier import InAppNotifier
from app.modules.alerts.repository_sqlalchemy import SqlAlchemyAlertRepository
from app.modules.alerts.rules import AlertRuleFactory
from app.modules.alerts.service import AlertService
from app.modules.waste.dependencies import build_waste_service
from tests.integration.factories import (
    NOW,
    TODAY,
    add_employee,
    add_ingredient,
    add_location,
    make_token,
    receive_batch,
)


def service(session, now=NOW):
    return AlertService(
        SqlAlchemyAlertRepository(session),
        SqlAlchemyUnitOfWork(session),
        FixedClock(now),
        AlertRuleFactory(),
        InAppNotifier(),
    )


def test_real_stock_matrix_location_and_expiry_order(session):
    employee, location, other = add_employee(session), add_location(session), add_location(session)
    ingredient = add_ingredient(session, safety="5")
    inactive = add_ingredient(session, safety="5", is_active=False)
    no_batches = add_ingredient(session, safety="2")
    stocked = add_ingredient(session, safety="1")
    ids = []
    for days in [4, 3, 0, -1]:
        ids.append(
            receive_batch(
                session,
                ingredient_id=ingredient.id,
                location_id=location.id,
                operator_id=employee.id,
                quantity="1",
                expiry_date=TODAY + timedelta(days=days),
            ).id
        )
    receive_batch(
        session,
        ingredient_id=inactive.id,
        location_id=location.id,
        operator_id=employee.id,
        expiry_date=TODAY - timedelta(days=1),
    )
    receive_batch(
        session,
        ingredient_id=stocked.id,
        location_id=other.id,
        operator_id=employee.id,
        quantity="2",
    )
    session.commit()
    result = service(session).evaluate()
    assert [item.status for item in result.items] == [
        "EXPIRED",
        "EXPIRED",
        "EXPIRES_TODAY",
        "EXPIRING_SOON",
        "LOW_STOCK",
        "LOW_STOCK",
    ]
    low = next(
        item
        for item in result.items
        if item.status == "LOW_STOCK" and item.ingredient_id == ingredient.id
    )
    assert low.store_available_quantity == Decimal("3") and low.shortfall == Decimal("2")
    assert any(item.ingredient_id == inactive.id for item in result.items)
    filtered = service(session).evaluate("LOW_STOCK", location.id)
    assert [item.ingredient_id for item in filtered.items] == [ingredient.id]
    assert no_batches.id not in [item.ingredient_id for item in filtered.items]
    assert service(session).evaluate(location_id=other.id).items == ()
    # T=0 removes only soon, updates the existing singleton and audit fields.
    setting_id = service(session).setting().id
    setting = service(session).update_setting(0, employee.id)
    assert (setting.id, setting.warning_days, setting.updated_by_id) == (setting_id, 0, employee.id)
    assert setting.updated_at == NOW
    assert "EXPIRING_SOON" not in [item.status for item in service(session).evaluate().items]


def test_expired_waste_refresh_and_taipei_midnight(session):
    employee, location, ingredient = (
        add_employee(session),
        add_location(session),
        add_ingredient(session),
    )
    batch = receive_batch(
        session,
        ingredient_id=ingredient.id,
        location_id=location.id,
        operator_id=employee.id,
        expiry_date=TODAY,
    )
    session.commit()
    assert service(session).evaluate().items[0].status == "EXPIRES_TODAY"
    after_midnight = NOW.replace(hour=16)
    before = service(session, after_midnight).evaluate()
    assert before.items[0].status == "EXPIRED"
    waste = build_waste_service(session, SqlAlchemyUnitOfWork(session), FixedClock(after_midnight))
    request = waste.create(
        batch.id,
        before.items[0].remaining_quantity,
        WasteReason.EXPIRED,
        None,
        employee.id,
        uuid4(),
    )
    assert service(session, after_midnight).evaluate().items[0].status == "EXPIRED"
    admin = add_employee(session, role=EmployeeRole.ADMIN)
    session.commit()
    waste.approve(request.id, admin.id)
    refreshed = service(session, after_midnight + timedelta(seconds=1)).list_alerts()
    assert refreshed.items == () and refreshed.generated_at > before.generated_at


def test_alert_api_permissions_and_setting_audit(session):
    staff = add_employee(session)
    admin = add_employee(session, role=EmployeeRole.ADMIN)
    session.commit()
    app = create_app()
    app.dependency_overrides[get_clock] = lambda: FixedClock(NOW)
    client = TestClient(app)
    assert client.get("/api/v1/alerts").status_code == 401
    cookie_name = get_settings().auth_cookie_name
    staff_headers = {"Cookie": f"{cookie_name}={make_token(staff.id)}"}
    admin_headers = {"Cookie": f"{cookie_name}={make_token(admin.id)}"}
    assert client.get("/api/v1/alerts", headers=staff_headers).status_code == 200
    assert client.get("/api/v1/alert-settings", headers=staff_headers).status_code == 200
    assert (
        client.patch(
            "/api/v1/alert-settings", headers=staff_headers, json={"warning_days": 2}
        ).status_code
        == 403
    )
    response = client.patch(
        "/api/v1/alert-settings", headers=admin_headers, json={"warning_days": 0}
    )
    assert response.status_code == 200
    assert response.json()["updated_by_id"] == admin.id
    for value in [-1, 1.5, "bad", "2", True]:
        response = client.patch(
            "/api/v1/alert-settings", headers=admin_headers, json={"warning_days": value}
        )
        assert response.status_code == 422
        assert response.json()["error"]["fields"][0]["field"] == "warning_days"


def test_equal_safety_and_location_uses_store_quantity(session):
    employee, location, other = add_employee(session), add_location(session), add_location(session)
    ingredient = add_ingredient(session, safety="5")
    for place, quantity in [(location, "1"), (other, "4")]:
        receive_batch(
            session,
            ingredient_id=ingredient.id,
            location_id=place.id,
            operator_id=employee.id,
            quantity=quantity,
        )
    session.commit()
    result = service(session).evaluate("LOW_STOCK", location.id).items[0]
    assert result.store_available_quantity == Decimal("5")
    assert result.location_available_quantity == Decimal("1")
    assert result.shortfall == 0
