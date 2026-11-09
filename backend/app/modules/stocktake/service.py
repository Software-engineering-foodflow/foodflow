"""先鎖定並驗證全部明細，再在單一交易中調整；版本拒絕 ABA。"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from app.core.clock import Clock
from app.core.enums import ErrorCode, GoodsReceiptStatus
from app.core.errors import DomainError, FieldError
from app.core.uow import UnitOfWork
from app.modules.inventory.ledger import StockLedger, StockOp
from app.modules.stocktake.repository import StocktakeRepository


@dataclass(frozen=True)
class CountLine:
    batch_id: int
    actual_quantity: Decimal
    reason: str


@dataclass(frozen=True)
class ConfirmLine(CountLine):
    expected_quantity: Decimal
    expected_transaction_id: int | None


@dataclass(frozen=True)
class PreviewLine(ConfirmLine):
    quantity_delta: Decimal


@dataclass(frozen=True)
class ResultLine:
    batch_id: int
    transaction_id: int | None
    quantity_before: Decimal
    quantity_delta: Decimal
    quantity_after: Decimal


@dataclass(frozen=True)
class StocktakeResult:
    operation_group_id: UUID
    occurred_at: datetime
    lines: list[ResultLine]


class StocktakeService:
    def __init__(
        self, repository: StocktakeRepository, ledger: StockLedger, uow: UnitOfWork, clock: Clock
    ):
        self._repository = repository
        self._ledger = ledger
        self._uow = uow
        self._clock = clock

    def batches(self, search: str, page: int, page_size: int):
        return self._repository.batches(search.strip(), page, page_size)

    def _snapshot(self, lines: list[CountLine]):
        if not 1 <= len(lines) <= 100:
            raise DomainError(ErrorCode.RULE_VIOLATION, "盤點須包含 1 至 100 筆明細")
        ids = [line.batch_id for line in lines]
        if len(set(ids)) != len(ids):
            raise DomainError(
                ErrorCode.RULE_VIOLATION,
                "不可重複選擇批次",
                fields=[FieldError("lines", "批次不可重複")],
            )
        for i, line in enumerate(lines):
            quantities = {"actual_quantity": line.actual_quantity}
            if isinstance(line, ConfirmLine):
                quantities["expected_quantity"] = line.expected_quantity
                if line.expected_transaction_id is not None and (
                    type(line.expected_transaction_id) is not int
                    or line.expected_transaction_id < 1
                ):
                    raise DomainError(ErrorCode.RULE_VIOLATION, "異動編號不合法")
            for field, quantity in quantities.items():
                if (
                    not quantity.is_finite()
                    or quantity < 0
                    or quantity >= Decimal("1000000000")
                    or quantity.as_tuple().exponent < -3
                ):
                    raise DomainError(
                        ErrorCode.RULE_VIOLATION,
                        "數量須為非負數，最多九位整數與三位小數",
                        fields=[FieldError(f"lines.{i}.{field}", "數量格式不正確")],
                    )
            if type(line.batch_id) is not int or line.batch_id < 1:
                raise DomainError(ErrorCode.RULE_VIOLATION, "批次編號不合法")
            if not line.reason.strip() or len(line.reason) > 2000:
                raise DomainError(
                    ErrorCode.RULE_VIOLATION,
                    "請填寫盤點原因（最多 2000 字）",
                    fields=[FieldError(f"lines.{i}.reason", "請填寫盤點原因（最多 2000 字）")],
                )
        batches = {batch.id: batch for batch in self._ledger.lock_batches(sorted(ids))}
        if len(batches) != len(ids):
            raise DomainError(ErrorCode.NOT_FOUND, "找不到盤點批次")
        states = self._repository.source_states(ids)
        for batch_id in ids:
            if batch_id not in states:
                raise DomainError(ErrorCode.NOT_FOUND, "找不到批次來源")
            if states[batch_id] == GoodsReceiptStatus.REVERSED:
                raise DomainError(
                    ErrorCode.RULE_VIOLATION, "已沖銷來源不可盤點", {"batch_id": batch_id}
                )
        return batches, self._repository.latest_transactions(ids)

    def preview(self, lines: list[CountLine]) -> list[PreviewLine]:
        with self._uow.transaction():
            batches, versions = self._snapshot(lines)
            return [
                PreviewLine(
                    line.batch_id,
                    line.actual_quantity,
                    line.reason.strip(),
                    batches[line.batch_id].remaining_quantity,
                    versions.get(line.batch_id),
                    line.actual_quantity - batches[line.batch_id].remaining_quantity,
                )
                for line in lines
            ]

    def confirm(self, lines: list[ConfirmLine], operator_id: int) -> StocktakeResult:
        with self._uow.transaction():
            batches, versions = self._snapshot(lines)
            # 全數驗證完成前，絕不呼叫 adjust。
            for line in lines:
                current = batches[line.batch_id].remaining_quantity
                if (
                    current != line.expected_quantity
                    or versions.get(line.batch_id) != line.expected_transaction_id
                ):
                    raise DomainError(
                        ErrorCode.STALE_QUANTITY,
                        "庫存已變更，請重新預覽並核對",
                        {
                            "batch_id": line.batch_id,
                            "current_quantity": current,
                            "current_transaction_id": versions.get(line.batch_id),
                        },
                    )
            group_id, now = uuid4(), self._clock.now()
            results = []
            for line in lines:
                batch = batches[line.batch_id]
                before = batch.remaining_quantity
                tx = self._ledger.adjust(
                    batch,
                    line.actual_quantity,
                    StockOp(group_id, operator_id, now, line.reason.strip()),
                )
                results.append(
                    ResultLine(
                        line.batch_id,
                        tx.id if tx else None,
                        tx.quantity_before if tx else before,
                        tx.quantity_delta if tx else Decimal("0"),
                        tx.quantity_after if tx else before,
                    )
                )
            return StocktakeResult(group_id, now, results)
