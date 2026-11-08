"""報廢規則、鎖定、防重送與原子交易。"""

from decimal import Decimal
from uuid import UUID

from app.core.clock import Clock
from app.core.enums import ErrorCode, TransactionType, WasteReason
from app.core.errors import DomainError, FieldError
from app.core.idempotency import check_replay, duplicate_operation
from app.core.types import round_money
from app.core.uow import UnitOfWork
from app.db.models import WasteRecord
from app.modules.inventory.ledger import StockLedger, StockOp
from app.modules.waste.repository import WasteRepository

REASON_LABELS = {
    WasteReason.EXPIRED: "過期",
    WasteReason.SPOILED: "變質",
    WasteReason.DAMAGED: "損壞",
    WasteReason.OTHER: "其他",
}


class WasteService:
    def __init__(
        self, repository: WasteRepository, ledger: StockLedger, uow: UnitOfWork, clock: Clock
    ):
        self._repository, self._ledger = repository, ledger
        self._uow, self._clock = uow, clock

    def create(
        self,
        batch_id: int,
        quantity: Decimal,
        reason: WasteReason,
        note: str | None,
        operator_id: int,
        key: UUID,
    ) -> WasteRecord:
        note = note.strip() if note else None
        note = note or None
        with self._uow.transaction():
            self._repository.serialize_operation(key)
            batches = self._ledger.lock_batches([batch_id])
            existing = self._ledger.find_operation(key, TransactionType.WASTE)
            if check_replay(existing, {batch_id: quantity}):
                record = self._repository.by_transaction(existing[0].id)
                if (
                    record is None
                    or record.operator_id != operator_id
                    or record.reason != reason
                    or record.note != note
                ):
                    raise duplicate_operation()
                return record
            if not batches:
                raise DomainError(ErrorCode.NOT_FOUND, "找不到批次")
            if (
                not quantity.is_finite()
                or quantity <= 0
                or quantity.as_tuple().exponent < -3
                or quantity >= Decimal("1000000000")
            ):
                raise DomainError(
                    ErrorCode.RULE_VIOLATION,
                    "報廢數量格式錯誤",
                    fields=[FieldError("quantity", "須為正數，最多三位小數")],
                )
            if reason not in REASON_LABELS:
                raise DomainError(
                    ErrorCode.RULE_VIOLATION,
                    "請選擇報廢原因",
                    fields=[FieldError("reason", "請選擇報廢原因")],
                )
            if reason == WasteReason.OTHER and not note:
                raise DomainError(
                    ErrorCode.RULE_VIOLATION,
                    "其他原因須填說明",
                    fields=[FieldError("note", "請補充說明")],
                )
            batch = batches[0]
            amount = (
                round_money(quantity * batch.unit_price) if batch.unit_price is not None else None
            )
            if amount is not None and amount >= Decimal("1000000000000"):
                raise DomainError(
                    ErrorCode.RULE_VIOLATION,
                    "報廢金額超過儲存上限",
                    fields=[FieldError("quantity", "請減少本次報廢數量")],
                )
            now = self._clock.now()
            label = REASON_LABELS[reason] + (f"：{note}" if note else "")
            transaction = self._ledger.deduct(
                batch, quantity, TransactionType.WASTE, StockOp(key, operator_id, now, label)
            )
            return self._repository.add(
                WasteRecord(
                    batch_id=batch.id,
                    transaction_id=transaction.id,
                    quantity=quantity,
                    reason=reason,
                    note=note,
                    loss_amount=amount,
                    operator_id=operator_id,
                    occurred_at=now,
                )
            )

    def list_records(self, page, page_size):
        return self._repository.list_records(page, page_size)

    def get(self, record_id):
        record = self._repository.get(record_id)
        if record is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到報廢紀錄")
        return record

    def batches(self, search, page, page_size):
        return self._repository.batches(search, page, page_size)

    def batch(self, batch_id):
        batch = self._repository.batch(batch_id)
        if batch is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到批次")
        return batch
