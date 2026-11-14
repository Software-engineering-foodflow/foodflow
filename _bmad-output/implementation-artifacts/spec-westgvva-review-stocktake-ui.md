---
title: '報廢審核與盤點操作改善'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1358fd8fd02c4d14a395e08eef9c837403fc5091'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/design/DESIGN.md'
---

<frozen-after-approval reason="2026-11-13 使用者已同意繼續實作；現有資料庫套用前另確認">
## Intent
報廢先申請、管理員核准後才扣庫存；報廢與多項盤點使用彈窗。釐清批次數量、改善報廢／盤點／異動與統計的可讀性。

## Boundaries & Constraints
獨立分支；保留未追蹤講稿。不 commit、push、合併，不刪資料、不重灌示範資料。不改其他組員功能、全站樣式、帳本契約或登入機制。必要 schema 與共用檔案變更先取得確認；現有資料庫 migration 另行核准。
維持 Decimal、Clock、UnitOfWork、StockLedger、後端 require_admin。歷史已生效紀錄與異動不可改寫。
使用者已批准新增 waste_request 表、模型註冊及必要 API 型別更新的實作；可在新建隔離測試資料庫驗證，不能套用至現有 foodflow 或清空既有 foodflow_test。現有服務可能自動 reload，測試應用獨立端口，交付時說明尚未套用 migration 的限制。

## I/O & Edge-Case Matrix
| Given | When | Then |
| --- | --- | --- |
| 有效申請 | 送出或重送 | 一筆待審核，不扣量、不產生 WASTE、不計入報表 |
| 管理員與待審核申請 | 核准 | 鎖定、重驗來源與庫存；扣量、紀錄及狀態一次提交 |
| 庫存不足／來源失效 | 核准 | 明確錯誤，仍待審核，不部分寫入 |
| 非管理員／並行重送 | 審核 | 403／僅一次生效；核准與駁回互斥 |
| 待審核申請 | 駁回 | 必填原因，保留人員與時間，不扣量 |
| 歷史報廢 | 查詢 | 保留原始結果，標示歷史已生效，不重新扣量 |
| 多批次盤點 | 預覽／確認 | 各批量與單位清楚；全部成功或全部回滾 |
| 預覽後數量異動，包括改回同量 | 確認 | 拒絕舊預覽，保留輸入並重新核對 |
| 日常／定期／異常／其他 | 選原因 | 定期必選每週／每月／每季；其他必填說明 |
| 彈窗操作 | 搜尋、選取、移除、取消、送出 | 防重選，送出中禁關閉，失敗保留輸入 |
</frozen-after-approval>

## Code Map
- `backend/app/modules/waste/`：目前 create 立即扣量；改為申請、審核服務。現無報廢修改／撤銷端點。
- `backend/app/db/models/waste.py`：WasteRecord 必須有 transaction_id，不能拿來存未生效申請。
- `backend/app/modules/reports/`：統計沿用生效異動，不將申請 join 成統計事件。
- `backend/app/modules/stocktake/`：已有多項原子確認、最新異動版本檢查；原因可相容寫回既有 reason 字串。
- `frontend/src/features/{waste,stocktake,reports}/`：頁面、hooks、api 與測試範圍。
- `frontend/src/shared/ui/{FormModal,DataTable,Toolbar,PageHeader}.tsx`：重用，不修改。
- `frontend/src/shared/api/{queryKeys.ts,schema.d.ts}`：重用失效策略；schema 為生成檔，更新須包含在許可範圍。

## Tasks & Acceptance
**Execution:**
- [x] `backend/app/db/models/waste.py`、模型註冊、`backend/alembic/versions/`：核准後新增申請表，舊表不改；唯一請求鍵、核准紀錄關聯與狀態約束。
- [x] `backend/app/modules/waste/{router,schemas,service,repository,repository_sqlalchemy,dependencies}.py`：申請／查詢／核准／駁回；舊直接扣量入口不得繞過審核；鎖與冪等在同一交易。
- [x] `frontend/src/features/waste/`：搜尋選批彈窗、送出審核、狀態列表、管理員審核、歷史紀錄；無 pending 異動連結。
- [x] `frontend/src/features/stocktake/`、`backend/app/modules/stocktake/schemas.py`：多項彈窗、四類原因、週期與備註；後端驗證新輸入並保留舊原因相容；預覽以伺服器量與差額為準。
- [x] `frontend/src/features/reports/`：統計口徑、篩選層級、數字對齊、載入／錯誤／空狀態與窄螢幕。
- [x] `backend/tests/{unit,integration}/`、各 feature 測試：覆蓋矩陣；併發僅以隔離 PostgreSQL 驗證，不清空現有資料庫或既有測試庫。

**Acceptance Criteria:**
- Given 同批次、相同時點，when 對照庫存與盤點，then 數量一致且顯示批次、位置與單位。
- Given 1024×768 與 1366×768，when 操作三個頁面與彈窗，then 無頁面橫向溢出、操作目標至少 44px，狀態文字可讀。

## Design Notes
唯讀實查雞胸肉 B-00000008=5.000、B-00000009=8.000；庫存首頁按食材加總為13，盤點逐批。另庫存有排除過期的可用量，盤點保留實體批次。未發現同批欄位對錯；不能宣稱使用者全部現象已重現。選取快照可能過時，需更新表單的帳面資訊，仍不得改歷史快照。
建議新表保存批次、數量、原因、說明、申請人／時間、狀態、審核人／時間、駁回原因、唯一請求鍵及核准後 WasteRecord 關聯。核准才產生既有 WasteRecord 與 WASTE；舊統計自然排除未生效申請。全數報廢也走申請，不留下快速扣量旁路。
部署前用既有 backup.sh 產生 dump 並驗證，在獨立資料庫還原檢查。復原優先保留新表停用新功能，不執行會刪申請的 downgrade；若需恢復舊備份，先保留當下備份、還原到新庫驗證後另請批准切換，避免覆蓋後續交易。

## Verification
前端 feature 測試、lint、typecheck/build；後端 waste/stocktake/reports 單元、Ruff、分層檢查。隔離 PostgreSQL 測核准競態、回滾、migration 前後歷史一致；缺環境則如實列未驗證。以兩種尺寸人工或瀏覽器驗證彈窗與鍵盤操作。不以檢查通過代替實際交易驗證。

### 2026-11-13 實作階段實測
- `frontend`: `npm.cmd test -- --run src/features/waste/waste.test.tsx src/features/stocktake/stocktake.test.tsx src/features/reports/reports.test.tsx`：22 passed。涵蓋重試 key、送出防重複、失敗保留輸入、待審核無異動連結、駁回必填、盤點舊預覽失效。
- `frontend`: `npm.cmd run gen:api`、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build`：通過。Build 仍有單一 chunk 超過 500 kB 的警告。
- `backend`: `uv run pytest -p no:cacheprovider tests/unit/test_waste.py tests/unit/test_stocktake.py tests/unit/test_reports.py -q`：95 passed。停用 cache 是因既有 `.pytest_cache` 無寫入權限，不影響測試內容。
- `backend`: `uv run ruff check .` 通過；`uv run lint-imports`：4 contracts kept、0 broken。
- 真 PostgreSQL：以 Python `Settings().database_url` 的連線設定建立唯一新庫，僅將子程序 `DATABASE_URL` 與 `TEST_DATABASE_URL` 指向該新庫，再執行 `.venv/Scripts/python.exe -m pytest -p no:cacheprovider tests/integration/test_waste_reports.py tests/integration/test_stocktake.py tests/integration/test_migrations.py -q`。最終庫 `foodflow_review_d053f75300a4_test`：23 passed，包括核准競態、核准/駁回互斥、扣量回滾、pending/rejected 不入報表、盤點版本衝突、migration CHECK 與 Alembic drift。既有 `foodflow`、`foodflow_test` 未套用 migration、未清空。
- 初輪隔離庫 `foodflow_review_04769400cc9a_test` 發現 WasteRecord 關聯未完整 eager load 及 migration Integer/BigInteger drift，已修正後在上述全新庫重驗。此初輪庫仍保留，非最終驗證依據。
- 歷史保留另於新庫 `foodflow_history_5a041129a152_test` 執行 `alembic.command.upgrade(config, '0001')`，建立一批庫存、進貨異動及舊 WasteRecord/WASTE，再升 `head`。比對 `inventory_batch`、`inventory_transaction`、`waste_record` 全列 `to_jsonb` 前後相同；`alembic.command.check(config)` 通過。以上新建隔離庫均保留，未執行刪庫。
- `git diff --check` 通過，僅現有 Git 換行提示。
- 初輪 CUA inventory 回報 `The browser access host is unavailable`；續作改用本機既有 Playwright/Chromium，在獨立埠與新庫完成1024×768／1366×768驗收。三頁與彈窗無頁面橫向溢出，Enter/Escape/Tab、盤點30次Tab焦點限制與輸入保留通過；實際多項盤點原因驗證、預覽及確認成功可見均通過。報廢1024實際流程另驗證送出中禁關框、申請不扣量、核准才扣量。證據及範圍見 `../verification/westgvva-review-stocktake-ui/README.md`、`results.json`、`flow-results.json` 與截圖。新UI隔離庫 `foodflow_ui_593cfd7bbe6c_test` 保留。
- UI實測補修：feature內分頁與報表連結44px、盤點成功才關框顯示結果、移除重複單位；修後22個前端測試、lint、build（含typecheck）通過。截圖已經view_image實際檢視，不僅依DOM尺寸判斷。

## Implementation Notes
分支 `feat/westgvva-review-stocktake-ui`，目前工作目錄為 `C:/Users/USER/Documents/GitHub/foodflow-review-resume`。原目錄在使用者續作前已 reset 並切至 `docs/westgwa-project-management`，因此本次以保留的完整 review diff 在獨立 worktree 還原，未改動原文件分支。已完成申請模型/migration/API、審核原子交易、多項盤點原因驗證、三頁 UI、測試及兩尺寸視覺驗收。三層審查已完成，功能缺陷與測試缺口已修正並由原審查者核對；status 保持 in-review，因完整後端測試發現三個舊規格測試預期需同步，待共用測試修改確認。CI 修正與現有庫部署已於使用者「確認並執行」後完成。保留 `docs/westgvva-presentation.md`；未 commit、push 或合併。

現有服務若自動 reload，申請 API 會因現有庫尚無 `waste_request` 而不可使用；必須先完成備份與獨立還原驗證，再取得現有庫 migration 核准後部署。新表 migration 的 downgrade 刻意拒絕刪除稽核申請；復原應停用新功能並保留新表。

## Spec Change Log

## Review Triage Log

| 發現 | 判定／處理 | 核對證據 |
| --- | --- | --- |
| 舊版已生效 key 仍可新增申請 | medium / patch，已修 | create 原只查新表；現在查既有 WASTE operation 並明確回覆已生效，新增單元回歸測試。 |
| 全數成功後外層彈窗遮住結果 | medium / patch，已修 | full hook 成功通知頁面關框並重設選取；兩尺寸真瀏覽器與前端測試通過。 |
| 瀏覽器返回不重開選取 | medium / patch，已修 | opened 原僅初始化；現在顯示狀態包含當前 batch_id，返回測試通過。 |
| 建議新增待審核篩選 | low / reject | 待審核目前可逐頁取得，沒有紀錄遺失；專用篩選需新增 API 與 UI 狀態，屬額外操作改善，非本次直接修正。 |
| 核准失敗缺最新剩餘量 | medium / patch，已修 | API details 已有 remaining_quantity；頁面改使用既有 wasteErrorInfo 顯示並補測。 |
| 後頁送出後看不到新申請 | medium / patch，已修 | 普通與全數成功統一回到第一頁，兩種提交各有測試。 |
| Repository 新方法缺抽象宣告 | low / patch，已修 | 舊介面均為 abstractmethod，新方法現在同樣限制並補型別，分層檢查通過。 |
| 缺真資料庫來源失效測試 | medium / patch，已修 | 新測試真實沖銷進貨並改來源狀態後核准失敗，獨立 Session 驗證仍待審核且沒有 WASTE。 |
| 臨時 UI 腳本無法跨機即跑 | low / reject 複雜化 | README 已明載本機 fixture 與工具限制，未宣稱 CI 測試；新增回歸腳本改用環境參數，原實測腳本保留作證據，不新增全專案測試安裝流程。 |
| 規格文字與勾選不一致 | low / reject 作程式缺陷 | 這是交接期間狀態文字；本次正常更新 Implementation Notes，沒有以改規格代替程式修正。 |

### 審查環境限制（歷史，已解除）
先前審查指引及 step-05 讀取遭拒。使用者調整權限後，兩層獨立審查與 step-05 讀取已完成，不再是阻礙。

### 最後審查收尾（2026-11-14）

| 發現 | 判定／處理 | 核對證據 |
| --- | --- | --- |
| 空 URL 下清除未套用篩選無效 | patch，已修 | 明確清空六個 draft，新增全部欄位回歸測試；原 edge reviewer 核對已解。 |
| 普通申請失聯關框後丟失 key | patch，已修 | 頁面保留批次、body、key，重開仍重試同筆；未知結果期間鎖內容、移除與全數操作。全數 unresolved 也禁止普通提交。關框重開回歸測試通過，原 edge reviewer 核對已解。 |
| 缺核准／駁回成功頁面測試 | patch，已修 | stateful GET/POST fixture 驗證狀態刷新、審核人與原因、關框、按鈕消失、只核准有異動連結；原 verification reviewer 核對已解。 |
| CI downgrade 與稽核保護衝突 | patch，待共用檔案確認 | 具體方案只移除 ci.yml 的 downgrade base 並更名步驟；保留 upgrade、check、pytest。尚未修改，不列已解。 |

- 最新前端 **31 passed**；lint、build（含 TypeScript）通過。後端此輪無新改動，沿用96單元及24隔離 PostgreSQL整合證據。
- 備份 `foodflow/backups/foodflow-20261113-220715.dump` SHA256 `e5af0cc0913aa36701ac9173e6f4f2a32389efca31ec3bdc7927037e4b8c4c59`；獨立還原庫 `foodflow_restore_240e0582caa5_test` 升級0002、Alembic check通過，既有表雜湊保留，來源庫前後相同且仍0001。詳見 `../verification/westgvva-review-stocktake-ui/restore-results.json`。
- 正式來源庫未套用；最終狀態與剩餘批准範圍見 `../verification/westgvva-review-stocktake-ui/CLOSURE.md`。

### 續作最終驗證（2026-11-13）
- 工作目錄：`foodflow-review-resume`。沿用原目錄已安裝的 Python venv；前端 node_modules 為連至原安裝的本機 junction，未更動依賴版本。
- 前端：`npm.cmd test -- --run src/features/waste/waste.test.tsx src/features/stocktake/stocktake.test.tsx src/features/reports/reports.test.tsx`：**27 passed**。`npm.cmd run lint`、`npm.cmd run build`（含 TypeScript）通過；僅原有大於500kB chunk提醒。
- 後端：原 venv Python 執行 `-m pytest -p no:cacheprovider tests/unit/test_waste.py tests/unit/test_stocktake.py tests/unit/test_reports.py -q`：**96 passed**。`-m ruff check .` 通過；設定 PYTHONPATH 為本 worktree backend 後 `lint-imports --no-cache`：**4 kept**。
- 新建 `foodflow_resume_90ac42ee6dc4_test`；只在此庫設定 DATABASE_URL、TEST_DATABASE_URL 執行 `test_waste_reports.py`、`test_stocktake.py`、`test_migrations.py`：**24 passed**。未清空既有 foodflow_test。
- 最終 UI 使用新庫 `foodflow_ui_ed2625e3a535_test` 與 18865/18866 獨立埠；`review-regressions.mjs` 在1024及1366驗證全數成功關閉雙層彈窗、申請不扣量、返回重開、無頁面橫向溢出與JS錯誤。證據 `review-results.json`、`*-review-back.png`。
- 原始兩尺寸完整驗收見同目錄 `results.json`／`flow-results.json`；最終回歸只重驗有變更的操作，不冒稱重新跑過全部舊流程。
- Docker API 與 `.docker/config.json` 存取遭拒，`scripts/backup.sh` 無法執行；現有業務庫備份／還原演練及 migration **尚未完成**，也尚未取得套用現有庫授權。只完成隔離庫 migration 與先前歷史資料保留實測。

### 需求矩陣對應
申請重送：`test_request_replay_does_not_affect_stock`；核准／原子回滾：`test_persistence_replay_and_read_models`、`test_failure_after_record_flush_rolls_back_everything`；不足與失效：`test_excess_returns_latest_quantity`、`test_reversed_source_after_request_keeps_request_pending`；權限與競態：`test_staff_cannot_review`、`test_review_same_request_is_serialized`；駁回與統計：`test_reject_requires_reason_and_blocks_approval`、`test_pending_and_rejected_requests_do_not_enter_reports`；歷史保留：前述0001→0002獨立庫實測；多批與ABA：`test_preview_confirm_multiple_batches_and_replay`、`test_aba_rejected_even_with_preloaded_quantity`、`test_second_stale_line_does_not_apply_first`；四類原因：`test_structured_reason_*`；彈窗／輸入保留：前端27測試與兩尺寸 JSON 證據。

### 已確認部署與全套測試追查（2026-11-14）
- CI 移除 downgrade base；現有 foodflow 0001→0002 成功，既有表雜湊全部保留，Alembic check及庫存帳本一致性通過。
- 新版本機服務 http://127.0.0.1:18866/，前端與6個後端唯讀端點驗證通過。詳見 deployment-results.json、service-results.json。
- 全套測試首輪779 passed、5 failed、14 errors；移除migration BOM並在沙箱外重跑權限受阻測試後，只剩預警立即生效假設、12表限制、新路由清單三項測試預期。提案已備妥待使用者確認；尚未宣稱全套通過。
