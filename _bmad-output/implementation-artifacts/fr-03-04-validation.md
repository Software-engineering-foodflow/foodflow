# FR-03／04 驗收紀錄

日期：2026-11-08。範圍：食材分類、食材與供應商；需求依 `docs/srs.md`、Epic 1.1～1.3 及已核准規格。

## 自動化檢查

| 檢查 | 結果 |
|---|---|
| 後端全套 pytest | 619 passed，74.59 秒；2026-11-09 整合最新 main 後重新驗證 |
| 其中主檔整合測試 | 53 passed，使用真實 PostgreSQL |
| 主檔 Service 單元測試 | 5 passed，Fake Repository／UnitOfWork／FixedClock |
| 前端全套 Vitest | 17 個檔案、257 tests passed；其中主檔互動測試 18 項 |
| 前端 lint／typecheck／build | 通過 |
| API 型別 | 已執行 gen:api，由 OpenAPI 產生 schema.d.ts；主代理重新產生後 SHA256 一致 |
| 後端 Ruff／import-linter | 通過；4 個分層契約全部滿足 |
| git diff --check | 通過 |

執行位置及指令：

```text
backend/
uv run pytest -q -p no:cacheprovider --basetemp=../frontend/node_modules/.cache/foodflow/pytest-master-data-ship-20261109
uv run ruff check .
uv run lint-imports

frontend/
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run gen:api
```

既有 `.pytest_cache` 與系統暫存目錄有權限問題，因此停用 pytest cache，暫存測試檔改用已忽略的專案目錄。整合測試 fixture 確認資料庫名稱為 `_test` 後才會清理。

## 矩陣覆蓋

以下未註明路徑的案例皆位於 `backend/tests/integration/test_master_data.py`。

| 驗收條件 | 測試證據 |
|---|---|
| 建立／編輯及必填欄位 | `test_category_and_ingredient_lifecycle`；`test_required_fields_reject_missing_and_blank`：7 欄位 × 缺漏／空白 × POST／PATCH，確認欄位錯誤及失敗後資料不變 |
| 重複資料 | `test_duplicates_filters_and_pagination`、`test_unique_constraint_maps_field_error`；前端 `keeps duplicate values and maps backend fields` 驗證表單保留 |
| 安全庫存量 | lifecycle 驗證空白為 `0.000`；`test_invalid_quantities_are_not_truncated` 拒絕負數、四位小數、JSON number、科學記號及 null |
| 分類停用／刪除限制 | lifecycle；單元 `test_category_reference_protection` 驗證拒絕後分類不變 |
| 停用分類選用／食材重新啟用 | lifecycle；單元 `test_category_lock_precedes_ingredient_lock_and_reactivation_rejected` |
| 食材單位及刪除保護 | `test_draft_item_blocks_unit_change_and_delete`；`test_batches_keep_references_after_deactivation` 涵蓋耗盡及未耗盡批次 |
| 供應商聯絡資訊 | `test_supplier_contacts_and_permissions`；`test_each_supplier_contact_method_is_sufficient_on_create_and_update`；`test_supplier_update_cannot_clear_all_contact_methods` |
| 供應商進貨引用 | draft item 案例驗證已引用供應商不可刪除；`test_foreign_key_maps_referenced_even_if_precheck_is_skipped` 驗證資料庫最後防線 |
| 停用後查詢及歷史保留 | lifecycle、supplier contacts、batches keep references；既有 `test_inactive_ingredient_can_still_be_suggested_and_issued` 驗證領用仍可用 |
| 權限 | supplier contacts 對三資源驗證未登入查詢 401、員工 GET 200、POST／PATCH／DELETE 403；前端三頁員工案例驗證無維護按鈕 |
| 併發 | `test_assignment_waits_for_category_deactivation` 與 `test_deactivation_waits_for_ingredient_assignment_then_rejects`，透過 PostgreSQL 鎖等待，覆蓋停用／建立／重新啟用先取得鎖的順序 |
| 表單及快取 | 前端涵蓋具名停用、引用刪除失敗、忙碌中 Escape、成功快取失效、101 筆分類跨頁選單、查詢重試、空狀態及分頁；另驗證安全庫存建立／修改的字串值、空白預設與錯誤保留 |
| 審查回歸 | 三資源 PATCH ID 0 回 404；草稿測試明確保存 DRAFT；背景更新縮減總筆數會回到有效頁；必填語意及前後頁中文名稱均有測試 |

## 瀏覽器尺寸檢查

主代理以獨立無介面 Chrome 檢查三個頁面，使用固定 API 測試資料，避免修改正式資料。這部分驗證實際 React／Mantine 畫面與響應式行為；資料庫及權限規則由上述真實 API 整合測試驗證。

- 三頁皆檢查 `1024×768`、`1366×768`、`390×844`，共 9 個清單畫面。
- 三種新增表單各檢查 `1024×768`，共 3 個對話框。
- 所有檢查均符合 `document.documentElement.scrollWidth <= innerWidth`。
- Chrome 實測分頁數字、上一頁、下一頁及通知關閉按鈕均為 `44×44px`；前後頁無障礙名稱另由元件測試驗證。
- 另實際檢視桌機及平板食材、桌機與手機供應商、食材新增表單等截圖；已修正桌機操作按鈕換行與平板卡片過高。
- 截圖位於 [docs/design/screenshots](../../docs/design/screenshots/)，檔名為 `ingredient-categories-*`、`ingredients-*`、`suppliers-*`。

## 環境與範圍限制

三個審查視角的發現已逐項核實並修正，無延後項目；判定及證據保留於規格的 Review Triage Log。

- 初次實作以 Node `26.13.0` 驗證；2026-11-09 推送前改用已安裝的 Node `24.22.2`（僅調整檢查程序的 PATH），完整前端檢查通過。
- Vite 提示 bundle 大於 500KB，建置成功；本次未改動分包策略。
- 主檔資料表已存在，本次沒有 migration；進貨及預警交易實作維持其原有開發範圍。
- 2026-11-09 依使用者指示，以 main `09dd7d958fbd96700ea12db4ba85250d31cf06c7` 建立 `feat/master-data-fr03-fr04`；保留上游報廢、盤點、統計及 UI 更新，並重新產生 OpenAPI 型別解決整合衝突。
- AI 使用紀錄由使用者確認後標為「已確認」，提交身分使用其提供的組員姓名與 Email。
