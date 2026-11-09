- source_spec: `_bmad-output/implementation-artifacts/spec-chore-seed-demo.md`
  summary: seed-demo --reset 除了 APP_ENV=production 之外沒有其他防護，也沒有顯示目標資料庫。
  evidence: APP_ENV 預設為 development，所以 DATABASE_URL 指向真實資料庫且未設 APP_ENV 時會直接清空；測試的 conftest 有 _test 名稱防護，CLI 沒有。
- source_spec: `_bmad-output/implementation-artifacts/spec-chore-seed-demo.md`
  summary: seed-demo 只有 RECEIPT 異動，沒有領用、報廢、盤點調整與位置變更的歷史。
  evidence: 需求只要求進貨單與批次；異動查詢與報廢損失畫面完成後，demo 時要現場操作才有資料。
- source_spec: `_bmad-output/implementation-artifacts/spec-design-system.md`
  summary: 色碼守門擴大到 src/shared 與 src/features 底下的 CSS module（ESLint 不檢查 CSS，可用 vitest 掃描或 stylelint）。
  evidence: 目前規則只檢查 src/features/**/*.{ts,tsx}；features 的 CSS module 現在沒有色碼，但沒有機制防止之後寫進去。
- source_spec: `_bmad-output/implementation-artifacts/spec-design-system.md`
  summary: 儲存位置頁的 ExpiryHint 在前端用 dayjs 算到期天數，與 AD-23 及新 AGENTS.md「前端不自己算狀態」衝突，應改用後端回傳的狀態與 StatusBadge。
  evidence: StorageLocationsPage.tsx 的 ExpiryHint 早在改版前就存在，這次只換了顏色。
- source_spec: `_bmad-output/implementation-artifacts/spec-design-system.md`
  summary: AGENTS.md 與 CLAUDE.md 內容相同、只靠人工同步，可加測試比對兩檔，或讓 CLAUDE.md 引用 AGENTS.md。
  evidence: 兩份各 42 行，只差第 3 行互相指向對方，沒有任何檢查。

- source_spec: `_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md`
  summary: 真PostgreSQL交易、競態、SQL篩選與Alembic漂移仍需執行證據。
  evidence: baseline及本輪測試都在setup因TEST_DATABASE_URL缺少而阻擋；Alembic check缺database_url/JWT_SECRET。依使用者限制未安裝DB或改環境，須在既有測試環境重跑。
- source_spec: `_bmad-output/implementation-artifacts/spec-westgvva-inventory-management.md`
  summary: 報表讀取歷史與明細的效能需依NFR-07負載驗證（medium風險，未驗證）。
  evidence: 查詢載入迄日前歷史與區間明細，讀取量隨資料增長；尚無超出SRS效能目標的實測證據。SRS將NFR-07列期末，負責人待確認，若不達標再依測量決定DB聚合/明細分頁。
