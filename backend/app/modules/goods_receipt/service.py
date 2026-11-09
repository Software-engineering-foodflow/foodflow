from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.clock import TAIPEI, Clock
from app.core.enums import EmployeeRole, ErrorCode, GoodsReceiptStatus, TransactionType
from app.core.errors import DomainError, FieldError
from app.core.uow import UnitOfWork
from app.db.models import GoodsReceipt, GoodsReceiptItem
from app.modules.goods_receipt.repository import GoodsReceiptRepository
from app.modules.inventory.ledger import StockLedger, StockOp


@dataclass(frozen=True)
class ReceiptItemInput:
    ingredient_id: int
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    expiry_date: date | None = None
    location_id: int | None = None
    note: str | None = None
    id: int | None = None


class GoodsReceiptService:
    def __init__(
        self, repository: GoodsReceiptRepository, ledger: StockLedger, uow: UnitOfWork, clock: Clock
    ) -> None:
        self._repository = repository
        self._ledger = ledger
        self._uow = uow
        self._clock = clock

    def get(self, receipt_id: int) -> GoodsReceipt:
        receipt = self._repository.get(receipt_id)
        if receipt is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到進貨單")
        return receipt

    def options(self, kind: str, search: str, page: int, page_size: int, include_inactive=False):
        return self._repository.options(kind, search.strip(), page, page_size, include_inactive)

    def list(self, **filters):
        if (
            filters["date_from"]
            and filters["date_to"]
            and filters["date_from"] > filters["date_to"]
        ):
            raise DomainError(ErrorCode.VALIDATION_ERROR, "起日不可晚於迄日")
        filters["receipt_number"] = filters["receipt_number"].strip()
        return self._repository.list(**filters)

    def reverse(self, receipt_id: int, *, operator_id: int, reason: str) -> GoodsReceipt:
        reason = reason.strip()
        if not reason or len(reason) > 500:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "請填寫500字以內的沖銷原因")
        with self._uow.transaction():
            operator = self._repository.employee(operator_id)
            if (
                operator is None
                or not operator.is_active
                or operator.role is not EmployeeRole.ADMIN
            ):
                raise DomainError(ErrorCode.FORBIDDEN, "僅有效管理者可沖銷進貨")
            receipt = self._lock(receipt_id)
            if receipt.status is GoodsReceiptStatus.REVERSED:
                return self.get(receipt_id)
            if receipt.status is not GoodsReceiptStatus.CONFIRMED:
                raise DomainError(ErrorCode.STATE_CONFLICT, "只有已確認進貨可以沖銷")
            item_ids = {item.id for item in receipt.items}
            candidates = self._repository.batches(list(item_ids))
            batches = self._ledger.lock_batches(sorted(batch.id for batch in candidates))
            invalid = (
                not item_ids
                or len(batches) != len(item_ids)
                or {batch.source_item_id for batch in batches} != item_ids
            )
            transactions = self._repository.transactions([batch.id for batch in batches])
            originals = []
            for batch in batches:
                history = [tx for tx in transactions if tx.batch_id == batch.id]
                if len(history) != 1 or history[0].type is not TransactionType.RECEIPT:
                    invalid = True
                else:
                    original = history[0]
                    if (
                        original.quantity_delta != batch.initial_quantity
                        or batch.remaining_quantity != batch.initial_quantity
                    ):
                        invalid = True
                    originals.append(original)
            if invalid:
                raise DomainError(
                    ErrorCode.RULE_VIOLATION, "進貨批次不完整或已有後續異動，請以盤點調整處理"
                )
            op = StockOp(uuid4(), operator_id, self._clock.now(), reason)
            for original in originals:
                self._ledger.reverse(original, op)
            receipt.status = GoodsReceiptStatus.REVERSED
            self._repository.flush()
            return self.get(receipt_id)

    def create(
        self,
        *,
        supplier_id: int,
        receipt_date: date,
        items: list[ReceiptItemInput],
        operator_id: int,
    ) -> GoodsReceipt:
        with self._uow.transaction():
            now = self._clock.now()
            self._validate(supplier_id, receipt_date, items, now.astimezone(TAIPEI).date())
            self._validate_ids(items, set())
            receipt = GoodsReceipt(
                supplier_id=supplier_id,
                receipt_date=receipt_date,
                status=GoodsReceiptStatus.DRAFT,
                created_by_id=operator_id,
                created_at=now,
                confirmed_at=None,
                items=[],
            )
            receipt.items = [self._item(value) for value in items]
            self._repository.add(receipt)
            return self.get(receipt.id)

    def update(
        self,
        receipt_id: int,
        *,
        supplier_id: int,
        receipt_date: date,
        items: list[ReceiptItemInput],
    ) -> GoodsReceipt:
        with self._uow.transaction():
            receipt = self._lock(receipt_id)
            self._draft(receipt)
            existing = {item.id: item for item in receipt.items}
            self._validate_ids(items, set(existing))
            self._validate(supplier_id, receipt_date, items, self._clock.today())
            receipt.supplier_id = supplier_id
            receipt.receipt_date = receipt_date
            retained = {value.id for value in items if value.id is not None}
            for item in list(receipt.items):
                if item.id not in retained:
                    receipt.items.remove(item)
                    self._repository.delete_item(item)
            for value in items:
                if value.id is None:
                    receipt.items.append(self._item(value))
                else:
                    self._assign(existing[value.id], value)
            self._repository.flush()
            return self.get(receipt.id)

    def delete(self, receipt_id: int) -> None:
        with self._uow.transaction():
            receipt = self._lock(receipt_id)
            self._draft(receipt)
            self._repository.delete(receipt)

    def confirm(self, receipt_id: int, *, operator_id: int) -> GoodsReceipt:
        with self._uow.transaction():
            receipt = self._lock(receipt_id)
            if receipt.status is GoodsReceiptStatus.CONFIRMED:
                return self.get(receipt_id)
            self._draft(receipt)
            now = self._clock.now()
            items = [
                ReceiptItemInput(
                    ingredient_id=item.ingredient_id,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    expiry_date=item.expiry_date,
                    location_id=item.location_id,
                    note=item.note,
                    id=item.id,
                )
                for item in receipt.items
            ]
            self._validate(
                receipt.supplier_id,
                receipt.receipt_date,
                items,
                now.astimezone(TAIPEI).date(),
                confirming=True,
            )
            op = StockOp(uuid4(), operator_id, now)
            # Ledger reads the receipt date through this relationship.
            for item in receipt.items:
                item.receipt = receipt
                self._ledger.receive(item, op)
            receipt.status = GoodsReceiptStatus.CONFIRMED
            receipt.confirmed_at = now
            self._repository.flush()
            return self.get(receipt.id)

    def _lock(self, receipt_id: int) -> GoodsReceipt:
        receipt = self._repository.lock(receipt_id)
        if receipt is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到進貨單")
        return receipt

    @staticmethod
    def _draft(receipt: GoodsReceipt) -> None:
        if receipt.status is not GoodsReceiptStatus.DRAFT:
            raise DomainError(ErrorCode.STATE_CONFLICT, "只有草稿可以編輯、刪除或確認")

    @staticmethod
    def _validate_ids(items: list[ReceiptItemInput], existing: set[int]) -> None:
        seen = set()
        errors = []
        for index, item in enumerate(items):
            if item.id is not None:
                if item.id not in existing or item.id in seen:
                    errors.append(FieldError(f"items.{index}.id", "明細不屬於此單或重複"))
                seen.add(item.id)
        if errors:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "輸入資料有誤", fields=errors)

    def _validate(
        self,
        supplier_id: int,
        receipt_date: date,
        items: list[ReceiptItemInput],
        today: date,
        *,
        confirming=False,
    ) -> None:
        errors = []
        supplier = self._repository.supplier(supplier_id)
        if supplier is None or not supplier.is_active:
            errors.append(FieldError("supplier_id", "請選擇啟用的供應商"))
        if receipt_date > today:
            errors.append(FieldError("receipt_date", "進貨日期不可晚於今天"))
        if not items:
            errors.append(FieldError("items", "至少需要一筆食材明細"))
        for index, item in enumerate(items):
            prefix = f"items.{index}."
            ingredient = self._repository.ingredient(item.ingredient_id)
            if ingredient is None or not ingredient.is_active:
                errors.append(FieldError(prefix + "ingredient_id", "請選擇啟用的食材"))
            if item.location_id is not None:
                location = self._repository.location(item.location_id)
                if location is None or not location.is_active:
                    errors.append(FieldError(prefix + "location_id", "請選擇啟用的位置"))
            for field, value, scale, maximum, positive in (
                ("quantity", item.quantity, 3, Decimal("999999999.999"), True),
                ("unit_price", item.unit_price, 2, Decimal("9999999999.99"), False),
            ):
                if value is not None and (
                    not value.is_finite()
                    or value < 0
                    or (positive and value == 0)
                    or value > maximum
                    or value.as_tuple().exponent < -scale
                ):
                    errors.append(FieldError(prefix + field, "數值或小數精度不正確"))
            if confirming:
                for field in ("quantity", "expiry_date", "location_id"):
                    if getattr(item, field) is None:
                        errors.append(FieldError(prefix + field, "確認入庫時必填"))
                if item.expiry_date is not None and item.expiry_date < max(receipt_date, today):
                    errors.append(FieldError(prefix + "expiry_date", "到期日不可早於進貨日或今天"))
        if errors:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "輸入資料有誤", fields=errors)

    @staticmethod
    def _assign(item: GoodsReceiptItem, value: ReceiptItemInput) -> None:
        for field in (
            "ingredient_id",
            "quantity",
            "unit_price",
            "expiry_date",
            "location_id",
            "note",
        ):
            setattr(item, field, getattr(value, field))

    @classmethod
    def _item(cls, value: ReceiptItemInput) -> GoodsReceiptItem:
        item = GoodsReceiptItem()
        cls._assign(item, value)
        return item
