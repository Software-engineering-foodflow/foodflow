# 報廢審核與盤點改善：結案檢核

目前狀態：**程式、審查、備份還原、資料庫升級與服務驗證完成；使用者已要求commit及merge，合併前完整後端798項與前端341項測試通過。**

## 合併前最終驗證

使用者明確要求提交合併後，同步必要的舊規格測試：13張表、新審核路由、預警在報廢待審核時仍保留。預警頁完成訊息同步改為待審核；沒有修改預警計算規則。
完整後端798 passed（獨立庫 `foodflow_ci_1575a68951a9_test`），完整前端341 passed；Ruff、4項分層契約、ESLint、TypeScript、build及API schema重新生成均通過。
以下尚缺項目段落是先前過程紀錄，已由此次驗證結清；只有後來新增的歷史盤點編輯／註解需求另待釐清，不包含在本次交付。

## 已完成成果

- 功能分支：`feat/westgvva-review-stocktake-ui`；工作目錄 `C:/Users/USER/Documents/GitHub/foodflow-review-resume`。
- 報廢申請先待審核；管理員核准才一次扣量、建立紀錄與更新申請，駁回保留原因及審核人員。
- 報廢與多項盤點彈窗、四類盤點原因與週期、批次數量核對、異動及統計畫面。
- 一般審查的確認缺陷已修復，包括歷史重送、全數申請成功關閉、返回導航、分頁與不足量提示。
- 前端31測試、後端96單元及24隔離PostgreSQL整合測試通過；lint、型別、build與4項分層契約通過。
- 最後審查補修：未套用報表篩選可清空；普通報廢失聯後關框重開仍保留提交內容與 key，禁止改內容另送；補齊核准／駁回成功後頁面重新載入的回歸測試。
- 1024×768及1366×768實際畫面／鍵盤檢查與修後回歸通過。截圖與 JSON 均在此目錄。
- 未commit、push或合併；未修改原目錄的文件分支；未刪除現有業務資料。

## 現有資料庫預檢

2026-11-13 20:26（台北）以 REPEATABLE READ、READ ONLY 交易檢查 `foodflow`：schema `0001`、21批庫存、21筆異動、0筆已生效報廢、0筆庫存／帳本不一致；`waste_request`不存在。詳見 `current-database-preflight.json`。這只是唯讀預檢，並非備份或上線成功證據。

## 尚缺的結案證據

1. 完整後端測試發現三處預期需同步已核准的新功能：`test_alerts.py` 原假設 create 立即生效、`test_architecture_rules.py` 原限12表、`test_api_conventions.py` 未列新3個審核端點。具體提案見 `alerts-test-proposal.diff`，待使用者確認共用／其他模組測試修改。
2. 完整測試首輪：779 passed、5 failed、14 errors。3個失敗由 migration UTF-8 BOM 造成，已移除 BOM；14 errors 由既有暫存目錄權限造成，沙箱外重跑相關兩檔為28 passed、2 failed，僅剩上述表數與路由預期。預警舊假設另待修正。不將此輪宣稱全部通過。

## 已執行的部署（2026-11-14）

使用者明確回覆「確認並執行」後，CI 已移除 downgrade base 並更名步驟，保留 upgrade/check/pytest。
套用前重新確認 dump SHA256 與來源所有表雜湊均吻合已驗證備份，再套用現有 `foodflow` 至0002。
`deployment-results.json` 證明既有表資料雜湊全部保留、21批庫存與21筆異動未變、stock mismatch=0、Alembic check通過。

新版服務目前在 `http://127.0.0.1:18866/`（前端）、18865（後端），使用本worktree與原環境設定。`service-results.json` 記錄健康檢查、已驗證身分、申請／歷史列表、盤點批次、異動列表與前端首頁均200；服務檢查前後資料庫相同。使用短效測試 session 驗證既有帳號的認證查詢，未操作密碼登入、未修改帳號或業務資料。這是本機開發服務，非開機自動啟動或外部正式主機部署。

## 已補齊的備份與還原證據

權限調整後，既有 `scripts/backup.sh` 已成功執行。備份：
`C:/Users/USER/Documents/GitHub/foodflow/backups/foodflow-20261113-220715.dump`（42,883 bytes）。
SHA256：`e5af0cc0913aa36701ac9173e6f4f2a32389efca31ec3bdc7927037e4b8c4c59`。

`restore-check.py` 將備份還原至全新獨立庫 `foodflow_restore_240e0582caa5_test`，核對 21 批庫存、21 筆異動、庫存帳本一致，再只對該新庫升級至0002並通過 Alembic check。所有既有表資料雜湊保留，現有來源庫前後相同，仍為0001。詳見 `restore-results.json`；沒有覆蓋現有庫，也沒有刪除測試庫。

兩份先前被拒絕的審查現在已完成；step-05-present 也已成功讀取。先前權限阻礙不再列為未解問題。

## 待確認的具體套用範圍

- Migration檔：`backend/alembic/versions/20261113_0002_waste_request.py`。
- 僅新增 `waste_request`、其唯一鍵、外鍵、檢查約束與三個索引，以及Alembic版本更新。
- 不修改既有庫存、異動、報廢歷史、員工或其他模組資料。
- 現有服務須載入本worktree的後端與前端，避免schema與程式版本不一致。主工作目錄仍是文件分支，不能把該版本當作已部署新功能。
- 復原優先停止新功能並保留申請表，因申請具有稽核價值，不執行刪表downgrade。若需回復備份，先保存當下資料並在另一新庫驗證，取得切換確認後才切換，避免覆蓋後續交易。

## 恢復工作的最短路徑

完整檢查已通過，依使用者指令提交並透過PR合併至main。個人講稿與忽略的環境／暫存檔不納入。
