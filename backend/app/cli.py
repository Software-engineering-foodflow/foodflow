"""管理指令。用法：uv run python -m app.cli <verify-stock|seed-demo [--reset]>"""

import argparse
import getpass
import secrets
import sys
import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from pwdlib import PasswordHash
from pydantic import ValidationError
from sqlalchemy import delete, exists, func, select
from sqlalchemy.orm import Session

from app.core.clock import TAIPEI
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.dependencies import get_clock
from app.core.enums import EmployeeRole, GoodsReceiptStatus, StorageType, TransactionType
from app.core.errors import DomainError
from app.core.uow import SqlAlchemyUnitOfWork
from app.db.base import Base
from app.db.models import (
    AlertSetting,
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
from app.modules.auth.dependencies import build_auth_service
from app.modules.auth.schemas import EmployeeCreate
from app.modules.inventory.ledger import StockOp
from app.modules.inventory.ledger_sqlalchemy import SqlAlchemyStockLedger

# 帳號要留著才登得進去，預警設定是管理者的決定，兩者都不屬於示範資料。
DEMO_RESET_TABLES = tuple(
    table
    for table in reversed(Base.metadata.sorted_tables)
    if table.name not in {Employee.__tablename__, AlertSetting.__tablename__}
)
DEMO_OPERATOR_USERNAME = "demo-seed"
DEMO_MASTER_DATA_AGE = timedelta(days=30)

# 代碼、名稱、保存方式、說明、是否啟用。三種保存方式都有位置；COLD-B 啟用但沒有庫存（空狀態），
# DRY-2 已停用（停用的位置不能有剩餘庫存，所以也沒有批次）。
DEMO_LOCATIONS = (
    ("COLD-A", "冷藏庫 A", StorageType.REFRIGERATED, "廚房後方的走入式冷藏庫", True),
    ("COLD-B", "備料冷藏櫃", StorageType.REFRIGERATED, "出餐口旁的小型冷藏櫃，目前清空中", True),
    ("FRZ-1", "冷凍庫", StorageType.FROZEN, "零下 18 度冷凍櫃", True),
    ("DRY-1", "乾貨倉", StorageType.AMBIENT, "常溫乾貨與調味料", True),
    ("DRY-2", "舊儲藏室", StorageType.AMBIENT, "改裝前的儲藏室，已停用", False),
)
DEMO_SUPPLIERS = (
    ("順發生鮮批發", "陳先生", "02-5550-0101"),
    ("好味食品批發", "林小姐", "02-5550-0102"),
    ("綠野蔬果行", "黃先生", "02-5550-0103"),
)
DEMO_CATEGORIES = (
    ("MEAT", "肉品海鮮"),
    ("VEG", "蔬菜"),
    ("DAIRY", "乳品蛋類"),
    ("DRY", "乾貨調味"),
    ("FROZ", "冷凍食品"),
)
# 名稱、分類代碼、單位、保存方式、安全庫存量
DEMO_INGREDIENTS = (
    ("雞胸肉", "MEAT", "公斤", StorageType.REFRIGERATED, "10"),
    ("豬里肌", "MEAT", "公斤", StorageType.REFRIGERATED, "5"),
    ("鮭魚片", "MEAT", "包", StorageType.REFRIGERATED, "3"),  # 真空包裝，約 1 公斤一包
    ("高麗菜", "VEG", "公斤", StorageType.REFRIGERATED, "8"),
    ("雞蛋", "DAIRY", "顆", StorageType.REFRIGERATED, "60"),
    ("鮮奶", "DAIRY", "公升", StorageType.REFRIGERATED, "5"),
    ("鮮奶油", "DAIRY", "公升", StorageType.REFRIGERATED, "2"),
    ("白米", "DRY", "袋", StorageType.AMBIENT, "1"),  # 約 20 公斤一袋，可領 0.5 袋
    ("醬油", "DRY", "瓶", StorageType.AMBIENT, "4"),
    ("沙拉油", "DRY", "公升", StorageType.AMBIENT, "10"),
    ("冷凍蝦仁", "FROZ", "包", StorageType.FROZEN, "4"),
    ("冷凍水餃", "FROZ", "盒", StorageType.FROZEN, "3"),
    ("起司片", "DAIRY", "包", StorageType.REFRIGERATED, "2"),  # 沒有任何批次：庫存 0 的低庫存
)


@dataclass(frozen=True)
class _DemoItem:
    ingredient: str
    quantity: str
    unit_price: str
    expires_in_days: int
    location: str


@dataclass(frozen=True)
class _DemoReceipt:
    supplier: str
    days_ago: int
    items: tuple[_DemoItem, ...]


def _demo_receipts(warning_days: int) -> tuple[_DemoReceipt, ...]:
    """到期日隨預警天數 T 計算，否則 T 調大後「正常」批次會全部變成即期。

    鮮奶與冷凍蝦仁另有正常批次、低庫存只落在雞蛋、沙拉油與起司片（完全沒有庫存），
    讓每種情境都能單獨展示。冷藏、冷凍、常溫三類位置各自都有需要注意的批次（過期、今日到期或即期），
    儲存位置頁的摘要卡與「最近到期」欄才會出現每種狀態。
    雞胸肉兩批是 SRS 第 9 節端到端示例的起點（T＝3 時分別為 1 天與 7 天後到期）。
    豬里肌、高麗菜、白米、雞蛋也各有兩個可用批次，才能示範改選批次（非 FEFO）；
    新增的都是正常批次，雞蛋加總後仍低於安全庫存量，不改變上述情境。
    """
    last_soon_day = max(warning_days, 1)
    normal = warning_days + 1
    return (
        _DemoReceipt(
            "好味食品批發",
            12,
            (
                _DemoItem("鮮奶", "6", "65", -2, "COLD-A"),
                _DemoItem("鮮奶油", "3", "210", 0, "COLD-A"),
                _DemoItem("白米", "3", "840", normal + 86, "DRY-1"),
                _DemoItem("白米", "2", "880", normal + 120, "DRY-1"),
                _DemoItem("醬油", "10", "85", normal + 176, "DRY-1"),
                _DemoItem("沙拉油", "8", "75", normal + 176, "DRY-1"),
                _DemoItem("冷凍蝦仁", "2", "260", -3, "FRZ-1"),
            ),
        ),
        _DemoReceipt(
            "順發生鮮批發",
            2,
            (
                _DemoItem("雞胸肉", "5", "120", 1, "COLD-A"),
                _DemoItem("雞胸肉", "8", "115", normal + 3, "COLD-A"),
                _DemoItem("豬里肌", "12", "180", normal + 4, "COLD-A"),
                _DemoItem("豬里肌", "6", "185", normal + 9, "COLD-A"),
                _DemoItem("鮭魚片", "4", "420", last_soon_day, "COLD-A"),
                _DemoItem("高麗菜", "15", "35", normal + 2, "COLD-A"),
                _DemoItem("高麗菜", "10", "32", normal + 6, "COLD-A"),
                _DemoItem("雞蛋", "30", "6", normal + 10, "COLD-A"),
                _DemoItem("雞蛋", "20", "6", normal + 18, "COLD-A"),
                _DemoItem("鮮奶", "12", "68", normal + 6, "COLD-A"),
                _DemoItem("冷凍蝦仁", "6", "250", normal + 60, "FRZ-1"),
                _DemoItem("冷凍水餃", "5", "150", last_soon_day, "FRZ-1"),
                _DemoItem("冷凍水餃", "4", "150", normal + 90, "FRZ-1"),
                _DemoItem("醬油", "2", "85", last_soon_day, "DRY-1"),
            ),
        ),
    )


def find_stock_discrepancies(session: Session) -> list[str]:
    """庫存核對（NFR-03、SM-2）：回傳所有差異的說明，空清單代表一致。"""
    problems: list[str] = []

    delta_sum = (
        select(
            InventoryTransaction.batch_id,
            func.sum(InventoryTransaction.quantity_delta).label("total"),
        )
        .group_by(InventoryTransaction.batch_id)
        .subquery()
    )
    rows = session.execute(
        select(InventoryBatch.id, InventoryBatch.remaining_quantity, delta_sum.c.total)
        .outerjoin(delta_sum, delta_sum.c.batch_id == InventoryBatch.id)
        .where(InventoryBatch.remaining_quantity != func.coalesce(delta_sum.c.total, 0))
        .order_by(InventoryBatch.id)
    )
    for batch_id, remaining, total in rows:
        problems.append(f"批次 {batch_id}：剩餘量 {remaining} 不等於異動合計 {total or 0}")

    latest_id = (
        select(
            InventoryTransaction.batch_id,
            func.max(InventoryTransaction.id).label("transaction_id"),
        )
        .group_by(InventoryTransaction.batch_id)
        .subquery()
    )
    rows = session.execute(
        select(
            InventoryBatch.id,
            InventoryBatch.remaining_quantity,
            InventoryTransaction.quantity_after,
        )
        .join(latest_id, latest_id.c.batch_id == InventoryBatch.id)
        .join(InventoryTransaction, InventoryTransaction.id == latest_id.c.transaction_id)
        .where(InventoryBatch.remaining_quantity != InventoryTransaction.quantity_after)
        .order_by(InventoryBatch.id)
    )
    for batch_id, remaining, quantity_after in rows:
        problems.append(
            f"批次 {batch_id}：剩餘量 {remaining} 不等於最新異動的 quantity_after {quantity_after}"
        )

    rows = session.scalars(
        select(InventoryTransaction.id)
        .outerjoin(WasteRecord, WasteRecord.transaction_id == InventoryTransaction.id)
        .where(InventoryTransaction.type == TransactionType.WASTE, WasteRecord.id.is_(None))
        .order_by(InventoryTransaction.id)
    )
    for transaction_id in rows:
        problems.append(f"異動 {transaction_id}：WASTE 異動沒有對應的報廢紀錄")

    return problems


def _verify_stock() -> int:
    with get_session_factory()() as session:
        problems = find_stock_discrepancies(session)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        print(f"庫存核對失敗：{len(problems)} 項差異", file=sys.stderr)
        return 1
    print("庫存核對通過")
    return 0


def _has_demo_scope_data(session: Session) -> bool:
    return any(session.scalar(select(exists().select_from(table))) for table in DEMO_RESET_TABLES)


def _demo_operator(session: Session, created_at: datetime) -> Employee:
    operator = session.scalar(select(Employee).where(Employee.username == DEMO_OPERATOR_USERNAME))
    if operator is not None:
        return operator
    operator = Employee(
        username=DEMO_OPERATOR_USERNAME,
        # 隨機值雜湊後即丟棄：沒有人知道密碼。不用假字串，因為 pwdlib 遇到無法辨識的雜湊會丟例外。
        password_hash=PasswordHash.recommended().hash(secrets.token_urlsafe(32)),
        name="示範資料",
        role=EmployeeRole.STAFF,
        is_active=False,
        token_version=0,
        created_at=created_at,
    )
    session.add(operator)
    session.flush()
    return operator


def _insert_demo_data(session: Session, now: datetime, today: date, warning_days: int) -> None:
    created_at = now - DEMO_MASTER_DATA_AGE
    operator = _demo_operator(session, created_at)

    locations = {
        code: StorageLocation(
            code=code, name=name, storage_type=storage_type, description=note, is_active=active
        )
        for code, name, storage_type, note, active in DEMO_LOCATIONS
    }
    suppliers = {
        name: Supplier(name=name, contact_person=contact, phone=phone)
        for name, contact, phone in DEMO_SUPPLIERS
    }
    categories = {
        code: IngredientCategory(code=code, name=name, created_at=created_at)
        for code, name in DEMO_CATEGORIES
    }
    session.add_all([*locations.values(), *suppliers.values(), *categories.values()])
    session.flush()

    ingredients = {
        name: Ingredient(
            name=name,
            category_id=categories[category].id,
            unit=unit,
            storage_method=storage_method,
            safety_stock_quantity=Decimal(safety),
            created_at=created_at,
        )
        for name, category, unit, storage_method, safety in DEMO_INGREDIENTS
    }
    session.add_all(ingredients.values())
    session.flush()

    ledger = SqlAlchemyStockLedger(session)
    for demo_receipt in _demo_receipts(warning_days):
        # 進貨與入帳都落在過去，已過期批次才符合 FR-06「到期日不得早於進貨日或確認當天」。
        confirmed_at = now - timedelta(days=demo_receipt.days_ago)
        receipt = GoodsReceipt(
            supplier_id=suppliers[demo_receipt.supplier].id,
            receipt_date=today - timedelta(days=demo_receipt.days_ago),
            status=GoodsReceiptStatus.CONFIRMED,
            created_by_id=operator.id,
            created_at=confirmed_at,
            confirmed_at=confirmed_at,
        )
        session.add(receipt)
        session.flush()
        op = StockOp(uuid4(), operator.id, confirmed_at)
        for demo_item in demo_receipt.items:
            item = GoodsReceiptItem(
                receipt_id=receipt.id,
                ingredient_id=ingredients[demo_item.ingredient].id,
                quantity=Decimal(demo_item.quantity),
                unit_price=Decimal(demo_item.unit_price),
                expiry_date=today + timedelta(days=demo_item.expires_in_days),
                location_id=locations[demo_item.location].id,
            )
            session.add(item)
            session.flush()
            ledger.receive(item, op)


def _seed_demo(*, reset: bool) -> int:
    settings = get_settings()
    if settings.app_env == "production":
        print("seed-demo 會寫入示範資料，APP_ENV=production 時拒絕執行", file=sys.stderr)
        return 1

    now = get_clock(settings).now()
    today = now.astimezone(TAIPEI).date()
    with get_session_factory()() as session:
        # 清空與重灌在同一交易，失敗時原有資料不會遺失。
        with SqlAlchemyUnitOfWork(session).transaction():
            if _has_demo_scope_data(session):
                if not reset:
                    print("資料庫已有資料，未做任何變更；要清空並重灌請加 --reset")
                    return 0
                for table in DEMO_RESET_TABLES:
                    session.execute(delete(table))
            warning_days = session.scalars(
                select(AlertSetting.warning_days).order_by(AlertSetting.id).limit(1)
            ).one()
            _insert_demo_data(session, now, today, warning_days)

    print(f"示範資料已建立，日期基準為 {today.isoformat()}（Asia/Taipei）")
    print("到期狀態隨日期變化，隔天要重現相同情境請執行 seed-demo --reset")
    if warning_days == 0:
        print("注意：預警天數為 0，依規則不會出現即期批次；調高預警天數後即可看到")
    return 0


def _create_admin() -> int:
    try:
        username = input("管理者帳號：")
        name = input("管理者姓名：")
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("密碼（8～128 字元）：")
            confirmation = getpass.getpass("再次輸入密碼：")
        if password != confirmation:
            print("兩次密碼不一致，未建立帳號", file=sys.stderr)
            return 1
        body = EmployeeCreate(
            username=username, name=name, password=password, role=EmployeeRole.ADMIN
        )
        settings = get_settings()
        with get_session_factory()() as session:
            service = build_auth_service(
                session, SqlAlchemyUnitOfWork(session), get_clock(settings), settings
            )
            service.bootstrap_admin(username=body.username, name=body.name, password=body.password)
    except getpass.GetPassWarning:
        print("無法隱藏密碼輸入，請使用互動式終端機；未建立帳號", file=sys.stderr)
        return 1
    except ValidationError:
        # ValidationError.__str__ includes input values: never print credentials.
        print("帳號與姓名必填且須符合長度限制；密碼須為 8～128 字元", file=sys.stderr)
        return 1
    except DomainError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    except (EOFError, KeyboardInterrupt):
        print("已取消建立管理者", file=sys.stderr)
        return 1
    print("管理者已建立，請使用該帳號登入")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="FoodFlow 管理指令")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("create-admin", help="以隱藏密碼輸入建立管理者")
    commands.add_parser("verify-stock", help="核對批次剩餘量與異動紀錄")
    seed_demo = commands.add_parser("seed-demo", help="灌入示範資料（production 時拒絕執行）")
    seed_demo.add_argument(
        "--reset",
        action="store_true",
        help="先清空帳號與預警設定以外的所有資料，再重灌",
    )
    args = parser.parse_args(argv)

    if args.command == "create-admin":
        return _create_admin()

    if args.command == "verify-stock":
        return _verify_stock()
    if args.command == "seed-demo":
        return _seed_demo(reset=args.reset)
    return 2


if __name__ == "__main__":
    sys.exit(main())
