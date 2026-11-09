---
title: '儲存位置頁與全站版面照基準頁改版'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '1bf1a242dba6468c3c91e6268994914a3b54ed00'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/design/DESIGN.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 儲存位置頁和全站版面跟視覺基準 `docs/design/storage-demo.html?v=6` 差很多。基準頁上的「批次」「最近到期」與摘要補充說明，後端也沒有提供資料。

**Approach:** 後端儲存位置 API 補上批次數、最近到期狀態與摘要統計，狀態一律由 `classify_expiry` 判定。前端版面、標題列、摘要卡、工具列、表格照基準頁改，並修掉基準頁在 1024 寬度的破版。

## Boundaries & Constraints

**Always:**
- **Ken 已決定（2026-11-08）：**
  1. 前後端一起做。
  2. 管理者的編輯／刪除改放列尾 44px「⋯」選單。
  3. 寬螢幕拿掉頂部列，品牌放側欄頂端，使用者與登出放側欄底部；窄螢幕保留含收合鈕的簡版頂部列。
  4. 1024×768 也用表格，「換位置」不換行，摘要卡文字不換行。
  5. 寬螢幕的收合鈕移到側欄品牌列右側；收合後畫面左上角留一個 44px 的展開鈕，保留現有的收合功能與 aria、`inert` 行為。
- 效期狀態與剩餘天數只由後端 `classify_expiry` 與 `days_until_expiry` 產生（AD-11），`today` 用注入的 Clock，`warning_days` 讀 `alert_setting` 中 id 最小的一列。前端不再自己算天數，刪除 `ExpiryHint`。
- 「批次」只算位於該位置、`remaining_quantity > 0` 的批次，定義與 `count_stocked_batches` 相同。
- 遵守 AD-4（只讀別的表）、DESIGN.md、AGENTS.md：44px 觸控目標、狀態一律文字加顏色、不寫死色碼、只用 `shared/ui` 元件。
- 權限、驗證、寫入 API 與錯誤處理不變；既有欄位不改名、不移除，只新增欄位。

**Never:**
- 不做側欄「預警首頁」的計數徽章（預警 API 還沒有）。
- 不改其他頁面的內容；只有 layout 的改動會影響全站。
- 不新增 npm 或 Python 依賴；不改資料表、不加 migration。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 有批次的位置 | 位置有 3 批剩餘量 > 0，最早到期日是今天 | `batch_count=3`、`nearest_expiry_date=今天`、`nearest_expiry_status=EXPIRES_TODAY`、`nearest_days_until_expiry=0` | N/A |
| 沒有批次的位置 | 位置只有剩餘量為 0 的批次，或完全沒有批次 | `batch_count=0`，三個 nearest 欄位都是 `null`；前端顯示「—」 | N/A |
| 狀態邊界 | `warning_days=3`，到期日分別在 −1、0、3、4 天 | EXPIRED、EXPIRES_TODAY、EXPIRING_SOON、NORMAL | N/A |
| 批次列 | `GET /storage-locations/{id}/batches` | 每筆多 `expiry_status`、`days_until_expiry` | N/A |
| 摘要 | 5 個位置（1 個停用），冷藏 6 批、冷凍 9 批（2 即期）、常溫 5 批（1 過期） | `GET /storage-locations/summary` 回傳啟用與總數，以及各類型的啟用位置數、批次數、過期／今日到期／即期數；只算啟用位置 | N/A |
| 列操作 | 管理者點列尾「⋯」 | 選單顯示「編輯」「刪除」，aria-label 維持「編輯 R-01」「刪除 R-01」；一般員工不顯示「⋯」 | N/A |

</frozen-after-approval>

## Code Map

- `backend/app/domain/expiry.py` -- `classify_expiry`、`days_until_expiry`，唯一來源
- `backend/app/core/clock.py` -- `Clock.today()`
- `backend/app/modules/storage_location/{repository,repository_sqlalchemy,service,router,schemas,dependencies}.py` -- `list_locations` 目前只回位置本身；`StorageLocationService` 沒有 Clock，要在 `dependencies.py` 注入；`count_stocked_batches` 是批次數的現成定義
- FEFO 分支的 `issue/repository_sqlalchemy.py:90` 有 `warning_days()` 寫法：`select(AlertSetting.warning_days).order_by(AlertSetting.id).limit(1)`。照抄到本模組自己的 repository，不跨模組呼叫
- `backend/tests/{unit,integration}/test_storage_location*.py`、`test_batch_relocation*.py` -- 照既有寫法補測試
- `frontend/src/shared/api/schema.d.ts` -- 用 `npm run gen:api` 重新產生，不手改（CI 會比對）
- `frontend/src/features/storage_location/{api,hooks}.ts`、`pages/StorageLocationsPage.tsx` -- `LocationSummary` 改成 4 張卡片並改用 summary API；`list()` 的三種版面中，table 的門檻從 lg 改成在 1024 也用表格；手機的 list 版面保留
- `frontend/src/app/layout.tsx`、`layout.test.tsx` -- AppShell header 只在窄螢幕顯示；`layout.test.tsx` 斷言品牌、姓名角色、登出、收合鈕的 aria 與 `inert`
- `frontend/src/shared/ui/{PageHeader,StatusBadge,Toolbar,DataTable}.tsx` -- PageHeader 加 `breadcrumb`；Toolbar 加無標籤的單列模式；DataTable 加貼齊卡片（無外框）模式
- `frontend/src/features/storage_location/pages/StorageLocationsPage.test.tsx` -- 用 aria-label 找「編輯／刪除」，改放選單後要先點「⋯」

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/modules/storage_location/` -- repository 加 `warning_days()`、列表的批次統計（批次數＋最近到期日，一次查詢）、摘要統計；service 注入 Clock 並用 `classify_expiry` 轉成狀態；schemas 加欄位；router 加 `GET /storage-locations/summary`（放在 `/{location_id}` 路由之前）-- 提供基準頁資料
- [x] `backend/tests/` -- 依 I/O 矩陣補 unit 與 integration 測試，含狀態邊界、空位置、只算啟用位置 -- 驗證契約
- [x] `frontend/src/shared/api/schema.d.ts` -- 重新產生 -- 同步型別
- [x] `frontend/src/shared/ui/` -- PageHeader `breadcrumb`；Toolbar 單列無標籤模式；DataTable 貼齊模式；StatusBadge 支援剩餘天數文字（見 Design Notes）；補測試 -- 共用元件
- [x] `frontend/src/app/layout.tsx` -- 寬螢幕無頂部列，側欄頂端品牌、底部使用者卡片（頭像、姓名、角色、登出）；收合鈕移到側欄品牌列，收合後左上角留展開鈕；更新 `layout.test.tsx` -- 照基準頁
- [x] `frontend/src/features/storage_location/` -- 麵包屑「基本資料 / 儲存位置」；4 張摘要卡；單列工具列；表格欄位為代碼／名稱／類型（圖示＋文字）／批次／最近到期／狀態／「⋯」＋展開；移除「共 N 個位置」與內層外框；批次列改用 StatusBadge；1024 用表格；更新測試 -- 照基準頁
- [x] 截圖 -- 照上次的做法用 Playwright 攔截 API 回傳假資料，1024×768 與 1366×768 各截儲存位置（含展開一列）與首頁，更新 `docs/design/screenshots/`

**Acceptance Criteria:**
- Given 1024×768 與 1366×768，when 打開儲存位置頁並展開一列，then 版面與基準頁一致，沒有橫向捲動，「換位置」與摘要卡文字都不換行
- Given 寬螢幕，when 看任一頁，then 沒有頂部列，品牌在側欄頂端，使用者與登出在側欄底部；窄螢幕仍有收合鈕
- Given 改版完成，when 執行 backend 的 pytest 與 ruff、frontend 的 test、lint、typecheck、build 與 `gen:api` 差異檢查，then 全部通過

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | 來源 | 發現 | 判定 | 依據與處理 |
|---|---|---|---|---|
| 1 | edge、verif、blind | 庫存異動後位置清單與摘要不會失效 | medium | `STOCK_QUERY_ROOTS` 沒有 `storage-locations`，清單與摘要現在含庫存衍生資料 → patch（含 shared 測試） |
| 2 | blind | 卡片與手機清單的位置說明不見 | medium | Code Map 寫明手機 list 版面保留，實作卻移除說明 → patch（表格依基準頁不顯示） |
| 3 | blind | 停用列只改 `tr` 的 color，區分變弱 | low | CodeTag、StatusBadge、名稱欄有自己的顏色，不繼承；卡片與手機用 opacity → patch |
| 4 | blind | `moveBatch` 回傳型別標成 LocationBatchItem | low | 換位置端點仍回 `LocationBatchResponse`，型別會說謊 → patch |
| 5 | verif、blind | `expires_today_count` 從未測過非零值 | medium | 後端兩個 summary 測試與前端 fixture 全是 0 → patch |
| 6 | blind | `test_staff_can_list_but_not_write` 被放寬成子集合比對 | low | 新欄位值完全沒檢查 → patch |
| 7 | blind | `_typed_location` 的 `active` 參數沒人用 | low | 死碼，直接刪除 → patch |
| 8 | blind | router 註解理由不成立、測試名稱名不符實 | low | 沒有 GET `/{location_id}`；測試只證明路由存在 → patch |
| 9 | edge | 頭像用 `slice(0, 1)` 會切斷非 BMP 字元 | low | 直接改成 `Array.from` → patch |
| 10 | edge、blind | `alert_setting` 空表時 `.one()` 會 500 | false | AD-13：migration 建立預設列，沒有刪除路徑；FEFO 模組用同樣寫法 |
| 11 | edge | layout 在員工資料載入前顯示「一般員工」 | false | `RequireLogin` 在 `current.data` 存在後才渲染 AppLayout |
| 12 | edge | 跨過午夜或改預警天數後狀態過期 | low | 改預警天數會呼叫 invalidateStockQueries（#1 一併解決）；午夜情境少見，修法要加計時器 → reject |
| 13 | blind | 讀預警天數的查詢與 cli.py 重複 | low | 兩處使用，未達抽象門檻；跨模組共用違反 AD-4 → reject |
| 14 | blind | 整合測試沒驗證「取 id 最小那一列」 | low | `alert_setting` 依 AD-13 只有一列，插第二列不是真實情境 → reject |
| 15 | blind | 「共 N 個位置」被移除 | false | Ken 的 intent 明確要求移除 |
| 16 | blind | 摘要載入失敗時整區消失 | low | 改版前的 LocationSummary 也是 `return null`，既有行為 → reject |
| 17 | blind | 換位置下拉多跑批次統計查詢 | low | 一次 GROUP BY，資料量小；修法要加參數 → reject |
| 18 | blind | 名稱欄 lineClamp 可能無效、撐寬表格 | maybe-false | 中文 min-content 為單字寬，自動表格版面可縮欄；1024 截圖量測沒有溢出。要確認需用超長名稱實測 → reject（只會是 low） |
| 19 | blind | `typeNote` 型別太寬 | low | 純型別整潔，行為正確 → reject |
| 20 | blind | diff 缺 schema.d.ts、spec、截圖 | false | schema.d.ts 已重新產生並比對完全相同；spec 刻意不給盲審；截圖已人工比對 |

## Design Notes

狀態文字（StatusBadge 加 `days` 參數，開頭一定是狀態詞，正常狀態維持弱提示）：

| 狀態 | 顯示 |
|---|---|
| EXPIRED | 過期 N 天 |
| EXPIRES_TODAY | 今日到期 |
| EXPIRING_SOON | 即期 · 剩 N 天 |
| NORMAL | 剩 N 天（灰字，不加狀態詞） |

摘要卡補充說明只放「N 批次」，再加上最緊急的一項非零數，依過期 → 今日到期 → 即期的順序挑，例如「9 批次 · 2 即期」。這樣在 1024 寬度不會換行。啟用中位置卡寫「共 5 個 · 1 停用」。

## Verification

**Commands:**
- `cd backend && uv run pytest -q && uv run ruff check .` -- expected: 全部通過
- `cd frontend && npx vitest run && npm run lint && npm run typecheck && npm run build` -- expected: 全部通過
- `cd frontend && npm run gen:api && git diff --exit-code -- src/shared/api/schema.d.ts` -- expected: 沒有差異

**Manual checks:**
- 對照 `docs/design/storage-demo.html?v=6` 與新截圖
