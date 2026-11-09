# Epic 1 Context: 食材、分類與供應商

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

建立進貨與庫存作業共用的食材分類、食材及供應商主檔。管理者維護資料與啟用狀態，一般員工查詢；停用或修改不破壞既有交易與批次的歷史關聯。負責人謝文佳，模組為 `master_data`。

## Stories

- Story 1.1: 管理食材分類
- Story 1.2: 管理食材與安全庫存量
- Story 1.3: 管理供應商

## Requirements & Constraints

- 分類包含代碼、名稱、選填說明及啟用狀態；代碼唯一，新建預設啟用。有啟用食材的分類不可停用；被任何食材引用即不可刪除。
- 食材名稱、分類、庫存單位與保存方式必填；名稱重複須提示。每種食材固定一種單位，不做單位換算。新增食材或更換分類不可選用停用分類。
- 安全庫存量只接受非負數量字串、最多三位小數；留空存為 `0.000`，代表不提醒。負數、四位小數、JSON 數字或科學記號均明確拒絕，不截斷。數量以 Decimal 處理，API 輸出固定三位小數。
- 已有進貨明細或批次的食材不可刪除或更換單位；未被引用者可刪除。停用食材從供新進貨選用的有效清單排除，其既有庫存仍可查詢、領用與報廢。
- 供應商名稱必填，聯絡人、電話、其他聯絡資訊至少填一項；新建預設啟用。已有任何進貨單（含草稿）者不可刪除，只能停用。停用後不得用於新進貨，歷史單據保持原關聯。
- 員工可依名稱、分類、保存方式等條件查詢；新增、修改、停用與刪除限管理者。後端驗證權限，不能僅隱藏按鈕。
- 低庫存由後端共用判定：啟用食材且安全量大於零、全店可用量小於或等於安全量時提醒；停用食材不產生低庫存提醒，其批次仍有正常效期提醒。

## Technical Decisions

- 採 API → Service → Repository 介面分層，具體相依於 dependencies 組裝並由建構子注入。Service 不寫 SQL、HTTP 或自行建立具體 Repository；每個寫入方法自行使用 UnitOfWork 單一交易，Repository 僅 flush。
- `ingredient_category`、`ingredient`、`supplier` 僅由本模組寫入。其他模組可唯讀查詢，不能互相呼叫 Service 或 Repository；身分權限使用 auth 提供的相依。主檔操作不直接修改庫存批次或異動。
- API 使用 `/api/v1`、複數 kebab-case 資源、snake_case 欄位；清單回 `{items, total, page, page_size}`。重複資料回 `409 DUPLICATE`、引用阻擋回 `409 REFERENCED`、不合規則回 `422 RULE_VIOLATION`；格式錯誤回 `422 VALIDATION_ERROR`，含可對應表單的 fields。未登入與無權限分別回 401、403。
- ORM 關聯禁止隱性載入，必要資料由 Repository 明確載入；資料庫 constraint 錯誤依名稱轉為 DomainError。Schema 變更經 Alembic，維持單一 head。
- 前端頁面及元件透過同 feature 的 hooks 取資料，hooks → api → 共用 client；伺服器狀態放 TanStack Query。API 型別由 OpenAPI 產生，不能自行手寫替代。
- Query key 集中管理。食材及分類變更成功後呼叫 `invalidateStockQueries()`，刷新庫存、預警及相關交易選單。未確認成功不可顯示完成。
- 規則以 fake Repository 與 UnitOfWork 做 Service 測試；真實資料庫用於引用限制、權限、整合及涉及列鎖的驗證。

## UX & Interaction Patterns

- 以專案 DESIGN.md 為視覺準則，沿用共用 PageHeader、Toolbar／SearchInput、DataTable、EmptyState、FormModal、ActiveBadge、CodeTag 及 StorageTypeIcon；保持現有主檔頁的綠色主題、卡片、表格與對話框風格。
- 每頁僅一個主要新增按鈕；列內操作與取消用次要變體，停用或刪除的最後確認用危險按鈕，標題與確認文字直接說明對象及後果。送出時不可關閉表單。
- 表單有獨立 label，必填以文字標示；後端錯誤對應欄位且保留輸入。查詢錯誤提供重試，首次載入顯示骨架，空資料與無篩選結果分別引導新增或清除篩選。
- 色彩、陰影與漸層從主題 token 取得；狀態文字加顏色，不能只靠顏色。停用列保留、淡化並排在啟用列後面。
- 可點擊目標至少 44px；純裝飾圖示隱藏於輔助技術，無文字按鈕有 aria-label。1024×768 不出現橫向捲動；小螢幕改卡片清單、收納篩選。

## Cross-Story Dependencies

- 食材維護依賴分類主檔與有效分類選單；停用分類必須檢查啟用食材，刪除則檢查所有食材。
- 進貨模組使用有效食材及供應商清單，並在草稿與確認時重新驗證狀態；本模組的引用限制需讀取進貨明細、批次及進貨單。
- 安全庫存量、食材狀態與分類變更影響庫存總覽、低庫存預警、交易選單與統計，成功後需使相關快取失效。
