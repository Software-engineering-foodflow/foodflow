---
title: 'Story 9.1 備份與還原'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
baseline_commit: '15efebb00c51edfd1d15efd1323c931d4f4e5140'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 目前沒有備份與還原程序（NFR-06），電腦故障或誤操作時會失去庫存紀錄，還原後也無法確認批次與異動是否一致。

**Approach:** 新增 `scripts/backup.sh` 與 `scripts/restore.sh`。備份在 `db` 容器內 `pg_dump -Fc`，以 `docker compose cp` 取出到 `backups/`，檔名含時間，並把當下的批次與異動筆數存成同名 `.counts` 檔；還原前確認後端已停止，`pg_restore --clean --if-exists --no-owner` 後自動跑 `verify-stock` 並比對筆數，任一步失敗以非零狀態結束。README 補使用方式與 Windows 用 Git Bash 執行。

## Boundaries & Constraints

**Always:**
- 帳號與資料庫名稱取自容器的 `POSTGRES_USER`、`POSTGRES_DB`，不在腳本寫死。
- 腳本從任何工作目錄呼叫都能跑（先切到 repo 根目錄，參數中的相對路徑以呼叫者的目錄為準）。
- Git Bash 下關閉 MSYS 路徑轉換（`MSYS_NO_PATHCONV=1`），否則容器內的 `/tmp/...` 會被改寫成 Windows 路徑。
- `set -euo pipefail`；容器內暫存檔用完即刪；錯誤訊息用繁體中文、寫到 stderr。
- 還原用 `--single-transaction`，失敗時資料庫維持原狀。
- `backups/` 加入 `.gitignore`（備份含帳號雜湊，不能 commit）。
- **決定（使用者）：** 驗證時在開發資料庫 `foodflow` 實際來回測試（先備份、再還原同一份）；輪到還原時請使用者先停掉 uvicorn。

**Never:**
- 不改後端程式碼、不新增 Python 套件、不改 `docker-compose.yml`。
- 腳本不自行停止或啟動 uvicorn，只檢查並提示。
- 不做排程、輪替或刪除舊備份。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 備份成功 | `db` 執行中 | 產生 `backups/foodflow-YYYYmmdd-HHMMSS.dump` 與 `.counts`，印出路徑與筆數，exit 0 | N/A |
| 備份中資料變動 | 備份前後筆數不同 | 刪除本次產物，提示稍後重試或先停後端 | exit 1 |
| `db` 未啟動 | 容器沒在跑 | 提示 `docker compose up -d --wait` | exit 1 |
| 還原成功 | 後端已停，給 `.dump` 路徑 | 互動確認後還原、`verify-stock` 通過、筆數相符，exit 0 | N/A |
| 後端仍在跑 | 資料庫有其他連線 | 拒絕還原、未變更資料，提示先停後端 | exit 1 |
| 未確認 | 確認時輸入非 `yes` | 取消，未變更資料 | exit 1 |
| 檔案不存在或缺 `.counts` | 錯誤路徑 | 在動資料庫前就拒絕 | exit 1 |
| 還原後不一致 | `verify-stock` 失敗或筆數不符 | 印出差異 | exit 非零 |

</frozen-after-approval>

## Code Map

- `docker-compose.yml` -- 唯一服務 `db`，具名 volume `db-data`（重啟後資料仍在即靠它，AC3 不需改程式）。
- `backend/app/cli.py` -- `verify-stock`（`find_stock_discrepancies`），有差異 exit 1；直接沿用，在 `backend/` 內 `uv run python -m app.cli verify-stock`。
- `backend/app/db/models/inventory.py` -- 表名 `inventory_batch`、`inventory_transaction`（筆數比對對象）。
- `alembic_version`（Alembic 管理的表，欄位 `version_num`）-- schema 版本檢查的依據；目前 `alembic heads` 只有一個 head。
- `.gitattributes` -- `*.sh` 已設 LF，新腳本不用另外處理。
- `README.md` -- 「常用工作」表與「疑難排解」表；疑難排解已記載 Git Bash 下 `docker compose` 可能找不到 `docker-credential-desktop`（只影響拉映像，`exec`、`cp` 不受影響，需實測確認）。
- `scripts/` -- 目前只有 `ai-evidence/`、`ship.mjs`，新腳本放這層。

## Tasks & Acceptance

**Execution:**
- [x] `scripts/backup.sh` -- 新增：開頭 `umask 077` → 檢查 `db` 執行中 → 查筆數與 `alembic_version.version_num` → 容器內 `pg_dump -Fc -f /tmp/...` → `docker compose cp` 到 `backups/` → 再查筆數，不同則刪產物並失敗 → 寫 `.counts`（`batches=N`、`transactions=N`、`alembic=<rev>`）→ 刪容器暫存檔。
- [x] `scripts/restore.sh` -- 新增：參數為 `.dump` 路徑，可加 `--yes` 略過確認；檢查檔案與 `.counts`（每個鍵只取第一行；缺 `alembic=` 視為格式錯誤）→ 檢查 `pg_stat_activity` 沒有其他連線 → **schema 版本檢查**（見 Design Notes）→ 確認 → **確認後再查一次連線** → `docker compose cp` 進容器 → `pg_restore --clean --if-exists --no-owner --single-transaction` → `verify-stock` → 比對筆數 → 刪暫存檔。驗證失敗時的訊息要說明資料已換成備份內容（不是原狀）。
- [x] `.gitignore` -- 加 `/backups/`（只錨定根目錄）。
- [x] `README.md` -- 新增「備份與還原」小節（用法、檔名、還原前要停後端、在 Git Bash 執行）；還原步驟第一步是先跑 `scripts/backup.sh` 保留目前資料；說明 schema 版本不同時會被拒絕及如何處理（`alembic downgrade <備份的版本>` 後再還原，完成後 `alembic upgrade head`）；說明驗證失敗代表資料已換成備份內容，可用剛才的備份還原回去；「常用工作」表加兩列。
- [ ] commit 時（由組員執行）-- `git add --chmod=+x scripts/backup.sh scripts/restore.sh`，讓 Linux/macOS 可直接執行；實作端不 stage，只在完成回報中提醒。

**Acceptance Criteria:**
- Given 系統有資料，when 在 Git Bash 執行 `scripts/backup.sh`，then 在 `backups/` 得到含時間的 `.dump` 與 `.counts`。
- Given 一份備份且後端已停，when 執行 `scripts/restore.sh <檔案>` 並確認，then 還原後 `verify-stock` 通過、批次與異動筆數與 `.counts` 相同，exit 0；不一致時 exit 非零。
- Given `db` 容器重啟（`docker compose restart db`），when 再查詢，then 先前的資料仍在。
- Given 組員第一次使用，when 讀 README，then 知道指令、檔案位置、還原前要停後端、要在 Git Bash 執行。

## Implementation Notes

- 新增 `scripts/backup.sh`、`scripts/restore.sh`；修改 `.gitignore`、`README.md`。Git Bash 下 docker.exe 不認 `/c/...` 路徑，本機路徑用 `cygpath -w` 轉換；`verify-stock` 在 Git Bash 下要加 `PYTHONIOENCODING=utf-8` 才不會亂碼。
- 連線檢查只算 `backend_type = 'client backend'`，排除自身查詢。
- 矩陣實測（2026-11-09，開發資料庫 `foodflow`，批次 21／異動 21）：備份成功；備份中筆數變動（以 PATH 上的 docker 包裝程式讓第二次查詢回傳不同筆數模擬）→ exit 1、產物已刪；`db` 停止時兩支腳本都 exit 1；後端在跑時拒絕還原；輸入 `no` 取消；檔案不存在、缺 `.counts` 拒絕；`.counts` 改成 999 時還原後 exit 1；正常還原 exit 0；`docker compose restart db` 後 `verify-stock` 通過、筆數不變。
- 實測期間有另一個 Claude session 自動重開 8001 的 uvicorn，經使用者同意後再次停止。
- 新檔在 Windows 上的 git mode 是 100644，commit 前要 `git add --chmod=+x scripts/backup.sh scripts/restore.sh`，否則 Linux/macOS 無法直接執行。
- 第 1 輪 loopback 後重新實作（舊版腳本已撤銷重寫）。`.counts` 多了 `alembic=`，舊格式備份（14:19、14:22、14:25）會被判為格式錯誤。協調者抽測：`alembic=deadbeef` 時拒絕並列出兩版本、exit 1；正常還原 exit 0；確認等待期間另開 psql 連線，確認後的複查擋下、exit 1。

## Spec Change Log

**第 1 輪（review_loop_iteration 1）**
- **觸發：** 審查發現 #5／#21（schema 版本不同時 `--clean` 殘留新表、`alembic_version` 退回）、#2（確認後未再查連線）、#3／#4（沒有還原前備份與驗證失敗指引）、#1（執行權限）、#10、#11、#17。
- **修改：** Tasks 加 `.counts` 的 `alembic=`、schema 版本檢查、確認後再查連線、`umask 077`、`.counts` 每鍵取第一行、`/backups/`、README 還原前先備份與失敗指引、commit 時設 +x；Design Notes 加版本檢查規則；Verification 加兩項版本檢查。
- **避免的已知錯誤狀態：** 還原舊備份到較新 schema 後，資料庫留下新表卻標成舊版本，之後 `alembic upgrade` 失敗；確認等待期間後端重開仍照樣還原；選錯檔後目前資料無法找回。
- **KEEP：** 第一版的整體流程與訊息風格都可行且已實測通過——`set -euo pipefail`、從任何目錄呼叫（相對路徑先轉絕對再 cd 根目錄）、`db_sql` 以 `sh -c '... "$1"' sh "$1"` 傳 SQL 並 `tr -d '\r'`、`docker compose ps --status running --services` 判斷 db、`.dump` 副檔名檢查、`--yes`／`-h` 參數處理、`read -r -p` 互動確認只接受 `yes`、`pg_restore` 失敗訊息「交易已回復，資料庫維持原狀」、驗證段落累積 `status` 後統一結束、README 疑難排解中 `docker-credential-desktop` 列的補充說明。

## Review Triage Log

第 1 輪（B＝Blind Hunter、E＝Edge Case Hunter、V＝Verification Gap）

| # | 來源 | 發現 | 判定 | 證據 | 去向 |
|---|------|------|------|------|------|
| 1 | B | 新腳本 git mode 100644，Linux/macOS 無法直接執行 | medium | diff 顯示 `new file mode 100644`；README 寫 `scripts/backup.sh` 直接執行 | bad_spec（commit 時設 +x，寫進 Tasks） |
| 2 | B、E、V | 連線檢查與 `pg_restore` 之間隔著確認與 cp，期間可能有新連線（TOCTOU） | medium | restore.sh 222–251；實測時另一個 session 確實在數秒內重開 uvicorn | bad_spec |
| 3 | B | 還原前沒有保留目前資料，選錯檔就救不回來 | medium | restore.sh 直接 `--clean` 覆蓋，README 未提醒先備份 | bad_spec（README 步驟） |
| 4 | B | 驗證失敗時資料已被覆蓋，README 沒說怎麼辦，且易與「失敗維持原狀」混淆 | medium | README 只說 pg_restore 失敗維持原狀；verify 失敗時交易已 commit | bad_spec（與 #3 同根：缺復原路徑） |
| 5 | B、E、V | 備份與目前資料庫 migration 版本不同時，`--clean` 只刪 dump 內物件，新表殘留、`alembic_version` 退回舊版 | medium | PostgreSQL `pg_restore --clean` 只對 dump 內物件發 DROP；README「覆蓋所有資料」因此不精確 | bad_spec |
| 6 | B、E、V | `verify-stock` 讀 `.env` 的 `DATABASE_URL`，可能不是容器的 `POSTGRES_DB` | low | 需 shell 另外 export 或 `.env` 不一致才會發生；修法要加比對分支 | 駁回（low 且需加 guard） |
| 7 | B | 筆數只比兩張表 | false | 意圖明定比對「批次與異動筆數」 | 駁回 |
| 8 | B | 備份前後比筆數會誤判、抓不到 UPDATE | low | dump 本身在快照內一致；批次與異動只 INSERT 不 DELETE，筆數相同即與 dump 一致；誤判只造成提示重試 | 駁回（設計取捨，見 Design Notes） |
| 9 | B | 兩支腳本重複 `db_sql`、計數 SQL 等 | low | 計數 SQL 兩處需同步；修法要抽 lib，非直接修正 | 駁回 |
| 10 | B | `.gitignore` 的 `backups/` 會忽略任何層級 | low | 直接修正為 `/backups/` | bad_spec（一併修） |
| 11 | B | 備份檔權限未收緊 | low | 加 `umask 077` 一行即可 | bad_spec（一併修） |
| 12 | B、V | 腳本沒有自動化測試，CI 不執行 | medium | CI 用 service container，腳本依賴 `docker compose exec/cp`，要改 CI 架構 | defer |
| 13 | B | diff 缺 ai-evidence 與 bmad 產物 | false | 這些在 commit 時由 ship 流程產生，不屬程式 diff | 駁回 |
| 14 | E | uvicorn 在跑但連線池尚無連線，檢查會通過 | low | 還原是單一交易，之後的請求只是讀到還原後資料；探測埠要假設 port | 駁回（low 且需加 guard） |
| 15 | E | 還原中 Ctrl+C，`exec -T` 下 pg_restore 可能照樣 commit、驗證沒跑 | low | 少見；處理訊號要加 trap 分支 | 駁回 |
| 16 | E | `.env` 缺或無效時，資料庫已覆蓋才發現 verify-stock 跑不起來 | low | 後端本身也跑不起來，使用者會先發現；修法要加預檢 | 駁回 |
| 17 | E | `.counts` 有重複行時解析成多行 | low | 只有手改才會發生；`head -n1` 直接修正 | bad_spec（一併修） |
| 18 | E | `.counts` 與 `.dump` 被錯配 | low | 需手動改名；修法要加 sha256 | 駁回 |
| 19 | E | 同一秒啟動兩次備份，cleanup 互刪 | low | 已有存在檢查，只剩極窄競態；修法要加唯一後綴 | 駁回 |
| 20 | E | 宣稱「後端沒停會拒絕」，但連線池可能為空 | low | 同 #14 | 駁回 |
| 21 | E | README「覆蓋所有資料」與 `--clean` 行為不符 | medium | 同 #5 | bad_spec（併入 #5） |

第 2 輪

| # | 來源 | 發現 | 判定 | 證據 | 去向 |
|---|------|------|------|------|------|
| 22 | B | 腳本 git mode 100644 | medium | carried #1：commit 時設 +x（Tasks 最後一項） | 已列入 Tasks |
| 23 | B、E、V | `verify-stock` 可能連到不同資料庫；`uv` 未預檢 | low | carried #6、#16 | 駁回 |
| 24 | B、E | 第二次連線檢查後到 `pg_restore` 仍有窗口；連線池為空時偵測不到 | low | carried #14；剩餘窗口只有 cp 加 restore 數秒，閒置連線不持有表鎖 | 駁回 |
| 25 | B、E | `.counts` 與 dump 不在同一快照，UPDATE 或一增一刪偵測不到 | low | carried #8 | 駁回 |
| 26 | B | `.counts` 與 dump 配對、完整性無檢查 | low | carried #18 | 駁回 |
| 27 | B | 只驗兩張表筆數 | false | carried #7 | 駁回 |
| 28 | B、E | `alembic_version` 存在但為空時，拒絕並給出無法執行的 downgrade 提示 | low | restore.sh 274：空字串 != 備份版本即拒絕；`alembic downgrade base` 後即是此狀態；直接修正條件 | patch |
| 29 | B | `docker compose exec` 本身失敗時仍說「交易已回復」 | low | 單一交易未完成就中斷，伺服器端一律回復；少見 | 駁回 |
| 30 | B | 沒有備份保留與輪替 | false | 意圖明定不做排程、輪替 | 駁回 |
| 31 | B、V | 沒有自動化測試 | medium | carried #12，已 defer | 已 defer |
| 32 | B | `--help` 依賴固定行號 | low | 只影響說明輸出，修法要改結構 | 駁回 |
| 33 | B | 缺 ai-evidence | false | carried #13 | 駁回 |
| 34 | E | `docker compose cp` 不受 umask 影響，dump 權限 0644 | low | `umask` 只作用於本程序建立的檔案，cp 由 docker 寫入；一行 `chmod 600` 直接修正 | patch |
| 35 | E | 同一秒兩次備份互刪 | low | carried #19 | 駁回 |
| 36 | E | 多個 alembic head 時 `version_num` 多行 | low | 專案要求單一 head（README、CI 檢查） | 駁回 |
| 37 | E | Ctrl-C 時 pg_restore 可能照樣 commit | low | carried #15 | 駁回 |
| 38 | E | 檔名以 `-` 開頭被當成選項 | low | 檔名還必須以 `.dump` 結尾，極少見 | 駁回 |
| 39 | E | db 在跑但還沒 healthy 時錯誤訊息誤導 | low | 只是提示不精確，重試即可；修法要加預檢 | 駁回 |

## Design Notes

筆數存在 `.counts` 而不是還原前即時查，因為還原前的資料庫是要被覆蓋的那份，不能當「備份前」的基準。備份前後各查一次筆數，是為了在後端仍在寫入時抓到 dump 與筆數不同步的情況（不必動用 `--snapshot`）。還原前檢查其他連線，同時涵蓋 uvicorn 的連線池與其他開著的 psql；互動確認可能等很久，所以確認後、`pg_restore` 前再查一次。

**Schema 版本檢查：** `pg_restore --clean` 只 DROP dump 裡有的物件，備份之後才由 migration 新增的表會殘留，`alembic_version` 卻被改回舊版。所以：目前資料庫沒有 `alembic_version` 表（全新的 volume，災難復原情境）→ 允許；版本與 `.counts` 的 `alembic=` 相同 → 允許；不同 → 在動資料庫前拒絕，訊息列出兩個版本並提示 `cd backend && uv run alembic downgrade <備份版本>` 後重試、還原完再 `uv run alembic upgrade head`。

保留既有可行做法：`MSYS_NO_PATHCONV=1`、本機路徑以 `cygpath -w` 轉換給 docker.exe、`verify-stock` 前加 `PYTHONIOENCODING=utf-8`、連線只算 `backend_type = 'client backend'`、`trap` 清容器暫存檔、備份失敗刪本機產物。

## Verification

**Commands:**
- `bash -n scripts/backup.sh scripts/restore.sh` -- expected: 無語法錯誤
- `scripts/backup.sh`（Git Bash）-- expected: 產生 `.dump` 與 `.counts`，exit 0
- 後端執行中跑 `scripts/restore.sh <檔案> --yes` -- expected: 拒絕，exit 1
- `scripts/restore.sh backups/不存在.dump` -- expected: 拒絕，exit 1
- 停掉 uvicorn 後 `scripts/restore.sh <剛才的備份> --yes` -- expected: `verify-stock` 通過、筆數相符，exit 0
- 把 `.counts` 的 `alembic=` 改成假版本後還原 -- expected: 動資料庫前拒絕並列出兩個版本，exit 1
- `.counts` 缺 `alembic=` 行 -- expected: 格式錯誤，exit 1

**Manual checks (if no CLI):**
- `docker compose restart db` 後 `verify-stock` 仍通過、筆數不變。
