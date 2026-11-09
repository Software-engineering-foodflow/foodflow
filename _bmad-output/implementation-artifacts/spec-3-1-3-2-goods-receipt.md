---
title: 'FR-06 進貨草稿與確認入庫（Story 3.1、3.2）'
type: feature
created: '2026-11-08'
status: done
route: dispatch
baseline_commit: 55e5482fd167f9337627cf4357dabf098662966a
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/CONTRIBUTING.md'
  - '{project-root}/docs/srs.md'
---

<frozen-after-approval reason="使用者已於本對話確認第一階段計畫">

## Intent

完成 FR-06：員工建立／再次開啟／編輯／刪除草稿，確認後整單入庫。使用者已核准 Story 3.1＋3.2；FR-07 列表搜尋、完整查詢及沖銷不在本次。以既有主題、登入、API、Schema、StockLedger 為基礎。

## Boundaries & Constraints

- 管理者與一般員工皆可操作；使用既有 Cookie、get_current_employee、RequireLogin，操作者由伺服器取得。不要修改 auth 模組。
- 不增加資料表、欄位、Migration、套件或假營運資料。沒有基本資料 API，因此在 goods_receipt 提供僅讀取啟用供應商／食材／位置的選單 API（可分頁搜尋），不維護它們。選單要處理超過100筆，已停用資料仍能在既有單據顯示。
- 不執行 commit、push、merge、rebase、stash、刪除檔案或覆蓋既有 AI 紀錄。既有 docs/diagrams/data-tables/ 全數保留；已建立 feat/goods-receipt 分支，不必再操作分支。避免讀取或輸出 .env 秘密。
- router → Service → Repository(ABC)；具體實作僅在 dependencies 組裝。Service 不 import FastAPI/SQLAlchemy/Pydantic；可新增純 dataclass 作為明細輸入。Session/UoW/Clock 共用 core dependencies。StockLedger 是庫存唯一寫入入口。
- 數量／金額使用既有 PositiveQuantity/Money，字串傳輸；零單價有效，null 不可變成0。單位讀 ingredient.unit。日期來自Clock、同次確認時間取一次。
- 單號 GR-{id:08d}、批號 B-{item.id:08d}。狀態 DRAFT→CONFIRMED；不新增取消狀態。草稿至少1筆食材明細，數量／效期／位置允許null，供應商／進貨日期／食材必填。填寫數量則>0最多3位，單價≥0最多2位，日期不可自動推算。
- POST /api/v1/goods-receipts 建草稿(201)，GET /{id}讀單筆，PATCH /{id}編輯，DELETE /{id}僅刪草稿(204)，POST /{id}/confirm確認(200)。不增加跨單列表搜尋API/UI。頁面提供建立入口與依已知單號重新開啟作為編輯導航（非FR07搜尋）；建立後導向詳細／編輯路由。API確切路徑由實作者固定在模組並避免/options被/{id}吞掉。
- 確認、更新及刪除已存在單據先鎖單頭（core.db.for_update，populate_existing）；防重送檢查先於其餘驗證。CONFIRMED重送回200與原資料，不再新增；REVERSED拒絕。明細更新保留現有id，新增分配新id，驗證傳入id屬於該單且不重複，刪草稿時先刪明細。關聯lazy=raise，以selectinload明載。
- 確認時鎖後重新驗證所有必填／日期／參照啟用狀態，逐筆ledger.receive，共用StockOp uuid/time/operator。狀態與批次異動在同一UoW提交，任何失敗全回滾。來源明細唯一鍵為防線。已確認單只讀。
- UI沿用forest、Noto Sans TC、AppLayout、PageHeader、Paper、Alert、Mantine表單；多筆區塊響應式排版1024×768/1366×768，不新增UI套件。元件→hooks→api→shared/client。表單失敗保留輸入，送出中防連點，收到成功才顯示完成；確認後invalidateStockQueries。支援new?ingredient_id預填。

## I/O & Edge-Case Matrix

| 情境 | 輸入／狀態 | 預期 | 錯誤 |
|---|---|---|---|
| 草稿 | >=1筆，可缺數量／效期／位置 | 儲存成功、不增加庫存 | 格式或無效參照422，items.N.field |
| 確認 | 完整有效兩筆 | 每筆一批次一RECEIPT，狀態CONFIRMED | 其中失敗全部回滾 |
| 日期 | 進貨日>today，或確認效期<進貨日/today | 拒絕且維持草稿 | 422 |
| 不合法值 | 零/負數量、超精度、負單價、空明細、未知或停用參照 | 不寫入 | 422欄位錯誤 |
| 已確認 | 更新／刪除 | 保留歷史 | 409 STATE_CONFLICT |
| 重複確認 | 重送或同時兩連線 | 200，只有一組批次與異動 | 無重複寫入 |
| 驗證 | 沒登入／帳號停用或token失效 | 拒絕營運存取 | 401 |
</frozen-after-approval>

## Code Map

- backend/app/db/models/goods_receipt.py、inventory.py、master_data.py：現有實體／關聯，勿改schema。
- backend/app/core/{types,errors,db,uow,dependencies,clock}.py：驗證、DomainError/FieldError、列鎖與交易。
- backend/app/modules/inventory/{ledger,ledger_sqlalchemy}.py：StockOp、receive現成入口，僅flush。
- backend/app/modules/auth/{dependencies,router}.py：既有認證，不改寫。
- backend/app/modules/storage_location/：分層及SQLAlchemy查詢範例。
- frontend/src/app/{theme,layout,router}.tsx（theme為.ts）、features/auth/pages/EmployeesPage.tsx：介面慣例。
- frontend/src/shared/api/{client,queryKeys}.ts：共用請求、快取失效。
- backend/tests/{conftest.py,integration/conftest.py}：自動切換foodflow_test並清空測試表；不可對正式DB執行測試。單元fake參照既有tests/fakes。

## Tasks & Acceptance

- [x] backend/app/modules/goods_receipt/{__init__,schemas,service,repository,repository_sqlalchemy,dependencies,router}.py：實作上述端點、只讀參照選單及交易，main.py掛router。
- [x] frontend/src/features/goods_receipt/：api.ts、hooks.ts、頁面與表單；app/router.tsx、shared/routes.ts及queryKeys.ts做必要整合，不改auth。
- [x] frontend/src/shared/api/schema.d.ts：用gen:api產生，勿手刻。
- [x] backend/tests/unit/test_goods_receipt_service.py、integration/test_goods_receipts.py及併發測試：矩陣全覆蓋，fake單測＋真PostgreSQL契約，包含第三筆寫入失敗回滾、鎖前讀取與編輯/確認競爭。
- [x] frontend/src/features/goods_receipt/pages/GoodsReceiptsPage.test.tsx：真實操作新增／編輯／確認、保留錯誤輸入、防連點、預填及已確認只讀。
- Given 有效ADMIN或STAFF，when 完成兩筆收貨，then 未確認無庫存、確認後單價/量/位置/效期/操作者/時間正確且不重複。
- Given FR01/02及儲存位置既有測試，when 全套回歸，then 維持通過。

## Implementation Notes

使用者於2026-11-08確認第一階段計畫，已授權實作及feat/goods-receipt分支；不重複要求批准同一計畫。新增只讀選單屬整合實作選擇，不接手master_data寫入。草稿再次開啟採已知單號導航，完整跨單查詢留FR07。若新增需求或schema需要改動才詢問。寫入如受Windows限制，回報具體路徑，勿更改ACL。

## Spec Change Log

## Review Triage Log

|來源|判定|證據與處理|
|---|---|---|
|blind1 清空位置|medium / patch|Mantine clearable 回 null；Number(null)=0。補空值正規化與操作測試。|
|blind2 背景更新|high / patch|useForm 只初始化，乾淨表單不隨 receipt 刷新。同步乾淨表單，保留 dirty 輸入。|
|blind3 回傳 ID 索引|medium / patch|乾淨確認使用刷新 receipt，舊表單行數可能不同。與 blind2 同根因，僅保存後套用伺服器明細。|
|blind4 離頁警告|low / rejected|未儲存離頁確會失去輸入，但加入導航 blocker 超過直接修正；規格要求送出失敗保留輸入，既有頁面亦無 guard。|
|blind5 草稿防重送|false / rejected|FR06 與 AD8 的防重送指確認入庫，不承諾草稿 POST 冪等。重試只多草稿、不增加庫存；不自行新增重送系統。|
|blind6 ID 界限|medium / patch|主代理對測試 DB 唯讀呼叫 get/supplier，2**63 與10**100 均得到 DataError；API 加 BIGINT 邊界與測試。|
|blind7 URL 安全整數|medium / patch|detail 缺 Number.isSafeInteger，可能請求不同 ID；與 OpenReceipt 一致檢查。|
|blind8 無效預填|low / rejected|後端已對無效參照回 items.0.ingredient_id；未證實錯誤欄位或寫入。額外提示需新分支，不增加複雜度。|
|blind9 停用標示|low / patch|loading/error 時缺值亦被標停用；成功取得完整選單後才標示。|
|blind10 時間顯示|low / patch|直接顯示 UTC 原字串，改為 Asia/Taipei 可讀格式。|
|edge1 清空位置|medium / patch|同 blind1；clearable Select 與序列化缺 null 分支。|
|edge2 背景刷新|high / patch|同 blind2；乾淨表單跳過 PATCH 而確認新伺服器資料。|
|verification1 dirty 重試缺測|medium / patch|補編輯、PATCH 成功、確認回應遺失、直接重試且保留 ID 的測試。|
|browser1 觸控高度|medium / patch|Chrome 兩尺寸無溢位/JS 錯誤；textarea42px、clear28px。調為44px並重測。|


最終驗證（2026-11-08）：後端424 passed、前端136 passed；Ruff、ESLint、TypeScript/build、import-linter（4 kept/0 broken）皆通過。Alembic check 無新操作、單一0001 head；gen:api 重跑 SHA256 與工作樹型別一致。兩尺寸Chrome測試以測試用途API mock驗證實際AppLayout：1024×768、1366×768均無水平溢位、無pageerror、無低於44px的可操作表單目標，兩筆建立後各一次確認且轉唯讀，零單價與空單價保留。真實資料庫功能另由48個PostgreSQL進貨整合測試驗證，正式資料庫未寫入。

全部保留的審查項目均已修正及補測；AD2純build組裝函式亦補齊。既有auth、Schema、Migration、AI紀錄及圖表未改；未追蹤資料表15檔保留。依使用者限制不建立commit、不push、不刪除檔案。文件中Story3.1與3.2標記review供人工驗收；FR07維持backlog。

## Verification

後端python -m pytest（foodflow_test）、ruff check、lint-imports、alembic check及heads；前端npm run lint/typecheck/test/build/gen:api。完成後核對Git差異、既有AI紀錄未更動及矩陣實際測試結果。必要的檢查可在實作授權下寫入測試DB，不使用正式DB；不執行seed-demo/reset。瀏覽器檢查兩種視窗、觸控尺寸及溢位。
