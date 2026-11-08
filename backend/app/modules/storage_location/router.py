"""儲存位置與整批換位置 API：登入者可查詢，寫入限管理者（FR-05、AD-15）。"""

from fastapi import APIRouter, Depends, Query, Response

from app.core.enums import StorageType
from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee, InventoryBatch, StorageLocation
from app.modules.auth.dependencies import require_admin
from app.modules.storage_location.dependencies import (
    get_batch_relocation_service,
    get_storage_location_service,
)
from app.modules.storage_location.schemas import (
    BatchMoveRequest,
    LocationBatchItem,
    LocationBatchList,
    LocationBatchResponse,
    StorageLocationCreate,
    StorageLocationList,
    StorageLocationListItem,
    StorageLocationResponse,
    StorageLocationSummaryResponse,
    StorageLocationUpdate,
)
from app.modules.storage_location.service import (
    BatchRelocationService,
    BatchView,
    LocationOverview,
    LocationSummary,
    StorageLocationService,
)

router = APIRouter(responses=ERROR_RESPONSES, tags=["storage-locations"])


@router.get("/storage-locations", response_model=StorageLocationList)
def list_storage_locations(
    search: str = Query(default="", max_length=100),
    storage_type: StorageType | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> StorageLocationList:
    items, total = service.list_locations(search, storage_type, is_active, page, page_size)
    return StorageLocationList(
        items=[_list_item(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def _list_item(overview: LocationOverview) -> StorageLocationListItem:
    base = StorageLocationResponse.model_validate(overview.location).model_dump()
    return StorageLocationListItem(
        **base,
        batch_count=overview.batch_count,
        nearest_expiry_date=overview.nearest_expiry_date,
        nearest_expiry_status=overview.nearest_expiry_status,
        nearest_days_until_expiry=overview.nearest_days_until_expiry,
    )


# 固定路徑放在 /{location_id} 路由之前，先保留這個路徑：
# 日後新增 GET /{location_id} 時，summary 才不會被當成位置 id。
@router.get("/storage-locations/summary", response_model=StorageLocationSummaryResponse)
def storage_location_summary(
    service: StorageLocationService = Depends(get_storage_location_service),
) -> LocationSummary:
    return service.summary()


@router.post("/storage-locations", status_code=201, response_model=StorageLocationResponse)
def create_storage_location(
    body: StorageLocationCreate,
    admin: Employee = Depends(require_admin),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> StorageLocation:
    return service.create(**body.model_dump())


@router.patch("/storage-locations/{location_id}", response_model=StorageLocationResponse)
def update_storage_location(
    location_id: int,
    body: StorageLocationUpdate,
    admin: Employee = Depends(require_admin),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> StorageLocation:
    return service.update(location_id, **body.model_dump())


@router.delete("/storage-locations/{location_id}", status_code=204)
def delete_storage_location(
    location_id: int,
    admin: Employee = Depends(require_admin),
    service: StorageLocationService = Depends(get_storage_location_service),
) -> Response:
    service.delete(location_id)
    return Response(status_code=204)


def _batch_fields(batch: InventoryBatch) -> dict:
    # 用 dict 而不是關鍵字參數：AD-5 的架構測試會把 remaining_quantity= 視為寫入批次。
    return {
        "id": batch.id,
        "batch_number": batch.batch_number,
        "ingredient_id": batch.ingredient_id,
        "ingredient_name": batch.ingredient.name,
        "unit": batch.ingredient.unit,
        "remaining_quantity": batch.remaining_quantity,
        "expiry_date": batch.expiry_date,
        "current_location_id": batch.current_location_id,
        "current_location_code": batch.current_location.code,
        "current_location_name": batch.current_location.name,
        "source_status": batch.source_item.receipt.status,
    }


def _batch_response(batch: InventoryBatch) -> LocationBatchResponse:
    return LocationBatchResponse.model_validate(_batch_fields(batch))


def _batch_item(view: BatchView) -> LocationBatchItem:
    return LocationBatchItem.model_validate(
        _batch_fields(view.batch)
        | {"expiry_status": view.expiry_status, "days_until_expiry": view.days_until_expiry}
    )


@router.get("/storage-locations/{location_id}/batches", response_model=LocationBatchList)
def list_location_batches(
    location_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    service: BatchRelocationService = Depends(get_batch_relocation_service),
) -> LocationBatchList:
    items, total = service.list_batches(location_id, page, page_size)
    return LocationBatchList(
        items=[_batch_item(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/inventory-batches/{batch_id}/location", response_model=LocationBatchResponse)
def move_batch(
    batch_id: int,
    body: BatchMoveRequest,
    admin: Employee = Depends(require_admin),
    service: BatchRelocationService = Depends(get_batch_relocation_service),
) -> LocationBatchResponse:
    batch = service.move(
        batch_id, to_location_id=body.to_location_id, reason=body.reason, operator_id=admin.id
    )
    return _batch_response(batch)
