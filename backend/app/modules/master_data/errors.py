from app.core.enums import ErrorCode
from app.core.errors import DomainError, FieldError


def duplicate(field: str) -> DomainError:
    message = "分類代碼已存在" if field == "code" else "食材名稱已存在"
    return DomainError(ErrorCode.DUPLICATE, message, fields=[FieldError(field, message)])


def referenced() -> DomainError:
    return DomainError(ErrorCode.REFERENCED, "此資料已被引用，不能執行此操作，請保留歷史關聯")


def invalid_category() -> DomainError:
    return DomainError(
        ErrorCode.RULE_VIOLATION,
        "分類不存在或已停用",
        fields=[FieldError("category_id", "請選擇啟用中的食材分類")],
    )


def not_found() -> DomainError:
    return DomainError(ErrorCode.NOT_FOUND, "找不到主檔資料")
