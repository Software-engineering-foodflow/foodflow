"""台北日期邊界、期初期末與報廢分布計算。"""

from datetime import date
from decimal import Decimal

from app.core.clock import taipei_day_range
from app.core.enums import ErrorCode, TransactionType
from app.core.errors import DomainError, FieldError
from app.modules.reports.repository import ReportsRepository


def date_range(start: date | None, end: date | None, required: bool = False):
    if start is None and end is None and not required:
        return None, None
    if start is None or end is None or start > end or end == date.max:
        raise DomainError(
            ErrorCode.RULE_VIOLATION,
            "請填寫有效的起迄日期",
            fields=[FieldError("end_date", "迄日須不早於起日，且可計算次日")],
        )
    return taipei_day_range(start, end)


class ReportsService:
    def __init__(self, repository: ReportsRepository):
        self._repository = repository

    def transactions(
        self, start_date, end_date, ingredient_id, batch_id, tx_type, operator_id, page, page_size
    ):
        start, end = date_range(start_date, end_date)
        return self._repository.transactions(
            start, end, ingredient_id, batch_id, tx_type, operator_id, page, page_size
        )

    def transaction(self, transaction_id):
        result = self._repository.transaction(transaction_id)
        if result is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到異動")
        return result

    def locations(
        self, start_date, end_date, ingredient_id, batch_id, operator_id, page, page_size
    ):
        start, end = date_range(start_date, end_date)
        return self._repository.locations(
            start, end, ingredient_id, batch_id, operator_id, page, page_size
        )

    def stock(self, start_date, end_date):
        start, end = date_range(start_date, end_date, required=True)
        rows = {}
        active = set()
        for tx in self._repository.history_before(end):
            ingredient = tx.batch.ingredient
            row = rows.setdefault(
                ingredient.id,
                dict(
                    ingredient_id=ingredient.id,
                    ingredient_name=ingredient.name,
                    unit=ingredient.unit,
                    opening=Decimal(0),
                    receipt=Decimal(0),
                    issue=Decimal(0),
                    waste=Decimal(0),
                    adjustment=Decimal(0),
                    closing=Decimal(0),
                ),
            )
            row["closing"] += tx.quantity_delta
            if tx.occurred_at < start:
                row["opening"] += tx.quantity_delta
            else:
                active.add(ingredient.id)
                kind = tx.reverses.type if tx.reverses is not None else tx.type
                field, sign = {
                    TransactionType.RECEIPT: ("receipt", 1),
                    TransactionType.ISSUE: ("issue", -1),
                    TransactionType.WASTE: ("waste", -1),
                    TransactionType.ADJUSTMENT: ("adjustment", 1),
                }[kind]
                row[field] += sign * tx.quantity_delta
        return [rows[k] for k in sorted(rows) if rows[k]["opening"] != 0 or k in active]

    def waste(self, start_date, end_date, group_by):
        start, end = date_range(start_date, end_date, required=True)
        groups = {}
        for record, tx in self._repository.waste_events(start, end):
            ingredient = record.batch.ingredient
            if group_by == "ingredient":
                key, label = str(ingredient.id), ingredient.name
            elif group_by == "category":
                key, label = str(ingredient.category_id), ingredient.category.name
            else:
                key, label = record.reason.value, record.reason.value
            group = groups.setdefault(
                (key, ingredient.unit),
                dict(
                    key=key,
                    label=label,
                    unit=ingredient.unit,
                    quantity=Decimal(0),
                    known_loss_amount=Decimal(0),
                    unknown_cost_count=0,
                    details=[],
                ),
            )
            sign = -1 if tx.reverses_transaction_id is not None else 1
            amount = sign * record.loss_amount if record.loss_amount is not None else None
            quantity = -tx.quantity_delta
            group["quantity"] += quantity
            if amount is None:
                group["unknown_cost_count"] += 1
            else:
                group["known_loss_amount"] += amount
            group["details"].append(
                dict(
                    waste_record_id=record.id,
                    transaction_id=tx.id,
                    reverses_transaction_id=tx.reverses_transaction_id,
                    batch_id=record.batch_id,
                    batch_number=record.batch.batch_number,
                    ingredient_name=ingredient.name,
                    quantity=quantity,
                    loss_amount=amount,
                    reason=record.reason,
                    note=record.note,
                    occurred_at=tx.occurred_at,
                    operator_name=tx.operator.name,
                )
            )
        return [groups[k] for k in sorted(groups)]
