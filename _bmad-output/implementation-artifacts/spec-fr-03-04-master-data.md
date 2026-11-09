---
title: 'FR-03／04 食材分類、食材與供應商維護'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'fa9fee00609dce0f2ff58022ccd238ca77764199'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/srs.md'
  - '{project-root}/docs/design/DESIGN.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 三個主檔頁目前只有開發中提示，無維護 API。

**Approach:** 完成 Epic 1.1～1.3 的前後端，供管理者維護、員工查詢，畫面延續現有系統風格。完整欄位及規則採上述 context 與 epics.md 對應故事。

## Boundaries & Constraints

**Always:** 沿用既有資料表、登入與分層。數量以字串傳輸、Decimal 儲存；新增預設啟用。狀態與數量由後端判定。遵守 DESIGN.md、44px 觸控與共用元件規則。

**Never:** 自動換算單位、破壞歷史關聯、直接寫庫存、建立假成功畫面。本次不實作進貨或預警交易；提供有效主檔查詢供其串接。不執行正式資料變更、commit 或 push。

## I/O & Edge-Case Matrix

| Given | When | Then |
|---|---|---|
| 管理者 | 提交有效主檔 | 建立／編輯成功；必填空白回 422 與欄位錯誤 |
| 既有分類代碼或食材名稱 | 新增／修改成重複值 | 409 DUPLICATE；保留輸入 |
| 安全庫存量 | 留空／負數／四位小數／JSON number | 空白為 0.000；其餘拒絕，不截斷 |
| 分類有啟用食材／任意食材 | 停用／刪除分類 | 409 REFERENCED，資料不變 |
| 停用分類 | 新建、改入分類或重新啟用食材 | 422 RULE_VIOLATION；既有停用食材可保留原分類編輯 |
| 食材已有明細或批次（含草稿、耗盡） | 改單位／刪除 | 409 REFERENCED |
| 供應商三個聯絡欄位 | 全空／任一有值 | 422／通過；供應商名稱亦必填 |
| 供應商已有進貨單（含草稿） | 刪除 | 409 REFERENCED；未引用主檔可刪除 |
| 停用食材或供應商 | 查詢有效清單 | 排除該筆，歷史及既有領用保持可用 |
| 員工／未登入者 | 寫入／查詢 API | 403／401；員工可查詢但無維護按鈕 |

</frozen-after-approval>

## Code Map

- `backend/app/db/models/master_data.py`：三個模型已齊；不需 migration。
- `backend/app/modules/storage_location/`：沿用交易、引用保護及錯誤模式；建立時間注入 Clock。
- `frontend/src/features/storage_location/`：參考響應式主檔頁與表單；不複製其日期計算。
- `frontend/src/shared/ui/`：重用頁首、工具列、表格、對話框、空狀態及標籤。
- `frontend/src/app/router.tsx`、`frontend/src/shared/routes.ts`：三頁路由已存在。

## Tasks & Acceptance

**Execution:**
- [x] `backend/tests/unit/test_master_data_service.py`、`backend/tests/integration/test_master_data.py`：先寫矩陣規則、權限、引用與競態測試。
- [x] `backend/app/modules/master_data/{__init__,schemas,repository,repository_sqlalchemy,service,dependencies,router,errors}.py`：三資源 GET／POST／PATCH／DELETE；分頁、關鍵字、狀態及食材分類／保存方式篩選；有效選單完整分頁。更新／刪除鎖主檔，分類指派與停用共用分類鎖序；唯一鍵及 FK 錯誤轉 DomainError。
- [x] `backend/app/main.py`：在需登入 router 掛載；寫入限 require_admin。
- [x] `frontend/src/shared/api/{schema.d.ts,queryKeys.ts}`：由 OpenAPI 產生型別，補查詢鍵。
- [x] `frontend/src/features/master_data/{api.ts,hooks.ts}`：透過共用 client 取資料；修改後刷新主檔及相關快取。
- [x] `frontend/src/features/master_data/pages/{IngredientCategoriesPage,IngredientsPage,SuppliersPage}.tsx`、`components/`、`masterData.module.css`：取代佔位頁；清單、搜尋篩選、分頁與維護表單。
- [x] `frontend/src/features/master_data/pages/MasterData.test.tsx`：驗證完整操作、錯誤保留、角色與快取刷新。

**Acceptance Criteria:**
- Given 主檔資料，when 開啟三頁，then 顯示各自欄位及狀態；停用項淡化並排後，支援搜尋、清除篩選及分頁。
- Given 新增／編輯／停用／刪除，when 操作，then 表單獨立 label；停用／刪除具名確認且末次按鈕紅色；busy 不可關閉；成功通知含名稱，失敗保留輸入。
- Given 查詢中、失敗或空結果，when 顯示清單，then 分別提供骨架、重試及新增／清除篩選引導。
- Given 食材／分類修改成功，when 回應完成，then 呼叫 invalidateStockQueries()。
- Given 1024×768、1366×768 或手機，when 查詢及維護，then 無頁面橫向捲動；手機使用卡片，色彩來自主題，每頁一個主要動作。

## Implementation Notes

- 已核准後於本機 `feat/master-data-management` 實作；沿用現有三張表與路由，無 migration。
- 三資源共用 Service／Repository 及表單流程；分類鎖先於食材鎖，並保留唯一鍵／外鍵最後防線。
- 桌機各資源獨立欄位；平板收納篩選並改卡片，手機表單全螢幕。食材及分類異動失效庫存快取，供應商異動失效進貨快取。
- 已核對矩陣每列的測試覆蓋；補上所有必填缺漏／空白、三種聯絡方式及清空聯絡資訊的更新案例。
- 瀏覽器檢查使用固定測試資料，實際資料庫規則由 PostgreSQL 整合測試驗證。截圖存於 `../../docs/design/screenshots/`。
- 2026-11-09 依使用者後續推送指示，整合最新 main `09dd7d958fbd96700ea12db4ba85250d31cf06c7` 至新分支 `feat/master-data-fr03-fr04`；保留原 baseline 供追溯。Node 24.22.2 下前端 257 項、後端 619 項測試及推送前檢查通過。

## Spec Change Log

## Review Triage Log

第一輪三個審查層全部完成後逐項核實；下列皆可直接修正，未新增 API 或產品狀態。

| ID | 判定 | 證據與處理 |
|---|---|---|
| B1 | medium | Service 用 record_id 真值區分新增，0 進入新增並重複傳入 is_active；patch：以 None 區分，無此 ID 回 404，補三資源測試。 |
| B2 | medium | 頁面未指定 Pagination size，Mantine 預設控制項小於 44px，主題無覆寫；patch：設為 44。 |
| B3 | medium | Notification 的 CloseButton 沒有傳可存取名稱與 44px 尺寸，Modal 主題設定不適用；patch：補關閉通知 label 及尺寸。 |
| B4 | medium | 食材停用確認稱不能用於新交易，會誤導既有庫存不可領用；patch：改為明確說明新進貨／既有庫存的文字。 |
| B5 | low | 篩選變更立即請求，但關閉按鈕名為套用篩選；patch：文字直接改為關閉篩選，不新增草稿狀態。 |
| B6 | medium | 必填欄位目前僅 label 文字，無 required／aria-required；patch：補語意屬性。 |
| B7 | medium | total 降到目前頁範圍以下時沒有校正頁碼，total 不大於 20 時還會隱藏分頁；patch：依回傳總數回到有效頁並補測。 |
| B8 | medium | factories.add_item 實際建立 CONFIRMED，既有命名為 draft 的 API 測試未覆蓋草稿 Service 預檢；patch：測試明確建立 DRAFT。 |
| B9 | medium | 目前真實鎖測試只覆蓋停用先取得鎖；patch：補食材建立先持有分類鎖、分類停用等待後遭 REFERENCED 拒絕的測試。 |
| B10 | medium | 食材建立／修改未驗證安全庫存字串的表單送出，既有停用測試只斷言 is_active；patch：補成功與錯誤保留案例。 |
| E1 | medium | 獨立邊界追查也確認 ID 0 走新增分支，同 B1 根因；納入同一 patch。 |
| E2 | medium | 獨立邊界追查確認背景更新縮減 total 會困在空頁，同 B7 根因；納入同一 patch。 |
| V1 | medium | 測試可被「把安全庫存送出值改為空字串」的錯誤實作穿過；驗證層已核實缺口，同 B10 根因；補建立與編輯回傳值測試。 |
| P1 | medium | 修正後 Chrome 實測分頁前後頁鈕仍無文字或 aria-label；補 getControlProps 中文名稱及測試，無新增產品行為。 |

上述項目均已修正並通過回歸檢查，無延後項目。最終後端 504、前端 226 項測試通過；完整證據見 [驗收紀錄](fr-03-04-validation.md)。

## Verification

- `backend/`：`uv run pytest`、`uv run ruff check .`、`uv run lint-imports`。
- `frontend/`：`npm run gen:api`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。
- 真實 PostgreSQL 整合測試僅使用 `_test` 資料庫；三頁做上述尺寸的瀏覽器檢查，記錄證據與限制。
