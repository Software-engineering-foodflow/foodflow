---
title: 'FoodFlow 報廢、異動統計與交付文件'
type: 'feature'
created: '2026-11-06'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '5a673669e2e407e526efb1ed55ce22980847ae9e'
context:
  - '{project-root}/_bmad-output/specs/spec-westgvva-inventory-management/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-westgvva-inventory-management/acceptance.md'
  - '{project-root}/docs/srs.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md'
---
<frozen-after-approval reason="使用者已授權接續規格與實作">
## Intent
完成郭明儒 Westgvva 的報廢 FR-15、異動 FR-17、統計 FR-18 與 A 文件、110秒個人講稿。使用者明確授權全部工作接續執行，接受多項交付，不需逐步批准。FR-16 已列主規格，但同量改回驗證規則正在等待使用者答覆，本輪先完成不受影響部分，FR-16仍是整體必要交付，不能宣稱完成。
## Boundaries & Constraints
Always：在 C:/Users/USER/Documents/GitHub/foodflow、feat/westgvva-inventory-management 操作，保留現有工作；SRS v3與架構、現有schema/auth/StockLedger/UoW/Clock/Decimal及共用UI。資料表與StockLedger契約不變。真實資料存取，空資料誠實顯示。
Never：commit/push/merge/deploy；G彙整與AI講稿內容；重做隊友進貨/領用/主檔/預警/庫存完整頁。尚未執行測試或人工驗收不得稱通過。
## I/O & Edge-Case Matrix
| Given | When | Then |
| --- | --- | --- |
| 批次2公斤單價120 | 報廢2、原因過期 | WASTE及WasteRecord同交易，剩0，成本240，歷史保留 |
| 未知單價或停用食材 | 報廢 | 成本NULL，停用既有庫存仍可報廢 |
| 原因空或OTHER無說明、0/負量/四位小數 | 提交 | 422欄位提示；不修改庫存 |
| 報廢超量或併發超量 | 提交 | 409最新量，無負庫存/半套紀錄 |
| 已成功key | 同內容重送／改內容 | 原結果200／409 DUPLICATE；含原因/說明及操作人安全比對 |
| 員工 | 報廢回應或報廢分布API | 回應不含loss_amount；分布403 |
| 全數報廢對話框已開 | 別人先扣量後確認 | 不偷改提交量；409顯示最新量，重新核對；新開框新key |
| 日期/食材/批次/類型/操作者 | 查異動 | 分頁，完整來源/前後量/原因/非FEFO；位置另區塊，沖銷原紀錄可追溯 |
| 跨期沖銷、期間無異動期初非零 | 查統計 | 按確認時間歸原類型，期初非零仍列，公式平衡 |
| 台北起日00:00與迄日次日00:00 | 查詢 | 起含迄不含；非法日期範圍422 |
| 同分類不同單位、未知成本 | 報廢分布 | 按鍵及unit分組，已知金額合計、未知筆數、明細可核對 |
</frozen-after-approval>

## Code Map
- backend/app/modules/inventory/ledger.py、ledger_sqlalchemy.py：唯一庫存寫入、lock_batches、find_operation、deduct；沿用，不自行改quantity。
- backend/app/core/{dependencies,idempotency,uow,clock,types,errors}.py：get_idempotency_key、check_replay、UoW transaction、taipei_day_range、round_money、Decimal字串與DomainError；FakeUnitOfWork不會還原fake資料，真回滾必用PostgreSQL。
- backend/app/db/models/{inventory,waste,goods_receipt,master_data}.py：既有12表，關聯lazy=raise；repository明確載入。
- backend/app/modules/auth/dependencies.py：get_current_employee與require_admin是真實認證，已有cookie/角色；main.py統一掛登入保護。
- frontend/src/shared/api/{client,queryKeys}.ts：request及invalidateStockQueries；新增查詢鍵集中此處。
- frontend/src/features/auth/hooks.ts：useCurrentEmployee；頁面僅用hooks；hooks只調api；不得跨feature import api、元件不得import client。
- frontend/src/shared/hooks/useIdempotencyKey.ts：key/rotate；成功或修改內容更換，網路重試保留。
- frontend/src/app/router.tsx、shared/routes.ts：目標路由已接佔位頁，RequireLogin不等於管理者守衛。
- frontend/src/shared/api/schema.d.ts：以npm.cmd run gen:api生成，不手寫；backend/tests/unit/test_api_conventions.py路由白名單需隨新增路由更新。
- frontend/src/test/renderApp.tsx、app/router.test.tsx：有佔位文案及API stub需調整，既有測試風格可沿用。

## Tasks & Acceptance
勾選表示程式／文件已交付；不表示真 DB 或人工驗收已通過。測試驗收項仍未勾選，原因與證據見 Verification。
- [x] backend/app/modules/waste/{repository,repository_sqlalchemy,service,schemas,dependencies,router}.py：實作報廢與唯讀批次選擇（可獨立讀既有表，不接管inventory的FR08/09），必要列表/明細。Service鎖→防重送→規則→帳本及報廢紀錄同交易；分角色schema防成本洩露。
- [x] backend/app/modules/reports/{repository,repository_sqlalchemy,service,schemas,dependencies,router}.py：異動、單筆追溯、位置變更、期初期末、管理者報廢分布與明細；以原異動歸類沖銷。若支援報廢沖銷資料則數量及金額一致於其實際確認日，避免原紀錄和沖銷雙算。
- [x] backend/app/main.py、tests/unit/test_api_conventions.py：登錄路由，維持統一錯誤與安全契約。
- [x] frontend/src/features/waste/{api.ts,hooks.ts,components/,pages/}：真資料批次選擇與URL預選、報廢表單/清單、共用全數報廢hook/dialog（給隊友Epic7.4接入）；錯誤保留內容、pending防連按、成功失效快取。
- [x] frontend/src/features/reports/{api.ts,hooks.ts,components/,pages/}：異動五篩選分頁、位置獨立、來源與原異動連結；全員庫存報表、管理者分布展開。批次詳情隊友未完，可提供本頁批次異動篩選及既定inventory連結，不能假裝對方頁完成。
- [x] frontend/src/shared/api/{queryKeys.ts,schema.d.ts}、app/router.test.tsx與feature測試：生成型別、更新測試及查詢鍵。
- [ ] backend/tests/unit/及integration/新增規則、角色/API、日期邊界/沖銷/單位/未知成本、防重送/真回滾及併發測試。Fake不能代表真DB驗證。
- [x] docs/a-project-management.md、docs/westgvva-presentation.md、docs/westgvva-verification.md：沿docs格式完成A、110秒含AI待補時間講稿、命令結果/限制/啟動與手動驗收/commit建議與PR。team-tasks.md僅修正本人帳號Westgvva；計畫日期引用原表，未知待確認，其他組員狀態不猜測。
- [x] _bmad-output/implementation-artifacts/sprint-status.yaml：只更新本人已實作stories 6.1/6.2/8.1/8.2/8.3及對應epic，未驗證不可標done；6.3仍待本次規則答覆。
- Given預警/進貨/領用/庫存完整功能尚未實作，When交付，Then明列隊友依賴，交付共用報廢介面，不宣稱整條流程驗收。
- Given全部變更，When驗證，Then如實列已跑結果、失敗及未跑原因；人工尺寸驗收未執行標待驗。

## Implementation Notes
2026-11-07：本次切片程式與文件已實作，保留 in-progress 等待主代理 diff/review、真 PostgreSQL 與人工尺寸驗收。新增 waste/reports 六層模組、報廢表單與共用全數報廢 hook/dialog、異動/位置/期初期末/管理者分布介面、API 型別及規則/行為/DB 測試。未實作 FR-16，未改 schema/StockLedger，未 commit/push/merge/deploy。完整交接見 [驗證紀錄](../../docs/westgvva-verification.md)。
2026-11-06：主規格已完成兩輪自查；本規格為其不受盤點待答問題影響的實作切片。初始乾淨；目前只有本次規格新增。後端uv sync --locked成功。前端npm.cmd ci由主代理執行中；Node24.22.0。Docker不在PATH且預設安裝位置不存在，psql/pg_ctl未找到；不可擅自下載或安裝大型資料庫，先保留並嘗試測試，環境阻擋如實報告。Windows用npm.cmd/npx.cmd避免npm.ps1政策；rg讀檔中文正常。唯讀沙箱寫入需適當escalation，不可繞過；可直接編輯已授權本任務檔案但仍遵守工具審批。
## Spec Change Log
2026-11-08 B2：原每次開框新key的描述未區分「新操作」與「結果未知的舊操作」。依防重複提交意圖補明後者先重試原快照/key；已記錄於memlog並重新衍生SPEC/acceptance。KEEP：四種原因、原快照、不超扣、既有server idempotency、明確409後重新核對、成功才失效查詢。只更新該路徑，不回復其他成果。
## Review Triage Log

| ID／來源 | verdict | 路由與證據／處置 |
| --- | --- | --- |
| B1 盲審：pending切換批次 | high | patch；選擇按鈕會卸載帶key的表單，風險成立。頁面透過共用mutation狀態禁用切換及其他報廢入口，回歸測試確認不重送。 |
| B2 盲審：未決全數報廢重開換key | high | bad_spec；網路錯誤不能判斷是否提交，丟key可能重扣。補明結果未知時重開仍保留原快照/key，鎖定原因，先重試同筆；成功或明確業務拒絕才結束，測試通過。 |
| B3 盲審：金額schema位數 | medium | patch；Money描述10位整數而DB/service容許12位，確有不符。改模組專用LossAmount輸出型別，測10000000000.00與公開pattern一致，重新生成前端型別。 |
| B4 盲審：boolean批次ID | high | patch；Pydantic會將true轉1，已改strict正整數，測true、字串與float皆422且不寫入。 |
| B5 盲審：兩個列表分頁互相重設 | medium | patch；effect原依所有URL參數重設表單/位置頁，翻數量頁會丟草稿。改僅依已套用篩選，測未提交輸入及位置頁保留。 |
| B6 盲審：UTC原字串與台北篩選不一致 | medium | patch；午夜資料顯示的日期確會與選取日期不同。共用Intl明確Asia/Taipei，數量/位置/報廢/分布使用，跨午夜測試通過。 |
| B7 盲審：讀全部歷史與明細擴展性 | maybe-false | defer（若超出效能目標則medium，未驗證）；目前讀取量隨歷史增加屬實，但沒有實測超出SRS目標。NFR-07排期末、負責人待確認，保留負載/記憶體限制，不在本次增加SQL聚合與分頁共用契約。 |
| B8 盲審：來源只連進貨單而非報廢紀錄 | false | schema已給批次原進貨單/明細、operation_group_id、異動ID及原因，符合現行FR-17來源單據追溯；報廢紀錄以transaction_id關聯，管理者分布明細已有waste_record_id。未發現要求把來源單據連結改為報廢紀錄的既有契約，原連結並非錯誤來源。 |
| B9 盲審：真DB與Alembic證據缺少 | medium | defer；baseline即無TEST_DATABASE_URL/database_url/JWT_SECRET，已實際嘗試並失敗在setup；不假稱通過，也依使用者限制不安裝DB或改環境。 |
| B10 盲審：6.3仍backlog | low | patch；追蹤表與實作狀態不同，現改in-progress，仍不標done。 |
| E1 邊界：pending切換後重送 | high | patch；與B1同根因，保留此獨立判定列；同一修正與回歸案例涵蓋。 |
| E2 邊界：true轉批次1 | high | patch；與B4同根因，strict ID及無寫入斷言涵蓋。 |
| E3 邊界：分組鍵/單位串接碰撞 | medium | patch；(1,2kg)與(12,kg)會同鍵。使用JSON tuple，兩面板獨立展開的測試通過。 |
| V1 驗證：零和資料遮蔽正負號 | medium | patch；採信審查對測試的搜尋證據，新增非零領用/報廢/正負調整與跨期沖銷，逐欄及公式斷言通過。 |
| V2 驗證：篩選無排除資料 | medium | patch；新增不同食材/批次/操作者資料，三條件分別測數量/位置結果及分頁前total；已收集，真DB執行仍受B9阻擋，不能寫成已驗證SQL。 |
| V3 驗證：三種分組資料無法區別 | medium | patch；新增同單位、不同食材/分類/原因，逐種比對鍵、標籤、數量、成本、未知數及明細歸屬，通過。 |
| M1 主流程：盤點query key分散 | low | patch；移至既有queryKeys.stocktake.batches，快取失效契約不變。 |
| M2 主流程：路由fixture未stub盤點 | low | patch；補盤點空列表回應，避免頁面掛載測試只驗heading卻背景404。 |
| M3 主流程：API清單註解仍稱無業務端點 | low | patch；只修正已修改測試檔的過時註解。 |

分組處置：B1/E1、B4/E2分別共用根因；其餘保留獨立處置。B2先補規格，再針對該hook與對話框修正；保留所有既有成果，依使用者續作指示不回復整個工作樹。原實作代理已因交接等待而停止，後續修正及驗證由主流程完成。

## Design Notes
2026-11-07：unknown_cost_count 定義為區間內未知成本事件數，原報廢與沖銷各為事件，UI/文件不稱為兩筆報廢。報表採獨立輸出 Decimal 型別，允許負值及超過單筆位數。報廢 repository 用 transaction advisory lock 序列化相同 key（包括不同批次的併發請求），再依既有 StockLedger 鎖批次及比對重送；此 PostgreSQL 實作仍待真 DB 驗證。
報表讀跨表合法，模組不得呼叫其他Service/Repository（StockLedger/auth例外）。明細成本權限務必在伺服器去除欄位。查詢日期可以由使用者填寫，無需前端自行算業務日期。未知成本與真正0元區分。測試表單網路重試key不變與失敗後保留輸入。
## Verification
2026-11-07 修改後：backend unit 149 passed/2.68s，ruff 通過，lint-imports 4 kept/0 broken，alembic heads=0001。新增 integration 7 案例及全部204案例均已嘗試，首個setup因TEST_DATABASE_URL未設定而阻擋；alembic check缺database_url/JWT_SECRET。frontend gen:api/lint/tsc通過，最終10檔110 tests passed/4.24s，build通過（643.43kB JS，保留500kB提示）。兩種尺寸人工驗收未執行，FR-16待答，隊友預警/進貨/領用/完整庫存整合未驗。詳細命令、基準、中間失敗及重現步驟見驗證紀錄。
- backend：uv run pytest tests/unit；uv run pytest tests/integration；uv run ruff check .；uv run lint-imports；uv run alembic check；uv run alembic heads。
- frontend：npm.cmd run gen:api、npm.cmd run lint、npx.cmd tsc --noEmit、npx.cmd vitest run、npm.cmd run build。
- 真DB或其他環境不可用時記錄實際失敗與重現步驟，不放寬斷言、不用假實作頂替。


## 2026-11-08 續作與審查範圍

上文第一切片的 FR-16 待答描述是歷史狀態。依原始使用者嚴格要求與自主續作指示，已完成 [盤點規格](spec-westgvva-stocktake.md) 的實作，採數量＋最新異動編號拒絕舊預覽（包含同量改回）；不改 schema 或 StockLedger 契約。此規格與盤點規格共同作為本次全差異審查 claims。

主流程修正 waste/reports API_PREFIX 遺漏及全數報廢409後未更新批次快取，補回歸測試。2026-11-08 主流程驗證：backend 181 passed/6.00s；frontend 11 files/120 passed/8.28s；gen:api、eslint、tsc+Vite及4項分層契約通過。Ruff初次有3處行長，限盤點檔案格式化後通過。新增盤點DB7案收集成功，但setup缺TEST_DATABASE_URL（1 error/0.37s），未驗證交易行為。詳細證據見 docs/westgvva-verification.md。

## 最終交付狀態（2026-11-08）
程式、文件與三路審查及修正已交付；status保留in-review以明示真DB/人工/隊友整合尚待驗收。最終backend189 passed/6.37s；frontend12 files/125 passed/5.17s；Ruff、4個分層契約、eslint、生成API型別、tsc與Vite通過。17個新增DB案例已收集；setup缺TEST_DATABASE_URL，未宣稱通過。保留500kB chunk提示（651.94kB）。未commit、push、merge或部署。
