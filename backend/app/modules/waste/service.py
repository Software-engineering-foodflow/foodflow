"""報廢規則、鎖定、防重送與原子交易。"""

from decimal import Decimal

from app.core.clock import Clock
from app.core.enums import ErrorCode, GoodsReceiptStatus, TransactionType, WasteReason
from app.core.errors import DomainError, FieldError
from app.core.idempotency import duplicate_operation
from app.core.types import round_money
from app.core.uow import UnitOfWork
from app.db.models import WasteRecord, WasteRequest
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

    def create(self, batch_id, quantity, reason, note, operator_id, key) -> WasteRequest:
        note = (note or "").strip() or None
        self._validate(quantity, reason, note)
        with self._uow.transaction():
            self._repository.serialize_operation(key)
            existing = self._repository.request_by_key(key)
            if existing:
                if (
                    existing.batch_id,
                    existing.quantity,
                    existing.reason,
                    existing.note,
                    existing.operator_id,
                ) != (batch_id, quantity, reason, note, operator_id):
                    raise duplicate_operation()
                return existing
            if self._ledger.find_operation(key, TransactionType.WASTE):
                raise DomainError(ErrorCode.STATE_CONFLICT, "此報廢操作已生效，請查看歷史紀錄")
            if self._repository.batch(batch_id) is None:
                raise DomainError(ErrorCode.NOT_FOUND, "找不到批次")
            self._require_source(batch_id)
            return self._repository.save_request(
                WasteRequest(
                    request_key=key,
                    batch_id=batch_id,
                    quantity=quantity,
                    reason=reason,
                    note=note,
                    operator_id=operator_id,
                    occurred_at=self._clock.now(),
                    status="PENDING",
                )
            )

    @staticmethod
    def _validate(quantity, reason, note):
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
            raise DomainError(ErrorCode.RULE_VIOLATION, "請選擇報廢原因")
        if reason == WasteReason.OTHER and not note:
            raise DomainError(
                ErrorCode.RULE_VIOLATION,
                "其他原因須填說明",
                fields=[FieldError("note", "請補充說明")],
            )
        if note and len(note) > 2000:
            raise DomainError(ErrorCode.RULE_VIOLATION, "說明最多 2000 字")

    def _require_source(self, batch_id):
        if self._repository.source_status(batch_id) != GoodsReceiptStatus.CONFIRMED:
            raise DomainError(ErrorCode.STATE_CONFLICT, "批次來源已失效，無法報廢")

    def approve(self, request_id: int, reviewer_id: int):
        with self._uow.transaction():
            request = self.get_request(request_id, lock=True)
            if request.status == "APPROVED":
                return request
            if request.status != "PENDING":
                raise DomainError(ErrorCode.STATE_CONFLICT, "申請已駁回，不能核准")
            batches = self._ledger.lock_batches([request.batch_id])
            if not batches:
                raise DomainError(ErrorCode.NOT_FOUND, "找不到批次")
            self._require_source(request.batch_id)
            batch = batches[0]
            amount = (
                round_money(request.quantity * batch.unit_price)
                if batch.unit_price is not None
                else None
            )
            if amount is not None and amount >= Decimal("1000000000000"):
                raise DomainError(ErrorCode.RULE_VIOLATION, "報廢金額超過儲存上限")
            now = self._clock.now()
            label = REASON_LABELS[request.reason] + (f"：{request.note}" if request.note else "")
            tx = self._ledger.deduct(
                batch,
                request.quantity,
                TransactionType.WASTE,
                StockOp(request.request_key, reviewer_id, now, label),
            )
            record = self._repository.add(
                WasteRecord(
                    batch_id=batch.id,
                    transaction_id=tx.id,
                    quantity=request.quantity,
                    reason=request.reason,
                    note=request.note,
                    loss_amount=amount,
                    operator_id=reviewer_id,
                    occurred_at=now,
                )
            )
            request.status, request.record_id = "APPROVED", record.id
            request.reviewer_id, request.reviewed_at = reviewer_id, now
            return self._repository.save_request(request)

    def reject(self, request_id: int, reviewer_id: int, reason: str):
        reason = reason.strip()
        if not reason or len(reason) > 2000:
            raise DomainError(
                ErrorCode.RULE_VIOLATION,
                "請填寫駁回原因（最多 2000 字）",
                fields=[FieldError("reason", "請填寫駁回原因")],
            )
        with self._uow.transaction():
            request = self.get_request(request_id, lock=True)
            if request.status == "REJECTED" and request.rejection_reason == reason:
                return request
            if request.status != "PENDING":
                raise DomainError(ErrorCode.STATE_CONFLICT, "申請已審核，不能駁回")
            request.status, request.rejection_reason = "REJECTED", reason
            request.reviewer_id, request.reviewed_at = reviewer_id, self._clock.now()
            return self._repository.save_request(request)

    def get_request(self, request_id, *, lock=False):
        request = self._repository.get_request(request_id, lock=lock)
        if request is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到報廢申請")
        return request

    def list_requests(self, page, page_size):
        return self._repository.list_requests(page, page_size)

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
