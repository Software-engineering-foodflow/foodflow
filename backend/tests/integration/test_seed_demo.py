from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pwdlib import PasswordHash
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import cli
from app.cli import find_stock_discrepancies, main
from app.core.clock import FixedClock
from app.core.config import get_settings
from app.core.enums import (
    EmployeeRole,
    ExpiryStatus,
    GoodsReceiptStatus,
    StorageType,
    TransactionType,
    WasteReason,
)
from app.db.base import Base
from app.db.models import (
    AlertSetting,
    BatchLocationChange,
    Employee,
    GoodsReceipt,
    GoodsReceiptItem,
    Ingredient,
    IngredientCategory,
    InventoryBatch,
    InventoryTransaction,
    StorageLocation,
    Supplier,
    WasteRecord,
)
from app.db.queries.stock_levels import stock_level_stmt
from app.domain.expiry import classify_expiry
from app.domain.stock import is_low_stock
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger
from tests.integration.factories import add_employee, add_ingredient, op_for, seed_batch

FIXED_NOW = datetime(2026, 11, 18, 1, 0, tzinfo=UTC)
FIXED_TODAY = FixedClock(FIXED_NOW).today()
KEPT_TABLES = {Employee.__tablename__, AlertSetting.__tablename__}


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """走真實的 get_clock：APP_FIXED_NOW 決定基準日。"""
    settings = get_settings().model_copy(update={"app_fixed_now": FIXED_NOW})
    monkeypatch.setattr(cli, "get_settings", lambda: settings)


def _set_warning_days(session: Session, days: int) -> None:
    session.execute(update(AlertSetting).values(warning_days=days))
    session.commit()


def _count(session: Session, model: type[Base]) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def _expiry_statuses(session: Session, warning_days: int) -> set[ExpiryStatus]:
    expiries = session.scalars(select(InventoryBatch.expiry_date))
    return {classify_expiry(expiry, FIXED_TODAY, warning_days) for expiry in expiries}


def _snapshot(session: Session) -> dict[str, list[tuple]]:
    session.rollback()
    return {
        table.name: sorted(tuple(row) for row in session.execute(select(table)))
        for table in Base.metadata.sorted_tables
    }


def test_seeds_expected_master_data_and_confirmed_receipts(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    assert _count(session, StorageLocation) == 2
    assert _count(session, Supplier) == 3
    assert _count(session, IngredientCategory) == 4
    assert _count(session, Ingredient) == 10
    assert session.scalars(select(Ingredient.safety_stock_quantity)).all().count(Decimal("0")) == 0
    receipts = session.scalars(select(GoodsReceipt)).all()
    assert len(receipts) == 2
    assert {receipt.status for receipt in receipts} == {GoodsReceiptStatus.CONFIRMED}
    assert all(receipt.confirmed_at is not None for receipt in receipts)
    assert all(receipt.receipt_date <= FIXED_TODAY for receipt in receipts)


def test_every_item_becomes_one_batch_with_one_receipt_transaction(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    items = session.scalars(select(GoodsReceiptItem)).all()
    batches = session.scalars(select(InventoryBatch)).all()
    transactions = session.scalars(select(InventoryTransaction)).all()
    assert {batch.source_item_id for batch in batches} == {item.id for item in items}
    assert len(batches) == len(items)
    assert len(transactions) == len(batches)
    assert {transaction.type for transaction in transactions} == {TransactionType.RECEIPT}
    for batch in batches:
        assert batch.remaining_quantity == batch.initial_quantity


def test_batches_follow_receipt_rules_and_history_precedes_today(session: Session) -> None:
    """FR-06：到期日不得早於進貨日或確認當天，所以已過期批次必須是早期進貨。"""
    assert main(["seed-demo"]) == 0

    rows = session.execute(
        select(InventoryBatch, GoodsReceipt)
        .join(GoodsReceiptItem, GoodsReceiptItem.id == InventoryBatch.source_item_id)
        .join(GoodsReceipt, GoodsReceipt.id == GoodsReceiptItem.receipt_id)
    ).all()
    for batch, receipt in rows:
        assert batch.received_date == receipt.receipt_date
        assert batch.expiry_date >= receipt.receipt_date
        assert receipt.confirmed_at is not None and receipt.confirmed_at <= FIXED_NOW
        assert FixedClock(receipt.confirmed_at).today() == receipt.receipt_date
    occurred = session.scalars(select(InventoryTransaction.occurred_at)).all()
    assert all(moment <= FIXED_NOW for moment in occurred)


@pytest.mark.parametrize("warning_days", [1, 2, 3, 7, 30])
def test_covers_every_expiry_status(session: Session, warning_days: int) -> None:
    _set_warning_days(session, warning_days)

    assert main(["seed-demo"]) == 0

    assert _expiry_statuses(session, warning_days) == set(ExpiryStatus)


def test_zero_warning_days_warns_that_soon_status_is_disabled(
    session: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    """SRS 第 5 節：T＝0 時不產生即期提醒，種子資料不能也不該繞過這條規則。"""
    _set_warning_days(session, 0)

    assert main(["seed-demo"]) == 0

    assert "預警天數為 0" in capsys.readouterr().out
    assert _expiry_statuses(session, 0) == set(ExpiryStatus) - {ExpiryStatus.EXPIRING_SOON}


def test_covers_low_stock_and_also_ingredients_above_safety(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    rows = session.execute(stock_level_stmt(FIXED_TODAY)).all()
    low = {
        row.ingredient_name
        for row in rows
        if is_low_stock(row.store_available_quantity, row.safety_stock_quantity)
    }
    assert low
    assert len(low) < len(rows)


def test_expired_batch_does_not_also_trigger_low_stock_for_its_ingredient(
    session: Session,
) -> None:
    """每個情境都要能單獨展示，過期量不計入可用量，所以該食材要另有正常批次撐住。"""
    assert main(["seed-demo"]) == 0

    expired_ids = set(
        session.scalars(
            select(InventoryBatch.ingredient_id).where(InventoryBatch.expiry_date < FIXED_TODAY)
        )
    )
    assert expired_ids
    for row in session.execute(stock_level_stmt(FIXED_TODAY)):
        if row.ingredient_id in expired_ids:
            assert not is_low_stock(row.store_available_quantity, row.safety_stock_quantity)


def test_scenarios_match_the_readme_table_at_default_warning_days(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    statuses: dict[ExpiryStatus, set[str]] = {status: set() for status in ExpiryStatus}
    rows = session.execute(
        select(Ingredient.name, InventoryBatch.expiry_date).join(
            InventoryBatch, InventoryBatch.ingredient_id == Ingredient.id
        )
    )
    for name, expiry in rows:
        statuses[classify_expiry(expiry, FIXED_TODAY, 3)].add(name)
    assert statuses[ExpiryStatus.EXPIRED] == {"鮮奶"}
    assert statuses[ExpiryStatus.EXPIRES_TODAY] == {"鮮奶油"}
    assert statuses[ExpiryStatus.EXPIRING_SOON] == {"雞胸肉", "鮭魚片"}
    assert {"雞胸肉", "豬里肌", "高麗菜", "白米", "醬油"} <= statuses[ExpiryStatus.NORMAL]
    low = {
        row.ingredient_name
        for row in session.execute(stock_level_stmt(FIXED_TODAY))
        if is_low_stock(row.store_available_quantity, row.safety_stock_quantity)
    }
    assert low == {"雞蛋", "沙拉油"}


def test_chicken_matches_the_srs_section_9_starting_point(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    batches = session.execute(
        select(InventoryBatch, StorageLocation.name)
        .join(Ingredient, Ingredient.id == InventoryBatch.ingredient_id)
        .join(StorageLocation, StorageLocation.id == InventoryBatch.current_location_id)
        .where(Ingredient.name == "雞胸肉")
        .order_by(InventoryBatch.expiry_date)
    ).all()
    assert [
        (
            batch.remaining_quantity,
            batch.unit_price,
            (batch.expiry_date - FIXED_TODAY).days,
            location,
        )
        for batch, location in batches
    ] == [
        (Decimal("5"), Decimal("120"), 1, "冷藏庫 A"),
        (Decimal("8"), Decimal("115"), 7, "冷藏庫 A"),
    ]
    safety = session.scalar(
        select(Ingredient.safety_stock_quantity).where(Ingredient.name == "雞胸肉")
    )
    assert safety == Decimal("10")


def test_verify_stock_passes_after_seeding(session: Session) -> None:
    assert main(["seed-demo"]) == 0

    assert find_stock_discrepancies(session) == []
    assert main(["verify-stock"]) == 0


def test_dates_follow_the_clock(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    later = FIXED_NOW + timedelta(days=40)
    settings = get_settings().model_copy(update={"app_fixed_now": later})
    monkeypatch.setattr(cli, "get_settings", lambda: settings)

    assert main(["seed-demo"]) == 0

    today = FixedClock(later).today()
    statuses = {
        classify_expiry(expiry, today, 3)
        for expiry in session.scalars(select(InventoryBatch.expiry_date))
    }
    assert statuses == set(ExpiryStatus)


def test_rerun_without_reset_prompts_and_changes_nothing(
    session: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["seed-demo"]) == 0
    before = _snapshot(session)
    capsys.readouterr()

    assert main(["seed-demo"]) == 0

    assert "--reset" in capsys.readouterr().out
    assert _snapshot(session) == before


def test_any_business_row_counts_as_existing_data(
    session: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    add_ingredient(session)
    session.commit()
    before = _snapshot(session)

    assert main(["seed-demo"]) == 0

    assert "--reset" in capsys.readouterr().out
    assert _snapshot(session) == before


def test_employees_alone_do_not_block_seeding(session: Session) -> None:
    """初始化順序是 create-admin 之後才 seed-demo。"""
    add_employee(session, role=EmployeeRole.ADMIN)
    session.commit()

    assert main(["seed-demo"]) == 0

    assert _count(session, Ingredient) == 10


def test_reset_replaces_all_business_data_including_full_history(session: Session) -> None:
    seeded = seed_batch(session)
    ledger = SqlAlchemyStockLedger(session)
    batch = ledger.lock_batches([seeded.batch_id])[0]
    waste = ledger.deduct(batch, Decimal("1"), TransactionType.WASTE, op_for(seeded.operator_id))
    session.add(
        WasteRecord(
            batch_id=batch.id,
            transaction_id=waste.id,
            quantity=Decimal("1"),
            reason=WasteReason.EXPIRED,
            operator_id=seeded.operator_id,
            occurred_at=FIXED_NOW,
        )
    )
    ledger.reverse(waste, op_for(seeded.operator_id))
    ledger.move(batch, _other_location(session), op_for(seeded.operator_id))
    session.commit()

    assert main(["seed-demo", "--reset"]) == 0

    session.expire_all()
    assert _count(session, WasteRecord) == 0
    assert _count(session, BatchLocationChange) == 0
    assert session.get(InventoryBatch, seeded.batch_id) is None
    assert session.get(Ingredient, seeded.ingredient_id) is None
    assert _count(session, Ingredient) == 10
    assert find_stock_discrepancies(session) == []


def _other_location(session: Session) -> int:
    location = StorageLocation(code="OTHER", name="其他位置", storage_type=StorageType.FROZEN)
    session.add(location)
    session.flush()
    return location.id


def test_reset_keeps_accounts_and_alert_setting(session: Session) -> None:
    admin = add_employee(session, username="real-admin", role=EmployeeRole.ADMIN)
    session.execute(update(AlertSetting).values(warning_days=5, updated_by_id=admin.id))
    session.commit()
    admin_id = admin.id
    assert main(["seed-demo"]) == 0

    assert main(["seed-demo", "--reset"]) == 0

    session.expire_all()
    assert session.get(Employee, admin_id) is not None
    setting = session.scalars(select(AlertSetting)).one()
    assert (setting.warning_days, setting.updated_by_id) == (5, admin_id)


def test_reset_on_empty_database_just_seeds(session: Session) -> None:
    assert main(["seed-demo", "--reset"]) == 0

    assert _count(session, Ingredient) == 10


def test_demo_operator_is_a_single_account_that_cannot_log_in(session: Session) -> None:
    assert main(["seed-demo"]) == 0
    assert main(["seed-demo", "--reset"]) == 0

    operators = session.scalars(
        select(Employee).where(Employee.id.in_(select(InventoryTransaction.operator_id)))
    ).all()
    assert len(operators) == 1
    assert _count(session, Employee) == 1
    assert operators[0].is_active is False
    # 必須是可辨識的雜湊：無法辨識時 verify 會丟例外，登入端點會回 500 而不是 401。
    assert PasswordHash.recommended().verify("demo-seed", operators[0].password_hash) is False
    # 停用又非管理者，不影響「有效管理者」的計數（AD-7）。
    assert operators[0].role is EmployeeRole.STAFF


@pytest.mark.parametrize("arguments", [["seed-demo"], ["seed-demo", "--reset"]])
def test_refuses_to_run_in_production(
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    arguments: list[str],
) -> None:
    seed_batch(session)
    before = _snapshot(session)
    settings = get_settings().model_copy(update={"app_env": "production"})
    monkeypatch.setattr(cli, "get_settings", lambda: settings)

    assert main(arguments) == 1

    assert "production" in capsys.readouterr().err
    assert _snapshot(session) == before


def test_failed_reset_rolls_back_and_keeps_existing_data(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert main(["seed-demo"]) == 0
    before = _snapshot(session)

    def explode(*_args: object) -> None:
        raise RuntimeError("灌資料途中失敗")

    monkeypatch.setattr(cli, "_insert_demo_data", explode)

    with pytest.raises(RuntimeError):
        main(["seed-demo", "--reset"])

    assert _snapshot(session) == before


def test_kept_tables_are_the_only_ones_not_counted_as_business_data() -> None:
    """新增資料表時，這裡會提醒要決定它是否屬於 --reset 清空的範圍。"""
    kept = {table.name for table in Base.metadata.sorted_tables} - {
        table.name for table in cli.DEMO_RESET_TABLES
    }
    assert kept == KEPT_TABLES


def test_several_ingredients_have_two_issuable_batches_for_non_fefo_demos(session: Session) -> None:
    """改選批次（非 FEFO）至少要有兩個可用批次才示範得出來。"""
    assert main(["seed-demo"]) == 0

    rows = session.execute(
        select(Ingredient.name, func.count(InventoryBatch.id))
        .join(InventoryBatch, InventoryBatch.ingredient_id == Ingredient.id)
        .where(InventoryBatch.remaining_quantity > 0, InventoryBatch.expiry_date >= FIXED_TODAY)
        .group_by(Ingredient.name)
    )
    multi = {name for name, count in rows if count >= 2}
    assert {"雞胸肉", "豬里肌", "高麗菜", "白米", "雞蛋"} <= multi
