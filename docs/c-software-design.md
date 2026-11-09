---
title: 食序 FoodFlow－軟體設計文件
status: final
created: 2026-11-05
updated: 2026-11-09
---

# 食序 FoodFlow：軟體設計文件（架構設計）

第 17 組。需求依據為 SRS v3.0（`docs/srs.md`）。完整的設計規則見 `_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md`。

> 本文件於 2026-11-09 依目前程式碼（commit `e1711bf`）核對過檔案路徑與模組依賴。帳號與權限、儲存位置、領用、報廢、盤點、異動統計已實作；基本資料、進貨、庫存查詢與預警仍在開發，這些段落描述的是設計，各模組的實作狀態見第 6 章，變更檢驗表的驗證狀態見第 7 章。

## 1. 專案動機與目的

許多餐廳的食材仍以紙本或試算表管理：進貨時沒有記錄效期，領用時憑印象拿，發現過期時往往只能報廢；也常常用完才發現沒叫貨。餐廳的食材品項、批次、儲存空間與經手的員工越多，靠人記憶就越不可靠。

食序 FoodFlow 集中記錄每次進貨及其庫存批次，讓員工清楚知道還有哪些食材、剩多少、放在哪裡、哪一批應該先使用，並留下領用、報廢與盤點調整的紀錄，方便追查食材去向與浪費原因。

目前沒有實際餐廳的試用數據，因此不預設能降低特定百分比的損耗。系統依輸入的日期提供提醒，不取代員工對食材狀況的判斷。

## 2. 系統特色

- **批次追蹤：** 以庫存批次而非品項追蹤，同一食材的不同到期日、位置與單價分開記錄。
- **FEFO 領用：** 依先到期先使用建議批次；員工可改選，但須填原因，並標記為非 FEFO。
- **效期與低庫存預警：** 首頁依過期、今日到期、即期、低庫存排序，可直接進入領用、報廢或建立進貨單。
- **報廢分析：** 保留報廢原因、數量與損失金額，並依食材、分類與原因統計。
- **可追溯：** 所有數量變動都有操作者、時間與來源，可由異動紀錄重算目前庫存。

## 3. 使用者定位

產品定位是單一門市、非連鎖的獨立餐廳，不限規模，以平板及電腦 Web 操作。供應商不登入本系統；首版不提供連鎖總部、跨分店調撥與中央廚房功能。

| 使用者 | 主要工作 | 系統權限 |
| --- | --- | --- |
| 餐廳負責人／店長 | 掌握庫存與效期、維護資料與權限、檢視報廢及盤點差異 | 管理者 |
| 收貨／採購人員 | 記錄進貨、到期日、單價與位置，知道哪些食材要補貨 | 一般員工 |
| 廚房／備料人員 | 查找食材、依批次建議領用、登記報廢 | 一般員工 |

## 4. 系統架構圖

![食序 FoodFlow 系統架構圖](diagrams/c-system-architecture.png)

系統由三部分組成：瀏覽器中的前端、提供 `/api/v1` 的後端，以及 PostgreSQL 資料庫。首版沒有背景工作，預警在每次查詢時即時計算，因此不會與庫存不同步。

開發時前端由 Vite 提供，並將 `/api` 轉送後端；demo 時由 FastAPI 一併提供前端靜態檔。兩種方式都維持同源，只在本機或區網使用。

## 5. 各層角色與職責

本系統採用課程設計層次 4：API → Service → Repository 分層，Service 透過建構子注入 Repository 介面。

### 5.1 Controller（API 層）

| 項目 | 內容 |
| --- | --- |
| 角色與定位 | 系統對外的入口，對應 `router.py` 與 `schemas.py` |
| 負責任務 | 驗證輸入格式；驗證登入與權限；呼叫 Service；轉換成回應格式 |
| 不應包含 | 商業規則、SQL、交易控制、對 Repository 的呼叫 |
| 例外處理 | 由單一 exception handler 把 `DomainError` 與格式錯誤轉成統一的 HTTP 錯誤格式，錯誤欄位以路徑標示（例如 `lines.0.quantity`）。未預期的例外回 `500 INTERNAL_ERROR`，不回傳內部細節 |

### 5.2 Service

| 項目 | 內容 |
| --- | --- |
| 角色與定位 | 商業規則與交易的所在，對應 `service.py` |
| 負責任務 | 執行規則（例如確認入庫、FEFO 領用）；決定交易範圍；協調 Repository、StockLedger、Domain 與 Clock |
| 不應包含 | HTTP、SQL、`Session`；不可自己建立 Repository、Strategy 或 Clock，一律由建構子注入 |
| 例外處理 | 規則不符時丟 `DomainError`，例如 `INSUFFICIENT_STOCK`、`STALE_QUANTITY`。交易區塊內發生例外時全部回滾 |

每個寫入操作都在單一交易內完成。多批次領用與確認入庫全部成功或全部不生效。

### 5.3 Repository

| 項目 | 內容 |
| --- | --- |
| 角色與定位 | 隔離資料存取。介面在 `repository.py`，SQLAlchemy 實作在 `repository_sqlalchemy.py` |
| 負責任務 | 以業務語言提供查詢與儲存；載入需要的關聯 |
| 不應包含 | 商業判斷；`commit` 或 `rollback` |
| 例外處理 | 把資料庫限制違反（例如唯一鍵）依 constraint 名稱轉成 `DomainError`，上層不需要接觸 SQLAlchemy 的例外 |

**StockLedger** 是庫存專用的資料存取元件。批次剩餘量、批次位置與異動紀錄只能經由它修改，避免進貨、領用、報廢、盤點各寫一份扣庫存邏輯。它也是批次列鎖的唯一入口，一律依 `id` 遞增上鎖以避免死結，鎖定後一定讀取最新值，並在同一筆異動留下前後量。

**已知取捨：** 領域物件綁定 ORM。SQLAlchemy 模型同時作為實體類別，Service 因此間接依賴 SQLAlchemy，沒有達到領域層完全獨立。原因是四人要在期中前完成 12 張表與八大功能，另建映射層等於每張表多寫一套類別與轉換，也多一處出錯的地方。代價由三點控制：Service 不可直接 import `sqlalchemy`、關聯不可延遲載入、Strategy 與 AlertRule 使用純資料物件。換其他 SQL 資料庫不受影響；換非 SQL 資料庫時要改寫模型。

### 5.4 Domain（Strategy／Factory）

| 項目 | 內容 |
| --- | --- |
| 角色與定位 | 不依賴資料庫與 HTTP 的純邏輯，可單獨測試 |
| 負責任務 | 批次挑選：`BatchSelectionStrategy`，實作 `FefoStrategy`、`ManualStrategy`。預警規則：`AlertRule`，實作過期、今日到期、即期、低庫存四個規則，由 `AlertRuleFactory` 依預警設定組合。效期與低庫存判定：`classify_expiry`、`is_low_stock` |
| 不應包含 | 資料庫查詢、HTTP、讀取系統時間 |
| 例外處理 | 不處理交易與 HTTP；資料由 Service 先過濾並傳入，Service 負責把結果轉成 `DomainError` |

日期一律來自可注入的 `Clock`，正式環境使用 `SystemClock`，測試使用 `FixedClock`，判定依 Asia/Taipei 的當日日期。

### 5.5 通知 Adapter

| 項目 | 內容 |
| --- | --- |
| 角色與定位 | 隔離預警與通知管道，介面為 `Notifier` |
| 負責任務 | 首版只有 `InAppNotifier`，它的投遞管道就是 API 回應，把預警交給首頁顯示（預警模組開發中，本節為設計） |
| 不應包含 | 預警判定、庫存查詢；不可在查詢頁面時觸發外部通知 |
| 例外處理 | `InAppNotifier` 不對外連線。期末若加外部通知，由獨立的進入點觸發，失敗時記錄日誌，不影響庫存與站內預警 |

### 5.6 防重送與併發

| 操作 | 防護方式 | 重送結果 |
| --- | --- | --- |
| 確認入庫、進貨沖銷 | 單據狀態機，鎖單頭後檢查狀態 | 回 200 與單據目前狀態，不重複入庫 |
| 領用、報廢 | 前端帶 `Idempotency-Key`，鎖定後先查是否已處理 | 回 200 與原結果 |
| 盤點調整 | 帶預覽時的帳面量與該批次最後一筆異動編號，鎖定後比對 | 任一項不符時回 `409 STALE_QUANTITY`，要求重新預覽核對 |

兩人同時領用時，第二人在等到列鎖後，會看到最新剩餘量。餘量不足時回 409 與最新可用量，不會產生負庫存。

## 6. 子系統切割

依 SRS 第 4 節的八大功能切分。後端模組在 `backend/app/modules/<模組>/`，前端 feature 在 `frontend/src/features/<模組>/`，兩邊使用相同的資料夾名稱。

| 八大功能 | 後端模組 | FR | 負責人 | 實作狀態（2026-11-09） |
| --- | --- | --- | --- | --- |
| 帳號與權限管理 | `auth` | FR-01、FR-02 | 謝文佳 | 已實作：登入、登出、員工帳號管理 |
| 基本資料與儲存位置管理 | `master_data` | FR-03、FR-04 | 謝文佳 | 開發中：後端模組尚未建立，前端為「功能開發中」頁 |
| | `storage_location` | FR-05 | Ken | 已實作：位置維護、位置摘要、批次換位置 |
| 進貨與批次管理 | `goods_receipt` | FR-06、FR-07 | ChiaJungTien | 開發中：後端模組尚未建立，前端為「功能開發中」頁 |
| 批次庫存查詢 | `inventory` | FR-08、FR-09 | ChiaJungTien（`StockLedger` 由 Ken 負責） | `StockLedger` 已實作；庫存查詢 API 與頁面開發中 |
| 食材領用與消耗登記 | `issue` | FR-10、FR-11 | Ken | 已實作：FEFO 建議、多批次領用、領用沖銷 |
| 效期與低庫存預警 | `alerts` | FR-12～FR-14 | 謝文佳 | 開發中：後端模組尚未建立，首頁為「功能開發中」頁 |
| 報廢與盤點 | `waste` | FR-15 | 郭明儒 | 已實作：報廢登記與報廢紀錄 |
| | `stocktake` | FR-16 | 郭明儒 | 已實作：盤點預覽與確認調整 |
| 異動紀錄與統計 | `reports` | FR-17、FR-18 | 郭明儒 | 已實作：異動查詢、位置變更紀錄、期初期末統計、報廢分布 |

另有 `health` 模組提供 `GET /health` 健康檢查，掛在 `/api/v1` 主路由之外、不需登入，不屬於八大功能，也不寫入任何資料表。

**切割理由：**

- 每個功能的規則變動原因不同，分開後四人可以平行開發。
- 報廢與盤點雖然屬於同一功能，但流程與防重送方式不同，所以分成兩個模組；基本資料與儲存位置也因負責人與換位置流程不同而分開。
- 多個模組都會改庫存，所以把庫存寫入集中到 `inventory.StockLedger`，避免規則重複。

**資料表寫入權：** 每張表只有一個模組可以寫入，讀取不受限。

| 資料表 | 寫入者 |
| --- | --- |
| `employee` | `auth` |
| `ingredient_category`、`ingredient`、`supplier` | `master_data` |
| `storage_location` | `storage_location` |
| `goods_receipt`、`goods_receipt_item` | `goods_receipt` |
| `inventory_batch`、`inventory_transaction`、`batch_location_change` | `inventory.StockLedger` |
| `waste_record` | `waste` |
| `alert_setting` | `alerts` |

`issue`、`stocktake` 沒有自己的資料表，數量變動全部經由 `StockLedger` 寫入 `inventory_batch` 與 `inventory_transaction`；`storage_location` 的批次換位置也經由 `StockLedger` 寫入 `batch_location_change`。`reports` 只讀取，不寫入任何資料表。

**模組間依賴：** 模組不可呼叫彼此的 Service 或 Repository，只有兩個例外：

- 會改庫存的模組依賴 `inventory.StockLedger`。
- 所有路由依賴 `auth` 提供的身分與權限檢查。

低庫存與可用量由共用的唯讀查詢及判定函式提供，首頁與庫存總覽的結果因此一致。

![食序 FoodFlow 子系統依賴圖](diagrams/c-subsystem-dependency.png)

## 7. 變更檢驗表

本表檢驗設計是否能把變更限制在小範圍內。路徑中的 `app/` 指 `backend/app/`，`tests/` 指 `backend/tests/`。

「已驗證」表示已逐項對照目前程式碼：表中列出的既有檔案都存在，「不用改」欄的類別確實沒有 import 或建立會被替換的具體實作。分層依賴另由 CI 的 import-linter 規則（`backend/pyproject.toml`）與 `tests/unit/test_architecture_rules.py` 持續檢查。預警模組尚未實作，C1、C3 的 `alerts/` 路徑是設計中的位置。

| 情境 | 新增 | 修改 | 不用改 | 驗證狀態 |
| --- | --- | --- | --- | --- |
| **C1 新增預警規則** | `app/modules/alerts/rules/<new>_rule.py`、對應單元測試 | `alerts/rule_factory.py`（註冊一行）；`alerts/rules/base.py`（`AlertKind` 加一個值）；`frontend/src/shared/ui/statusBadgeMap.ts`（顯示文字與顏色）；以 `npm run gen:api` 重新產生 `frontend/src/shared/api/schema.d.ts` | 既有四個規則、`AlertService`、`alerts/router.py`、`Notifier` | 依設計，待預警模組完成後驗證 |
| **C2 換挑批次規則** | `app/modules/issue/strategies/<new>_strategy.py`、`tests/unit/test_<new>_strategy.py` | `app/modules/issue/dependencies.py`（`DEFAULT_STRATEGY = FefoStrategy` 這一行換成新策略） | `IssueService`（只依賴 `BatchSelectionStrategy` 介面）、`ManualStrategy`、`issue/router.py`、`StockLedger`、Repository、前端 | 已驗證 |
| **C3 加外部通知** | `app/modules/alerts/notifiers/<channel>_notifier.py`；`app/jobs/daily_alert_digest.py`（排程進入點）；對應測試 | `app/core/config.py`、`.env.example`（通道設定）；`docker-compose.yml` 或系統排程（觸發 job）；`backend/pyproject.toml`（若需要新套件） | 所有 `AlertRule`、`AlertRuleFactory`、`InAppNotifier`、`AlertService`、`alerts/dependencies.py`、`alerts/router.py`、前端 | 依設計，待預警模組完成後驗證 |
| **C4 換資料庫**（其他 SQL 資料庫） | `backend/alembic/versions/` 下新資料庫的 baseline migration | `docker-compose.yml`、`docker/initdb/01-create-test-db.sql`、`.env.example`、`backend/pyproject.toml`（目前 driver 為 `psycopg`）；`app/core/db.py`（連線與 `READ COMMITTED` 設定）；`backend/alembic/env.py`；`app/db/models/` 與 `app/db/queries/`（僅不相容的型別或語法）；`app/modules/*/repository_sqlalchemy.py`、`app/modules/inventory/ledger_sqlalchemy.py`（僅不相容的查詢）；`scripts/backup.sh`、`restore.sh` | 所有 `service.py`、`router.py`、`schemas.py`、Domain（`app/domain/`、`issue/strategies/`）、Repository 介面、`StockLedger` 介面、前端 | 已驗證 |
| **C5 測試跨日** | `tests/unit/`、`tests/integration/` 下的測試案例 | 無正式程式碼。單元測試注入 `FixedClock`（例如 `tests/unit/test_issue_service.py`）；API 測試用 `app.dependency_overrides[get_clock]`（例如 `tests/integration/test_auth_and_write.py`）；手動驗收在 `.env` 設定 `APP_FIXED_NOW` | `app/core/clock.py` 的 `SystemClock`、`app/core/dependencies.py` 的 `get_clock`、`service.py`、`router.py`、Domain、Repository | 已驗證 |

補充：

- **C1：** 若新規則需要新資料，還要改 `AlertContext` 與載入它的 Repository；若預警是新形狀，還要改 `Alert` 與 `alerts/schemas.py`。兩種情況既有規則都不用改。`statusBadgeMap.ts` 目前已有過期、今日到期、即期、低庫存、正常五種狀態。
- **C2：** `IssueService` 在鎖內用注入的預設策略重算 FEFO 基準，換策略後基準跟著改變，不用改 Service。換成非 FEFO 策略後，`is_non_fefo` 的實際意義變成「偏離系統建議」，欄位名稱、錯誤訊息與報表文字要另外決定是否調整。
- **C3：** 外部 Notifier 只由 job 使用，查詢預警仍使用 `InAppNotifier`，不會在查詢時發送外部通知。C3 需要新增排程進入點，屬於期末延伸，首版沒有。
- **C4：** 程式中沒有手寫 SQL 字串，也沒有 import PostgreSQL 方言，模型只用 SQLAlchemy 通用型別。唯一的例外是 `app/core/db.py` 的 `for_update(key_share=True)`（目前由 `storage_location` 鎖定位置時使用），它產生 PostgreSQL 的 `FOR NO KEY UPDATE`，換資料庫時要在 `for_update` 內改成新資料庫支援的鎖定方式，呼叫端不用改。換資料庫後要重跑 `tests/integration`，並確認隔離層級仍為 `READ COMMITTED`。`tests/unit/test_architecture_rules.py` 中檢查 constraint 名稱長度的測試以 PostgreSQL 的 63 字元為上限，換資料庫時要依新資料庫的限制調整。備份與還原腳本 `scripts/backup.sh`、`restore.sh`（NFR-06）使用 PostgreSQL 的 `pg_dump`／`pg_restore`，也要改寫。換成非 SQL 資料庫時，還要重寫所有 Repository 與 StockLedger 實作、`UnitOfWork` 及模型類別，也要重新評估列鎖機制。
- **C5：** `get_clock` 只在 `APP_ENV` 不是 `production` 時採用 `APP_FIXED_NOW`。「固定時鐘下可登入並完成一次寫入」已由 `tests/integration/test_auth_and_write.py` 涵蓋；以環境變數設定 `APP_FIXED_NOW` 的路徑由 `tests/unit/test_config_and_clock.py` 與 `tests/integration/test_seed_demo.py` 涵蓋。

## 8. 技術選型

| 部分 | 技術 | 理由 |
| --- | --- | --- |
| 前端框架 | React、TypeScript、Vite | 元件化適合多功能頁面；TypeScript 可在編譯時抓出前後端欄位不符 |
| UI | Mantine | 內建表單與表格元件，減少自刻介面的時間 |
| 資料請求 | TanStack Query | 統一快取與失效，領用後可讓預警與庫存畫面同步更新 |
| 路由 | React Router | 只處理頁面路由；伺服器資料一律交給 TanStack Query |
| 後端框架 | Python FastAPI | `Depends` 可實作建構子注入的組裝；自動產生 OpenAPI，可據此產生前端型別 |
| 資料存取 | SQLAlchemy 2、Alembic | 支援列鎖與交易；migration 讓四人的 schema 保持一致 |
| 資料驗證 | Pydantic | 可嚴格驗證數量格式，超過三位小數時明確拒絕 |
| 資料庫 | PostgreSQL（docker-compose） | 支援 `NUMERIC(12,3)` 與列鎖，能滿足併發領用不超領的需求；容器讓全組環境一致 |

開發環境版本見 `README.md`，所有套件版本見架構主幹的 Stack 章節。

## 9. 前端架構

前端是單頁應用（SPA），原始碼在 `frontend/src/`，依「全站組裝、功能、共用」分成三個資料夾。

![食序 FoodFlow 前端架構圖](diagrams/c-frontend-architecture.png)

### 9.1 資料夾結構

```text
frontend/src/
  main.tsx                 # 進入點
  app/                     # 全站組裝
    providers.tsx          # MantineProvider（套用主題）、QueryClientProvider
    router.tsx             # 所有路由集中在這裡
    layout.tsx             # 側欄導覽與頁框
    theme.ts、theme.css    # 色票、陰影、漸層與 --ff-* CSS 變數
  features/<f>/            # 每個功能一個資料夾，名稱與後端模組相同
    api.ts                 # 端點函式與型別別名
    hooks.ts               # 包裝成 useQuery／useMutation
    components/            # 只在這個功能使用的元件
    pages/                 # 頁面
  shared/
    api/                   # client.ts、queryKeys.ts、schema.d.ts
    ui/                    # 共用元件
    hooks/                 # useIdempotencyKey
    routes.ts              # 路徑常數與預警動作對應的路由
```

`features/` 下有 `auth`、`master_data`、`storage_location`、`goods_receipt`、`inventory`、`issue`、`alerts`、`waste`、`stocktake`、`reports` 與 `health`。後端尚未完成的功能（`master_data`、`goods_receipt`、`inventory`、`alerts`）目前只有 `pages/`，頁面以 `EmptyState` 顯示「功能開發中」與對應的 FR 編號，讓導覽與預警動作的連結不會落空。

### 9.2 資料存取分層：api.ts → hooks.ts → pages

| 層 | 位置 | 職責 | 不可以 |
| --- | --- | --- | --- |
| HTTP 用戶端 | `shared/api/client.ts` | 全專案唯一呼叫 `fetch` 的地方；以同源 cookie 送出請求；統一處理錯誤格式（轉成 `ApiError`）與 401（導回登入頁）；匯出 `API_PREFIX`（`/api/v1`）給各 `api.ts` 組路徑 | 知道個別功能的端點 |
| API 函式 | `features/<f>/api.ts` | 每個端點一個函式；型別取自 `shared/api/schema.d.ts`（由後端 OpenAPI 以 `npm run gen:api` 產生，不手寫） | 管快取、被元件直接 import、被其他 feature import |
| Hooks | `features/<f>/hooks.ts` | 以 TanStack Query 包成 `useQuery`／`useMutation`；query key 取自 `shared/api/queryKeys.ts`；會改庫存的 mutation 成功後呼叫 `invalidateStockQueries()`，讓儲存位置、庫存、預警、領用、報廢、盤點、統計畫面一起更新 | 自行計算到期狀態、低庫存或數量 |
| 頁面與元件 | `features/<f>/pages/`、`components/` | 版面、表單與互動；只透過 `hooks.ts` 取資料 | 直接發請求、import `api.ts` 或 `client.ts` |

跨 feature 要用別人的資料時，import 對方的 `hooks.ts`，例如報表、盤點與儲存位置頁面使用 `auth/hooks.ts` 的 `useCurrentEmployee` 判斷是否顯示管理者功能（權限仍由後端檢查）。這些規則由 `frontend/eslint.config.js` 的 `no-restricted-imports`、`no-restricted-globals` 在 `npm run lint` 與 CI 中檢查。

伺服器資料只放在 TanStack Query 快取，React Router 只處理頁面路由，不使用 `loader`／`action`。數量一律以字串傳遞，前端不做數量運算；到期狀態、剩餘天數、低庫存與是否非 FEFO 都以後端回傳為準。

### 9.3 共用元件（`shared/ui/`）

各頁面先使用共用元件，畫面才會一致。每個檔案開頭都有用法註解。

| 元件 | 用途 |
| --- | --- |
| `PageHeader` | 每頁一個 h1，可加圖示；頁面唯一的主要按鈕放在 `actions` |
| `Toolbar`、`SearchInput` | 主卡片頂部的搜尋與篩選 |
| `DataTable` | 表格外框與表頭，列由呼叫端提供 |
| `EmptyState` | 空狀態，以及「功能開發中」卡片 |
| `FormModal` | 表單與確認對話框，送出中不能關閉 |
| `StatusBadge`、`statusBadgeMap.ts` | 效期與庫存狀態標籤，同時顯示文字與顏色；狀態文字與色票只定義在 `statusBadgeMap.ts` |
| `Quantity` | 後端數量字串的顯示格式，只處理顯示，不做運算 |
| `ActiveBadge`、`CodeTag`、`StorageTypeIcon`、`icons.tsx` | 啟用狀態、代碼、保存方式圖示與線條圖示 |

`shared/hooks/useIdempotencyKey` 為領用與報廢表單產生 `Idempotency-Key`（見 5.6），每個表單實例一把，成功或內容變更後才更換。

### 9.4 設計系統

視覺規範寫在 `docs/design/DESIGN.md`，包含色彩、字體、間距、圓角、元件樣式與觸控規則，與其他文件衝突時以它為準。程式中的實作是 `frontend/src/app/theme.ts`（Mantine 主題、色票與 `cssVariablesResolver`）與 `frontend/src/app/theme.css`。

- **顏色只從主題取：** 元件使用 Mantine 色票名稱（例如 `forest.8`、`expired.8`）或 `--ff-*` CSS 變數。色碼只能寫在 `app/theme.ts` 與 `app/*.css`，`src/features/**` 中寫死的色碼會被 ESLint 擋下。要新顏色時，先在主題加 token，再從元件引用。
- **狀態不能只靠顏色：** 效期與庫存狀態一律文字加顏色（NFR-01）。
- **觸控：** 可點擊目標至少 44px，操作不放在 hover 或 Tooltip 中；每個畫面最多一個主要按鈕。
- **驗收尺寸：** 1024×768 不出現橫向捲動；進貨、領用、報廢、預警四頁另外檢查 1366×768。
