---
title: 'Story 5.1～5.3：FEFO 領用建議、確認領用、非 FEFO 原因'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '6fc6384c717da85ab65686c16d17731b7e074ff8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/docs/design/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**問題：** 備料人員沒有領用功能：不知道該先拿哪一批，領了也沒有扣庫存與紀錄；偏離 FEFO 時店長看不到原因（FR-10、FR-11、UJ-2）。

**方案：** 新增 `issue` 模組。`POST /issues/suggestions` 用 `FefoStrategy` 產生建議，也可接受員工改選的明細並回傳每行 `is_non_fefo`；`POST /issues` 帶 `Idempotency-Key`，鎖住該食材所有剩餘批次後以 `ManualStrategy` 驗證明細、在鎖內重算 FEFO 基準、經 `StockLedger.deduct` 扣庫存；非 FEFO 明細必填原因。前端領用頁可選食材與數量、看建議、改選批次並填原因、確認領用。

**已定案（使用者 2026-11-08）：** 三個 story 做成一份 spec、一個 PR，在重建後的 `feat/fefo-issue` 分支上做。

## Boundaries & Constraints

**必要：** 依 epic-5-context 的 Technical Decisions。處理順序固定：`lock_ingredient_batches` → `find_operation(key, ISSUE)` ＋ `check_replay` → 其他檢查。錯誤在過濾候選之前分類，順序為：明細的批次不存在或不屬於該食材 `404` → 已過期 `422 RULE_VIOLATION` → 超過剩餘量（含剩餘 0）`409 INSUFFICIENT_STOCK`（`details` 含 `batch_id`、`remaining_quantity`、`available_quantity`）→ 非 FEFO 缺原因 `422 RULE_VIOLATION`（`fields=[lines.N.reason]`）。可用量 = 鎖內（建議端為一般讀取）未過期候選的剩餘量合計。`occurred_at` 取一次 `clock.now()`；同次領用每行一個 `StockOp`，共用 `operation_group_id = Idempotency-Key`，`reason` 依該行。數量格式錯、同批次重複、`lines` 空白由 schema 回 `422 VALIDATION_ERROR`。員工與管理者都可用。停用食材照常可建議與領用。

**界線：** 不加 migration；不改 `StockLedger`、`FakeStockLedger` 的既有行為；不做領用紀錄查詢（Epic 8）；不呼叫其他模組的 Service 或 Repository（讀表可以，AD-4）；前端不做數量運算、不自行判定非 FEFO 或效期狀態。

## I/O & Edge-Case Matrix

今天 10/31；雞胸肉 A 5kg（11/01 到期）、B 8kg（11/07 到期）。

| 情境 | 輸入／狀態 | 結果 | 錯誤 |
|---|---|---|---|
| 建議 | `{ingredient_id, quantity:"3"}` | A:3；含 A 的位置、可用量、效期狀態 | — |
| 跨批建議 | quantity 7 | A:5、B:2 | — |
| 同到期日 | 兩批同日 | 依進貨日，再依批號 | — |
| 排除 | 已過期或剩 0 | 不在候選；今日到期仍可建議 | — |
| 不足 | quantity 14 | 不扣 | `409 INSUFFICIENT_STOCK`，`available_quantity="13.000"` |
| 改選檢查 | `{ingredient_id, lines:[{B,"1"}]}` | B 行 `is_non_fefo=true` | 與確認端相同的 404／422／409 |
| 確認 FEFO | `POST /issues` A:3，無原因 | A 剩 2；一筆 `ISSUE`、`is_non_fefo=false`；回 `{operation_group_id, lines}` | — |
| 確認非 FEFO | B:1＋原因 | B 剩 7；`is_non_fefo=true`，原因保存 | 缺原因 `422`，`fields=[lines.0.reason]` |
| 同日排後 | 兩批同日，選排序在後者 | 判定非 FEFO | — |
| 超過剩餘 | A 剩 2，領 3 | 全部不扣 | `409`，含最新剩餘量 |
| 多批部分不足 | A:2＋B:9（B 剩 8） | 全部不扣 | `409`，`batch_id=B` |
| 過期 | 今天 11/02，明細含 A | 全部不扣 | `422 RULE_VIOLATION` |
| 不存在／他食材 | 未知批次或別的食材的批次 | 不扣 | `404` |
| 重送同內容 | 同 key 同 `{batch:qty}` | `200` 原結果，不再扣 | — |
| 重送不同內容 | 同 key 不同明細 | 不扣 | `409 DUPLICATE` |
| 併發 | B 剩 6，兩人各領 4 | 至多一人成功，不會負庫存 | 另一人 `409`，含最新量 |

</frozen-after-approval>

## Code Map

- `backend/app/modules/inventory/ledger.py` -- `StockLedger.lock_ingredient_batches`（只鎖剩餘 > 0，依 id）、`find_operation`、`deduct(..., is_non_fefo=)`、`StockOp`。只呼叫，不改。
- `backend/app/core/idempotency.py` `check_replay(existing, {batch_id: qty})`；`core/dependencies.py` `get_idempotency_key`、`get_clock`、`get_uow`、`get_session`。
- `backend/app/core/errors.py` `DomainError`、`FieldError`、`insufficient_stock(batch_id, remaining_quantity, available_quantity)`、`ERROR_RESPONSES`。
- `backend/app/core/types.py` `PositiveQuantity`、`NonNegativeQuantity`（字串進出、三位小數）。
- `backend/app/domain/expiry.py` `is_available`、`classify_expiry`、`days_until_expiry`。
- `backend/app/db/queries/stock_levels.py` `stock_level_stmt(today)` -- 可領用食材清單取 `store_available_quantity > 0`。
- `backend/app/db/models/alert_setting.py` -- 讀 id 最小者的 `warning_days`，給效期狀態用。
- `backend/app/modules/storage_location/*` -- 模組分層、`errors.py` 集中錯誤、router 以 dict 組回應（AD-5 架構測試會擋 `remaining_quantity=` 關鍵字參數）的樣板。
- `backend/app/main.py` -- `api_router.include_router(...)` 掛新 router。
- `backend/tests/unit/test_api_conventions.py` `PRODUCTION_API_ROUTES`；`tests/unit/test_architecture_rules.py`（AD-5、無 float、無 async）。
- `backend/tests/fakes/fake_stock_ledger.py` `add_batch`；`fake_uow.py` `FakeUnitOfWork(ledger)`。
- `backend/tests/integration/factories.py` `add_employee`、`add_ingredient`、`add_location`、`add_item`（可指定 `receipt_date`）、`receive_batch`、`make_token`、`NOW`／`TODAY`；`test_concurrency.py` 的雙執行緒與 `pg_blocking_pids` 等鎖樣板；`test_batch_relocation.py` 的 `_client`。
- `frontend/src/features/issue/pages/IssuesPage.tsx` -- 目前是「開發中」，改成領用頁；`/issues` 與 `/issues/new` 都指向它（`app/router.tsx` 已設定）。
- `frontend/src/shared/hooks/useIdempotencyKey.ts`、`shared/api/client.ts`（`request(..., {idempotencyKey})`、`ApiError.details/fields`）、`shared/api/queryKeys.ts`（`issue.all`、`invalidateStockQueries`）、`shared/ui/{PageHeader,DataTable,EmptyState,StatusBadge}.tsx`。
- `frontend/src/features/storage_location/{api,hooks}.ts`、`pages/StorageLocationsPage.test.tsx` -- api／hooks／測試寫法樣板。

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/modules/issue/strategies/{__init__,base,fefo_strategy,manual_strategy}.py` -- `BatchCandidate`（frozen：batch_id、batch_number、expiry_date、received_date、remaining_quantity）、`SelectionLine`、`SelectionRequest(total_quantity, lines=None)`、`Allocation(batch_id, quantity)`、`BatchSelectionStrategy`。`FefoStrategy` 依（到期日、進貨日、批號）排序並分配，不足丟 `insufficient_stock(available_quantity=合計)`；`ManualStrategy` 依 lines 回分配，行數量超過該候選剩餘量丟 `insufficient_stock(batch_id, remaining, available)`。不 import sqlalchemy、不讀時間。
- [x] `backend/app/modules/issue/{repository,repository_sqlalchemy}.py` -- `issuable_ingredients(today)`（`stock_level_stmt`，可用量 > 0，含停用）、`get_ingredient(id)`、`available_batches(ingredient_id, today)`（一般讀取，含位置）、`batch_facts(ids)`（id → ingredient_id、expiry_date、remaining、batch_number，一般讀取）、`batch_locations(ids)`、`warning_days()`。
- [x] `backend/app/modules/issue/{schemas,errors,service,dependencies,router}.py` -- `IssueService(repository, ledger, uow, clock, default_strategy, manual_strategy)`：`list_ingredients`、`suggest(ingredient_id, quantity | lines)`（不上鎖）、`issue(ingredient_id, lines, key, operator_id)`（依 Boundaries 順序；回應與重放共用 `_result(transactions)`）。路由：`GET /issues/ingredients`、`POST /issues/suggestions`、`POST /issues`（`get_idempotency_key`，首次與重放都 200）；預設策略在 `dependencies.py` 一行組裝。
- [x] `backend/app/main.py`、`tests/unit/test_api_conventions.py` -- 掛 router、加三條路由。
- [x] `backend/tests/unit/test_fefo_strategy.py`、`test_manual_strategy.py` -- 不連資料庫：排序（同日比進貨日、再比批號）、跨批分配、剛好等於可用量、不足、manual 超量。
- [x] `backend/tests/unit/test_issue_service.py` -- `FakeStockLedger`＋fake repository＋`FixedClock`：矩陣各列（不連 DB 能測的部分）、失敗時 `rollbacks == 1` 且沒有異動、重放不再扣、停用食材可領。
- [x] `backend/tests/integration/test_issues.py` -- 真實 PostgreSQL＋`TestClient`：第 9 節流程（領 3 → 改選 B 1 填原因 → 再從 A 領 3 被拒 → `FixedClock` 11/02 時 A 422）、404／422／409、`DUPLICATE`、重送 200；兩條執行緒各領 B 4（B 剩 6），其中一條在鎖前先讀過 B，結果一成一敗、B 剩 2，`pg_blocking_pids` 確認第二條在等鎖。
- [x] `frontend/src/features/issue/{api,hooks}.ts`、`shared/api/queryKeys.ts`、`shared/api/schema.d.ts` -- `issue.ingredients`、`issue.suggestion(...)` key；`useIssuableIngredients`、`useIssueSuggestion`（mutation）、`useCreateIssue`（成功後 `invalidateStockQueries()`）；PowerShell 下 `npm run gen:api`。
- [x] `frontend/src/features/issue/pages/IssuesPage.tsx`（必要時拆 `components/`） -- 依 Design Notes 的版面；`?ingredient_id=` 預選；成功才顯示完成、`rotate()` 並重設；表單內容變更時 `rotate()`；錯誤保留輸入，`lines.N.reason` 標到對應列，409 顯示後端回的可用量／剩餘量。
- [x] `frontend/src/features/issue/pages/IssuesPage.test.tsx` -- 預選食材、取得建議顯示批號／位置／狀態、改數量後以 lines 重查並出現原因欄、送出帶 `Idempotency-Key` 的 body、成功後失效快取並換 key、422 原因錯誤標在列上、409 顯示可用量。

**Acceptance Criteria:**
- Given 領用成功，when 前端收到回應，then 才顯示完成，呼叫 `invalidateStockQueries()`，下一次送出用新的 key。
- Given 頁面以 `/issues/new?ingredient_id=5` 開啟，when 載入完成，then 食材已選好。
- Given 1024×768 與 1366×768，when 顯示建議表格，then 頁面不出現橫向捲動，可點目標至少 44px。

## Design Notes

- 領用頁版面：`PageHeader`（h1「領用」）→ 卡片：食材 `Select`（searchable，選項顯示「名稱（可用 N 單位）」，停用食材加「已停用」字樣）、「需要數量」輸入、「取得建議」（`variant="default"`）→ 建議表格（`DataTable`）：批號、位置、到期日＋`StatusBadge`、可用量、領用量輸入（預填建議量，未分配列留空）、非 FEFO 列加「非 FEFO」文字標記與必填「原因」輸入 → 主要按鈕「確認領用」（全頁唯一漸層按鈕）。
- 員工改了任一列的領用量（停止輸入約 400ms 後）即以 `lines`（只送非空白的列，依畫面順序）呼叫建議 API，由回應決定哪幾列要原因、顯示合計量；畫面不自己加總。
- 建議端點回 `{ingredient_id, unit, requested_quantity, available_quantity, candidates:[{batch_id, batch_number, location_code, location_name, remaining_quantity, expiry_date, expiry_status, days_until_expiry, fefo_quantity, quantity, is_non_fefo}]}`：`candidates` 是全部可用批次（FEFO 順序），`fefo_quantity` 是基準分配，`quantity` 是本次分配（quantity 模式等於基準，lines 模式為員工所填，未選為 `"0.000"`）。
- FEFO 列若有填原因也照存；沒填就用 Ledger 預設「領用」。
- 可領用食材另開 `GET /issues/ingredients`：Epic 1 的食材 API 還沒做，而且領用只需要有可用量的食材。

## Verification

**Commands:**
- `cd backend && uv run ruff check . && uv run ruff format --check . && uv run lint-imports && uv run pytest` -- 全部通過
- PowerShell：`cd frontend; npm run gen:api` -- `schema.d.ts` 已更新
- PowerShell：`cd frontend; npm run lint; npm run typecheck; npm test; npm run build` -- 全部通過

## Implementation Notes

- 由主 session 直接實作（沿用 Story 2.2 的做法，subagent 只用在審查）。
- Strategy 介面多了 `order(candidates)`（預設維持傳入順序，`FefoStrategy` 覆寫），讓建議表格依建議順序排列；換策略時一起換掉。
- 建議與確認共用 `_classify`（404 → 過期 422）與 `_allocate`（`ManualStrategy` 驗證超量 409，再以預設策略算同總量的基準）。剩餘量為 0 的同食材批次不在候選中，由 `ManualStrategy` 以剩餘 0 回 409。
- `BatchCandidate(...)` 與 `insufficient_stock(...)` 在 app 內改用位置參數：AD-5 架構測試會把任何 `remaining_quantity=` 關鍵字參數當成寫入批次。
- 建議端點用 `useQuery`（key `issue.suggestion(body)`），領用成功後 `invalidateStockQueries()` 也會失效它；畫面只採用「目前請求」的結果（`appliedRequest`），quantity 模式回來時以建議量預填各列，`"0.000"` 的列留空。
- Idempotency key 在送出內容（食材＋明細）改變時 `rotate()`，同內容重按沿用同一把；成功後也換新的。
- 併發整合測試：第二個等待者被第一個等待者擋住，`pg_blocking_pids` 指向的不是 holder，所以改成計算「被任何連線擋住」的連線數。
- `router.test.tsx` 移除「領用」的開發中佔位檢查；`/issues/new?ingredient_id=` 的導覽測試保留。
- 建議表格設 `minWidth={680}`：1024×768 時卡片內約 700px，不會捲動；放不下時只在表格外框內捲動（`DataTable` 的 `Paper` 是 `overflow: hidden`，不設會被切掉）。
- 實際的 repository 方法是 `issuable_ingredients`、`get_ingredient`、`remaining_batches`（不依日期過濾，效期在 Service 以 `is_available` 判斷）、`get_batches`、`warning_days`。
- 驗證（審查前）：backend 412 passed、ruff、format、lint-imports 4 kept；frontend 185 passed、lint、typecheck、build 通過，`schema.d.ts` 已重新產生。1024×768／1366×768 的實機版面尚未檢查。

- 實測後追加（使用者 2026-11-08 決定）：
  - 領用頁下方新增「最近領用紀錄」（`GET /issues?limit=`，預設 20、上限 50），依 `operation_group_id` 分組、新到舊，唯讀；依條件查詢所有異動仍屬 FR-17（Epic 8）。
  - 食材選單改成分類篩選（Chip）加依分類分組的下拉，選項顯示保存方式、可用量，以及後端判定的最早到期狀態與低庫存（停用食材不提醒低庫存，AD-21）。`GET /issues/ingredients` 因此多回分類、保存方式、`nearest_expiry_*` 與 `is_low_stock`。
  - 單位維持 A2（每項食材一種單位、三位小數、不換算）；數量欄加上說明，公斤／公升顯示「0.25 公斤 = 250 公克」這類固定範例。示範資料的單位（公斤、公升、顆、瓶）不改。
  - 驗證：backend 424 passed、ruff、format、lint-imports 4 kept；frontend 194 passed、lint、typecheck、build 通過，`schema.d.ts` 已重新產生。這次追加沒有再跑三層審查。

- 第二次實測後追加（使用者 2026-11-08 決定）：
  - 沖銷領用：`POST /issues/{operation_group_id}/reversal`（必填原因，所有登入者可用）。先讀原 ISSUE 異動，鎖住相關批次後才判斷是否已沖銷；每筆原異動各寫一筆 `REVERSAL`（`reverses_transaction_id` 連回、新的 `uuid4()` 作為 `operation_group_id`），原紀錄保留。已沖銷時回 200 與目前狀態，唯一鍵 `reverses_transaction_id` 是最後防線。最近紀錄顯示「已沖銷」、沖銷者與原因。SRS 把交易更正列為期末延伸，這裡先做了領用的部分。
  - 不可分割的單位：`app/domain/units.py` 的 `INDIVISIBLE_UNITS`（目前是「顆、個」）在建議與確認領用時擋小數，回 `422 RULE_VIOLATION`，`fields` 指向 `quantity`／`lines.N.quantity`；盒、包、瓶等照常允許小數。API 回 `allows_fraction`，前端依此提示「只能填整數」並切換數字鍵盤。進貨、報廢、盤點之後可以共用；Epic 1 若在食材加「允許小數」欄位，改由欄位決定。
  - 數量顯示：共用元件 `shared/ui/Quantity.tsx`，去掉多餘的 0（`30.000` → `30`），小數部分縮小變淡；只處理字串，送出的值不經過它。
  - 版面：分類篩選移到整列上方，「食材」與「需要數量」同一列、label 與輸入框對齊；表格上方加「想改拿別的批次？」說明，只有一個批次時改說明不會有非 FEFO。
  - 驗證：backend 445 passed、ruff、format、lint-imports 4 kept；frontend 205 passed、lint、typecheck、build 通過，`schema.d.ts` 已重新產生。這次追加沒有再跑三層審查。

- 第三次實測後追加（使用者 2026-11-08 決定）：
  - 示範資料：豬里肌、高麗菜、白米、雞蛋各多一個正常批次，連同雞胸肉共五種食材有兩個可用批次，可以示範非 FEFO；README 情境表與 `test_seed_demo.py` 一起更新（即期、低庫存情境不變）。開發資料庫已用 `seed-demo --reset` 重灌。
  - 切換分類時下拉不關閉：`usePickerDropdown` 控制 Select 的開關，下拉開著時分類的 `onMouseDown` 會 `preventDefault`，輸入框不會 blur，也略過那一刻的關閉。
  - 只有一個批次時不再顯示任何說明。
  - 動態效果：`features/issue/issue.module.css` 沿用儲存位置頁的 `rise`／`reveal` 與 `stagger`（70ms 間隔），套在頁首、主卡片、建議與紀錄的各列、原因欄、非 FEFO 標記、提示訊息；按鈕與分類加 `.press`（滑過浮起、按下回彈）；下拉選單用 `pop-top-left` 轉場；都尊重 `prefers-reduced-motion`。
  - 驗證：backend 446 passed、ruff、format、lint-imports 4 kept；frontend 207 passed、lint、typecheck、build 通過。這次追加沒有再跑三層審查。

- 第四次實測後修正（使用者 2026-11-08）：
  - 「切換分類時下拉不關」上一版沒有做到：Mantine `Select` 的下拉在點到外面（Popover 的 click outside）時也會關，只擋 blur 不夠。改用 `Combobox` 自組食材選單，分類按鈕放進下拉頂端的 `Combobox.Header`（`onMouseDown` 時 `preventDefault`，焦點留在輸入框），點分類就不算點到外面。下拉加 `position="bottom-start"`、`middlewares={{ flip: false, shift: true }}`，捲動時固定在輸入框下方。
  - 示範資料：白米改用「袋」（約 20 公斤一袋，3 袋＋2 袋，安全量 1 袋），鮭魚片改用「包」（約 1 公斤一包）；兩者都允許小數，袋、包這類單位的數量欄顯示「可填小數（最多三位），例如 0.5 袋」。開發資料庫已再用 `seed-demo --reset` 重灌。
  - 驗證：backend 446 passed；frontend 208 passed、lint、typecheck、build 通過。

- 第五次實測後修正（使用者 2026-11-08）：
  - 下拉仍會關的根因：分類用的 `Chip` 底層是 label＋radio，點下去瀏覽器會把焦點移到 radio，輸入框 blur 就關掉清單；jsdom 不模擬這種焦點轉移，所以單元測試抓不到。改成一般按鈕（`aria-pressed`），mousedown 時 `preventDefault`，焦點留在輸入框。
  - 食材框改用 `InputBase` 後少了主題的 44px 最小高度，補上 `styles.input.minHeight`；「取得建議」的 `mt` 由 25 改 21。
  - 以 Playwright（scratchpad，用本機 Chrome、API 全部以假資料攔截，不碰資料庫）實測 1024×768 與 1366×768：換兩次分類清單都維持開啟、焦點留在輸入框；點選食材後關閉並帶入名稱；點空白處會關閉；捲動時清單固定在輸入框下方 8px；食材、需要數量、取得建議三者頂端與高度一致（225＋44／233＋44）；沒有橫向捲動。
  - 驗證：frontend 208 passed、lint、typecheck、build 通過。

## Spec Change Log

## Review Triage Log

第 1 輪：Blind Hunter（BH）13 項、Edge Case Hunter（ECH）9 項、Verification Gap（VG）5 項加 2 項其他，合併同根因後 24 列。沒有 intent_gap 或 bad_spec，全部以 patch 處理或駁回。

| # | 來源 | 發現 | 判定 | 依據與處理 |
|---|---|---|---|---|
| 1 | BH、ECH | 同條件再按「取得建議」後表格一直空白 | medium → patch | 已確認：`setView(undefined)` 後 refetch 回來的 data 因 structural sharing 是同一個參照，套用的 effect 不會再跑。改以 `dataUpdatedAt` 判斷是否有新結果；補測試。 |
| 2 | ECH | 領用成功後再查同樣數量，先套用舊快取、重抓結果被擋掉 | medium → patch | 同 1 的根因（以請求物件判斷「套用過」）。改用 `dataUpdatedAt` 後，失效重抓的結果也會套用。 |
| 3 | BH、ECH | 400ms 重新檢查計時器在換食材、送出成功、重新取得建議時沒有取消 | medium → patch | 已確認 effect 只依賴 `edited`。計時器改存 ref，`resetDraft`、`suggest` 先 `cancelCheck()`。 |
| 4 | BH、ECH | 改回照 FEFO 後，隱藏的原因仍會送出並寫進異動 | medium → patch | 已確認 `selectedLines` 一律帶 reason。改成只送畫面上有原因欄的列；補測試。後端仍照 Design Notes 保存 FEFO 列的原因，不改。 |
| 5 | BH | 重新檢查中仍可按「確認領用」 | low → patch | 修正只是停用條件加一項：檢查排程中或 lines 檢查請求中時停用，並顯示「正在檢查…」。 |
| 6 | BH、VG | 清空所有領用量後，非 FEFO 標記停在上次結果 | low，駁回 | 此時沒有明細，確認鈕已停用，不會送出錯誤內容；再輸入任一列就會重新檢查。 |
| 7 | BH | 確認回 409 後表格的剩餘量不會自動更新 | low，駁回 | 錯誤訊息已顯示後端回傳的最新剩餘量與可用量；只在兩人同時領用時發生，要修得加錯誤分支的失效邏輯。 |
| 8 | BH | 「非 FEFO」標記借用「今日到期」的色票 | low → patch | 同一畫面兩種意思同色，容易誤讀。改成灰色外框 Badge，文字本身說明意思；它不是效期／庫存狀態，不放進 `statusBadgeMap`。 |
| 9 | BH、ECH | 重放比對不含 reason 與 ingredient_id | false | AD-8 明定比對內容為 `{batch_id: quantity}`；批次只屬於一種食材，同批次不同 ingredient_id 不可能成功。 |
| 10 | BH | 「需要數量」與表格合計可能不一致 | false | 改選後合計以後端的 `requested_quantity` 顯示，是設計行為；需要數量只是取得建議的輸入。 |
| 11 | BH | 為了避開 AD-5 架構測試改用位置參數與 dict | low，駁回 | 與 Story 2.2 相同的既有做法；修架構測試的判斷方式超出本 story。已在程式加註解。 |
| 12 | BH | `_quantities` 缺型別參數 | low → patch | 直接改成 `Sequence[Allocation]`。 |
| 13 | BH | `alert_setting` 沒有資料時 `.one()` 會 500 | false | AD-19 規定 migration 建立預設列，整合測試的清表也保留這一列；程式沒有刪除它的路徑。 |
| 14 | BH | 新路由沒有測未登入回 401 | false | `test_api_conventions.py` 的 `test_every_api_route_requires_login_unless_explicitly_public` 已檢查所有 `/api/v1` 路由，含新增的三條。 |
| 15 | VG、BH | 建議端「quantity 與 lines 擇一」、重複批次、空 lines 沒有 HTTP 測試 | medium → patch | 已補 `test_invalid_suggestion_requests_are_validation_errors`（5 種）。 |
| 16 | BH | 建議端 lines 模式的 404／過期 422／409 沒有 HTTP 測試 | low → patch | 已補 `test_suggestion_lines_are_classified_like_confirmation` 與 `test_expired_line_in_suggestion_is_rule_violation`。 |
| 17 | VG | 只有空白的原因視為未填，沒有測試 | medium → patch | 已補 `test_blank_reason_counts_as_missing`。 |
| 18 | VG、BH | 可領用食材含停用、排除只剩過期批次的食材，沒有測試 | medium → patch | 已補 `test_ingredient_list_keeps_inactive_stock_and_drops_expired_only`。 |
| 19 | VG | 前端「指定批次不足」訊息與改選檢查的逐列錯誤沒有測試 | medium → patch | 已補兩個測試。 |
| 20 | VG、BH | 失敗後同內容重送要沿用同一把 key，沒有測試 | medium → patch | 已補測試：500 後重按 key 相同，改量後 key 不同。 |
| 21 | ECH | 建議錯誤與送出錯誤指向同一列時，淺層合併會丟掉前者 | low → patch | 直接改成逐列合併（`mergeRowErrors`）。 |
| 22 | ECH | 送出失敗後改了輸入，舊的錯誤橫幅仍在 | low → patch | `editRow` 在有送出錯誤時 `create.reset()`。 |
| 23 | ECH | spec 寫的 repository 方法名稱與實作不同、建議寫成 mutation | 駁回 | 修正方式是改 spec。實際名稱已記在 Implementation Notes。 |
| 24 | BH | 審查 diff 沒有包含 `schema.d.ts`、sprint-status 與 spec | false | 刻意排除：`schema.d.ts` 由 `npm run gen:api` 產生（修正後重跑，內容不變），spec 只給 Edge Case Hunter。 |

另外 VG 指出 `const next ={` 少一個空格，已修正。

修正後驗證：backend 422 passed、ruff、format、lint-imports 4 kept；frontend 190 passed、lint、typecheck、build 通過，`schema.d.ts` 重新產生後沒有差異。
