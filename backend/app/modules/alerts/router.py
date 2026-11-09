"""已登入者可讀預警與設定，設定寫入只限管理者。"""

from fastapi import APIRouter, Depends, Query

from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee
from app.modules.alerts.dependencies import get_alert_service
from app.modules.alerts.schemas import (
    AlertList,
    AlertSettingResponse,
    AlertSettingUpdate,
    AlertStatus,
)
from app.modules.alerts.service import AlertService
from app.modules.auth.dependencies import require_admin

router = APIRouter(tags=["alerts"], responses=ERROR_RESPONSES)


@router.get("/alerts", response_model=AlertList)
def list_alerts(
    status: AlertStatus | None = None,
    location_id: int | None = Query(default=None, gt=0),
    service: AlertService = Depends(get_alert_service),
) -> AlertList:
    return AlertList.model_validate(service.list_alerts(status, location_id))


@router.get("/alert-settings", response_model=AlertSettingResponse)
def get_alert_settings(service: AlertService = Depends(get_alert_service)) -> AlertSettingResponse:
    return AlertSettingResponse.model_validate(service.setting())


@router.patch("/alert-settings", response_model=AlertSettingResponse)
def update_alert_settings(
    body: AlertSettingUpdate,
    admin: Employee = Depends(require_admin),
    service: AlertService = Depends(get_alert_service),
) -> AlertSettingResponse:
    return AlertSettingResponse.model_validate(service.update_setting(body.warning_days, admin.id))
