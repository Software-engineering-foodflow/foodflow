# FoodFlow 軟體架構圖（D 文件用）

[PNG 預覽](diagrams/d-software-architecture.png)｜[SVG 向量圖](diagrams/d-software-architecture.svg)｜[draw.io 可編輯檔](diagrams/d-software-architecture.drawio)｜[PlantUML 邏輯結構檔](diagrams/d-software-architecture.puml)

參考第 2 組 D 物件設計文件範例的分層方塊、前端入口、安全控管、後端分層與資料儲存配置，內容依 FoodFlow SRS、既有 C 文件及目前程式整理。核對基準：`f5f87a6f79589877e148e8302fd5bdbb0fe0be50`；日期：2026-11-12。圖表示邏輯分層，不表示每一方塊是獨立部署的服務。

## 檔案與排版來源

PNG 與 SVG 採固定排版，與 draw.io 使用相同方塊、文字、連線及座標資料，可使用 draw.io 調整；PlantUML 保留相同主要元件與依賴，供文字維護與自動排版參考，其自動輸出的版面可能不同。Word 可插入 PNG 或 SVG；此圖不會自動替換既有文件內嵌圖片。

## 各層職責

| 區塊 | FoodFlow 的設計與實作 |
| --- | --- |
| 前端客戶端 | 電腦與平板共用瀏覽器 Web 介面；React、TypeScript、Vite 與 Mantine。頁面經 hooks／feature API，統一使用 shared/api/client.ts 請求。 |
| API 入口與安全控管 | FastAPI 的 /api/v1 路由、Pydantic 請求驗證、JWT Cookie 與角色檢查，並統一處理驗證錯誤及 DomainError。此區塊在 FastAPI 內，不是獨立 Gateway。登入與健康檢查依既有規則開放，不要求先登入。 |
| Service | 八大功能模組的商業規則及交易協調；各功能按需使用 Repository、StockLedger、Clock、策略／規則與預警 Adapter，不表示每個 Service 都會使用全部元件。 |
| 領域規則與策略 | 領用的 FefoStrategy／ManualStrategy；預警的 AlertRuleFactory／AlertRule；共用效期與低庫存判定。策略與規則在應用內執行，不是微服務或背景工作。 |
| 站內預警 Adapter | AlertService.list_alerts() 將 evaluate() 結果交給 InAppNotifier.deliver()，同步回傳 AlertResult，最後經 API 交由首頁呈現，沒有額外推播連線。 |
| 共用支援 | Clock 統一時間與臺灣日期；UnitOfWork 由 Service 使用，透過同一 SQLAlchemy Session 執行 commit／rollback。由 dependencies.py 組裝相依物件。 |
| StockLedger | 批次列鎖及批次餘量、位置與異動紀錄的共用寫入入口；各庫存作業使用同一契約，具體實作只 flush，不自行 commit。 |
| Repository | 以介面隔離各模組資料查詢與維護，具體 SQLAlchemy 實作透過共用 Session 查詢及 flush；批次餘量與位置寫入仍交給 StockLedger。 |
| 資料儲存 | PostgreSQL 17 儲存現有 12 張表；主外鍵、唯一限制與檢查限制維持完整性，Docker Compose 以 Volume 持久化資料。 |

## 與範例的對應

- 範例的 Web／行動 App／Kiosk，在 FoodFlow 對應電腦與平板瀏覽器；不增加原生 App 或機台。
- 範例的獨立 API Gateway／Load Balancer，在 FoodFlow 以 FastAPI 內的路由與驗證依賴呈現；不宣稱目前有獨立 Gateway、負載平衡器或 HTTPS 終結層。本機／區網的實際通訊標為 HTTP／JSON。
- 保留 Controller → Service → 資料存取的職責分離，補上 FoodFlow 的 StockLedger、UnitOfWork 與 Clock。
- 範例的 WebSocket、Redis、訊息佇列與 Worker 沒有加入圖中；FoodFlow 預警在查詢時即時計算並同步回傳。
- TanStack Query 管理的是瀏覽器端伺服器資料快取；JWT 以 HttpOnly Cookie 傳遞，不另外建立 Redis Session 儲存層。

## 圖面範圍與重要限制

1. 實線表示主幹呼叫與資料存取；虛線表示對 Clock 的共用支援依賴。圖上的輸入箭頭僅呈現請求方向，HTTP 回應沿原連線回傳，未另畫回應線。
2. 身分驗證、錯誤處理與 Pydantic 驗證合併為一個 API 方塊；其執行分散在既有路由、dependencies.py 與 app/main.py 中。get_current_employee 亦會用 Session 讀取 Employee，此驗證查詢未逐一展開；圖中的 Service 分層箭頭是主業務流程。
3. UnitOfWork 不自行啟動一個額外的資料庫服務；它操作共用 Session。SQLAlchemy 在 SQL 執行時開啟實際交易，寫入失敗由 UoW rollback。
4. Notifier 是 Adapter，不與純領域規則混為同一個物件；預警資料仍由 AlertService 透過 Repository 載入，再交規則計算。
5. 未將備份工具、測試程式與資料遷移工具畫成線上請求的一部分；部署方式為開發時 Vite 代理 API、展示時 FastAPI 提供靜態檔。
6. 本次只新增架構圖與說明，保留原 c-system-architecture 圖、既有 Word、類別圖及未提交的字體調整，不變更程式或 Schema。

## 程式與文件依據

| 對照內容 | 來源 |
| --- | --- |
| 需求與既有架構 | [SRS](srs.md)、[C 文件](c-software-design.md)、[原系統架構圖](diagrams/c-system-architecture.puml) |
| API 路由、安全與靜態檔 | [main.py](../backend/app/main.py)、[驗證依賴](../backend/app/modules/auth/dependencies.py)、[登入 Cookie](../backend/app/modules/auth/router.py) |
| 前端入口與資料請求 | [router.tsx](../frontend/src/app/router.tsx)、[client.ts](../frontend/src/shared/api/client.ts)、[queryKeys.ts](../frontend/src/shared/api/queryKeys.ts) |
| 相依注入與交易 | [dependencies.py](../backend/app/core/dependencies.py)、[UnitOfWork](../backend/app/core/uow.py)、[Clock](../backend/app/core/clock.py) |
| 庫存共用寫入 | [StockLedger 契約](../backend/app/modules/inventory/ledger.py)、[SQLAlchemy 實作](../backend/app/modules/inventory/ledger_sqlalchemy.py) |
| 領用策略 | [領用 Service](../backend/app/modules/issue/service.py)、[FEFO](../backend/app/modules/issue/strategies/fefo_strategy.py)、[Manual](../backend/app/modules/issue/strategies/manual_strategy.py) |
| 預警規則與 Adapter | [AlertService](../backend/app/modules/alerts/service.py)、[規則與 Factory](../backend/app/modules/alerts/rules.py)、[InAppNotifier](../backend/app/modules/alerts/notifier.py)、[組裝點](../backend/app/modules/alerts/dependencies.py) |
| 資料庫部署 | [docker-compose.yml](../docker-compose.yml) |
