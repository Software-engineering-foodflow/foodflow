---
title: 'FR-07 查詢與沖銷進貨（Story 3.3、3.4）'
type: feature
created: '2026-11-08'
status: done
route: dispatch
baseline_commit: 55e5482fd167f9337627cf4357dabf098662966a
baseline_snapshot: C:/Users/user/AppData/Local/Temp/foodflow-fr07-baseline-20261108
review_loop_iteration: 0
context:
  - '{project-root}/docs/srs.md'
  - '{project-root}/CONTRIBUTING.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="使用者明確要求繼續完成FR-07；沿用既有核准架構與限制">

## Intent

在已完成FR06上完成Story3.3查詢及3.4整單沖銷，讓員工核對來源、管理者更正錯誤入庫。保留同分支未提交FR06及資料表檔案；不改auth、Schema、Migration、其他模組或既有AI紀錄，不執行commit/push/merge/rebase/stash/刪除檔案。不做FR08/09或一般交易更正。

## Boundaries & Constraints

沿用router→Service→Repository、UoW、Clock、Cookie/RBAC、Mantine/forest、API client/hooks與generated schema。庫存只經StockLedger；明確selectinload關聯，數量/金額仍為字串Decimal。查詢所有狀態並可選停用主檔，不能讓啟用選單限制歷史查詢。

新增GET /api/v1/goods-receipts：receipt_number、date_from、date_to（含首尾進貨日期）、supplier_id、ingredient_id、page預設1、page_size預設20上限100；多條件AND，食材篩選以exists避免重複，依receipt_date DESC/id DESC穩定排序，回{items,total,page,page_size}。單號格式錯誤或不存在回空集合；日期反向422；超BIGINT參照422。保留FR06單號導航。詳情顯示既有欄位及每筆來源批次id/批號（草稿null），REVERSED顯示原沖銷時間/操作者/原因，來自REVERSAL異動與員工，不增加單頭欄位。批次透過source_item_id追溯，不開發FR09頁面。

新增POST /{receipt_id}/reverse，body只有reason（去空白後必填，合理長度上限與既有風格一致）。路由require_admin，Service也以repo重讀/驗證有效ADMIN操作者，不能相信前端角色。先單頭鎖→狀態防重送→依id遞增ledger.lock_batches；DRAFT回409，REVERSED重送回200與原單/原沖銷資料且不增加紀錄。鎖後重新查每批異動：每筆明細必有1批與1原RECEIPT，其餘數量異動存在（含零差額ADJUSTMENT若有）皆422 RULE_VIOLATION並提示盤點調整；位置變更不阻擋。不能只比剩餘量等於初始量，領用後調回仍須拒絕。批次集合或原異動不完整也拒絕，不部分沖銷。

整單同一UoW，每個原RECEIPT呼叫ledger.reverse，新的StockOp uuid共用operator/reason/clock.now一次，全部成功才設REVERSED，餘量歸零；任一失敗全回滾。與領用並行以批次鎖及鎖後重新查異動防止沖銷已使用批次，不能反向鎖單頭；不修改既有Ledger。

列表沿用既有PageHeader/Paper/搜尋/分頁/Alert/載入/空結果/重試；篩選改變重設page1，頁面返回保留條件（URL參數），非FR07候選的狀態篩選不新增。詳細頁ADMIN且CONFIRMED才顯示沖銷，確認Modal說明影響、輸入原因、忙碌防連點；錯誤保留原因，成功才提示並invalidateStockQueries，REVERSED唯讀且顯示三項沖銷資訊。STAFF不得見按鈕也不能API沖銷。1024×768與1366×768無頁面水平溢位，主要互動44px。不要引入套件或假正式資料。

## I/O & Edge-Case Matrix

|情境|輸入|預期|
|---|---|---|
|查詢|日期/供應商/食材/單號單獨或組合|正確AND、分頁與total；重複食材明細不重複單據|
|歷史|已停用供應商食材、草稿/確認/沖銷|均可查；不合法單號空結果|
|沖銷|ADMIN完整未使用兩批、含曾移位|200/REVERSED，兩筆連原RECEIPT的REVERSAL，共用新uuid/時間/原因/操作者，餘量0|
|禁止|任一批已ISSUE/WASTE/ADJUSTMENT，即使量調回|422，整單不變，提示盤點|
|重送|同時或重送已REVERSED|200原結果，不重複寫入|
|失敗|第二筆寫入失敗、缺批次/原異動|整單回滾|
|權限狀態|STAFF/未登入/草稿/空原因|403/401/409/422；舊Token失效仍拒絕|
</frozen-after-approval>

## Code Map

- backend/app/modules/goods_receipt/{service,repository,repository_sqlalchemy,router,schemas,dependencies}.py：擴充現有FR06；dependencies已有純build函式。
- backend/app/modules/inventory/{ledger,ledger_sqlalchemy}.py：reverse/lock_batches現成；core/db.py列鎖helper；core/uow.py交易；db/models/inventory.py來源與沖銷連結。
- frontend/src/features/goods_receipt/{api,hooks}.ts、pages/GoodsReceiptsPage.tsx：既有多筆草稿/唯讀表單/明細；可新增列表或沖銷元件，避免檔案過大。shared/api/queryKeys.ts擴充list keys；auth/hooks.ts useCurrentEmployee僅重用。
- backend/tests/{unit/test_goods_receipt_service.py,integration/test_goods_receipts.py}、frontend/src/features/goods_receipt/pages/GoodsReceiptsPage.test.tsx：保留FR06測試，新增FR07案例；精確更新test_api_conventions路由白名單。若新增ABC方法，同步既有FakeReceiptRepository。
- 前次spec-3-1-3-2-goods-receipt.md狀態done；FR06驗證基準424後端/136前端通過。不要改該規格。epic context中「本次限FR06」屬上一輪，本次以此FR07規格與epics為準。

## Tasks & Acceptance

- [x] backend/app/modules/goods_receipt/：列表、詳情批次/沖銷資訊、原子沖銷、狀態防重送與RBAC；原FR06行為保持。
- [x] frontend/src/features/goods_receipt/、shared/api/queryKeys.ts：列表搜尋分頁、歷史選擇、詳細來源與沖銷Modal、快取刷新。
- [x] frontend/src/shared/api/schema.d.ts：實際gen:api產生，不手刻。
- [x] backend/tests/unit/與integration/新增FR07測試：矩陣、併發雙沖銷、沖銷對扣量雙方向、鎖前舊讀、整單回滾與角色/Token。
- [x] frontend/src/features/goods_receipt/新增測試：篩選/分頁/空結果/錯誤重試/返回條件/兩角色/沖銷原因保留及完成資訊。
- Given 正式既有FR06，when FR07完成及回歸，then 原草稿確認及登入權限測試維持通過。

## Implementation Notes

使用者已明確授權FR07整體，不需重問同一範圍。兩個Story共同完成已確認進貨的核對更正流程。沒有未決意圖問題；不需Schema或外部操作；正式DB不寫入。pytest使用既有conftest，確保_test，basetemp設backend/.pytest_cache下全新子目錄，避免預設TEMP權限；終端以明確workdir指向實際專案。.venv launcher可能舊路徑，使用python -m。uv cache必要時用正常權限，不改ACL。BOM/中文以UTF8存檔，PowerShell管線Python中文需處理編碼。

## Spec Change Log

## Review Triage Log

|來源|判定|證據與處理|
|---|---|---|
|blind1 原沖銷對象|medium / patch|目前僅以REVERSAL類型篩選來源批次，Ledger也可沖銷ISSUE。只取連回原RECEIPT的沖銷，補測。|
|blind2 巨大頁碼|medium / patch|page只有ge1，計算OFFSET後可超過BIGINT；限制安全界限，測極值。|
|blind3 URL頁碼|low / patch|目前接受小數/Infinity；正規化為正安全整數，直接修正。|
|blind4 空分頁|medium / patch|page2從21筆減為20筆時items空但total20且分頁消失；回有效頁並區分查無結果。|
|blind5 返回條件|medium / patch|查看返回保留條件，但新增/建立後/刪除及已知單號導航丟失條件；沿全路徑傳遞既有query。|
|blind6 歷程讀取量|medium / patch|每次列表讀每批全部數量異動及操作者，只需原進貨沖銷資訊；採專用窄查詢，同時解blind1。|
|blind7 沖銷目標|low / patch|Modal無單號，確認時無法就地核對；加入單號/明細摘要。|
|blind8 篩選缺排除證據|medium / patch|現有兩筆同供應商/食材且都在日期內，無法識別被移除predicate；加對照資料與精確ID/total。|
|blind9 Service單測|medium / patch|FR07行為僅整合測試，fake未覆蓋無效ADMIN/原因/404/replay/日期反向；加直接Service測試。|
|edge1 巨大OFFSET|medium / patch|同blind2，外部整數頁碼可導致PG錯誤。|
|edge2 刪除後空頁|medium / patch|同blind4，total20/page2時無導航可回有效結果。|
|verification1 日期食材排除|medium / patch|受信任的驗證缺口：刪日期或食材predicate原測試仍過。補獨立排除與AND驗證。|


完成紀錄（2026-11-09）：FR07 Story3.3、3.4全部實作與審查修正完成。原沖銷資訊僅查連回RECEIPT的REVERSAL；列表不載入完整批次數量歷程。API頁碼限制安全OFFSET，前端正規化URL並在資料減少時回有效頁。查看、新增、建立後、刪除及單號導航皆保留查詢條件；沖銷Modal包含單號與明細摘要。新增對照資料驗證獨立/組合篩選與日期邊界、各狀態及Service直接呼叫。

最終完整測試：後端449 passed（56.51秒，foodflow_test真PostgreSQL），前端148 passed／10 files（預設npm test，9.80秒）。FR06原有兩筆建立→編輯→確認長流程測試曾超過預設5秒，僅該案例設15000ms，所有斷言保留，其餘案例維持預設上限。Ruff、ESLint、tsc、build、import-linter（4 kept/0 broken）、Alembic check（無差異）及單一0001 head皆通過；gen:api重跑前後SHA256一致，git diff --check通過。build仍有原本的大型chunk提示，未擴充套件或調整其他模組。

Chrome瀏覽器以測試用途API mock驗證1024×768、1366×768，ADMIN與STAFF四組均無水平溢位、無pageerror、主要操作目標44px；ADMIN失敗保留原因並可重試、成功顯示原沖銷資訊，STAFF無沖銷按鈕，返回保留篩選與頁碼。正式資料庫未寫入；真實交易/鎖/原子性由PostgreSQL整合測試驗證。

審查紀錄所有patch項目均已完成並補測，沒有新增延期功能；FR08/09仍未開發。使用者禁止自動commit/push/merge/rebase/stash及刪檔，未執行。FR06規格、auth、DB模型/Migration/Ledger、既有AI紀錄與資料表檔案保留；Sprint3.3、3.4標為review供人工驗收。

## Verification

pytest全套（foodflow_test）、ruff、import-linter、alembic check/heads；前端lint、test、build含tsc、gen:api一致性。真PostgreSQL驗證原子性與鎖，瀏覽器兩尺寸查詢沖銷流程（mock僅測試用途），git diff --check與受保護檔案核對。主代理最終驗證，不提交。
