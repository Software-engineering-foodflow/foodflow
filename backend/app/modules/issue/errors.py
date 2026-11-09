"""領用的業務錯誤，訊息只定義一次。可用量不足沿用 core.errors.insufficient_stock。"""

from collections.abc import Sequence

from app.core.enums import ErrorCode
from app.core.errors import DomainError, FieldError


def ingredient_not_found() -> DomainError:
    return DomainError(
        ErrorCode.NOT_FOUND,
        "找不到食材",
        fields=[FieldError("ingredient_id", "請重新選擇食材")],
    )


def batch_not_found(index: int) -> DomainError:
    return DomainError(
        ErrorCode.NOT_FOUND,
        "找不到批次，或批次不屬於這項食材",
        details={"line_index": index},
        fields=[FieldError(f"lines.{index}.batch_id", "請重新取得建議後再選擇批次")],
    )


def expired_batch(index: int, batch_number: str) -> DomainError:
    return DomainError(
        ErrorCode.RULE_VIOLATION,
        f"批次 {batch_number} 已過期，不能領用",
        details={"line_index": index},
        fields=[FieldError(f"lines.{index}.batch_id", "已過期的批次請改用報廢")],
    )


def missing_non_fefo_reason(indexes: Sequence[int]) -> DomainError:
    return DomainError(
        ErrorCode.RULE_VIOLATION,
        "沒有照先到期先使用領用的批次，必須填寫原因",
        fields=[
            FieldError(f"lines.{index}.reason", "請填寫沒有照先到期先使用的原因")
            for index in indexes
        ],
    )


def issue_not_found() -> DomainError:
    return DomainError(ErrorCode.NOT_FOUND, "找不到這次領用")


def whole_quantity_required(unit: str, fields: list[str]) -> DomainError:
    return DomainError(
        ErrorCode.RULE_VIOLATION,
        f"單位是「{unit}」，數量只能填整數",
        fields=[FieldError(field, f"「{unit}」只能填整數") for field in fields],
    )
