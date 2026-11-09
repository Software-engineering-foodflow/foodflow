---
title: 'FR-08、FR-09 庫存總覽、批次與異動查詢（Story4.1–4.3）'
type: feature
created: '2026-11-09'
status: done
route: dispatch
baseline_commit: 55e5482fd167f9337627cf4357dabf098662966a
baseline_snapshot: C:/Users/user/AppData/Local/Temp/foodflow-fr08-fr09-baseline-20261109
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/srs.md'
  - '{project-root}/CONTRIBUTING.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="使用者已明確授權接續FR08與FR09">

## Intent

完成Epic4的庫存總覽→食材批次→單批異動與位置歷程唯讀流程，沿用已完成FR06/07、角色與UI。保留目前feat/goods-receipt所有未提交內容，不執行commit/push/merge/rebase/stash/刪檔。auth、goods_receipt模組及其測試、Ledger、DB模型/Migration、共用庫存/效期計算、既有AI紀錄與先前規格皆不改。必要shared路由/queryKeys/generated schema與router掛載可增補；不開發領用、報廢、預警維護或報表，不增加套件或假正式資料。

## Boundaries & Constraints

- inventory現有ledger.py/ledger_sqlalchemy.py必須完整保留。新增同模組router/schemas/service/Repository ABC/SQLAlchemy實作/dependencies純build組裝。Service注入Repository與Clock，無FastAPI/SQLAlchemy/Pydantic、無交易寫入。所有API置/api/v1既有登入主路由，ADMIN/STAFF皆可查，禁止寫入端點。必要聚合資料可回純dataclass，ORM關聯selectinload，避免N+1。
- 總覽必須使用stock_level_stmt(today,location_id)與is_low_stock/shortfall。顯示食材、分類、單位、保存方式、啟用狀態、實體量/可用量/過期量/安全量、全店可用量及低庫存。數量3位十進位字串，不同食材/單位不加總。從未進貨也列0；停用食材歷史仍列，但不低庫存；安全量0不提醒，等於安全量也提醒，全過期仍算實體量。
- 搜尋名稱、分類、保存方式、位置及五狀態NORMAL/EXPIRING_SOON/EXPIRES_TODAY/EXPIRED/LOW_STOCK，條件AND，分頁預設20上限100、頁碼限制安全OFFSET。位置篩選只合計該位置，且必有剩餘批次；低庫存永遠依全店可用量，不因位置誤報。效期篩選取顯示範圍至少一筆remaining>0的相符批次，服務/SQL條件與classify_expiry對照。前端顯示所選位置與「低庫存依全店」說明。
- Clock同次讀取一致today（台北），warning_days讀取既有AlertSetting最小id；不硬編碼天數或在查詢時新增設定。日期/剩餘天數/狀態皆由後端計算（classify_expiry/days_until_expiry），前端只呈現，使用StatusBadge。日期當天到期仍可用，預警天數0及跨日要測。
- 批次逐筆呈現批號、食材/單位、來源進貨單號/供應商/來源明細id、進貨日期/效期/剩餘天數、位置、初始/剩餘量、效期狀態、來源單據狀態；預設expiry_date ASC/received_date ASC/batch_number ASC/id ASC穩定排序。耗盡與已沖銷保留歷史（顯示已耗盡），不算可用或效期篩選。點來源連到既有goods receipt明細，不能另做進貨功能。
- 批次歷程唯讀，數量異動依occurred_at DESC/id DESC列時間/類型/增減量/前後量/操作者/原因/非FEFO與reverses_transaction_id原紀錄；位置歷程另區含前後位置、員工/時間/原因。同時間排序穩定。數量與位置各自分頁，不能一次無限載入；不存在食材/批次404，參數錯誤422（ID正BIGINT上界），空歷程正常空結果，不泄漏password/token或不屬FR09的報廢損失金額。
- 建議API：GET /inventory（query search/category_id/storage_method/location_id/status/page/page_size）；GET /inventory/options/{kind}（categories/locations含歷史停用資料，分頁）；GET /inventory/{ingredient_id}/batches（可location_id、預設含耗盡）；GET /inventory/batches/{batch_id}；GET /inventory/batches/{batch_id}/transactions；GET /inventory/batches/{batch_id}/location-changes。路徑設計避免參數路由吞靜態路徑，精確更新路由白名單與gen:api。
- UI沿用Mantine forest/AppLayout/PageHeader/Paper/Alert、44px主要操作、兩尺寸無頁面水平溢位。可透過食材卡片的查看批次及獨立批次歷程頁完成展開；返回要保留各層篩選/分頁。filters URL可分享，頁碼非法正規化/資料減少回有效頁、載入/空結果/錯誤/重試明確；不要把成功舊查詢當本次結果。大數量名稱/原因需換行。
- 元件→hooks→api→shared/client；query key全集中shared/api/queryKeys.ts且以inventory為root，既有invalidateStockQueries將自動更新此功能。歷史選單讀inventory自有唯讀API，不import其他feature api；只重用hook可行。前端不得直接fetch或自行算庫存與日期狀態。不得新增預警管理或資料修改按鈕。

## I/O & Edge-Case Matrix

|情境|輸入|預期|
|---|---|---|
|基準|兩批5/8，後扣至2/7且第一批過期|起初13/13/0；跨日9實體/7可用/2過期，安全10低庫存|
|位置|不同位置各有庫存|只計當前位置數量，低庫存仍全店，效期符合該位置顯示範圍|
|邊界|無批次/全過期/等於安全量/安全0/停用食材|數量正確、僅應提醒者低庫存；不按不同單位加總|
|效期|過期/今日/即期臨界/正常、T0|SQL篩選與共用classify一致，零量不符合效期篩選|
|歷史|耗盡/進貨沖銷/換位置/非FEFO|歷史可查、來源可連，REVERSAL顯示原紀錄，位置獨立分頁|
|無效|未知食材或批次/錯誤及超大ID/過大頁碼|404/422，無500|
|權限|兩角色/未登入/停用/過期或舊Token|角色皆可讀，其餘401；無新增修改刪除端點|
</frozen-after-approval>

## Code Map

- backend/app/db/queries/stock_levels.py：現成聚合；domain/expiry.py、stock.py：唯一效期/低庫存規則，不更改。
- backend/app/db/models/inventory.py、master_data.py、goods_receipt.py、alert_setting.py：讀取關聯；Ledger唯讀不能修改其實作。
- backend/app/modules/inventory/：新增查詢分層；core/dependencies.py的get_session/get_clock既有唯一定義。
- frontend/src/features/inventory/pages/InventoryPage.tsx：目前佔位；app/router.tsx/shared/routes.ts擴充前端路由，保留所有其他feature。
- shared/ui/StatusBadge.tsx與statusBadgeMap.ts：效期/低庫存顯示，耗盡獨立gray文字Badge。
- backend/tests/integration/factories.py、tests/fakes/fake_stock_ledger.py：可用Ledger製造測試收貨/扣量/盤點/移位，不需等待其他功能。
- FR06/07規格皆done、Sprint3.1–3.4 review；最近完整基準449後端/148前端。不可為通過測試移除既有斷言，僅調整inventory佔位路由測試為功能行為。

## Tasks & Acceptance

- [x] backend/app/modules/inventory/{repository,repository_sqlalchemy,service,schemas,dependencies,router}.py及main.py：唯讀API、共用規則與穩定分頁。
- [x] frontend/src/features/inventory/新增api/hooks/頁面元件，app/router.tsx/shared/routes.ts/queryKeys.ts/gen schema：完整總覽→批次→兩種歷程及來源導航。
- [x] backend/tests/unit/與integration新增inventory查詢測試：矩陣全覆蓋；有對照食材/分類/位置驗證AND排除與count；SQL日期篩選對照純函式；真PG每API兩角色與401、GET不改DB資料；大頁碼/關聯載入。
- [x] frontend/src/features/inventory/操作測試：filters/分頁/返回、載入失敗重試/空結果、狀態與單位、耗盡/沖銷來源/兩歷程/非FEFO/兩角色/無寫入按鈕，快取失效涵蓋inventory新key。
- Given 既有FR06/07與登入功能，when 完成全套回歸，then 仍全部通過；Given 1024×768/1366×768，when 搜尋與查看批次歷程，then 無水平溢位且主要操作44px。

## Implementation Notes

使用者明確授權完整FR08/09（同一庫存追查目標），沒有需要新增Migration或外部動作的未決問題；保留既有髒工作樹，沿目前分支，不切換/提交。實際專案僅C:/Users/foodflow-sideproject/foodflow；所有shell明確workdir，不在不存在的舊Downloads路徑建立副本。pytest basetemp及UV_CACHE_DIR使用backend/.pytest_cache下新目錄，禁止留下未追蹤cache或改ACL；python使用backend/.venv/Scripts/python.exe -B -m，lint-imports需python呼叫importlinter.cli.lint_imports_command（舊launcher失效）。資料庫測試先使用既有conftest確認_test，勿寫正式DB或seed/reset。UTF8存檔，PowerShell轉Python中文需處理編碼。主代理將負責最後瀏覽器與獨立審查。

## Spec Change Log

## Review Triage Log

|來源|判定|證據與處理|
|---|---|---|
|blind1 BIGINT序列化|medium / patch|新API回傳number可能使JS對超過2^53的ID四捨五入；新inventory回應ID改十進位字串並測精度，輸入仍支援正BIGINT。既有goods receipt超大ID UI限制不擴大修改。|
|blind2 常駐頁更新|low / rejected|架構已明訂staleTime0、focus及庫存異動失效；UI明示計算日期，未承諾輪詢或午夜推送。新增計時器超過直接修正，不擴增需求。|
|blind3 全量選單成本|low / rejected|單店分類/位置選單逐頁取回以保留完整歷史；改成遠端搜尋/增量UI需新增流程，未有本專案規模造成延遲證據。補第二頁回歸測試。|
|blind4 批次位置選單錯誤|medium / patch|位置選單失敗缺提示與重試，名稱永久中性；補局部錯誤/重試，保留批次資訊。|
|blind5 分頁可讀名稱|low / patch|兩歷程Pager皆同名，加入各區可讀名稱及控制按鈕名稱。|
|blind6 清除篩選名稱|low / patch|四個清除控制同名，按分類/保存方式/位置/狀態區分。|
|blind7 全層頁碼返回缺測|medium / patch|補非預設batch_page/tx_page/location_page逐層往返並保留overview篩選。|
|blind8 同時修正分頁缺測|medium / patch|兩區各自setParams，補兩個total同時縮減的最終頁碼/父篩選不遺失測試；必要時小修狀態更新。|
|blind9 排序同值缺測|medium / patch|補到期日/進貨日相同、批號次序異於插入順序與跨頁穩定性。batch_number本身唯一，完全相同批號/id排序平手不可達。|
|blind10 聚合數量契約|medium / patch|兩個合法單批可累積超過9位整數；實際序列化無上限但OpenAPI套單批pattern。聚合欄位改適合彙總的十進位字串Schema並測大總量。|
|edge1 BIGINT|medium / patch|同blind1，識別碼保留字串避免導航到不同資源。|
|verification1 選單第二頁|medium / patch|預先驗證缺口：原fixtures僅0/1筆，不會偵測聚合只取首100筆；新增第二頁選用。|
|verification2 歷程真值|medium / patch|預先驗證缺口：新API未逐值比對delta/before/after與from/to；補實際PG持久化值斷言。|


完成紀錄（2026-11-09）：Story4.1–4.3已完成庫存總覽、食材批次及單批數量/位置歷程唯讀查詢。各層URL與分頁保留、來源連既有進貨明細、耗盡及沖銷歷史保留，兩角色皆可查。聚合及低庫存/效期共用既有規則；位置數量限定所選範圍，低庫存仍全店。沒有新增Schema/Migration/套件或修改正式資料庫。

審查修正：新inventory回應ID均以十進位字串保留BIGINT，新增精確大ID導航及PG測試；聚合量使用無單批9位整數限制的三位小數字串契約。加入位置名稱載入失敗/重試、各區分頁與清除控制名稱，並測百筆以上選單、全層非預設頁碼、兩個歷程分頁同時縮減、跨頁排序平手及歷程delta/before/after與from/to實值。既有goods receipt超大ID頁面限制屬前輪功能，未擴大修改其協定。

最終主代理驗證：後端495 passed（58.00秒，foodflow_test真PostgreSQL），前端169 passed／11 files（預設測試指令，10.37秒）；Ruff、ESLint、tsc/build、import-linter（4 kept/0 broken）、Alembic check無差異與單一0001 head均通過。gen:api重跑前後SHA256一致，git diff --check通過。build僅有既有類型的大型chunk提示。

Chrome實際AppLayout以測試用途API mock檢查1024×768與1366×768、ADMIN/STAFF四組：總覽→批次→兩歷程→返回保留條件，來源進貨連結正確，無頁面水平溢位、無pageerror、主要操作皆44px，僅有GET及唯讀畫面。資料庫正確性/權限/GET不修改資料另由真PG整合測試覆蓋。

使用者禁止自動commit/push/merge/rebase/stash及刪檔，未執行。FR06/07及登入程式、其原有測試、Ledger、DB模型/Migration、共用計算、AI紀錄與資料表均保留；Epic4三個story標為review等待人工驗收，父Epic維持in-progress。

## Verification

pytest全套（foodflow_test）、Ruff、import-linter、Alembic check/heads、前端lint/test/typecheck/build/gen:api重跑一致性、兩尺寸Chrome與兩角色操作、git diff --check與保護檔hash核對。現有單一FR06長流程測試已15秒，保留設定與全部斷言。最終只更新本spec與自己Epic4三個story狀態為review，人工驗收後才合併。
