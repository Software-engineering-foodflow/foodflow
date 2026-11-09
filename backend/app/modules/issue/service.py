"""FEFO 領用（FR-10、FR-11）：建議不上鎖；確認領用依 AD-7 的固定順序處理。

確認領用的順序：鎖該食材所有剩餘批次 → 防重送 → 錯誤分類（404 → 過期 422 → 超量 409）
→ 鎖內以預設策略重算 FEFO 基準 → 非 FEFO 缺原因 422 → 經 StockLedger 扣庫存。
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from app.core.clock import Clock
from app.core.enums import ExpiryStatus, TransactionType
from app.core.idempotency import check_replay
from app.core.uow import UnitOfWork
from app.db.models import Ingredient, InventoryBatch, InventoryTransaction
from app.domain.expiry import classify_expiry, days_until_expiry, is_available
from app.domain.stock import is_low_stock
from app.domain.units import allows_fraction, is_whole
from app.modules.inventory.ledger import StockLedger, StockOp
from app.modules.issue.errors import (
    batch_not_found,
    expired_batch,
    ingredient_not_found,
    issue_not_found,
    missing_non_fefo_reason,
    whole_quantity_required,
)
from app.modules.issue.repository import IssuableIngredient, IssueRepository
from app.modules.issue.strategies import (
    Allocation,
    BatchCandidate,
    BatchSelectionStrategy,
    SelectionLine,
    SelectionRequest,
    available_quantity,
)

_ZERO = Decimal("0")


@dataclass(frozen=True)
class IssueLineInput:
    batch_id: int
    quantity: Decimal
    reason: str | None = None


@dataclass(frozen=True)
class SuggestionLine:
    batch: InventoryBatch  # 已載入 current_location
    expiry_status: ExpiryStatus
    days_until_expiry: int
    fefo_quantity: Decimal
    quantity: Decimal
    is_non_fefo: bool


@dataclass(frozen=True)
class Suggestion:
    ingredient: Ingredient
    requested_quantity: Decimal
    available_quantity: Decimal
    lines: list[SuggestionLine]
    allows_fraction: bool


@dataclass(frozen=True)
class IssueResultLine:
    transaction_id: int
    batch_id: int
    batch_number: str
    quantity: Decimal
    quantity_after: Decimal
    is_non_fefo: bool
    reason: str


@dataclass(frozen=True)
class IssueResult:
    operation_group_id: UUID
    lines: list[IssueResultLine]


@dataclass(frozen=True)
class IngredientOption:
    """領用頁的食材選項：狀態由後端判定，前端只顯示（AD-11、AD-21）。"""

    ingredient: IssuableIngredient
    nearest_expiry_status: ExpiryStatus
    nearest_days_until_expiry: int
    is_low_stock: bool
    allows_fraction: bool


@dataclass(frozen=True)
class IssueReversal:
    occurred_at: datetime
    operator_name: str
    reason: str


@dataclass(frozen=True)
class IssueRecord:
    """一次領用（同一個 operation_group_id）。"""

    operation_group_id: UUID
    occurred_at: datetime
    operator_name: str
    ingredient_id: int
    ingredient_name: str
    unit: str
    lines: list[IssueResultLine]
    reversal: "IssueReversal | None" = None


def _candidate(batch: InventoryBatch) -> BatchCandidate:
    # 位置參數：AD-5 的架構測試會把 remaining_quantity= 關鍵字參數視為寫入批次。
    return BatchCandidate(
        batch.id,
        batch.batch_number,
        batch.expiry_date,
        batch.received_date,
        batch.remaining_quantity,
    )


def _quantities(allocations: Sequence[Allocation]) -> dict[int, Decimal]:
    return {allocation.batch_id: allocation.quantity for allocation in allocations}


class IssueService:
    def __init__(
        self,
        repository: IssueRepository,
        ledger: StockLedger,
        uow: UnitOfWork,
        clock: Clock,
        *,
        default_strategy: BatchSelectionStrategy,
        manual_strategy: BatchSelectionStrategy,
    ) -> None:
        self._repository = repository
        self._ledger = ledger
        self._uow = uow
        self._clock = clock
        self._default = default_strategy
        self._manual = manual_strategy

    def list_ingredients(self) -> list[IngredientOption]:
        today = self._clock.today()
        warning_days = self._repository.warning_days()
        return [
            IngredientOption(
                ingredient=item,
                nearest_expiry_status=classify_expiry(
                    item.nearest_expiry_date, today, warning_days
                ),
                nearest_days_until_expiry=days_until_expiry(item.nearest_expiry_date, today),
                # AD-21：停用食材不產生低庫存提醒。
                is_low_stock=item.is_active
                and is_low_stock(item.available_quantity, item.safety_stock_quantity),
                allows_fraction=allows_fraction(item.unit),
            )
            for item in self._repository.issuable_ingredients(today)
        ]

    def recent_issues(self, limit: int) -> list[IssueRecord]:
        return self._records(self._repository.recent_issues(limit))

    def reverse_issue(self, group_id: UUID, *, reason: str, operator_id: int) -> IssueRecord:
        """沖銷整次領用：每筆 ISSUE 各寫一筆連回原紀錄的 REVERSAL，原紀錄保留（AD-5、AD-8）。

        已沖銷過時直接回目前狀態，重按不會加兩次庫存。
        """
        with self._uow.transaction():
            originals = self._ledger.find_operation(group_id, TransactionType.ISSUE)
            if not originals:
                raise issue_not_found()
            # 原異動不會再變動，可以先讀；是否已沖銷要在鎖住批次後才判斷。
            self._ledger.lock_batches(sorted({item.batch_id for item in originals}))
            if not self._repository.reversals_of([item.id for item in originals]):
                op = StockOp(uuid4(), operator_id, self._clock.now(), reason)
                for original in originals:
                    self._ledger.reverse(original, op)
            [record] = self._records(self._repository.issue_operation(group_id))
            return record

    def _records(self, transactions: Sequence[InventoryTransaction]) -> list[IssueRecord]:
        """依 operation_group_id 分組，保留傳入順序；附上沖銷資訊。"""
        reversals = {
            item.reverses_transaction_id: item
            for item in self._repository.reversals_of([item.id for item in transactions])
        }
        grouped: dict[UUID, list[InventoryTransaction]] = {}
        for item in transactions:
            grouped.setdefault(item.operation_group_id, []).append(item)
        records = []
        for group_id, items in grouped.items():
            first = items[0]
            ingredient = first.batch.ingredient
            reversal = next((reversals[item.id] for item in items if item.id in reversals), None)
            records.append(
                IssueRecord(
                    operation_group_id=group_id,
                    occurred_at=first.occurred_at,
                    operator_name=first.operator.name,
                    ingredient_id=ingredient.id,
                    ingredient_name=ingredient.name,
                    unit=ingredient.unit,
                    lines=[
                        IssueResultLine(
                            transaction_id=item.id,
                            batch_id=item.batch_id,
                            batch_number=item.batch.batch_number,
                            quantity=-item.quantity_delta,
                            quantity_after=item.quantity_after,
                            is_non_fefo=item.is_non_fefo,
                            reason=item.reason,
                        )
                        for item in items
                    ],
                    reversal=None
                    if reversal is None
                    else IssueReversal(
                        reversal.occurred_at, reversal.operator.name, reversal.reason
                    ),
                )
            )
        return records

    def suggest(
        self,
        ingredient_id: int,
        *,
        quantity: Decimal | None = None,
        lines: Sequence[IssueLineInput] | None = None,
    ) -> Suggestion:
        """不上鎖。只給 quantity 時回 FEFO 建議；給 lines 時驗證並回傳每行是否非 FEFO。"""
        if (quantity is None) == (lines is None):
            raise ValueError("quantity 與 lines 必須擇一")
        ingredient = self._repository.get_ingredient(ingredient_id)
        if ingredient is None:
            raise ingredient_not_found()
        if lines is None:
            self._require_whole(ingredient.unit, [("quantity", quantity)])
        else:
            self._require_whole(
                ingredient.unit,
                [(f"lines.{index}.quantity", line.quantity) for index, line in enumerate(lines)],
            )
        today = self._clock.today()
        batches = {batch.id: batch for batch in self._repository.remaining_batches(ingredient_id)}

        if lines is None:
            candidates = self._candidates(batches, today)
            baseline = _quantities(self._default.select(candidates, SelectionRequest(quantity)))
            chosen = baseline
            requested = quantity
        else:
            candidates = self._classify(ingredient_id, lines, batches, today)
            chosen, baseline = self._allocate(candidates, lines)
            requested = sum((line.quantity for line in lines), _ZERO)

        warning_days = self._repository.warning_days()
        suggestion_lines = []
        for candidate in self._default.order(candidates):
            batch = batches[candidate.batch_id]
            picked = chosen.get(batch.id, _ZERO)
            fefo = baseline.get(batch.id, _ZERO)
            suggestion_lines.append(
                SuggestionLine(
                    batch=batch,
                    expiry_status=classify_expiry(batch.expiry_date, today, warning_days),
                    days_until_expiry=days_until_expiry(batch.expiry_date, today),
                    fefo_quantity=fefo,
                    quantity=picked,
                    is_non_fefo=picked > fefo,
                )
            )
        return Suggestion(
            ingredient,
            requested,
            available_quantity(candidates),
            suggestion_lines,
            allows_fraction(ingredient.unit),
        )

    def issue(
        self,
        ingredient_id: int,
        lines: Sequence[IssueLineInput],
        *,
        idempotency_key: UUID,
        operator_id: int,
    ) -> IssueResult:
        if not lines:
            raise ValueError("領用至少要有一筆明細")
        with self._uow.transaction():
            locked = self._ledger.lock_ingredient_batches(ingredient_id)
            existing = self._ledger.find_operation(idempotency_key, TransactionType.ISSUE)
            if check_replay(existing, {line.batch_id: line.quantity for line in lines}):
                return self._result(idempotency_key, existing)

            ingredient = self._repository.get_ingredient(ingredient_id)
            if ingredient is None:
                raise ingredient_not_found()
            self._require_whole(
                ingredient.unit,
                [(f"lines.{index}.quantity", line.quantity) for index, line in enumerate(lines)],
            )
            today = self._clock.today()
            batches = {batch.id: batch for batch in locked}
            candidates = self._classify(ingredient_id, lines, batches, today)
            chosen, baseline = self._allocate(candidates, lines)

            non_fefo = [
                chosen[line.batch_id] > baseline.get(line.batch_id, _ZERO) for line in lines
            ]
            missing = [
                index for index, line in enumerate(lines) if non_fefo[index] and not line.reason
            ]
            if missing:
                raise missing_non_fefo_reason(missing)

            occurred_at = self._clock.now()
            transactions = [
                self._ledger.deduct(
                    batches[line.batch_id],
                    line.quantity,
                    TransactionType.ISSUE,
                    StockOp(idempotency_key, operator_id, occurred_at, line.reason),
                    is_non_fefo=non_fefo[index],
                )
                for index, line in enumerate(lines)
            ]
            return self._result(idempotency_key, transactions)

    def _require_whole(self, unit: str, quantities: Sequence[tuple[str, Decimal]]) -> None:
        if allows_fraction(unit):
            return
        fields = [field for field, quantity in quantities if not is_whole(quantity)]
        if fields:
            raise whole_quantity_required(unit.strip(), fields)

    def _candidates(
        self, batches: Mapping[int, InventoryBatch], today: date
    ) -> list[BatchCandidate]:
        return [
            _candidate(batch)
            for batch in batches.values()
            if is_available(batch.expiry_date, today)
        ]

    def _classify(
        self,
        ingredient_id: int,
        lines: Sequence[IssueLineInput],
        batches: Mapping[int, InventoryBatch],
        today: date,
    ) -> list[BatchCandidate]:
        """在過濾候選前分類錯誤：不存在或屬於其他食材 404，過期 422；超量留給 ManualStrategy。"""
        missing = [line.batch_id for line in lines if line.batch_id not in batches]
        others = {batch.id: batch for batch in self._repository.get_batches(missing)}
        resolved = [batches.get(line.batch_id) or others.get(line.batch_id) for line in lines]
        for index, batch in enumerate(resolved):
            if batch is None or batch.ingredient_id != ingredient_id:
                raise batch_not_found(index)
        for index, batch in enumerate(resolved):
            if not is_available(batch.expiry_date, today):
                raise expired_batch(index, batch.batch_number)
        return self._candidates(batches, today)

    def _allocate(
        self, candidates: Sequence[BatchCandidate], lines: Sequence[IssueLineInput]
    ) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
        """回傳（員工選的分配, 同總量下的 FEFO 基準）。"""
        selection = tuple(SelectionLine(line.batch_id, line.quantity) for line in lines)
        total = sum((line.quantity for line in lines), _ZERO)
        chosen = _quantities(self._manual.select(candidates, SelectionRequest(total, selection)))
        baseline = _quantities(self._default.select(candidates, SelectionRequest(total)))
        return chosen, baseline

    def _result(self, group_id: UUID, transactions: Sequence[InventoryTransaction]) -> IssueResult:
        """首次與重放共用：只從已持久化的異動重建，不讀批次目前的剩餘量（AD-8）。"""
        numbers = {
            batch.id: batch.batch_number
            for batch in self._repository.get_batches([item.batch_id for item in transactions])
        }
        return IssueResult(
            operation_group_id=group_id,
            lines=[
                IssueResultLine(
                    transaction_id=item.id,
                    batch_id=item.batch_id,
                    batch_number=numbers[item.batch_id],
                    quantity=-item.quantity_delta,
                    quantity_after=item.quantity_after,
                    is_non_fefo=item.is_non_fefo,
                    reason=item.reason,
                )
                for item in transactions
            ],
        )
