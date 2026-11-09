"""必須以真實 PostgreSQL 執行；驗證原子性、競態及報表查詢。"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.cli import main as cli_main
from app.core.clock import FixedClock
from app.core.db import get_session_factory
from app.core.enums import ErrorCode, TransactionType, WasteReason
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.models import InventoryBatch, InventoryTransaction, WasteRecord
from app.modules.inventory.ledger import StockOp
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from app.modules.reports.dependencies import build_reports_service
from app.modules.waste.dependencies import build_waste_service
from app.modules.waste.repository_sqlalchemy import SqlAlchemyWasteRepository
from app.modules.waste.schemas import batch_response, waste_response
from app.modules.waste.service import WasteService
from tests.integration.factories import (
    NOW,
    add_employee,
    add_ingredient,
    add_item,
    add_location,
    seed_batch,
)

DAY = date(2026, 11, 6)


def service(session, now=NOW):
    return build_waste_service(session, SqlAlchemyUnitOfWork(session), FixedClock(now))


def submit(svc, seeded, key=None, quantity="2"):
    return svc.create(
        seeded.batch_id,
        Decimal(quantity),
        WasteReason.EXPIRED,
        None,
        seeded.operator_id,
        key or uuid4(),
    )


def test_persistence_replay_and_read_models(session):
    seeded = seed_batch(session, quantity="2")
    key = uuid4()
    first = waste_response(submit(service(session), seeded, key), True)
    with get_session_factory()() as second:
        replay = waste_response(submit(service(second), seeded, key), True)
        assert first == replay
        assert second.get_one(InventoryBatch, seeded.batch_id).remaining_quantity == 0
        assert second.scalar(select(func.count()).select_from(WasteRecord)) == 1
        selector = service(second).batch(seeded.batch_id)
        assert batch_response(selector).remaining_quantity == 0
        assert service(second).batches("", 1, 20) == ([], 0)
    assert cli_main(["verify-stock"]) == 0


def test_failure_after_record_flush_rolls_back_everything(session):
    seeded = seed_batch(session)

    class FailingRepository(SqlAlchemyWasteRepository):
        def add(self, record):
            super().add(record)
            raise RuntimeError("模擬寫入中斷")

    svc = WasteService(
        FailingRepository(session),
        SqlAlchemyStockLedger(session),
        SqlAlchemyUnitOfWork(session),
        FixedClock(NOW),
    )
    with pytest.raises(RuntimeError, match="模擬寫入中斷"):
        submit(svc, seeded)
    with get_session_factory()() as observer:
        assert observer.get_one(InventoryBatch, seeded.batch_id).remaining_quantity == 10
        assert observer.scalar(select(func.count()).select_from(WasteRecord)) == 0
        assert observer.scalar(select(func.count()).select_from(InventoryTransaction)) == 1
    assert cli_main(["verify-stock"]) == 0


@pytest.mark.parametrize("same_key", [False, True])
def test_concurrent_waste_with_preloaded_stale_batch(session, same_key):
    seeded = seed_batch(session, quantity="2")
    gate = Barrier(2)
    shared_key = uuid4()

    def attempt():
        with get_session_factory()() as worker:
            preloaded = worker.get_one(InventoryBatch, seeded.batch_id)
            assert preloaded.remaining_quantity == Decimal("2")  # 保留 identity map 中的舊物件。
            gate.wait(timeout=10)
            try:
                result = submit(service(worker), seeded, shared_key if same_key else uuid4())
                return result.id
            except DomainError as error:
                return error

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: attempt(), range(2)))
    if same_key:
        assert outcomes[0] == outcomes[1]
        assert isinstance(outcomes[0], int)
    else:
        assert sum(isinstance(o, int) for o in outcomes) == 1
        error = next(o for o in outcomes if isinstance(o, DomainError))
        assert error.code == ErrorCode.INSUFFICIENT_STOCK
        assert error.details["remaining_quantity"] == "0.000"
    with get_session_factory()() as observer:
        assert observer.scalar(select(func.count()).select_from(WasteRecord)) == 1
    assert cli_main(["verify-stock"]) == 0


def test_same_key_different_batches_race_rejects_changed_content(session):
    first, second = seed_batch(session), seed_batch(session)
    gate, key = Barrier(2), uuid4()

    def attempt(seeded):
        with get_session_factory()() as worker:
            gate.wait(timeout=10)
            try:
                return submit(service(worker), seeded, key).id
            except DomainError as error:
                return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [first, second]))
    assert sum(isinstance(result, int) for result in results) == 1
    assert ErrorCode.DUPLICATE in results
    assert cli_main(["verify-stock"]) == 0


def test_reports_boundaries_filters_locations_and_cross_period_reversal(session):
    seeded = seed_batch(session)
    ledger = SqlAlchemyStockLedger(session)
    ledger.lock_batches([seeded.batch_id])
    original = session.scalar(select(InventoryTransaction))
    # 第一筆進貨在 11/6；沖銷在次日台北 00:00，當日報表不可算進去。
    midnight = NOW.replace(hour=16)  # UTC 16:00 = 11/7 台北 00:00。
    reversal = ledger.reverse(original, StockOp(uuid4(), seeded.operator_id, midnight, "退回"))
    other_location = add_location(session)
    ledger.move(
        session.get_one(InventoryBatch, seeded.batch_id),
        other_location.id,
        StockOp(uuid4(), seeded.operator_id, NOW, "整批移位"),
    )
    session.commit()
    reports = build_reports_service(session)
    first_day = reports.stock(DAY, DAY)[0]
    assert first_day["receipt"] == first_day["closing"] == 10
    second_day = reports.stock(DAY + timedelta(days=1), DAY + timedelta(days=1))[0]
    assert second_day["opening"] == 10 and second_day["receipt"] == -10
    assert second_day["closing"] == 0
    rows, total = reports.transactions(
        DAY,
        DAY,
        seeded.ingredient_id,
        seeded.batch_id,
        TransactionType.RECEIPT,
        seeded.operator_id,
        1,
        1,
    )
    assert total == len(rows) == 1 and rows[0].id == original.id
    assert reports.transactions(
        DAY,
        DAY,
        seeded.ingredient_id,
        seeded.batch_id,
        TransactionType.WASTE,
        seeded.operator_id,
        1,
        1,
    ) == ([], 0)
    assert reports.transaction(reversal.id).reverses.id == original.id
    changes, total = reports.locations(
        DAY, DAY, seeded.ingredient_id, seeded.batch_id, seeded.operator_id, 1, 20
    )
    assert total == 1 and changes[0].from_location_id == seeded.location_id
    assert changes[0].to_location.name == other_location.name
    assert reports.stock(DAY + timedelta(days=2), DAY + timedelta(days=2)) == []


def test_real_distribution_unknown_reversal_and_units(session):
    employee, location = add_employee(session), add_location(session)
    kg, pack = add_ingredient(session), add_ingredient(session)
    pack.category_id = kg.category_id
    pack.unit = "包"
    ledger = SqlAlchemyStockLedger(session)
    transactions = []
    for ingredient, price in [(kg, None), (kg, "120"), (pack, "0")]:
        item = add_item(
            session,
            ingredient_id=ingredient.id,
            location_id=location.id,
            operator_id=employee.id,
            quantity="2",
            unit_price=price,
        )
        transactions.append(ledger.receive(item, StockOp(uuid4(), employee.id, NOW)))
    session.commit()
    records = [
        service(session).create(
            t.batch_id, Decimal("2"), WasteReason.EXPIRED, None, employee.id, uuid4()
        )
        for t in transactions
    ]
    ledger = SqlAlchemyStockLedger(session)
    ledger.lock_batches([records[0].batch_id])
    ledger.reverse(records[0].transaction, StockOp(uuid4(), employee.id, NOW, "更正"))
    session.commit()
    reports = build_reports_service(session)
    groups = reports.waste(DAY, DAY, "category")
    kg_group = next(g for g in groups if g["unit"] == "kg")
    assert kg_group["quantity"] == 2
    assert kg_group["known_loss_amount"] == 240
    assert kg_group["unknown_cost_count"] == 2
    assert len(kg_group["details"]) == 3
    assert next(g for g in groups if g["unit"] == "包")["known_loss_amount"] == 0
    assert cli_main(["verify-stock"]) == 0


@pytest.mark.parametrize("field", ["ingredient_id", "batch_id", "operator_id"])
def test_each_report_filter_excludes_other_records_and_counts_before_pagination(session, field):
    first, second = seed_batch(session), seed_batch(session)
    ledger = SqlAlchemyStockLedger(session)
    locked = {b.id: b for b in ledger.lock_batches([first.batch_id, second.batch_id])}
    destination = add_location(session)
    for seeded in [first, second]:
        ledger.move(
            locked[seeded.batch_id],
            destination.id,
            StockOp(uuid4(), seeded.operator_id, NOW, "移位"),
        )
    session.commit()
    reports = build_reports_service(session)
    filters = {"ingredient_id": None, "batch_id": None, "operator_id": None}
    filters[field] = getattr(first, field)
    txs, total = reports.transactions(DAY, DAY, tx_type=None, page=1, page_size=1, **filters)
    assert total == 1 and len(txs) == 1 and txs[0].batch_id == first.batch_id
    moves, total = reports.locations(DAY, DAY, page=1, page_size=1, **filters)
    assert total == 1 and len(moves) == 1 and moves[0].batch_id == first.batch_id
    unfiltered, total = reports.transactions(DAY, DAY, None, None, None, None, 1, 1)
    assert len(unfiltered) == 1 and total == 2
