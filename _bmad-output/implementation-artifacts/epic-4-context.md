# Epic 4 Context: 庫存總覽與批次明細

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

讓已登入員工查清每項食材的實體量、可用量、過期量與安全庫存量，再由食材展開批次、追溯來源進貨及數量與位置歷程，避免把過期庫存當成可用食材。本次範圍為 FR-08、FR-09 的查詢能力，包含總覽必要的低庫存標示。

## Stories

- Story 4.1: 庫存總覽與篩選
- Story 4.2: 查看食材的批次清單
- Story 4.3: 查看單一批次的異動歷程

## Requirements & Constraints

- 依名稱、分類、保存方式、位置及效期／低庫存狀態搜尋；數量按食材與單位分開，不跨食材加總。實體量包含尚未報廢的過期剩餘量；可用量只包含未過期量。過期不自動扣庫存。
- 位置篩選只改變顯示數量的合計範圍，必須清楚顯示條件。低庫存始終以全店可用量判定：安全量大於 0 且可用量小於或等於安全量。停用食材仍可查詢，但不標示低庫存；從未進貨的食材仍須出現，數量為 0。
- 效期狀態以 Asia/Taipei 當日計算：過期、今日到期、即期、正常互斥；預設提前 3 天預警，設為 0 時沒有即期。今日到期仍屬可用。食材符合效期篩選表示至少一個剩餘量大於 0 的批次符合。
- 各批次獨立呈現並依到期日排序；保留來源進貨與供應商、進貨日期、到期日、剩餘天數、位置、初始量、剩餘量、效期及來源單據狀態。耗盡批次保留歷史並標示已耗盡，不計入可用量或待處理預警。
- 數量異動保留操作者、時間、原因、增減與前後量及非 FEFO 標記；沖銷可追查原紀錄。位置變更另區呈現，不混入數量異動；歷程唯讀。

## Technical Decisions

- 查詢屬 inventory 模組；遵循 router → service → repository 介面，具體依賴由 dependencies 組裝。Repository 可跨表 SELECT／JOIN，但不可呼叫其他模組的 Service 或 Repository。批次、異動及位置紀錄的寫入權仍屬 StockLedger。
- 庫存聚合共用 `stock_level_stmt(today, location_id=None)`，從食材 LEFT JOIN 批次；低庫存共用 `is_low_stock`。位置篩選時，低庫存項目只在該食材於該位置有剩餘批次時出現。
- 效期唯一判定為 `classify_expiry` 與 `is_available`；今天由注入的 Clock 傳入，不讀系統日期或 SQL 當日。前端顯示後端提供的狀態與剩餘天數。SQL 篩選須以對照測試確認規則一致，涵蓋日期邊界、無批次、全過期、等於安全量及安全量為 0。
- 數量使用 Decimal，API 以固定三位小數字串回傳；前端不做庫存計算。關聯明確載入，禁止隱性 lazy loading；時間排序以 id 作為次要鍵。
- API 使用 `/api/v1`、snake_case 欄位及統一錯誤格式；清單回傳 items、total、page、page_size。路由層驗證登入，管理者與一般員工均可查詢。API 變更後重新產生 OpenAPI 前端型別。
- 頁面透過 feature hooks 取得資料，伺服器資料由 TanStack Query 管理；inventory 的 staleTime 為 0，配合共用 `invalidateStockQueries()` 接收庫存、位置、主檔及預警設定變更後的更新。

## UX & Interaction Patterns

採繁體中文及 Mantine 預設元件；總覽 → 食材批次 → 單批歷程逐層追查，來源進貨單可連至明細。狀態使用共用 StatusBadge，同時顯示文字與顏色；操作目標至少 44px，不依賴 hover。沒有獨立 UX／設計文件，依共用介面規則實作。

## Cross-Story Dependencies

- 4.1 提供食材入口，4.2 展開批次並銜接來源進貨明細，4.3 提供單批歷程；Epic 8 的跨批次異動查詢將連入此歷程。
- 主檔與位置資料由 Epic 1、2 提供；來源進貨與批次由 Epic 3 提供。共用 Clock、庫存聚合、效期／低庫存規則及認證能力須可用；預警天數讀取全店設定並套用預設值。
- 不必等待 Epic 5、6：測試可由 StockLedger 建立領用、報廢、調整與移位資料，直接驗證查詢與追溯。預警首頁與設定的建置仍屬 Epic 7。
