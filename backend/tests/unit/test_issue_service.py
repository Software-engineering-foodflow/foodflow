"""IssueService（FR-10、FR-11、AD-7、AD-8、AD-12），不連資料庫。

列鎖等待、併發與真實寫入在 tests/integration/test_issues.py 驗證。
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.clock import FixedClock
from app.core.enums import ErrorCode, ExpiryStatus, StorageType, TransactionType
from app.core.errors import DomainError
from app.db.models import Employee, Ingredient, InventoryBatch
from app.modules.issue.repository import IssuableIngredient, IssueRepository
from app.modules.issue.service import IssueLineInput, IssueService
from app.modules.issue.strategies import FefoStrategy, ManualStrategy
from tests.fakes.fake_stock_ledger import FakeStockLedger
from tests.fakes.fake_uow import FakeUnitOfWork

OCT_31 = datetime(2026, 10, 31, 2, 0, tzinfo=UTC)  # 台北 10/31
NOV_02 = datetime(2026, 11, 2, 2, 0, tzinfo=UTC)
OPERATOR_ID = 7
CHICKEN = 1
PORK = 2


class FakeIssueRepository(IssueRepository):
    def __init__(self, ledger: FakeStockLedger) -> None:
        self.ledger = ledger
        self.ingredients = {
            CHICKEN: Ingredient(
                id=CHICKEN,
                name="雞胸肉",
                unit="kg",
                storage_method=StorageType.REFRIGERATED,
                is_active=True,
            ),
            PORK: Ingredient(
                id=PORK,
                name="豬肉",
                unit="kg",
                storage_method=StorageType.REFRIGERATED,
                is_active=True,
            ),
        }

    def issuable_ingredients(self, today: date) -> list[IssuableIngredient]:
        return []

    def get_ingredient(self, ingredient_id):
        return self.ingredients.get(ingredient_id)

    def remaining_batches(self, ingredient_id):
        return sorted(
            (
                batch
                for batch in self.ledger.batches.values()
                if batch.ingredient_id == ingredient_id and batch.remaining_quantity > 0
            ),
            key=lambda batch: batch.id,
        )

    def get_batches(self, batch_ids):
        return [
            self.ledger.batches[item]
            for item in sorted(set(batch_ids))
            if item in self.ledger.batches
        ]

    def warning_days(self) -> int:
        return 3

    def recent_issues(self, limit):
        return []

    def _loaded(self, transaction):
        batch = self.ledger.batches[transaction.batch_id]
        batch.ingredient = self.ingredients[batch.ingredient_id]
        transaction.batch = batch
        transaction.operator = Employee(
            id=transaction.operator_id, name=f"員工{transaction.operator_id}"
        )
        return transaction

    def issue_operation(self, group_id):
        return [
            self._loaded(item)
            for item in self.ledger.transactions
            if item.operation_group_id == group_id and item.type is TransactionType.ISSUE
        ]

    def reversals_of(self, transaction_ids):
        ids = set(transaction_ids)
        return [
            self._loaded(item)
            for item in self.ledger.transactions
            if item.reverses_transaction_id in ids
        ]


class World:
    def __init__(self, now: datetime = OCT_31) -> None:
        self.ledger = FakeStockLedger()
        self.uow = FakeUnitOfWork(self.ledger)
        self.repository = FakeIssueRepository(self.ledger)
        self.service = IssueService(
            self.repository,
            self.ledger,
            self.uow,
            FixedClock(now),
            default_strategy=FefoStrategy(),
            manual_strategy=ManualStrategy(),
        )
        self.a = self.batch(1, "5", date(2026, 11, 1))
        self.b = self.batch(2, "8", date(2026, 11, 7))

    def batch(
        self,
        batch_id: int,
        quantity: str,
        expiry: date,
        *,
        ingredient_id: int = CHICKEN,
        received: date = date(2026, 10, 25),
    ) -> InventoryBatch:
        return self.ledger.add_batch(
            InventoryBatch(
                id=batch_id,
                batch_number=f"B-{batch_id:08d}",
                source_item_id=batch_id,
                ingredient_id=ingredient_id,
                expiry_date=expiry,
                received_date=received,
                current_location_id=1,
                initial_quantity=Decimal(quantity) or Decimal("1"),
                remaining_quantity=Decimal(quantity),
            )
        )

    def issue(self, *lines: tuple[int, str] | tuple[int, str, str], key=None):
        return self.service.issue(
            CHICKEN,
            [IssueLineInput(line[0], Decimal(line[1]), *line[2:]) for line in lines],
            idempotency_key=key or uuid4(),
            operator_id=OPERATOR_ID,
        )

    def check(self, *lines: tuple[int, str]):
        return self.service.suggest(
            CHICKEN, lines=[IssueLineInput(batch_id, Decimal(qty)) for batch_id, qty in lines]
        )


def _by_batch(suggestion) -> dict[int, tuple[str, str, bool]]:
    return {
        line.batch.id: (f"{line.fefo_quantity:.3f}", f"{line.quantity:.3f}", line.is_non_fefo)
        for line in suggestion.lines
    }


# ── 建議（Story 5.1） ──


def test_suggests_three_from_the_earliest_batch() -> None:
    world = World()

    suggestion = world.service.suggest(CHICKEN, quantity=Decimal("3"))

    assert suggestion.requested_quantity == Decimal("3")
    assert suggestion.available_quantity == Decimal("13")
    assert [line.batch.id for line in suggestion.lines] == [1, 2]
    assert _by_batch(suggestion) == {
        1: ("3.000", "3.000", False),
        2: ("0.000", "0.000", False),
    }
    a_line = suggestion.lines[0]
    assert (a_line.expiry_status, a_line.days_until_expiry) == (ExpiryStatus.EXPIRING_SOON, 1)
    assert suggestion.lines[1].expiry_status is ExpiryStatus.NORMAL
    assert world.ledger.transactions == []


def test_suggestion_spills_over_to_the_next_batch() -> None:
    suggestion = World().service.suggest(CHICKEN, quantity=Decimal("7"))

    assert _by_batch(suggestion) == {1: ("5.000", "5.000", False), 2: ("2.000", "2.000", False)}


def test_excludes_expired_and_empty_batches_but_keeps_batches_expiring_today() -> None:
    world = World()
    world.batch(3, "4", date(2026, 10, 30))  # 已過期
    world.batch(4, "0", date(2026, 10, 31))  # 已用完
    world.batch(5, "1", date(2026, 10, 31))  # 今日到期

    suggestion = world.service.suggest(CHICKEN, quantity=Decimal("2"))

    assert [line.batch.id for line in suggestion.lines] == [5, 1, 2]
    assert suggestion.lines[0].expiry_status is ExpiryStatus.EXPIRES_TODAY
    assert suggestion.available_quantity == Decimal("14")
    assert _by_batch(suggestion)[5] == ("1.000", "1.000", False)


def test_suggestion_over_available_is_insufficient_stock() -> None:
    with pytest.raises(DomainError) as caught:
        World().service.suggest(CHICKEN, quantity=Decimal("14"))

    assert caught.value.code is ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details["available_quantity"] == "13.000"


def test_unknown_ingredient_is_not_found() -> None:
    with pytest.raises(DomainError) as caught:
        World().service.suggest(99, quantity=Decimal("1"))

    assert caught.value.code is ErrorCode.NOT_FOUND


def test_inactive_ingredient_can_still_be_suggested_and_issued() -> None:
    world = World()
    world.repository.ingredients[CHICKEN].is_active = False

    suggestion = world.service.suggest(CHICKEN, quantity=Decimal("3"))
    result = world.issue((1, "3"))

    assert _by_batch(suggestion)[1] == ("3.000", "3.000", False)
    assert world.a.remaining_quantity == Decimal("2")
    assert result.lines[0].is_non_fefo is False


# ── 改選檢查（Story 5.3） ──


def test_checking_a_switch_to_the_later_batch_marks_it_non_fefo() -> None:
    suggestion = World().check((2, "1"))

    assert suggestion.requested_quantity == Decimal("1")
    assert _by_batch(suggestion) == {1: ("1.000", "0.000", False), 2: ("0.000", "1.000", True)}


def test_only_the_line_over_its_fefo_share_is_non_fefo() -> None:
    suggestion = World().check((1, "2"), (2, "4"))

    assert _by_batch(suggestion) == {1: ("5.000", "2.000", False), 2: ("1.000", "4.000", True)}


@pytest.mark.parametrize(
    ("line", "code", "field"),
    [
        ((99, "1"), ErrorCode.NOT_FOUND, "lines.0.batch_id"),
        ((10, "1"), ErrorCode.NOT_FOUND, "lines.0.batch_id"),  # 其他食材
        ((3, "1"), ErrorCode.RULE_VIOLATION, "lines.0.batch_id"),  # 已過期
        ((4, "1"), ErrorCode.INSUFFICIENT_STOCK, None),  # 已用完
        ((1, "6"), ErrorCode.INSUFFICIENT_STOCK, None),
    ],
)
def test_check_classifies_errors_like_confirmation(line, code, field) -> None:
    world = World()
    world.batch(3, "4", date(2026, 10, 30))
    world.batch(4, "0", date(2026, 11, 9))
    world.batch(10, "3", date(2026, 11, 9), ingredient_id=PORK)

    with pytest.raises(DomainError) as caught:
        world.check(line)

    assert caught.value.code is code
    assert [item.field for item in caught.value.fields] == ([field] if field else [])


# ── 確認領用（Story 5.2） ──


def test_issue_following_the_suggestion_deducts_and_records_one_transaction() -> None:
    world = World()
    key = uuid4()

    result = world.issue((1, "3"), key=key)

    assert world.a.remaining_quantity == Decimal("2")
    assert world.b.remaining_quantity == Decimal("8")
    [transaction] = world.ledger.transactions
    assert transaction.type is TransactionType.ISSUE
    assert transaction.operation_group_id == key
    assert transaction.operator_id == OPERATOR_ID
    assert transaction.occurred_at == OCT_31
    assert transaction.is_non_fefo is False
    assert transaction.reason == "領用"
    assert result.operation_group_id == key
    [line] = result.lines
    assert (line.transaction_id, line.batch_id, line.batch_number) == (
        transaction.id,
        1,
        "B-00000001",
    )
    assert (line.quantity, line.quantity_after, line.is_non_fefo) == (
        Decimal("3"),
        Decimal("2"),
        False,
    )
    assert (world.uow.commits, world.uow.rollbacks) == (1, 0)


def test_issue_across_batches_in_fefo_order_needs_no_reason() -> None:
    world = World()

    result = world.issue((1, "5"), (2, "1"))

    assert [line.is_non_fefo for line in result.lines] == [False, False]
    assert world.b.remaining_quantity == Decimal("7")


def test_non_fefo_line_without_reason_is_rejected_and_nothing_is_deducted() -> None:
    world = World()

    with pytest.raises(DomainError) as caught:
        world.issue((2, "1"))

    assert caught.value.code is ErrorCode.RULE_VIOLATION
    assert [item.field for item in caught.value.fields] == ["lines.0.reason"]
    assert world.b.remaining_quantity == Decimal("8")
    assert world.ledger.transactions == []
    assert (world.uow.commits, world.uow.rollbacks) == (0, 1)


def test_non_fefo_line_with_reason_is_marked_and_keeps_the_reason() -> None:
    world = World()

    result = world.issue((2, "1", "A 放在冷凍庫最裡面"))

    [transaction] = world.ledger.transactions
    assert transaction.is_non_fefo is True
    assert transaction.reason == "A 放在冷凍庫最裡面"
    assert result.lines[0].reason == "A 放在冷凍庫最裡面"
    assert world.b.remaining_quantity == Decimal("7")


def test_reason_errors_point_at_every_non_fefo_line() -> None:
    world = World()
    world.batch(3, "2", date(2026, 11, 9))

    with pytest.raises(DomainError) as caught:
        world.issue((1, "1"), (2, "1"), (3, "1"))

    assert [item.field for item in caught.value.fields] == ["lines.1.reason", "lines.2.reason"]


def test_same_expiry_but_later_in_order_is_still_non_fefo() -> None:
    world = World()
    world.batch(3, "5", date(2026, 11, 1), received=date(2026, 10, 27))

    with pytest.raises(DomainError) as caught:
        world.issue((3, "1"))

    assert [item.field for item in caught.value.fields] == ["lines.0.reason"]


def test_issue_more_than_remaining_is_rejected() -> None:
    world = World()
    world.issue((1, "3"))

    with pytest.raises(DomainError) as caught:
        world.issue((1, "3"))

    assert caught.value.code is ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details["remaining_quantity"] == "2.000"
    assert caught.value.details["available_quantity"] == "10.000"
    assert world.a.remaining_quantity == Decimal("2")


def test_one_short_line_rejects_the_whole_issue() -> None:
    world = World()

    with pytest.raises(DomainError) as caught:
        world.issue((1, "2"), (2, "9", "原因"))

    assert caught.value.code is ErrorCode.INSUFFICIENT_STOCK
    assert caught.value.details["batch_id"] == 2
    assert (world.a.remaining_quantity, world.b.remaining_quantity) == (Decimal("5"), Decimal("8"))
    assert world.ledger.transactions == []


def test_expired_batch_is_rule_violation_on_a_later_day() -> None:
    world = World(now=NOV_02)

    with pytest.raises(DomainError) as caught:
        world.issue((1, "1"), (2, "1"))

    assert caught.value.code is ErrorCode.RULE_VIOLATION
    assert [item.field for item in caught.value.fields] == ["lines.0.batch_id"]
    assert world.ledger.transactions == []


@pytest.mark.parametrize("batch_id", [99, 10])
def test_unknown_or_foreign_batch_is_not_found(batch_id: int) -> None:
    world = World()
    world.batch(10, "3", date(2026, 11, 9), ingredient_id=PORK)

    with pytest.raises(DomainError) as caught:
        world.issue((batch_id, "1"))

    assert caught.value.code is ErrorCode.NOT_FOUND
    assert world.ledger.transactions == []


def test_issue_for_unknown_ingredient_is_not_found() -> None:
    world = World()

    with pytest.raises(DomainError) as caught:
        world.service.issue(
            99, [IssueLineInput(1, Decimal("1"))], idempotency_key=uuid4(), operator_id=1
        )

    assert caught.value.code is ErrorCode.NOT_FOUND


def test_replaying_the_same_key_and_content_returns_the_original_result() -> None:
    world = World()
    key = uuid4()
    first = world.issue((1, "3"), key=key)

    replay = world.issue((1, "3.000"), key=key)

    assert replay == first
    assert len(world.ledger.transactions) == 1
    assert world.a.remaining_quantity == Decimal("2")


def test_replay_rebuilds_from_transactions_not_from_current_stock() -> None:
    world = World()
    key = uuid4()
    world.issue((1, "3"), key=key)
    world.issue((1, "1"))

    replay = world.issue((1, "3"), key=key)

    assert replay.lines[0].quantity_after == Decimal("2")


def test_reusing_a_key_with_different_content_is_duplicate() -> None:
    world = World()
    key = uuid4()
    world.issue((1, "3"), key=key)

    with pytest.raises(DomainError) as caught:
        world.issue((1, "2"), key=key)

    assert caught.value.code is ErrorCode.DUPLICATE
    assert len(world.ledger.transactions) == 1


# ── 沖銷領用 ──


def test_reversing_an_issue_adds_stock_back_and_keeps_the_original() -> None:
    world = World()
    key = uuid4()
    world.issue((1, "5"), (2, "1"), key=key)

    record = world.service.reverse_issue(key, reason="數量填錯", operator_id=9)

    assert (world.a.remaining_quantity, world.b.remaining_quantity) == (Decimal("5"), Decimal("8"))
    issues = [item for item in world.ledger.transactions if item.type is TransactionType.ISSUE]
    reversals = [
        item for item in world.ledger.transactions if item.type is TransactionType.REVERSAL
    ]
    assert len(issues) == 2
    assert [item.reverses_transaction_id for item in reversals] == [item.id for item in issues]
    assert {item.reason for item in reversals} == {"數量填錯"}
    assert {item.operator_id for item in reversals} == {9}
    assert len({item.operation_group_id for item in reversals}) == 1
    assert reversals[0].operation_group_id != key
    assert record.reversal is not None
    assert (record.reversal.operator_name, record.reversal.reason) == ("員工9", "數量填錯")
    assert [line.quantity for line in record.lines] == [Decimal("5"), Decimal("1")]


def test_reversing_twice_does_not_add_stock_twice() -> None:
    world = World()
    key = uuid4()
    world.issue((1, "3"), key=key)
    world.service.reverse_issue(key, reason="填錯", operator_id=9)

    again = world.service.reverse_issue(key, reason="又按一次", operator_id=9)

    assert world.a.remaining_quantity == Decimal("5")
    assert again.reversal is not None and again.reversal.reason == "填錯"
    assert len([t for t in world.ledger.transactions if t.type is TransactionType.REVERSAL]) == 1


def test_reversing_an_unknown_issue_is_not_found() -> None:
    with pytest.raises(DomainError) as caught:
        World().service.reverse_issue(uuid4(), reason="x", operator_id=9)

    assert caught.value.code is ErrorCode.NOT_FOUND


# ── 不可分割的單位 ──


def _eggs(world: World) -> None:
    world.repository.ingredients[CHICKEN].unit = "顆"


def test_indivisible_unit_rejects_fractions_when_suggesting_and_issuing() -> None:
    world = World()
    _eggs(world)

    with pytest.raises(DomainError) as suggested:
        world.service.suggest(CHICKEN, quantity=Decimal("2.5"))
    with pytest.raises(DomainError) as issued:
        world.issue((1, "1"), (2, "0.5", "原因"))

    assert suggested.value.code is ErrorCode.RULE_VIOLATION
    assert [item.field for item in suggested.value.fields] == ["quantity"]
    assert [item.field for item in issued.value.fields] == ["lines.1.quantity"]
    assert world.ledger.transactions == []


def test_indivisible_unit_accepts_whole_numbers_and_says_so() -> None:
    world = World()
    _eggs(world)

    suggestion = world.service.suggest(CHICKEN, quantity=Decimal("3.000"))
    world.issue((1, "3"))

    assert suggestion.allows_fraction is False
    assert world.a.remaining_quantity == Decimal("2")


def test_box_unit_still_allows_fractions() -> None:
    world = World()
    world.repository.ingredients[CHICKEN].unit = "盒"

    suggestion = world.service.suggest(CHICKEN, quantity=Decimal("0.5"))

    assert suggestion.allows_fraction is True
    assert _by_batch(suggestion)[1] == ("0.500", "0.500", False)
