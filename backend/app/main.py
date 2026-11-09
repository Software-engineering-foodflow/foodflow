"""建立 app、掛 router、exception handler、靜態檔。

啟動方式：uv run uvicorn app.main:create_app --factory
"""

import logging
from collections.abc import Sequence
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import REPO_ROOT, get_settings
from app.core.enums import ErrorCode
from app.core.errors import (
    ERROR_RESPONSES,
    DomainError,
    FieldError,
    error_payload,
)
from app.modules.auth.dependencies import get_current_employee
from app.modules.auth.router import public_router as auth_public_router
from app.modules.auth.router import router as auth_router
from app.modules.health.router import router as health_router
from app.modules.issue.router import router as issue_router
from app.modules.reports.router import router as reports_router
from app.modules.stocktake.router import router as stocktake_router
from app.modules.storage_location.router import router as storage_location_router
from app.modules.waste.router import router as waste_router

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"
DEFAULT_FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

_VALUE_ERROR_PREFIX = "Value error, "
_VALIDATION_MESSAGES = {
    "missing": "此欄位為必填",
    "json_invalid": "JSON 格式錯誤",
    "string_type": "須為文字",
    "int_type": "須為整數",
    "int_parsing": "須為整數",
    "bool_type": "須為布林值",
    "bool_parsing": "須為布林值",
    "uuid_parsing": "須為 UUID",
    "uuid_type": "須為 UUID",
    "date_parsing": "日期格式錯誤",
    "date_from_datetime_parsing": "日期格式錯誤",
    "enum": "不是可接受的選項",
    "literal_error": "不是可接受的選項",
    "extra_forbidden": "不接受此欄位",
}
_DEFAULT_VALIDATION_MESSAGE = "欄位格式不正確"
_HTTP_ERROR_CODES = {
    401: ErrorCode.UNAUTHENTICATED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
}


def _field_error(error: dict) -> FieldError:
    """只取 loc 與 msg（T4）：ctx 可能含 Decimal，不可進回應。"""
    location = error["loc"]
    if location and location[0] in {"body", "query", "path", "header", "cookie"}:
        location = location[1:]
    field = ".".join(str(part) for part in location) or "body"

    if error["type"] == "value_error":
        message = error["msg"].removeprefix(_VALUE_ERROR_PREFIX)
    else:
        message = _VALIDATION_MESSAGES.get(error["type"], _DEFAULT_VALIDATION_MESSAGE)
    return FieldError(field=field, message=message)


def _install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message, exc.details, exc.fields),
        )

    @app.exception_handler(RequestValidationError)
    def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_payload(
                ErrorCode.VALIDATION_ERROR,
                "輸入資料有誤",
                fields=[_field_error(error) for error in exc.errors()],
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    def handle_http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code >= 500:
            code = ErrorCode.INTERNAL_ERROR
        else:
            code = _HTTP_ERROR_CODES.get(exc.status_code, ErrorCode.VALIDATION_ERROR)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(code, "無法處理此請求"),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.error("未預期的錯誤：%s", type(exc).__name__, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_payload(ErrorCode.INTERNAL_ERROR, "系統發生錯誤，請稍後再試"),
        )


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Demo 時由 FastAPI 提供建置後的前端，同源、單一 port（T9）。"""
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise DomainError(ErrorCode.NOT_FOUND, "找不到資源")
        candidate = (root / full_path).resolve()
        if candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        if full_path.startswith("assets/"):
            raise DomainError(ErrorCode.NOT_FOUND, "找不到資源")
        return FileResponse(index)


def create_app(
    *,
    extra_api_routers: Sequence[APIRouter] = (),
    frontend_dist: Path = DEFAULT_FRONTEND_DIST,
) -> FastAPI:
    """extra_api_routers 只給測試注入，正式 app 只掛下方明列的 router。"""
    get_settings()  # 設定不合法（例如缺 JWT_SECRET）時拒絕啟動。

    app = FastAPI(title="食序 FoodFlow API", version="0.1.0")
    _install_exception_handlers(app)

    # /api/v1 預設需要登入（AD-15）；公開端點要掛在另外明確的公開路由。
    api_router = APIRouter(
        prefix=API_PREFIX,
        dependencies=[Depends(get_current_employee)],
        responses=ERROR_RESPONSES,
    )
    api_router.include_router(auth_router)
    api_router.include_router(storage_location_router)
    api_router.include_router(issue_router)
    api_router.include_router(waste_router)
    api_router.include_router(reports_router)
    api_router.include_router(stocktake_router)
    for router in extra_api_routers:
        api_router.include_router(router)
    app.include_router(api_router)
    app.include_router(auth_public_router, prefix=API_PREFIX)

    app.include_router(health_router)
    _mount_frontend(app, frontend_dist)
    return app
