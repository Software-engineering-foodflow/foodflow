"""盤點的真 PostgreSQL 驗證；不以 fake 宣稱鎖與回滾通過。"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.cli import main as cli_main
from app.core.clock import FixedClock
from app.core.db import get_session_factory
from app.core.enums import ErrorCode, GoodsReceiptStatus, TransactionType
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.models import GoodsReceipt, GoodsReceiptItem, InventoryBatch, InventoryTransaction
from app.modules.inventory.ledger import StockOp
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.stocktake.dependencies import build_stocktake_service
from app.modules.stocktake.repository_sqlalchemy import SqlAlchemyStocktakeRepository
from app.modules.stocktake.service import CountLine, StocktakeService
from tests.integration.factories import NOW, seed_batch


def service(session):
    return build_stocktake_service(session, SqlAlchemyUnitOfWork(session), FixedClock(NOW))


def line(seeded, actual="7"):
    return CountLine(seeded.batch_id, Decimal(actual), "實際清點")


def adjustment_count(session):
    return session.scalar(
        select(func.count())
        .select_from(InventoryTransaction)
        .where(InventoryTransaction.type == TransactionType.ADJUSTMENT)
    )


def test_preview_confirm_multiple_batches_and_replay(session):
    first, second = seed_batch(session), seed_batch(session, quantity="2")
    svc = service(session)
    preview = svc.preview([line(first), line(second, "3")])
    assert [p.expected_quantity for p in preview] == [Decimal("10"), Decimal("2")]
    assert [p.quantity_delta for p in preview] == [Decimal("-3"), Decimal("1")]
    assert all(p.expected_transaction_id is not None for p in preview)
    assert adjustment_count(session) == 0
    result = svc.confirm(preview, first.operator_id)
    with get_session_factory()() as observer:
        txs = list(
            observer.scalars(
                select(InventoryTransaction).where(
                    InventoryTransaction.type == TransactionType.ADJUSTMENT
                )
            )
        )
        assert len(txs) == 2
        assert {t.operation_group_id for t in txs} == {result.operation_group_id}
        assert {t.occurred_at for t in txs} == {NOW}
        assert {t.operator_id for t in txs} == {first.operator_id}
        assert {t.reason for t in txs} == {"實際清點"}
        assert observer.get_one(InventoryBatch, first.batch_id).remaining_quantity == 7
        assert observer.get_one(InventoryBatch, second.batch_id).remaining_quantity == 3
        with pytest.raises(DomainError) as error:
            service(observer).confirm(preview, first.operator_id)
        assert error.value.code == ErrorCode.STALE_QUANTITY
        assert adjustment_count(observer) == 2
    assert cli_main(["verify-stock"]) == 0


def test_zero_actual_noop_and_zero_quantity_candidate(session):
    seeded = seed_batch(session)
    svc = service(session)
    zero = svc.preview([line(seeded, "0")])
    svc.confirm(zero, seeded.operator_id)
    noop = svc.preview([line(seeded, "0")])
    result = svc.confirm(noop, seeded.operator_id)
    assert result.lines[0].transaction_id is None
    assert result.lines[0].quantity_delta == 0
    assert adjustment_count(session) == 1
    svc.confirm(noop, seeded.operator_id)
    assert adjustment_count(session) == 1
    candidates, total = svc.batches("", 1, 20)
    assert total == 1 and candidates[0].id == seeded.batch_id
    assert cli_main(["verify-stock"]) == 0


def test_aba_rejected_even_with_preloaded_quantity(session):
    seeded = seed_batch(session)
    preview = service(session).preview([line(seeded)])
    cached = session.get_one(InventoryBatch, seeded.batch_id)
    assert cached.remaining_quantity == 10
    with get_session_factory()() as writer:
        ledger = SqlAlchemyStockLedger(writer)
        batch = ledger.lock_batches([seeded.batch_id])[0]
        ledger.adjust(batch, Decimal("9"), StockOp(uuid4(), seeded.operator_id, NOW))
        ledger.adjust(batch, Decimal("10"), StockOp(uuid4(), seeded.operator_id, NOW))
        writer.commit()
    with pytest.raises(DomainError) as error:
        service(session).confirm(preview, seeded.operator_id)
    assert error.value.code == ErrorCode.STALE_QUANTITY
    assert adjustment_count(session) == 2
    assert session.get_one(InventoryBatch, seeded.batch_id).remaining_quantity == 10
    assert cli_main(["verify-stock"]) == 0


def test_second_stale_line_does_not_apply_first(session):
    first, second = seed_batch(session), seed_batch(session)
    preview = service(session).preview([line(first), line(second)])
    with get_session_factory()() as writer:
        ledger = SqlAlchemyStockLedger(writer)
        batch = ledger.lock_batches([second.batch_id])[0]
        ledger.adjust(batch, Decimal("9"), StockOp(uuid4(), second.operator_id, NOW))
        writer.commit()
    with pytest.raises(DomainError) as error:
        service(session).confirm(preview, first.operator_id)
    assert error.value.code == ErrorCode.STALE_QUANTITY
    with get_session_factory()() as observer:
        assert observer.get_one(InventoryBatch, first.batch_id).remaining_quantity == 10
        assert observer.get_one(InventoryBatch, second.batch_id).remaining_quantity == 9
        assert adjustment_count(observer) == 1


def test_failure_after_second_flush_rolls_back_all(session):
    first, second = seed_batch(session), seed_batch(session)
    preview = service(session).preview([line(first), line(second)])

    class FailingLedger(SqlAlchemyStockLedger):
        def adjust(self, batch, actual_quantity, op):
            tx = super().adjust(batch, actual_quantity, op)
            if batch.id == second.batch_id:
                raise RuntimeError("second flush failed")
            return tx

    svc = StocktakeService(
        SqlAlchemyStocktakeRepository(session),
        FailingLedger(session),
        SqlAlchemyUnitOfWork(session),
        FixedClock(NOW),
    )
    with pytest.raises(RuntimeError, match="second flush failed"):
        svc.confirm(preview, first.operator_id)
    with get_session_factory()() as observer:
        assert observer.get_one(InventoryBatch, first.batch_id).remaining_quantity == 10
        assert observer.get_one(InventoryBatch, second.batch_id).remaining_quantity == 10
        assert adjustment_count(observer) == 0
    assert cli_main(["verify-stock"]) == 0


def test_concurrent_same_preview_only_one_confirmation(session):
    seeded = seed_batch(session)
    preview = service(session).preview([line(seeded)])
    gate = Barrier(2)

    def attempt():
        with get_session_factory()() as worker:
            cached = worker.get_one(InventoryBatch, seeded.batch_id)
            assert cached.remaining_quantity == 10
            gate.wait(timeout=10)
            try:
                return service(worker).confirm(preview, seeded.operator_id)
            except DomainError as error:
                return error

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: attempt(), range(2)))
    errors = [o for o in outcomes if isinstance(o, DomainError)]
    assert len(errors) == 1 and errors[0].code == ErrorCode.STALE_QUANTITY
    with get_session_factory()() as observer:
        assert adjustment_count(observer) == 1
        assert observer.get_one(InventoryBatch, seeded.batch_id).remaining_quantity == 7
    assert cli_main(["verify-stock"]) == 0


def test_reversed_source_excluded_and_confirmation_rejected(session):
    first, second = seed_batch(session), seed_batch(session)
    preview = service(session).preview([line(first), line(second)])
    ledger = SqlAlchemyStockLedger(session)
    batch = ledger.lock_batches([second.batch_id])[0]
    original = session.scalar(
        select(InventoryTransaction).where(InventoryTransaction.batch_id == second.batch_id)
    )
    ledger.reverse(original, StockOp(uuid4(), second.operator_id, NOW, "沖銷進貨"))
    item = session.get_one(GoodsReceiptItem, batch.source_item_id)
    session.get_one(GoodsReceipt, item.receipt_id).status = GoodsReceiptStatus.REVERSED
    session.commit()
    candidates, total = service(session).batches("", 1, 20)
    assert total == 1 and candidates[0].id == first.batch_id
    with pytest.raises(DomainError) as error:
        service(session).confirm(preview, first.operator_id)
    assert error.value.code == ErrorCode.RULE_VIOLATION
    with get_session_factory()() as observer:
        assert observer.get_one(InventoryBatch, first.batch_id).remaining_quantity == 10
        assert observer.get_one(InventoryBatch, second.batch_id).remaining_quantity == 0
        assert adjustment_count(observer) == 0
    assert cli_main(["verify-stock"]) == 0
