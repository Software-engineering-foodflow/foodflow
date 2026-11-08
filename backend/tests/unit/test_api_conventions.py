"""AD-15、AD-16、T9、T11：路由預設驗證、錯誤格式、OpenAPI、靜態檔。不連資料庫。"""

from pathlib import Path

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute, RouteContext, iter_route_contexts
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.types import PositiveQuantity
from app.main import API_PREFIX, create_app
from app.modules.auth.dependencies import get_current_employee

# 公開端點只有在這裡明確列出才可以存在；謝文佳加登入端點時補上。
PUBLIC_API_PATHS: set[str] = {"/api/v1/auth/login"}
# 正式 app 的完整路由；新增端點必須加入以驗證共用權限與錯誤契約。
PRODUCTION_API_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api/v1/stocktakes/batches"),
    ("POST", "/api/v1/stocktakes/preview"),
    ("POST", "/api/v1/stocktakes"),
    ("GET", "/api/v1/waste-records"),
    ("POST", "/api/v1/waste-records"),
    ("GET", "/api/v1/waste-records/batches"),
    ("GET", "/api/v1/waste-records/batches/{batch_id}"),
    ("GET", "/api/v1/waste-records/{record_id}"),
    ("GET", "/api/v1/inventory-transactions"),
    ("GET", "/api/v1/inventory-transactions/{transaction_id}"),
    ("GET", "/api/v1/batch-location-changes"),
    ("GET", "/api/v1/reports/stock"),
    ("GET", "/api/v1/reports/waste"),
    ("GET", "/health"),
    ("POST", "/api/v1/auth/login"),
    ("GET", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/employees"),
    ("POST", "/api/v1/employees"),
    ("PATCH", "/api/v1/employees/{employee_id}"),
    ("POST", "/api/v1/employees/{employee_id}/password"),
}


class Payload(BaseModel):
    quantity: PositiveQuantity
    lines: list[PositiveQuantity] = []


probe_router = APIRouter()


@probe_router.post("/probe")
def create_probe(body: Payload) -> dict[str, str]:
    return {"quantity": f"{body.quantity:.3f}"}


@pytest.fixture
def probe_app(tmp_path: Path):
    app = create_app(extra_api_routers=[probe_router], frontend_dist=tmp_path / "missing")
    # 這些測試不連資料庫：略過身分驗證，只看錯誤格式。
    app.dependency_overrides[get_current_employee] = lambda: None
    return app


def _api_routes(app) -> list[RouteContext]:
    # FastAPI 0.162 的 app.routes 只有 _IncludedRouter 外殼，要展開才看得到實際路由。
    return [
        context
        for context in iter_route_contexts(app.routes)
        if isinstance(context.original_route, APIRoute)
    ]


def _depends_on_current_employee(route: RouteContext) -> bool:
    pending = list(route.dependant.dependencies)
    while pending:
        dependency = pending.pop()
        if dependency.call is get_current_employee:
            return True
        pending.extend(dependency.dependencies)
    return False


def test_every_api_route_requires_login_unless_explicitly_public() -> None:
    app = create_app(extra_api_routers=[probe_router])
    api_routes = [r for r in _api_routes(app) if r.path.startswith(API_PREFIX)]

    assert api_routes, "至少要檢查到注入的路由，否則這個測試沒有意義"
    for route in api_routes:
        if route.path in PUBLIC_API_PATHS:
            assert not _depends_on_current_employee(route)
        else:
            assert _depends_on_current_employee(route), f"{route.path} 沒有驗證"
    assert {
        (method, route.path)
        for route in api_routes
        if not _depends_on_current_employee(route)
        for method in route.methods
    } == {("POST", "/api/v1/auth/login")}

    # 確認偵測本身有效：根路徑的 /health 不需要登入。
    health = next(route for route in _api_routes(app) if route.path == "/health")
    assert not _depends_on_current_employee(health)


def test_production_app_has_exact_declared_routes(tmp_path: Path) -> None:
    app = create_app(frontend_dist=tmp_path / "missing")
    routes = {
        (method, route.path)
        for route in _api_routes(app)
        if route.include_in_schema
        for method in route.methods
    }
    assert routes == PRODUCTION_API_ROUTES


def test_validation_error_uses_unified_format_with_dotted_paths(probe_app) -> None:
    response = TestClient(probe_app).post(
        f"{API_PREFIX}/probe", json={"quantity": "-1", "lines": ["1", "1.2345"]}
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"] == {}
    assert {field["field"] for field in error["fields"]} == {"quantity", "lines.1"}
    assert all("Value error" not in field["message"] for field in error["fields"])


def test_missing_field_message_is_traditional_chinese(probe_app) -> None:
    response = TestClient(probe_app).post(f"{API_PREFIX}/probe", json={})

    assert response.json()["error"]["fields"] == [{"field": "quantity", "message": "此欄位為必填"}]


def test_malformed_json_returns_unified_422(probe_app) -> None:
    response = TestClient(probe_app).post(
        f"{API_PREFIX}/probe", content="{", headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_path_returns_unified_404(probe_app) -> None:
    response = TestClient(probe_app).get(f"{API_PREFIX}/nope")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_unexpected_exception_returns_500_without_details(tmp_path: Path) -> None:
    router = APIRouter()

    @router.get("/boom")
    def boom() -> None:
        raise RuntimeError("password=hunter2")

    app = create_app(extra_api_routers=[router], frontend_dist=tmp_path / "missing")
    app.dependency_overrides[get_current_employee] = lambda: None

    response = TestClient(app, raise_server_exceptions=False).get(f"{API_PREFIX}/boom")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in response.text


def test_openapi_uses_error_response_instead_of_http_validation_error() -> None:
    schema = create_app(extra_api_routers=[probe_router]).openapi()

    components = schema["components"]["schemas"]
    assert "HTTPValidationError" not in components
    assert "ErrorResponse" in components
    responses = schema["paths"][f"{API_PREFIX}/probe"]["post"]["responses"]
    assert responses["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ErrorResponse"
    }


def test_openapi_quantity_is_string_only() -> None:
    schema = create_app(extra_api_routers=[probe_router]).openapi()

    payload = schema["components"]["schemas"]["Payload"]["properties"]["quantity"]
    assert payload["type"] == "string"


def test_health_declares_503_with_health_schema() -> None:
    schema = create_app().openapi()

    responses = schema["paths"]["/health"]["get"]["responses"]
    assert responses["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }


class TestFrontendStaticFiles:
    @pytest.fixture
    def client(self, tmp_path: Path) -> TestClient:
        dist = tmp_path / "dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text("<html>spa</html>", encoding="utf-8")
        (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        (tmp_path / "secret.txt").write_text("outside", encoding="utf-8")
        return TestClient(create_app(frontend_dist=dist))

    def test_serves_index_at_root(self, client: TestClient) -> None:
        assert "spa" in client.get("/").text

    def test_serves_built_asset(self, client: TestClient) -> None:
        assert "console.log" in client.get("/assets/app.js").text

    def test_deep_link_falls_back_to_index(self, client: TestClient) -> None:
        assert "spa" in client.get("/issues/new").text

    def test_missing_asset_returns_404_instead_of_index(self, client: TestClient) -> None:
        response = client.get("/assets/missing.js")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_api_path_is_not_swallowed_by_spa_fallback(self, client: TestClient) -> None:
        response = client.get(f"{API_PREFIX}/unknown")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_path_traversal_cannot_leave_dist(self, client: TestClient) -> None:
        response = client.get("/..%2Fsecret.txt")
        assert "outside" not in response.text

    def test_no_dist_means_no_fallback_route(self, tmp_path: Path) -> None:
        client = TestClient(create_app(frontend_dist=tmp_path / "missing"))
        assert client.get("/").status_code == 404


def test_valid_request_reaches_the_route(probe_app) -> None:
    response = TestClient(probe_app).post(f"{API_PREFIX}/probe", json={"quantity": "12.5"})

    assert response.status_code == 200
    assert response.json() == {"quantity": "12.500"}
