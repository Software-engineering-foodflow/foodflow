from dataclasses import asdict
from datetime import date

from app.core.clock import Clock
from app.core.enums import ErrorCode
from app.core.errors import DomainError
from app.domain.expiry import classify_expiry, days_until_expiry
from app.domain.stock import is_low_stock, shortfall
from app.modules.inventory.repository import InventoryFilters, InventoryRepository


class InventoryService:
    def __init__(self, repository: InventoryRepository, clock: Clock):
        self.repository = repository
        self.clock = clock

    def overview(self, filters: InventoryFilters):
        today = self.clock.today()
        warning_days = self.repository.warning_days()
        rows, total = self.repository.overview(filters, today, warning_days)
        items = [
            asdict(row)
            | {
                "is_low_stock": row.is_active
                and is_low_stock(row.store_available_quantity, row.safety_stock_quantity),
                "shortfall_quantity": shortfall(
                    row.store_available_quantity, row.safety_stock_quantity
                ),
            }
            for row in rows
        ]
        return self._page(items, total, filters.page, filters.page_size) | {
            "today": today,
            "warning_days": warning_days,
        }

    @staticmethod
    def _page(items, total, page, page_size):
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def batches(self, ingredient_id: int, location_id: int | None, page: int, page_size: int):
        ingredient = self.repository.ingredient(ingredient_id)
        if ingredient is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到食材")
        today = self.clock.today()
        warning_days = self.repository.warning_days()
        batches, total = self.repository.batches(ingredient_id, location_id, page, page_size)
        return self._page(
            [self._batch(item, today, warning_days) for item in batches], total, page, page_size
        ) | {
            "ingredient_id": ingredient.id,
            "ingredient_name": ingredient.name,
            "unit": ingredient.unit,
            "today": today,
            "warning_days": warning_days,
        }

    def _get_batch(self, batch_id: int):
        batch = self.repository.batch(batch_id)
        if batch is None:
            raise DomainError(ErrorCode.NOT_FOUND, "找不到批次")
        return batch

    def batch(self, batch_id: int):
        batch = self._get_batch(batch_id)
        return self._batch(batch, self.clock.today(), self.repository.warning_days())

    @staticmethod
    def _batch(batch, today: date, warning_days: int):
        receipt = batch.source_item.receipt
        return {
            "id": batch.id,
            "batch_number": batch.batch_number,
            "ingredient_id": batch.ingredient_id,
            "ingredient_name": batch.ingredient.name,
            "unit": batch.ingredient.unit,
            "source_item_id": batch.source_item_id,
            "receipt_id": receipt.id,
            "receipt_number": receipt.receipt_number,
            "receipt_status": receipt.status,
            "supplier_id": receipt.supplier_id,
            "supplier_name": receipt.supplier.name,
            "received_date": batch.received_date,
            "expiry_date": batch.expiry_date,
            "days_until_expiry": days_until_expiry(batch.expiry_date, today),
            "expiry_status": classify_expiry(batch.expiry_date, today, warning_days),
            "location_id": batch.current_location_id,
            "location_name": batch.current_location.name,
            "initial_quantity": batch.initial_quantity,
            "remaining_quantity": batch.remaining_quantity,
            "is_depleted": batch.remaining_quantity == 0,
        }

    def transactions(self, batch_id: int, page: int, page_size: int):
        self._get_batch(batch_id)
        rows, total = self.repository.transactions(batch_id, page, page_size)
        return self._page(
            [
                {
                    "id": row.id,
                    "type": row.type,
                    "quantity_delta": row.quantity_delta,
                    "quantity_before": row.quantity_before,
                    "quantity_after": row.quantity_after,
                    "operator_id": row.operator_id,
                    "operator_name": row.operator.name,
                    "occurred_at": row.occurred_at,
                    "reason": row.reason,
                    "is_non_fefo": row.is_non_fefo,
                    "reverses_transaction_id": row.reverses_transaction_id,
                }
                for row in rows
            ],
            total,
            page,
            page_size,
        )

    def location_changes(self, batch_id: int, page: int, page_size: int):
        self._get_batch(batch_id)
        rows, total = self.repository.location_changes(batch_id, page, page_size)
        return self._page(
            [
                {
                    "id": row.id,
                    "from_location_id": row.from_location_id,
                    "from_location_name": row.from_location.name,
                    "to_location_id": row.to_location_id,
                    "to_location_name": row.to_location.name,
                    "operator_id": row.operator_id,
                    "operator_name": row.operator.name,
                    "occurred_at": row.occurred_at,
                    "reason": row.reason,
                }
                for row in rows
            ],
            total,
            page,
            page_size,
        )

    def options(self, kind: str, page: int, page_size: int):
        rows, total = self.repository.options(kind, page, page_size)
        return self._page([asdict(row) for row in rows], total, page, page_size)
