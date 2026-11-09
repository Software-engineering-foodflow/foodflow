---
title: 食序 FoodFlow－Westgvva 實作與驗證紀錄
status: partial-verification
updated: 2026-11-08
owner: 郭明儒（Westgvva）
---

# Westgvva 實作與驗證紀錄

## 1. 範圍與狀態

依[本次規格](../_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md)完成 FR-15～18 的後端、前端、測試及文件實作；FR-16 詳見[盤點規格](../_bmad-output/implementation-artifacts/spec-westgvva-stocktake.md)。真資料庫、人工操作及隊友整合仍待驗，不能宣稱完整驗收完成。

工作分支：`feat/westgvva-inventory-management`。保留原規格與工作；沒有 commit、push、merge、deploy。未改資料表、migration、StockLedger 契約，也未重做隊友功能。

## 2. 實作內容與契約

- `backend/app/modules/waste/`：同交易報廢紀錄與 WASTE 帳本；明確正數、三位小數；OTHER 補充說明；沿用 Clock、Decimal、ROUND_HALF_UP、UoW、StockLedger。停用食材既有庫存可報廢。
- 同 key 先序列化、鎖批次、再查重送，內容包含批次、數量、原因、正規化說明及操作者。成功重送回原紀錄與原 `quantity_after`；異內容為 409 DUPLICATE。
- PostgreSQL transaction advisory lock 以 UUID 的前 64 bits 序列化同 key，防止「同 key 同時提交不同批次」繞過防重送。碰撞只會額外等待；鎖隨交易釋放。此鎖僅供本報廢模組，未變更帳本。換資料庫時須替換這個 repository 實作。
- 報廢 API 分員工／管理者 schema：員工 POST、清單、明細皆不含 `loss_amount`；分布 API 需管理者。未知金額是 NULL，真 0 元是 0.00。
- `backend/app/modules/reports/`：五項篩選與分頁、單筆異動追溯、位置變更獨立清單、期初期末與報廢分布。數量來自帳本，沖銷歸原類型並依實際異動時間計算。
- 日期採 Asia/Taipei 起日含、迄日次日不含；兩端需成對，起日晚於迄日或無法計算次日回 422。報表數量與金額輸出接受負值及超過單筆輸入上限的合計字串。
- 報廢分布按「分組鍵＋unit」分開，已知金額加總可為負；`unknown_cost_count` 是**區間內未知成本事件數**，原報廢與沖銷同期間算兩個事件，不代表兩筆不同報廢。明細以 transaction_id 區分，保留原異動連結。
- 前端 `features/waste`：批次搜尋／分頁與 URL 預選、表單／歷史、全數報廢快照對話框；失敗保留輸入、重試沿用 key、修改／成功換 key、pending 防連按、成功失效七類庫存查詢。
- 前端 `features/reports`：數量與位置分區、來源與批次歷程連結、全員數量統計、管理者分布與明細；空資料不造假。
- `schema.d.ts` 由 OpenAPI 產生；查詢鍵集中於 `queryKeys.ts`。

### 隊友接入全數報廢

從 `features/waste/hooks.ts` 匯入 `useFullWaste`、`useWasteBatch` 與型別；從 `features/waste/components/FullWasteDialog.tsx` 匯入元件。以伺服器批次資料呼叫 `state.open(batch)`，並渲染 `<FullWasteDialog state={state} />`。若預警資料形狀不同，先以 `useWasteBatch(batch_id)` 取得批次再開框；不跨 feature import api。

新操作開框複製剩餘量並預設 EXPIRED、取得新 key。結果未知的舊操作關框重開仍保留原快照、原因與 key，先重試該操作；明確結束後才開始新的報廢。API 不接受「全部」語意，只接受當次核對的明確數量。409 顯示最新量，關框、更新批次查詢並重新核對後再開框，不在送出時偷偷換量。

Story 7.4 預警接入、進貨／領用完整 UI、完整庫存批次頁仍是隊友依賴。現有庫存／進貨路由連結僅為既定交接入口，本次不代表其明細頁已完成；本報表內的批次異動篩選與原異動明細可獨立使用。

## 3. 修改前基準（主代理提供）

以下為主代理於 2026-11-06 實際執行並回報的結果，與本次修改後測試分開記錄：

| 命令／檢查 | 基準結果 |
| --- | --- |
| `uv sync --locked` | 成功 |
| `npm.cmd ci` | 成功，248 套件，31s；本代理未重複安裝 |
| `uv run pytest tests/unit` | 109 passed，2.34s |
| `uv run pytest tests/integration -x` | collected 197；test_auth_and_write.py 首個 setup 因 TEST_DATABASE_URL 未設定而失敗，1 error／0.50s |
| `uv run ruff check .` | 通過 |
| `uv run lint-imports` | 4 kept／0 broken |
| `npm.cmd test` | 8 files／103 passed，4.16s |
| `npm.cmd run lint` | 通過 |
| `npm.cmd run build`（含 tsc） | 通過；JS 615.70kB，已有大於 500kB chunk 提示 |
| `uv run alembic heads` | 0001 (head) |
| `uv run alembic check` | Settings 缺 database_url、JWT_SECRET |
| 本機環境 | Node 24.22.0；Get-Service 未找到 postgres/docker、Program Files 無 Docker/PostgreSQL、預設 Docker 路徑不存在；psql/pg_ctl 未找到 |

## 4. 修改後執行結果（2026-11-07）

命令工作目錄分別為 `backend/` 與 `frontend/`。使用既有安裝；未下載或安裝大型資料庫。

| 命令 | 實際結果 | 判定 |
| --- | --- | --- |
| `uv run pytest tests/unit` | 149 passed，2.68s | 通過 |
| `uv run ruff check .` | All checks passed | 通過 |
| `uv run lint-imports` | 84 files、279 dependencies；4 kept／0 broken | 通過 |
| `uv run pytest tests/integration/test_waste_reports.py -x` | collected 7；首個 persistence 測試 setup：TEST_DATABASE_URL 未設定，1 error／0.28s | 阻擋，案例尚未執行 |
| `uv run pytest tests/integration -x` | collected 204；首個 test_auth_and_write setup 同原因，1 error／0.45s | 阻擋，非通過 |
| `uv run alembic heads` | 0001 (head) | 通過，仍單一 head |
| `uv run alembic check` | Settings 缺 database_url、JWT_SECRET；未進入 DB schema 比對 | 阻擋，非無漂移證據 |
| `npm.cmd run gen:api` | OpenAPI 匯出及 openapi-typescript 成功 | 通過 |
| `npm.cmd run lint` | 無錯誤 | 通過 |
| `npx.cmd tsc --noEmit` | 無錯誤 | 通過 |
| `npx.cmd vitest run` | 最終 10 files／110 passed，4.24s（URL 篩選同步修正後重跑） | 通過 |
| `npm.cmd run build` | 最終 tsc、Vite 成功；JS 643.43kB（gzip 195.65kB），CSS 274.73kB | 通過，但保留 >500kB chunk 提示 |
| 1024×768／1366×768 實機人工操作 | 未執行 | 待驗 |
| 真 DB 的持久化、回滾、競態及端到端展示 | 無可用 DB 設定 | 待驗 |

中間失敗亦保留：第一輪後端 148 passed／1 failed，架構檢查將回應 schema 的同名 keyword 當作庫存寫入，已改為映射序列化，檢查規則未放寬。第一輪前端 105 passed／5 failed，測試的精確 label 查詢不適用 Mantine 必填星號及同名 listbox；改用具名 textbox／combobox 後新增 7 個案例通過，完整 110 個亦通過。上述修正沒有刪除案例或降低業務斷言。

收尾修正讓報表 URL 切換時同步篩選輸入；完整 frontend lint、tsc、Vitest、build 已再次通過。整合競態測試保留預載物件參照，以確實驗證 identity map 的舊值；最終 Ruff 與 `git diff --check` 通過。沒有因為 DB 不可用而改成 skip 或降低斷言。

### 測試對照

| 驗收項目 | 自動測試 | 狀態 |
| --- | --- | --- |
| 全數報廢、240 元、停用食材、NULL／0／四捨五入 | test_waste.py | 單元通過 |
| 非法數量／原因、OTHER 說明、超量回最新值 | test_waste.py | 單元／API 通過 |
| 同 key 重試／改數量、原因、說明、操作人、批次 | test_waste.py | 單元／API 通過 |
| 員工 create/list/detail 無成本、分布 403 | test_waste.py | API 通過 |
| 台北邊界、跨期沖銷、期初非零無當期異動、公式平衡 | test_reports.py；test_waste_reports.py | 純邏輯通過，SQL 待驗 |
| 按鍵與單位分組、未知事件數、負金額、大合計 | test_reports.py；test_waste_reports.py | 純邏輯通過，SQL 待驗 |
| 真持久化、flush 後失敗全回滾、同批次／同 key 競態 | test_waste_reports.py（7 案例） | 已嘗試，DB setup 阻擋 |
| 網路重試 key、修改換 key、失敗保留／pending、快取失效 | waste.test.tsx | 通過 |
| URL 預選、全數報廢快照與衝突重開、新 key | waste.test.tsx | 通過 |
| 員工報表權限、五篩選、管理者展開沖銷 | reports.test.tsx | 通過 |

## 5. 重現與啟動

1. 在已安裝 PostgreSQL 或 Docker 的環境，依 [README](../README.md) 與 `.env.example` 設定根目錄 `.env`：DATABASE_URL、名稱以 `_test` 結尾的 TEST_DATABASE_URL、至少 32 bytes 的 JWT_SECRET。不得把測試指向正式資料庫；整合 fixture 會清空測試表。
2. 若採既有 Docker 方式，在專案根目錄執行 `docker compose up -d --wait`。本次未替使用者安裝 Docker。
3. 在 backend 執行 `uv run alembic upgrade head`、`uv run python -m app.cli create-admin`。用互動提示建立帳號，不將密碼寫入命令列。
4. 可在非 production 的空資料庫執行 `uv run python -m app.cli seed-demo`；本次不執行 reset。
5. backend 執行 `uv run uvicorn app.main:create_app --factory --reload`；frontend 執行 `npm.cmd run dev`。登入後開啟 `/waste-records`、`/stocktakes` 或 `/reports`。
6. DB 可用後重跑本文件第 4 節全部 backend 檢查，特別是新增整合檔與完整 integration。需要完整列出所有阻擋案例時去除 `-x`。
7. demo 跨日可依 README 設定 APP_FIXED_NOW，務必驗證該時間下登入及一次寫入仍成功。完成後以 `uv run python -m app.cli verify-stock` 核對帳本。

## 6. 人工驗收步驟（全部待驗）

| 操作 | 預期結果 |
| --- | --- |
| 在 1024×768、1366×768 登入員工 | 報廢與報表可觸控；表格可水平捲動，無必要操作只在 hover |
| URL 帶實際 batch_id、搜尋食材／批號、翻頁 | 正確載入批次、位置、餘量與單位；不存在顯示錯誤 |
| 2 公斤、單價 120，輸入 2／過期 | 剩 0、歷史保留；管理者見 240.00，員工回應無成本欄位 |
| 未知單價、0 元單價、停用食材 | NULL 顯示未知、0 元保留 0.00；停用仍可報廢 |
| 提交 0／負數／四位小數、OTHER 空白 | 422 與欄位提示；資料不變 |
| 斷網、恢復後同內容重試；再更改內容 | 原 key 重試不重複；更改後新 key，失敗不清空 |
| 開全數報廢框後另一連線先扣量 | 原快照提交，409 顯示最新量；重新核對重開，才提交新快照 |
| 五項篩選、翻頁、來源與原異動連結 | 欄位完整、前後量與原因／非 FEFO 可查；位置在獨立區塊 |
| 查台北起迄邊界、跨期沖銷、無當期異動食材 | 邊界正確、淨額依原類型，期初非零仍出現且公式平衡 |
| 管理者按食材／分類／原因展開分布 | 單位分開，負值沖銷一致，已知金額與未知事件數可由明細核對 |
| 重啟後查看／verify-stock | 成功紀錄仍存在、數量等於帳本合計 |
| 預警組員接入 hook/dialog | 實際預警刷新；本次尚未驗證整條進貨→領用→預警→報廢 |

## 7. 未完成與限制

- FR-16 已實作嚴格舊預覽檢查；與舊 AD-8 接受同量改回不同。本次依原始使用者要求及自主續作指示採數量＋最新異動編號，無需資料表或共用帳本改動。這是代理依明確需求作的實作決策，並非使用者另答選項。
- 真 DB 的 SQL、advisory lock、列鎖與回滾尚未通過執行驗證。fake UoW 不會撤銷 fake 資料，單元測試不是 DB 回滾證據。
- 目前期初期末讀取迄日前帳本並在 Service 彙總；歷史與分布資料增長時的效能、記憶體及回應大小未做負載驗證。NFR-07 仍排期末，若需優化可在保持 Repository 介面與統計契約下改為 DB 聚合。
- >500kB bundle 提示仍存在，未調高警告門檻。實機載入與兩種尺寸待驗。
- 報表與清單為查詢時資料，跨 API 的多個區塊不保證同一資料庫快照；寫入仍以鎖後狀態為準。
- 沒有驗收隊友完整頁面、預警接入、備份還原或整條流程。不能因連結存在就宣稱目的頁已完成。
- A 文件待人工確認，110 秒講稿尚未實測；AI 40 秒內容待補。未製作 G。

## 8. 建議 commit 與 PR（未執行）

建議 commit：`feat(inventory): implement waste, stocktake and inventory reports`。

建議 PR 標題：`完成 FR-15～18 報廢、盤點與庫存統計`。

建議 PR 描述：

> 原本報廢、盤點與統計僅有佔位頁；現在可由真實批次登記報廢、追查數量及位置異動，並按台北日期核對庫存及管理者報廢分布。報廢沿用帳本與交易、防止重送，員工回應移除成本欄位；提供預警接入的全數報廢 hook/dialog。
>
> 單元／前端自動檢查已通過，詳見本紀錄。真 PostgreSQL 整合與 Alembic check 因設定／環境受阻，實機尺寸待驗；盤點採數量與異動版本雙重檢查，隊友端到端整合尚未驗收。未修改資料表與帳本契約。

合併前補齊 DB 與人工證據並由主代理／組員檢查 diff。不要把仍待驗的 stories 改成 done。

## 9. 續作驗證（2026-11-08，主流程實際執行）

第4節保留第一切片的歷史結果；以下是加上 FR-16 與回歸修正後的結果。

| 命令 | 實際結果 |
| --- | --- |
| backend `uv run pytest tests/unit` | 181 passed，6.00s（含盤點32案） |
| backend `uv run ruff check .` | 初次3處盤點行長錯誤；只格式化盤點模組及測試後 All checks passed |
| backend `uv run lint-imports` | 91 files、317 dependencies；4 kept、0 broken |
| backend `uv run pytest tests/integration/test_stocktake.py -x` | collected 7；首個setup缺TEST_DATABASE_URL，1 error/0.37s，案例內容未執行 |
| frontend `npm.cmd run gen:api` | 成功，包含盤點端點與型別 |
| frontend `npm.cmd test` | 11 files、120 passed，8.28s |
| frontend `npm.cmd run lint` | 通過 |
| frontend `npm.cmd run build` | tsc及Vite通過；JS650.33kB/gzip197.11kB，CSS274.73kB；仍有500kB提示 |

本輪未重跑已確認受阻且環境未變的 Alembic check 與全部 DB 案例。資料庫、人工尺寸及完整端到端均未驗收。沒有升級依賴或更動環境設定。

### 本輪修正及新增

- 報廢與報表 api.ts 補上共用 API_PREFIX；原 client 不會自動加前綴，已補實際 fetch 路徑斷言。
- 全數報廢409後失效庫存快取，重新開框可取得最新量；已開框快照不會偷偷改量。回歸測試以實際頁面驗證，不只手動更新測試輸入。
- 盤點管理者列批次、預覽及確認；數量／最新異動編號在批次鎖內取得及比對；全數驗證後才adjust；無差額不寫異動；來源已沖銷回422；有差額成功後重送舊預覽回409，不再調整。
- 盤點前端多批次輸入、預覽、確認、錯誤保留、編輯清預覽及pending防連按；員工不發盤點請求，伺服器另驗管理者。
- 新增 backend/tests/unit/test_stocktake.py、backend/tests/integration/test_stocktake.py、frontend/src/features/stocktake/stocktake.test.tsx。資料庫測試覆蓋多批次同群組、無差額與零量、同量改回、第二筆衝突、第二次flush失敗回滾、同預覽併發與來源沖銷。
- PowerShell管線曾使新增中文測試字串變問號（1 suite解析失敗），已改UTF-8直接寫入；報廢/報表8案及完整120案再跑通過，未改環境編碼設定。

### 盤點人工驗收（待驗）

1. 管理者加入兩批，輸入實際量與原因，預覽檢查帳面／實際／差額；預覽前後資料不變。
2. 確認後核對異動的前後量、原因、同一operation_group_id與時間；實際量0合法；無差額不得有新數量異動。
3. 預覽後由另一連線報廢或調整，再確認應409；即使第二連線改回原量也拒絕，保留輸入並要求重新預覽。
4. 第一筆合法、第二筆過時或來源已沖銷，確認後兩筆均不得部分成功。
5. 連按／重送同一舊預覽不能重複調整。修改實際量、原因、增刪批次後必須重新預覽。
6. 員工直接呼叫 GET /api/v1/stocktakes/batches、POST /api/v1/stocktakes/preview、POST /api/v1/stocktakes 都應403；未登入應401。


## 10. 最終審查修正與驗證（2026-11-08）

三路審查共16項意見逐項判定，另記主流程3項修正，詳見[Review Triage Log](../_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md)。不把審查意見直接視為事實；來源連結意見已核對現有契約，效能與DB執行限制列待補。修正包括：

- 報廢送出期間不能切換批次或同時開另一報廢入口；未決全數報廢關框重開保持原快照/key。
- batch_id嚴格正整數；損失金額回應schema與12位整數上限一致，員工仍不含金額。
- 報表翻頁保留未套用輸入及獨立位置頁；時間統一顯示台北；分組鍵與單位不會串接碰撞。
- 補非零統計與跨期沖銷、同單位不同分組、不同ID篩選排除與total的測試；盤點query key集中、6.3追蹤改in-progress。

| 最終執行命令 | 結果 |
| --- | --- |
| backend `uv run pytest tests/unit` | 189 passed，6.37s |
| backend `uv run ruff check .` | All checks passed |
| backend `uv run lint-imports` | 91 files、319 dependencies，4 kept、0 broken |
| frontend `npm.cmd run gen:api` | 成功；非手改schema.d.ts |
| frontend `npm.cmd test` | 12 files、125 passed，5.17s |
| frontend `npm.cmd run lint` | 通過 |
| frontend `npm.cmd run build` | tsc與Vite通過，JS651.94kB/gzip197.68kB，CSS274.73kB；>500kB提示保留 |
| backend `uv run pytest tests/integration/test_waste_reports.py tests/integration/test_stocktake.py --collect-only -q` | 17 tests collected，0.54s；只代表可收集，非DB案例通過 |

真DB執行阻擋仍如第4/9節；本輪未變更環境，沒有反覆嘗試已知無法連線的檢查。新增3個篩選案例也尚未實際執行。人工尺寸、資料持久化、負載及隊友完整流程都未驗收。

本輪中間失敗：前端第一次122 passed/2 failed（Intl細空白與重繪後舊DOM參照），隨後124及125全通過；午夜日期與頁碼斷言未放寬。Ruff一處import順序已修正後通過。沒有刪除失敗案例。

手動驗收另補：部分報廢pending時批次選擇不可切換；全數報廢模擬回應遺失後關框重開，應提示未決操作、保留原量及key，再試不重複。時間跨UTC午夜以台北日期顯示；翻數量頁不清除尚未提交的篩選，也不重設位置頁。

建議PR摘要：完成FR-15～18前後端，沿用StockLedger與交易、角色權限，盤點用數量及異動版本拒絕舊預覽，報廢保留未知成本並防重送，提供唯讀追溯與正確分組統計。189後端與125前端測試及靜態檢查/建置通過；真PostgreSQL、Alembic check與人工/隊友整合仍待補證據。附A規劃與110秒講稿，AI40秒待補，未處理G。

## 11. 本次修改與新增檔案

- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md`
- `_bmad-output/implementation-artifacts/spec-westgvva-stocktake.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/specs/spec-westgvva-inventory-management/.memlog.md`
- `_bmad-output/specs/spec-westgvva-inventory-management/SPEC.md`
- `_bmad-output/specs/spec-westgvva-inventory-management/acceptance.md`
- `backend/app/main.py`
- `backend/app/modules/reports/__init__.py`
- `backend/app/modules/reports/dependencies.py`
- `backend/app/modules/reports/repository.py`
- `backend/app/modules/reports/repository_sqlalchemy.py`
- `backend/app/modules/reports/router.py`
- `backend/app/modules/reports/schemas.py`
- `backend/app/modules/reports/service.py`
- `backend/app/modules/stocktake/__init__.py`
- `backend/app/modules/stocktake/dependencies.py`
- `backend/app/modules/stocktake/repository.py`
- `backend/app/modules/stocktake/repository_sqlalchemy.py`
- `backend/app/modules/stocktake/router.py`
- `backend/app/modules/stocktake/schemas.py`
- `backend/app/modules/stocktake/service.py`
- `backend/app/modules/waste/__init__.py`
- `backend/app/modules/waste/dependencies.py`
- `backend/app/modules/waste/repository.py`
- `backend/app/modules/waste/repository_sqlalchemy.py`
- `backend/app/modules/waste/router.py`
- `backend/app/modules/waste/schemas.py`
- `backend/app/modules/waste/service.py`
- `backend/tests/integration/test_stocktake.py`
- `backend/tests/integration/test_waste_reports.py`
- `backend/tests/unit/test_api_conventions.py`
- `backend/tests/unit/test_reports.py`
- `backend/tests/unit/test_stocktake.py`
- `backend/tests/unit/test_waste.py`
- `docs/a-project-management.md`
- `docs/team-tasks.md`
- `docs/westgvva-presentation.md`
- `docs/westgvva-verification.md`
- `frontend/src/app/router.test.tsx`
- `frontend/src/features/reports/api.ts`
- `frontend/src/features/reports/components/TransactionTable.tsx`
- `frontend/src/features/reports/hooks.ts`
- `frontend/src/features/reports/pages/ReportsPage.tsx`
- `frontend/src/features/reports/reports.test.tsx`
- `frontend/src/features/stocktake/api.ts`
- `frontend/src/features/stocktake/hooks.ts`
- `frontend/src/features/stocktake/pages/StocktakesPage.tsx`
- `frontend/src/features/stocktake/stocktake.test.tsx`
- `frontend/src/features/waste/api.ts`
- `frontend/src/features/waste/components/FullWasteDialog.tsx`
- `frontend/src/features/waste/components/WasteForm.tsx`
- `frontend/src/features/waste/hooks.ts`
- `frontend/src/features/waste/pages/WasteRecordsPage.tsx`
- `frontend/src/features/waste/waste.test.tsx`
- `frontend/src/shared/api/queryKeys.ts`
- `frontend/src/shared/api/schema.d.ts`
- `frontend/src/shared/formatDateTime.test.ts`
- `frontend/src/shared/formatDateTime.ts`
- `frontend/src/test/renderApp.tsx`
