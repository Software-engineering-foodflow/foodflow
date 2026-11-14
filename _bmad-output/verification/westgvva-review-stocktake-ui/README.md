# UI 驗收證據（2026-11-13）

獨立後端 `127.0.0.1:18765`、Vite `127.0.0.1:18766`；只連本次新建庫 `foodflow_ui_593cfd7bbe6c_test`。測試帳號／cookie fixture 保留於本機暫存，未收入此目錄或版控。沒有修改既有服務、foodflow、foodflow_test。

執行：`node C:/Users/USER/AppData/Local/Temp/foodflow-ui-review/check.mjs` 及 `node C:/Users/USER/AppData/Local/Temp/foodflow-ui-review/flows.mjs`。使用既有 `C:/Users/USER/Documents/playwright-demo/node_modules/playwright-core` 與 `C:/Users/USER/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`。此目錄保存兩支實際執行腳本副本；需要本機暫存 fixture 與獨立服務，並非可直接指向正式庫的測試。

## 通過範圍

- `results.json`：1024×768、1366×768 的報廢、盤點、報表及兩種彈窗，document scrollWidth 與 viewport 相等，無頁面橫向溢出、無 JS pageerror。
- 同份結果：鍵盤 Enter 開框、Escape 關框、Tab 留框；盤點關框後再開保留輸入。
- `flow-results.json`：兩尺寸皆實際選入兩批、防重選、定期必選週期、其他必填說明；預覽使用伺服器的帳面量、實際量與零差額；連續 Tab 30 次焦點留框；確認成功才關框、結果可見（modalAfterSuccess=0）。
- 1024 實際報廢流程另驗證：暫緩 POST 時 Escape 不能關框、取消禁用；解除暫緩後申請待審核且批次量不變；管理員鍵盤 Enter 核准後量才減 1。見 `1024-waste-busy.png`、`1024-waste-approved.png`。這段首輪執行沒有最終 JSON（後續盤點選項測試中斷），不冒稱兩尺寸皆跑完整報廢交易。
- `view_image` 人工逐張檢查代表圖：1024 報表、1024 盤點彈窗與預覽、1366 報廢彈窗、1366 報表、1366 盤點成功。確認文字與狀態可讀、批次/位置/單位及數字清楚；長彈窗可縱向捲動到確認按鈕。

## 驗收發現與修正

- 分頁原本 38px，現在 feature 局部指定 control 高/寬至少44px，字級保留14px。
- 報表追溯連結原本19px，現在各連結 minHeight/minWidth 44px。
- 盤點原本成功結果在仍開啟彈窗後方，改為 confirm 成功回傳 true 後關框；錯誤仍保留彈窗與輸入。
- 移除盤點明細標題重複顯示單位。
- `results.json` smallTargets 僅列既有全站「收合導覽列」30px外觀；`frontend/src/app/theme.css` 的 `.ff-hit-44::before { inset: -7px }` 已將其有效點擊區擴為44px，未修改全站樣式。

修後 feature 測試22 passed、ESLint及build（含typecheck）通過；build仍有既有500kB chunk提醒。正式資料庫備份與套用 migration 不屬此 UI 驗收，尚未執行。

## 審查修正後的回歸（2026-11-13）

最終工作目錄為 `C:/Users/USER/Documents/GitHub/foodflow-review-resume`，原目錄的文件分支未修改。`review-regressions.mjs` 以環境變數指定 Playwright module、Chromium、隔離服務網址、版控外 fixture 與證據目錄；本次使用18865/18866及 `foodflow_ui_ed2625e3a535_test`。兩尺寸通過結果在 `review-results.json`，截圖已關閉動畫並用 view_image 核對。

本次檢查：全數申請成功後內外彈窗都關閉、成功訊息可見、申請仍不扣量、返回上一頁重開指定批次、無橫向溢出及JS錯誤。前端新增回歸涵蓋普通/全數申請回第一頁及核准失敗的最新剩餘量，最終前端27測試、後端96單元與24整合測試通過。

測試完成後已透過所屬執行session停止本次18865/18866服務；隔離測試資料庫保留。原始18765/18766服務狀態不由本次變更。未執行正式庫備份、還原或 migration：Docker API 權限仍拒絕。
