---
title: 'FR-12～14 效期與低庫存預警'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'a4a97d44fbb323a34c1472fdccf1c54bd65730b4'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/docs/design/DESIGN.md', '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

將首頁的開發中頁面改為可操作的效期與低庫存預警，符合 SRS FR-12～14、Epic 7.1～7.5；沿用現有系統視覺與報廢流程。

## Boundaries & Constraints

**Always:** 台北日期、後端計算排序與動作、四個 AlertRule＋Factory＋InAppNotifier。低庫存依全店可用量；位置篩選須有該處剩餘批次。停用食材只停低庫存提醒。Decimal／API 字串、共用 UI／主題／快取失效、管理者設定。

**Never:** 不自動扣除過期量、不存預警、不發外部通知；不重做其他成員的進貨及庫存總覽。

## I/O & Edge-Case Matrix

| 情境 | 輸入 | 預期 | 錯誤處理 |
|---|---|---|---|
| 效期 | D<0、D=0、1≤D≤T、D>T | 過期、今日、即期、不提醒；T=0 無即期 | 零剩餘排除 |
| 低庫存 | 可用量≤安全量且安全量>0 | 名稱、全店可用量、安全量、缺口；等量缺口為0 | 過期不計可用；無批次仍提醒 |
| 操作 | 過期／今日與即期／低庫存 | 報廢／領用或報廢／建立進貨單 | 過期無領用；失敗不顯示完成 |
| 設定 | 非負整數 | 更新既有設定、操作者及時間 | 負數、小數、非數字422；員工403 |

</frozen-after-approval>

## Code Map

- `backend/app/domain/{expiry,stock}.py`、`db/queries/stock_levels.py`：共用規則與全店量查詢。
- `backend/app/db/models/alert_setting.py`：已有預設3天，不需 migration。
- `backend/app/modules/storage_location/dependencies.py`：分層組裝範例。
- `frontend/src/shared/`：`api/queryKeys.ts`、`routes.ts`、`ui/` 提供快取、路由及共用元件。
- `frontend/src/features/waste/`：`useFullWaste`／`FullWasteDialog` 處理快照確認及衝突。

## Tasks & Acceptance

**Execution:**
- [x] `backend/tests/{unit,integration}/test_alert*.py`：矩陣、位置及權限已測；後端未先執行 red，見 Implementation Notes。
- [x] `backend/app/modules/alerts/`：規則、Factory、Notifier、Repository、Service、schemas、dependencies、router。
- [x] `backend/app/main.py`、`backend/tests/unit/test_api_conventions.py`：註冊 GET `/alerts`、GET/PATCH `/alert-settings`。
- [x] `frontend/src/shared/`：產生 `api/schema.d.ts`、擴充 `api/queryKeys.ts` 與 `routes.ts`。
- [x] `frontend/src/features/alerts/`：API、hooks、測試、摘要卡、篩選清單、設定表單、刷新時間及載入／錯誤／空狀態。
- [x] `frontend/src/features/inventory/pages/InventoryPage.tsx`：接入低庫存區塊，其他功能保留。
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`：Epic 7 五個 story 已移至 review，待獨立審查。

**Acceptance Criteria:**
- Given 已登入，When 開首頁，Then 按過期→今日→即期→低庫存，同級按效期、食材 id 排序，包含批號、位置、量、單位、效期及天數。
- Given 過期批次，When 確認報廢，Then 成功移除並刷新時間，失敗保留錯誤。
- Given 異動成功，When 重查，Then 數量／狀態／時間更新，庫存頁同步低庫存。
- Given 兩個驗收尺寸，When 操作，Then 無橫向捲動、44px目標、文字狀態及 DESIGN.md 配色。

## Implementation Notes

- 後端先完成初版實作再執行測試，沒有遵守預期 red-first 次序；未宣稱後端先紅後綠。前端先寫四個行為案例，於原佔位首頁確認四項失敗後實作；後續增加成功報廢刷新案例。
- 規則透過不可變快照讀取，個別規則自帶排序 rank；Service 不列舉規則優先序。擴充測試驗證新增規則不改 Service，evaluate 不投遞、list_alerts 才經注入 notifier。
- 低庫存沿用 stock_level_stmt 的全店可用量與 domain 低庫存判定；位置只限制有剩餘批次的食材並分開呈現位置量。停用食材仍有效期預警。
- 前端共用既有報廢 hook/dialog，將 hook 輸入縮成實際使用的快照欄位，保留既有重送及衝突機制。進貨與庫存總覽原有頁面保留，低庫存只新增共用區塊；建立進貨單帶 ingredient_id 進既有路由，進貨功能本身仍由其原模組負責。
- settings 僅更新最小 id 既有列，經共用列鎖入口及 UoW，記錄操作者與 Clock 時間；strict integer 拒絕字串、布林、小數與負數。

## Spec Change Log

## Review Triage Log

第一輪三層審查：邊界追查無實證問題；逐項判斷如下。重複缺口分別保留，再依根因合併修補。

| 編號 | 判斷／處理 | 驗證依據 |
|---|---|---|
| BH-1 分次查詢快照 | low／不修 | READ COMMITTED 下，併發提交確實可落在批次與彙總查詢之間；這是短暫唯讀顯示差異，報廢仍以交易及快照防護。非日常穩定重現，改隔離或整合查詢超出直接修正，依低影響複雜度規則拒絕。 |
| BH-2 狀態篩選仍載入全部資料 | low／不修 | Service 確實先算四種規則，未證明目前規模下超時；新增資料載入分支會增加複雜度。暫不加入未經效能測試支持的最佳化。 |
| BH-3 無預警缺成功色 | low／patch | AlertList 沒傳 tone，EmptyState 預設 forest；DESIGN 要求無任何預警使用 success。直接補屬性。 |
| BH-4 設定重查失敗仍可送出 | medium／patch | AlertSettings 有 cached data 時，query.error 分支隱藏欄位，但 disabled 只看 data，確實可送出看不到的舊值。錯誤時禁用提交並加重現案例。 |
| BH-5 設定成功刷新缺測試 | medium／patch | 目前只有422測試；移除設定 mutation 的 onSuccess 仍會全綠。補成功更新、清單／時間與庫存快取失效案例。 |
| BH-6 位置篩選缺頁面測試 | medium／patch | 既有測試只選狀態，後端位置測試不經前端序列化。補 location_id、全店／位置數量及清除篩選案例。 |
| BH-7 位置多頁選單缺測試 | low／不修 | 逐頁累積、signal 傳遞與錯誤拋出均可直接追查；未發現遺漏頁面或吞錯誤的實際問題。超過100個位置非本店日常案例，暫不擴增多分支測試。 |
| BH-8 載入及錯誤分支缺測試 | low／不修 | query.error 已提示舊資料，generated_at 取快取回應，不會虛構新時間；未發現行為錯誤。設定錯誤的實證問題另由 BH-4 修正，不為每個呈現分支新增鏡像測試。 |
| BH-9 重複操作缺批次名稱 | medium／patch | 只以按鈕導覽時，重複「全數報廢」缺少操作對象；為各操作補上食材／批號的可存取名稱。 |
| BH-10 瀏覽器腳本未保留 | low／不修 | 截圖及 fixture 限制已記錄；可重現的 API 與互動行為由正式測試覆蓋。另加 Playwright 套件及執行流程超出直接修正，保留量測證據而不新增工具依賴。 |
| VG-1 設定成功刷新缺測試 | medium／patch | 審查已搜尋 hook、表單與測試，只有失敗設定及報廢成功路徑；與 BH-5 同根因，一併補回歸測試。 |
| VG-2 位置篩選缺頁面測試 | medium／patch | 審查指出刪除 location_id 序列化不會使既有測試失敗；與 BH-6 同根因，一併補回歸測試。 |

修補已驗收：設定讀取失敗時，按鈕與 submit handler 都拒絕提交；新增成功設定／快取失敗／位置篩選測試；真正無篩選空清單套用 success；操作名稱包含食材與批號。8項預警前端測試及完整測試皆通過。本輪沒有遞延項目，低影響建議的拒絕理由如上。

## Verification

2026-11-09 實作驗證：

- 主流程獨立驗收：預警矩陣23項通過；審查修補後重跑完整後端642項（真實 PostgreSQL）及前端264項通過，Ruff、4個分層契約、ESLint、typecheck、build全部通過，`git diff --check` 通過。後端使用系統暫存目錄及 `-p no:cacheprovider`。
- 已完成規格內任務與驗收；Epic 7五個 story 保留 review 供組員人工審查。依專案 AI 協作規則，不由 agent commit 或 push。

- 後端完整 `uv run pytest -p no:cacheprovider --basetemp=C:/Windows/Temp/foodflow-alerts-full tests -q`：642 passed，含真實 PostgreSQL 預警四項整合測試；測試庫守門確認 `_test` 後綴。最初資料庫未啟動，啟動專用 db 後已重驗通過。既有 pytest cache 權限問題以停用 cacheprovider 與系統暫存目錄解決，清除本次 repo 暫存目錄。
- `uv run ruff check .`：通過；`uv run lint-imports`：4 kept、0 broken。
- `npm.cmd test`：18 files、261 passed。`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build`：通過；build 仍有既有 500 kB bundle 警告。
- 前端 API 型別由 `npm.cmd run gen:api` 重新產生。
- 實際 Edge（Playwright、Vite preview）1024×768 與1366×768：document scrollWidth 等於 viewport、兩者可見五列、可見按鈕與輸入均至少44px。狀態與位置篩選、設定儲存、全數報廢快照確認／成功移除操作通過。
- 瀏覽器用 API fixtures 隔離視覺與互動；真實 API／資料庫、權限、台北跨日及報廢異動在 PostgreSQL 整合測試覆蓋，瀏覽器不是 live DB 端到端。截圖及量測結果：`alerts-browser-evidence/`。

- 後端：`uv run pytest`、`uv run ruff check .`、`uv run lint-imports`；專用 PostgreSQL 測試庫。
- 前端：`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。
- 瀏覽器：1024×768／1366×768、篩選、設定、動作及刷新；記錄未能執行的檢查。
