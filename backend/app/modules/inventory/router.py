from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query

from app.core.enums import StorageType
from app.core.errors import ERROR_RESPONSES
from app.modules.inventory.dependencies import get_inventory_service
from app.modules.inventory.schemas import (
    BIGINT_MAX,
    MAX_PAGE,
    InventoryBatchList,
    InventoryBatchResponse,
    InventoryList,
    InventoryLocationChangeList,
    InventoryOptionList,
    InventoryStatus,
    InventoryTransactionList,
)
from app.modules.inventory.service import InventoryFilters, InventoryService

router = APIRouter(prefix="/inventory", tags=["inventory"], responses=ERROR_RESPONSES)
ExternalId = Annotated[int, Path(gt=0, le=BIGINT_MAX)]
FilterId = Annotated[int | None, Query(gt=0, le=BIGINT_MAX)]
Page = Annotated[int, Query(ge=1, le=MAX_PAGE)]
PageSize = Annotated[int, Query(ge=1, le=100)]
Service = Annotated[InventoryService, Depends(get_inventory_service)]


@router.get("", response_model=InventoryList)
def overview(
    service: Service,
    search: str = Query(default="", max_length=100),
    category_id: FilterId = None,
    storage_method: StorageType | None = None,
    location_id: FilterId = None,
    status: InventoryStatus | None = None,
    page: Page = 1,
    page_size: PageSize = 20,
):
    return service.overview(
        InventoryFilters(search, category_id, storage_method, location_id, status, page, page_size)
    )


@router.get("/options/{kind}", response_model=InventoryOptionList)
def options(
    kind: Literal["categories", "locations"],
    service: Service,
    page: Page = 1,
    page_size: PageSize = 20,
):
    return service.options(kind, page, page_size)


@router.get("/batches/{batch_id}", response_model=InventoryBatchResponse)
def batch(batch_id: ExternalId, service: Service):
    return service.batch(batch_id)


@router.get("/batches/{batch_id}/transactions", response_model=InventoryTransactionList)
def transactions(batch_id: ExternalId, service: Service, page: Page = 1, page_size: PageSize = 20):
    return service.transactions(batch_id, page, page_size)


@router.get("/batches/{batch_id}/location-changes", response_model=InventoryLocationChangeList)
def location_changes(
    batch_id: ExternalId, service: Service, page: Page = 1, page_size: PageSize = 20
):
    return service.location_changes(batch_id, page, page_size)


@router.get("/{ingredient_id}/batches", response_model=InventoryBatchList)
def batches(
    ingredient_id: ExternalId,
    service: Service,
    location_id: FilterId = None,
    page: Page = 1,
    page_size: PageSize = 20,
):
    return service.batches(ingredient_id, location_id, page, page_size)
