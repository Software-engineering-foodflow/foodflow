# 食材異動總覽／明細抽屜驗證

工作目錄：`C:/Users/USER/Documents/GitHub/foodflow-review-resume`。
本次改動僅前端報表、盤點布局與對應測試，沿用既有 API 與資料庫，不執行 migration 或業務異動。

## 瀏覽器證據

`browser-check.mjs` 使用本機 Playwright/Chromium 與18866前端服務，攔截 API 回傳固定測試資料。這是**真瀏覽器＋模擬資料**，非現有業務庫的新增交易。

`browser-results.json` 與 `1024-*`／`1366-*` 截圖涵蓋：
- 主表無重複庫存入口，Drawer唯一食材庫存入口。
- 四類Tabs、非FEFO明細篩選、隱藏UUID。
- ESC關閉回到原捲動位置；兩尺寸無頁面橫向溢出及JS錯誤。
- 盤點加入後輸入位於該批次的下一列。

首次截圖發現膠囊內文字被截短，已修正label換行、欄寬及同時顯示多個異常標籤；修正後重新產生截圖。截圖有實際檢視，不僅檢查DOM寬度。

執行：`node _bmad-output/verification/reports-master-detail/browser-check.mjs`。
腳本中的本機工具路徑僅對本環境有效；不宣稱可直接移植為CI測試。

## 自動測試與服務

前端測試涵蓋跨頁完整性、三位小數、單位分開、KPI口徑、篩選與Drawer、盤點選取及輸入保留。最後結果由規格 Implementation Notes 記錄。

現有服務的唯讀HTTP驗證見 `../westgvva-review-stocktake-ui/service-results.json`：健康檢查、認證查詢、報廢申請與歷史、盤點批次、數量異動及前端首頁成功；驗證前後來源庫相同。認證使用短效測試session，沒有重設密碼或執行密碼登入。

使用者要求commit/merge後，已同步必要的舊規格測試及預警待審核訊息。合併前全套後端798 passed、全套前端341 passed，lint/build及schema生成通過。
