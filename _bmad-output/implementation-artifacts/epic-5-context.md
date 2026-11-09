# Epic 5 Context: FEFO 領用

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

讓備料人員選擇食材與需要的數量後，取得「先到期先使用」（FEFO）的批次建議，看到各批次的位置與可用量，確認後由系統扣庫存並留下領用異動。實際拿的批次與建議不同時，員工可以改選批次，但要填寫原因，該筆異動標記為「非 FEFO」，讓店長追查。重按、網路重試或兩人同時領用都不能超領或重複扣料。負責人 Ken，`issue` 模組，分支 `feat/fefo-issue`。

## Stories

- Story 5.1: 取得 FEFO 領用建議
- Story 5.2: 依建議確認領用並扣庫存
- Story 5.3: 改選批次並記錄非 FEFO 原因

## Requirements & Constraints

- **建議排序：** 只列未過期、剩餘量大於 0 的批次；依到期日排序，到期日相同時依進貨日期，再依批號。最早批次不夠就依序往下一批分配，直到滿足需求量。今日到期仍可領用，次日起禁止（D = 到期日 − 今天，以 Asia/Taipei 當日計算，D ≥ 0 才可用）。
- **可用量不足：** 需求量大於可用量時回 `409 INSUFFICIENT_STOCK`，`details.available_quantity` 帶目前可用量。
- **確認領用：** 一筆以上批次與數量，數量大於 0、不超過提交當下的剩餘量；多批次全部成功或全部不生效，每個被扣批次各一筆 `ISSUE` 異動。不自動改分配到其他批次。
- **非 FEFO：** 某明細數量超過 FEFO 基準分配到該批次的數量，就是非 FEFO；到期日相同但選了排序在後的批次也算。非 FEFO 明細的原因必填，依建議領用則不要求原因。
- **停用食材：** 既有未過期的剩餘批次照常可以建議與領用。
- **錯誤區分：** 數量小於等於 0、超過三位小數、同一批次重複出現回 `422`；批次不存在或屬於其他食材回 `404`；含過期批次回 `422 RULE_VIOLATION`；超過剩餘量回 `409 INSUFFICIENT_STOCK`（含該批最新剩餘量與可用量）；非 FEFO 缺原因回 `422 RULE_VIOLATION`，`fields` 指向 `lines.N.reason`。以上任一錯誤都不扣任何批次。
- **併發與重送：** 兩人同時領同一批，至多一人成功，失敗者收到最新量，不產生負庫存。同一個 `Idempotency-Key` 以相同內容重送回 200 與原結果，不同內容回 `409 DUPLICATE`。
- **權限：** 一般員工與管理者都可領用；權限在伺服器端驗證。錯誤回饋指出欄位並保留已填內容；未確認成功不顯示完成。
- **範圍：** 人工登記領用，不做銷售自動扣料。FEFO 遵循率報表是期末延伸項目，不在本 epic。

## Technical Decisions

- **API：** `POST /api/v1/issues/suggestions` 產生建議，**不上鎖**；可接受員工改選的 `lines`，回傳每行 `is_non_fefo` 讓前端決定是否顯示原因欄位。`POST /api/v1/issues` 確認領用，必帶 `Idempotency-Key` 標頭（UUID）。回應固定為 `{operation_group_id, lines: [{transaction_id, batch_id, batch_number, quantity, quantity_after, is_non_fefo, reason}]}`。寫入端點首次與重放都回 200。
- **Strategy（AD-12）：** `BatchSelectionStrategy.select(candidates, request: SelectionRequest) -> list[Allocation]`，`SelectionRequest(total_quantity, lines=None)`。`FefoStrategy` 負責排序與分配，`ManualStrategy` 驗證員工選的批次。Strategy 只接收已過濾的不可變 dataclass `BatchCandidate`，不查資料庫、不讀時間、不收 ORM 物件，要有不連資料庫的單元測試。`IssueService` 注入兩者；預設策略在 `issue/dependencies.py` 一行替換（換策略不必改 Service、`ManualStrategy`、router、前端）。
- **確認流程（AD-7、AD-8）：** 處理順序固定為「取得鎖 → 防重送檢查 → 其他檢查」。領用一次只處理單一食材，以 `StockLedger.lock_ingredient_batches(ingredient_id)` 鎖該食材所有剩餘量大於 0 的批次（依 `id` 遞增）；鎖後用 `find_operation(key, ISSUE)` 查重送；再於鎖內以 `ManualStrategy` 驗證明細、以預設策略重算 FEFO 基準判定 `is_non_fefo`。所有判斷以鎖後資料為準。錯誤分類（404／422／409）在過濾候選批次之前完成。
- **重放：** `operation_group_id` 直接取自 `Idempotency-Key`；`inventory_transaction` 有唯一鍵 `(operation_group_id, batch_id)` 作為最後防線。重放與首次回應走同一個方法，從已持久化的異動重建，數量取 `quantity_after`，不取批次目前值；比對內容以 `{batch_id: quantity}` 為準。
- **庫存寫入（AD-5、AD-20）：** 扣庫存只能呼叫 `StockLedger.deduct(batch, quantity, TransactionType.ISSUE, op, is_non_fefo=...)`，`quantity` 一律正數，Ledger 對未鎖定批次丟例外、結果小於 0 丟 `INSUFFICIENT_STOCK`。`StockOp(operation_group_id, operator_id, occurred_at, reason)` 中 `occurred_at` 由 Service 以 `clock.now()` 取一次。`issue` 模組沒有自己的資料表，不可直接改 `inventory_batch` 或 `inventory_transaction`。
- **效期與時間：** 可用判定只用 `app/domain/expiry.py` 的 `is_available`／`classify_expiry`；今天由 `Clock.today()` 取得並以參數傳入查詢，不可用 `datetime.now()`、`func.now()`、`CURRENT_DATE`。跨日情境（例如 11/02 A 已過期）以 `FixedClock`、`APP_FIXED_NOW` 測試。
- **數量（AD-9）：** 數量以字串傳遞，使用 `core/types.py` 的 `PositiveQuantity` 等型別，最多三位小數，Python 一律 `Decimal`；輸出固定三位小數。前端不做數量運算，是否非 FEFO 由後端回傳。
- **分層與錯誤：** `modules/issue/` 依 router → service → repository 介面分層，策略放 `issue/strategies/`（`base`、`fefo_strategy`、`manual_strategy`），具體類別只在 `dependencies.py` 組裝。交易邊界在 Service（`with self._uow.transaction():`），路由與依賴一律同步 `def`。Service 丟 `DomainError(code, message, details, fields)`，`details` 裡的 `Decimal` 先轉字串。
- **前端：** 元件只透過 `features/issue/hooks.ts` 取資料，query key 集中在 `shared/api/queryKeys.ts`。用 `useIdempotencyKey()`（`{key, rotate}`），每個表單實例一把 key，成功或內容變更時才 `rotate`。成功後才顯示完成並呼叫 `invalidateStockQueries()`。路由 `/issues/new?ingredient_id=` 要預選食材（路徑常數在 `shared/routes.ts`）。改 API 後重新產生並提交 `schema.d.ts`。
- **測試：** Service 單元測試用 fake Repository、`FakeStockLedger`、`FixedClock`；超領併發（含鎖前先讀同一批次）與防重送要有真實 PostgreSQL 整合測試。

## UX & Interaction Patterns

- 領用頁顯示建議批次的批號、位置、可用量、到期狀態與建議扣量；狀態用 `StatusBadge`，同時顯示文字與顏色。
- 員工改選批次或改數量後重新呼叫建議 API；回傳 `is_non_fefo = true` 的行才顯示必填的原因欄位。
- 操作目標至少 44px、不依賴 hover；領用頁要在 1024×768 與 1366×768 檢查。
- 錯誤時保留已填內容並標出出錯欄位（例如 `lines.0.reason`）；可用量不足時顯示後端回傳的最新可用量。

## Cross-Story Dependencies

- 5.2 依賴 5.1 的 `FefoStrategy` 與候選批次查詢，在鎖內重算 FEFO 基準；5.3 依賴 5.1 的建議 API 接受 `lines`，以及 5.2 的確認流程與 `ManualStrategy` 驗證。
- 需要 Epic 3 確認入庫產生的批次與 `RECEIPT` 異動作為資料來源；`StockLedger`、`FakeStockLedger`、`Idempotency-Key` 解析與 `check_replay`、`FakeUnitOfWork`、`useIdempotencyKey` 已在骨架完成。
- Epic 7 預警首頁以 `/issues/new?ingredient_id=` 連到領用頁；過期批次不能經預警連結領用。領用後低庫存與效期預警要同步更新（靠 `invalidateStockQueries()`）。
- Epic 8 異動查詢會顯示 `is_non_fefo` 與原因；Epic 4 批次異動歷程會列出 `ISSUE` 異動。
