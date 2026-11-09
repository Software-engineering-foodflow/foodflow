# 預警首頁瀏覽器驗證

2026-11-09，以 Vite production preview 與 Playwright 操作本機 Edge headless。

`results.json` 記錄兩個 viewport 的 document 寬度、可見表格列數與可見控制項尺寸。API 由瀏覽器 route fixture 提供（過期、今日、即期、低庫存），不是 live DB 端到端；真實 PostgreSQL 與 API 由後端整合測試驗證。

每個尺寸依序驗證：首頁呈現、狀態篩選、位置篩選及位置可用量、清除篩選、管理者設定儲存 0、過期批次快照確認、成功報廢後清單移除及重查。初始與報廢確認畫面分別存成 PNG。

兩個尺寸皆無水平溢出、可見五列；已量測的可見控制項高度44px。隱藏的 Mantine 表單欄位不列入觸控目標量測。
