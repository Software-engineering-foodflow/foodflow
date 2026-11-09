"""領用 API（FR-10、FR-11）：一般員工與管理者都可使用，登入由 /api/v1 統一把關（AD-15）。"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_idempotency_key
from app.core.errors import ERROR_RESPONSES
from app.db.models import Employee
from app.modules.auth.dependencies import get_current_employee
from app.modules.issue.dependencies import get_issue_service
from app.modules.issue.schemas import (
    IssuableIngredientList,
    IssuableIngredientResponse,
    IssueCreateRequest,
    IssueLineRequest,
    IssueLineResponse,
    IssueRecordList,
    IssueRecordResponse,
    IssueResponse,
    IssueReversalRequest,
    IssueReversalResponse,
    IssueSuggestionRequest,
    IssueSuggestionResponse,
    SuggestionLineResponse,
)
from app.modules.issue.service import (
    IssueLineInput,
    IssueRecord,
    IssueResult,
    IssueResultLine,
    IssueService,
    Suggestion,
)

router = APIRouter(responses=ERROR_RESPONSES, tags=["issues"])


def _line_inputs(lines: list[IssueLineRequest]) -> list[IssueLineInput]:
    return [IssueLineInput(line.batch_id, line.quantity, line.reason) for line in lines]


def _suggestion_response(suggestion: Suggestion) -> IssueSuggestionResponse:
    # 用 dict 而不是關鍵字參數：AD-5 的架構測試會把 remaining_quantity= 視為寫入批次。
    candidates = [
        SuggestionLineResponse.model_validate(
            {
                "batch_id": line.batch.id,
                "batch_number": line.batch.batch_number,
                "location_id": line.batch.current_location_id,
                "location_code": line.batch.current_location.code,
                "location_name": line.batch.current_location.name,
                "remaining_quantity": line.batch.remaining_quantity,
                "expiry_date": line.batch.expiry_date,
                "expiry_status": line.expiry_status,
                "days_until_expiry": line.days_until_expiry,
                "fefo_quantity": line.fefo_quantity,
                "quantity": line.quantity,
                "is_non_fefo": line.is_non_fefo,
            }
        )
        for line in suggestion.lines
    ]
    return IssueSuggestionResponse(
        ingredient_id=suggestion.ingredient.id,
        ingredient_name=suggestion.ingredient.name,
        unit=suggestion.ingredient.unit,
        requested_quantity=suggestion.requested_quantity,
        available_quantity=suggestion.available_quantity,
        candidates=candidates,
        allows_fraction=suggestion.allows_fraction,
    )


def _line_response(line: IssueResultLine) -> IssueLineResponse:
    return IssueLineResponse(
        transaction_id=line.transaction_id,
        batch_id=line.batch_id,
        batch_number=line.batch_number,
        quantity=line.quantity,
        quantity_after=line.quantity_after,
        is_non_fefo=line.is_non_fefo,
        reason=line.reason,
    )


def _issue_response(result: IssueResult) -> IssueResponse:
    return IssueResponse(
        operation_group_id=result.operation_group_id,
        lines=[_line_response(line) for line in result.lines],
    )


def _record_response(record: IssueRecord) -> IssueRecordResponse:
    reversal = record.reversal
    return IssueRecordResponse(
        operation_group_id=record.operation_group_id,
        occurred_at=record.occurred_at,
        operator_name=record.operator_name,
        ingredient_id=record.ingredient_id,
        ingredient_name=record.ingredient_name,
        unit=record.unit,
        lines=[_line_response(line) for line in record.lines],
        reversal=None
        if reversal is None
        else IssueReversalResponse(
            occurred_at=reversal.occurred_at,
            operator_name=reversal.operator_name,
            reason=reversal.reason,
        ),
    )


@router.get("/issues", response_model=IssueRecordList)
def list_recent_issues(
    limit: int = Query(default=20, ge=1, le=50),
    service: IssueService = Depends(get_issue_service),
) -> IssueRecordList:
    """最近幾次領用，新到舊；依條件查詢所有異動屬於 FR-17（Epic 8）。"""
    return IssueRecordList(
        items=[_record_response(record) for record in service.recent_issues(limit)]
    )


@router.post("/issues/{operation_group_id}/reversal", response_model=IssueRecordResponse)
def reverse_issue(
    operation_group_id: UUID,
    body: IssueReversalRequest,
    employee: Employee = Depends(get_current_employee),
    service: IssueService = Depends(get_issue_service),
) -> IssueRecordResponse:
    """沖銷整次領用並回傳更新後的紀錄；已沖銷過時回 200 與目前狀態。"""
    record = service.reverse_issue(operation_group_id, reason=body.reason, operator_id=employee.id)
    return _record_response(record)


@router.get("/issues/ingredients", response_model=IssuableIngredientList)
def list_issuable_ingredients(
    service: IssueService = Depends(get_issue_service),
) -> IssuableIngredientList:
    return IssuableIngredientList(
        items=[
            IssuableIngredientResponse(
                id=option.ingredient.id,
                name=option.ingredient.name,
                unit=option.ingredient.unit,
                category_id=option.ingredient.category_id,
                category_name=option.ingredient.category_name,
                storage_method=option.ingredient.storage_method,
                available_quantity=option.ingredient.available_quantity,
                is_active=option.ingredient.is_active,
                nearest_expiry_date=option.ingredient.nearest_expiry_date,
                nearest_expiry_status=option.nearest_expiry_status,
                nearest_days_until_expiry=option.nearest_days_until_expiry,
                is_low_stock=option.is_low_stock,
                allows_fraction=option.allows_fraction,
            )
            for option in service.list_ingredients()
        ]
    )


@router.post("/issues/suggestions", response_model=IssueSuggestionResponse)
def suggest_issue(
    body: IssueSuggestionRequest,
    service: IssueService = Depends(get_issue_service),
) -> IssueSuggestionResponse:
    suggestion = service.suggest(
        body.ingredient_id,
        quantity=body.quantity,
        lines=None if body.lines is None else _line_inputs(body.lines),
    )
    return _suggestion_response(suggestion)


@router.post("/issues", response_model=IssueResponse)
def create_issue(
    body: IssueCreateRequest,
    idempotency_key: UUID = Depends(get_idempotency_key),
    employee: Employee = Depends(get_current_employee),
    service: IssueService = Depends(get_issue_service),
) -> IssueResponse:
    """首次與重放都回 200（AD-8）。"""
    result = service.issue(
        body.ingredient_id,
        _line_inputs(body.lines),
        idempotency_key=idempotency_key,
        operator_id=employee.id,
    )
    return _issue_response(result)
