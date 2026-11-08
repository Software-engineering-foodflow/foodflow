- source_spec: `_bmad-output/implementation-artifacts/spec-chore-seed-demo.md`
  summary: seed-demo --reset 除了 APP_ENV=production 之外沒有其他防護，也沒有顯示目標資料庫。
  evidence: APP_ENV 預設為 development，所以 DATABASE_URL 指向真實資料庫且未設 APP_ENV 時會直接清空；測試的 conftest 有 _test 名稱防護，CLI 沒有。
- source_spec: `_bmad-output/implementation-artifacts/spec-chore-seed-demo.md`
  summary: seed-demo 只有 RECEIPT 異動，沒有領用、報廢、盤點調整與位置變更的歷史。
  evidence: 需求只要求進貨單與批次；異動查詢與報廢損失畫面完成後，demo 時要現場操作才有資料。

- source_spec: `_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md`
  summary: 真PostgreSQL交易、競態、SQL篩選與Alembic漂移仍需執行證據。
  evidence: baseline及本輪測試都在setup因TEST_DATABASE_URL缺少而阻擋；Alembic check缺database_url/JWT_SECRET。依使用者限制未安裝DB或改環境，須在既有測試環境重跑。
- source_spec: `_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md`
  summary: 報表讀取歷史與明細的效能需依NFR-07負載驗證（medium風險，未驗證）。
  evidence: 查詢載入迄日前歷史與區間明細，讀取量隨資料增長；尚無超出SRS效能目標的實測證據。SRS將NFR-07列期末，負責人待確認，若不達標再依測量決定DB聚合/明細分頁。
