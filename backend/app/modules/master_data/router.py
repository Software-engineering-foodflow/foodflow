"""登入者查詢、管理者維護主檔。"""

from fastapi import APIRouter, Depends, Query, Response

from app.core.enums import StorageType
from app.core.errors import ERROR_RESPONSES
from app.modules.auth.dependencies import require_admin
from app.modules.master_data.dependencies import get_master_data_service
from app.modules.master_data.schemas import (
    IngredientCategoryCreate,
    IngredientCategoryList,
    IngredientCategoryResponse,
    IngredientCategoryUpdate,
    IngredientCreate,
    IngredientList,
    IngredientResponse,
    IngredientUpdate,
    SupplierCreate,
    SupplierList,
    SupplierResponse,
    SupplierUpdate,
)
from app.modules.master_data.service import MasterDataService

router = APIRouter(tags=["master-data"], responses=ERROR_RESPONSES)


def ingredient_response(item):
    return IngredientResponse.model_validate(
        {
            "id": item.id,
            "name": item.name,
            "category_id": item.category_id,
            "category_name": item.category.name,
            "unit": item.unit,
            "storage_method": item.storage_method,
            "safety_stock_quantity": item.safety_stock_quantity,
            "is_active": item.is_active,
        }
    )


@router.get("/ingredient-categories", response_model=IngredientCategoryList)
def list_categories(
    search: str = Query(default="", max_length=100),
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: MasterDataService = Depends(get_master_data_service),
):
    items, total = service.list(
        "ingredient-categories",
        search=search,
        is_active=is_active,
        category_id=None,
        storage_method=None,
        page=page,
        page_size=page_size,
    )
    return IngredientCategoryList(
        items=[IngredientCategoryResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/ingredient-categories",
    response_model=IngredientCategoryResponse,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_categories(
    body: IngredientCategoryCreate, service: MasterDataService = Depends(get_master_data_service)
):
    item = service.save("ingredient-categories", body.model_dump())
    return IngredientCategoryResponse.model_validate(item)


@router.patch(
    "/ingredient-categories/{record_id}",
    response_model=IngredientCategoryResponse,
    dependencies=[Depends(require_admin)],
)
def update_categories(
    record_id: int,
    body: IngredientCategoryUpdate,
    service: MasterDataService = Depends(get_master_data_service),
):
    item = service.save("ingredient-categories", body.model_dump(), record_id)
    return IngredientCategoryResponse.model_validate(item)


@router.delete(
    "/ingredient-categories/{record_id}", status_code=204, dependencies=[Depends(require_admin)]
)
def delete_categories(
    record_id: int, service: MasterDataService = Depends(get_master_data_service)
):
    service.delete("ingredient-categories", record_id)
    return Response(status_code=204)


@router.get("/ingredients", response_model=IngredientList)
def list_ingredients(
    search: str = Query(default="", max_length=100),
    is_active: bool | None = None,
    category_id: int | None = Query(default=None, gt=0),
    storage_method: StorageType | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: MasterDataService = Depends(get_master_data_service),
):
    items, total = service.list(
        "ingredients",
        search=search,
        is_active=is_active,
        category_id=category_id,
        storage_method=storage_method,
        page=page,
        page_size=page_size,
    )
    return IngredientList(
        items=[ingredient_response(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/ingredients",
    response_model=IngredientResponse,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_ingredients(
    body: IngredientCreate, service: MasterDataService = Depends(get_master_data_service)
):
    item = service.save("ingredients", body.model_dump())
    return ingredient_response(item)


@router.patch(
    "/ingredients/{record_id}",
    response_model=IngredientResponse,
    dependencies=[Depends(require_admin)],
)
def update_ingredients(
    record_id: int,
    body: IngredientUpdate,
    service: MasterDataService = Depends(get_master_data_service),
):
    item = service.save("ingredients", body.model_dump(), record_id)
    return ingredient_response(item)


@router.delete("/ingredients/{record_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_ingredients(
    record_id: int, service: MasterDataService = Depends(get_master_data_service)
):
    service.delete("ingredients", record_id)
    return Response(status_code=204)


@router.get("/suppliers", response_model=SupplierList)
def list_suppliers(
    search: str = Query(default="", max_length=100),
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    service: MasterDataService = Depends(get_master_data_service),
):
    items, total = service.list(
        "suppliers",
        search=search,
        is_active=is_active,
        category_id=None,
        storage_method=None,
        page=page,
        page_size=page_size,
    )
    return SupplierList(
        items=[SupplierResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/suppliers",
    response_model=SupplierResponse,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_suppliers(
    body: SupplierCreate, service: MasterDataService = Depends(get_master_data_service)
):
    item = service.save("suppliers", body.model_dump())
    return SupplierResponse.model_validate(item)


@router.patch(
    "/suppliers/{record_id}", response_model=SupplierResponse, dependencies=[Depends(require_admin)]
)
def update_suppliers(
    record_id: int,
    body: SupplierUpdate,
    service: MasterDataService = Depends(get_master_data_service),
):
    item = service.save("suppliers", body.model_dump(), record_id)
    return SupplierResponse.model_validate(item)


@router.delete("/suppliers/{record_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_suppliers(record_id: int, service: MasterDataService = Depends(get_master_data_service)):
    service.delete("suppliers", record_id)
    return Response(status_code=204)
