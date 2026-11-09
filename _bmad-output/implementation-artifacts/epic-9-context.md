# Epic 9 Context: 資料保存與期中驗收

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

讓店長能備份與還原資料，並在還原後自動核對批次與異動是否一致，確保電腦故障或誤操作時不失去庫存紀錄；同時把 SRS 第 9 節的端到端示例（進貨 → 領用 → 預警 → 報廢 → 盤點，含跨日）寫成可重跑的自動化驗收，並以固定日期完成期中展示前的手動走查。本 epic 不新增功能需求，負責人為 Ken（整合），收尾的是資料保存、可追溯與期中展示的可驗證性。

## Stories

- Story 9.1: 備份與還原
- Story 9.2: 第 9 節端到端驗收與跨日驗收

## Requirements & Constraints

- **資料保存**：後端或資料庫容器重啟後，先前成功的紀錄必須仍在；要有備份與還原程序，還原後核對批次與異動一致。
- **可追溯**：所有數量變動有操作者、時間與來源，目前量可由有效異動重算。
- **一致性**：同批次多人操作、重複提交或中斷不得產生負庫存、重複異動或半套資料。
- **驗收標準**：流程可完整操作（進貨至庫存追查）；庫存可與異動核對，超量、重送、併發不出現負庫存或重複入庫；預警的正常、即期、今日到期、過期、低庫存、零庫存與跨日邊界都符合規則。
- **端到端示例（全部 11 列都要對上）**：今天 2026/10/31、預警 3 天；雞胸肉安全庫存 10 公斤；批次 A 5 公斤、單價 120、11/01 到期；批次 B 8 公斤、單價 115、11/07 到期，皆在冷藏庫 A。重點結果：
  - 兩批入庫後實體與可用量 13，A 即期、B 正常，沒有低庫存。
  - 領 3 公斤時系統建議 A；領完 A 剩 2、B 剩 8，可用量 10，觸發低庫存（≤ 安全庫存且安全庫存 > 0）。
  - 改選 B 領 1 公斤要填原因，異動標記為非 FEFO。
  - 再從 A 領 3 公斤會被拒絕，庫存不變。
  - 11/01 查詢時 A 今日到期；11/02 查詢時 A 過期、不得領用，實體量 9、可用量 7。
  - 報廢 A 的 2 公斤後 A 歸零並移出預警，損失 240 元，歷史仍在。
  - 盤點 B 實際 6 公斤，調整 -1，可查原因與操作者。
  - 兩人同時各領 B 的 4 公斤，最多一人成功，不產生負庫存。
  - 同一筆進貨或報廢請求重送只生效一次。
  - 員工嘗試盤點會被拒，管理者可以。
- **日期規則**：D = 到期日 − 今天（Asia/Taipei）；D<0 過期、D=0 今日到期、1≤D≤T 即期、D>T 正常；今日到期仍可領用，次日禁止。
- **畫面尺寸**：手動走查在 1024×768 與 1366×768 各走一次「進貨 → 領用 → 預警 → 報廢」，發現的問題開 issue 指派給對應 epic 的負責人。

## Technical Decisions

- **docker compose**：只有一個服務 `db`（`postgres:17-alpine`，具名 volume `db-data`，埠只綁 `127.0.0.1`）。後端不在 compose 裡，開發時在本機以 `uvicorn` 執行，所以「停止後端」是停掉本機的 uvicorn 程序。帳號與資料庫名稱從 `.env` 的 `POSTGRES_USER`、`POSTGRES_DB` 讀取。
- **備份**（`scripts/backup.sh`）：在 `db` 容器內執行 `pg_dump -Fc`，再用 `docker compose cp` 取出到本機，檔名要含時間。
- **還原**（`scripts/restore.sh`）：順序是先停後端，再執行 `pg_restore --clean --if-exists --no-owner`，接著跑 `python -m app.cli verify-stock`，最後比對備份前後的批次與異動筆數；任一步不一致就以非零狀態結束。README 要寫使用方式，並說明 Windows 要在哪個 shell 執行（例如 Git Bash）。
- **`verify-stock`**（`backend/app/cli.py`，用 `uv run python -m app.cli verify-stock` 執行）會檢查三件事，有差異時以非零狀態結束：
  - 每個批次 `remaining_quantity == SUM(quantity_delta)`。
  - 最新一筆異動的 `quantity_after == remaining_quantity`。
  - 每筆 `WASTE` 異動都有對應的 `waste_record`。

  併發整合測試的結尾也要跑它。
- **時間只來自 Clock**：
  - 程式與 SQL 不可用 `datetime.now()`、`date.today()`、`func.now()`、`CURRENT_DATE`。
  - `get_clock` 只定義在 `core/dependencies.py`。
  - API 整合測試用 `app.dependency_overrides[get_clock]` 換成 `FixedClock`，跨日時改覆寫的日期。
  - 手動驗收與 demo 在 `.env` 設 `APP_FIXED_NOW`（要含時區，例如 `2026-11-18T09:00:00+08:00`）；`APP_ENV=production` 時會被忽略。
- **`APP_FIXED_NOW` 下登入**：JWT 的 `exp` 由 `clock.now()` 計算，解碼時關掉函式庫的 exp/iat 驗證，改由 `get_current_employee` 用注入的 Clock 比對，所以固定日期下仍能登入。驗收時一定要包含「固定日期下登入並完成一次寫入」。
- **`seed-demo [--reset]`**：建立 SRS 第 9 節的示範場景，`APP_ENV=production` 時拒絕執行。到期狀態會隨日期改變，隔天要重現同樣情境就跑 `--reset`。初始化順序是 `docker compose up -d db` → `alembic upgrade head` → `create-admin` → `seed-demo`。
- **測試資料庫**：用同一個容器裡的 `foodflow_test`（`TEST_DATABASE_URL`，名稱必須以 `_test` 結尾，整合測試會清空它）。它由 `docker/initdb/` 在資料目錄為空時建立；既有環境要手動 `CREATE DATABASE`。
- **庫存只能經由 `StockLedger` 變動**；交易邊界在 Service，並用列鎖與防重送 key，這些是併發與重送那幾列能通過的前提。
- **換資料庫的影響**：日後換資料庫時，`scripts/backup.sh`、`restore.sh` 屬於必須跟著修改的檔案。

## Cross-Story Dependencies

- 9.1 與 9.2 都依賴 `verify-stock`，cli 裡已經有這個指令。
- 9.2 的 11 列操作要用到其他 epic 的成果：主檔（Epic 1）、進貨與沖銷、領用與 FEFO、預警與低庫存、報廢、盤點、權限，以及防重送與列鎖。任一模組的行為跟第 9 節不符時，開 issue 給該 epic 的負責人，不在本 epic 修改。
- 9.2 的手動走查依賴 `seed-demo --reset` 與前端四個主要頁面（進貨、領用、報廢、預警）。
