import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased, selectinload

from app.core.db import for_update
from app.core.enums import TransactionType
from app.core.errors import flush_or_raise
from app.db.models import (
    Employee,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    InventoryBatch,
    InventoryTransaction,
    StorageLocation,
    Supplier,
)
from app.modules.goods_receipt.repository import GoodsReceiptRepository

_VIEW = (
    selectinload(GoodsReceipt.supplier),
    selectinload(GoodsReceipt.created_by),
    selectinload(GoodsReceipt.items).selectinload(GoodsReceiptItem.ingredient),
    selectinload(GoodsReceipt.items).selectinload(GoodsReceiptItem.location),
)


class SqlAlchemyGoodsReceiptRepository(GoodsReceiptRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, receipt_id: int) -> GoodsReceipt | None:
        receipt = self._session.scalar(
            select(GoodsReceipt)
            .where(GoodsReceipt.id == receipt_id)
            .options(*_VIEW)
            .execution_options(populate_existing=True)
        )

        return self._details(receipt) if receipt is not None else None

    def _details(self, receipt):
        return self._details_many([receipt])[0]

    def _details_many(self, receipts):
        batches = self.batches([item.id for receipt in receipts for item in receipt.items])
        original = aliased(InventoryTransaction)
        transactions = list(
            self._session.scalars(
                select(InventoryTransaction)
                .join(original, InventoryTransaction.reverses_transaction_id == original.id)
                .where(
                    InventoryTransaction.batch_id.in_([batch.id for batch in batches]),
                    InventoryTransaction.type == TransactionType.REVERSAL,
                    original.type == TransactionType.RECEIPT,
                    original.batch_id == InventoryTransaction.batch_id,
                )
                .options(selectinload(InventoryTransaction.operator))
                .execution_options(populate_existing=True)
            )
        )
        by_item = {batch.source_item_id: batch for batch in batches}
        by_batch = {tx.batch_id: tx for tx in transactions if tx.type is TransactionType.REVERSAL}
        for receipt in receipts:
            receipt.source_batches = {
                item.id: by_item[item.id] for item in receipt.items if item.id in by_item
            }
            receipt.reversal = next(
                (
                    by_batch[batch.id]
                    for batch in receipt.source_batches.values()
                    if batch.id in by_batch
                ),
                None,
            )
        return receipts

    def list(
        self, *, receipt_number, date_from, date_to, supplier_id, ingredient_id, page, page_size
    ):
        stmt = select(GoodsReceipt)
        if receipt_number:
            match = re.fullmatch(r"(?:GR-)?([0-9]+)", receipt_number, re.IGNORECASE)
            value = int(match[1]) if match and len(match[1]) <= 19 else 0
            stmt = stmt.where(GoodsReceipt.id == (value if 0 < value < 2**63 else 0))
        if date_from:
            stmt = stmt.where(GoodsReceipt.receipt_date >= date_from)
        if date_to:
            stmt = stmt.where(GoodsReceipt.receipt_date <= date_to)
        if supplier_id:
            stmt = stmt.where(GoodsReceipt.supplier_id == supplier_id)
        if ingredient_id:
            stmt = stmt.where(
                GoodsReceipt.items.any(GoodsReceiptItem.ingredient_id == ingredient_id)
            )
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = self._session.scalars(
            stmt.options(*_VIEW)
            .order_by(GoodsReceipt.receipt_date.desc(), GoodsReceipt.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return self._details_many(list(rows)), total

    def employee(self, employee_id):
        return self._session.get(Employee, employee_id, populate_existing=True)

    def batches(self, item_ids):
        return list(
            self._session.scalars(
                select(InventoryBatch)
                .where(InventoryBatch.source_item_id.in_(item_ids))
                .order_by(InventoryBatch.id)
                .execution_options(populate_existing=True)
            )
        )

    def transactions(self, batch_ids):
        return list(
            self._session.scalars(
                select(InventoryTransaction)
                .where(InventoryTransaction.batch_id.in_(batch_ids))
                .order_by(InventoryTransaction.id)
                .execution_options(populate_existing=True)
            )
        )

    def lock(self, receipt_id: int) -> GoodsReceipt | None:
        return self._session.scalar(
            for_update(select(GoodsReceipt).where(GoodsReceipt.id == receipt_id).options(*_VIEW))
        )

    def supplier(self, supplier_id: int) -> Supplier | None:
        return self._session.get(Supplier, supplier_id, populate_existing=True)

    def ingredient(self, ingredient_id: int) -> Ingredient | None:
        return self._session.get(Ingredient, ingredient_id, populate_existing=True)

    def location(self, location_id: int) -> StorageLocation | None:
        return self._session.get(StorageLocation, location_id, populate_existing=True)

    def options(self, kind, search, page, page_size, include_inactive=False):
        model = {"suppliers": Supplier, "ingredients": Ingredient, "locations": StorageLocation}[
            kind
        ]
        stmt = select(model)
        if not include_inactive:
            stmt = stmt.where(model.is_active.is_(True))
        if search:
            filters = [model.name.contains(search, autoescape=True)]
            if model is StorageLocation:
                filters.append(model.code.contains(search, autoescape=True))
            stmt = stmt.where(or_(*filters))
        total = self._session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = self._session.scalars(
            stmt.order_by(model.id).offset((page - 1) * page_size).limit(page_size)
        )
        return list(rows), total

    def add(self, receipt: GoodsReceipt) -> None:
        self._session.add(receipt)
        self.flush()

    def delete_item(self, item: GoodsReceiptItem) -> None:
        self._session.delete(item)

    def delete(self, receipt: GoodsReceipt) -> None:
        for item in list(receipt.items):
            self.delete_item(item)
        self.flush()
        self._session.delete(receipt)
        self.flush()

    def flush(self) -> None:
        flush_or_raise(self._session)
