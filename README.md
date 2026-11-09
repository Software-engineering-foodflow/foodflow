# 食序 FoodFlow

餐飲食材庫存與效期預警系統，第 17 組軟體工程期末專案。需求見 [docs/srs.md](docs/srs.md)，協作規則見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 開發環境需求

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| Python | 3.13 | 後端 |
| uv | 最新版 | 安裝 Python、管理後端套件 |
| Node.js | 24 LTS | 前端 |
| Docker（含 Docker Compose） | 最新版 | 執行 PostgreSQL 17 |

確認版本：

```bash
uv --version
node --version
docker --version
docker compose version
```

注意事項：

- **Node 版本：** 不可使用 Node 20。在 Node 20.17 上執行 `vite build` 會出現 `Cannot find native binding`，原因是 Node 版本，不要反覆重裝套件。Windows 可用 nvm-windows 或 fnm 切換版本。
- **Docker：** 啟動資料庫前，要先開啟 Docker Desktop。
- **Python：** 可用 `uv python install 3.13` 安裝。

## 從 clone 到跑起來

以下指令都從 repo 根目錄開始。

### 1. 設定

```bash
git config core.hooksPath .githooks
cp .env.example .env
```

產生 JWT 金鑰，把輸出貼到 `.env` 的 `JWT_SECRET=` 後面（至少 32 bytes，未設定時後端拒絕啟動）：

```bash
cd backend
uv sync --locked
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"
cd ..
```

安裝 AI 使用紀錄自動化工具（文件 G 用，見 [scripts/ai-evidence/README.md](scripts/ai-evidence/README.md)）：

```powershell
cd scripts/ai-evidence
npm install
cd ../..
```

### 2. 資料庫

```bash
docker compose up -d --wait
```

會建立 `foodflow` 與測試用的 `foodflow_test`。測試資料庫的初始化腳本只在 volume 為空時執行；若你的 volume 比腳本舊，手動建立一次：

```bash
docker compose exec db psql -U foodflow -c "CREATE DATABASE foodflow_test"
```

### 3. 後端（http://localhost:8000）

```bash
cd backend
uv run alembic upgrade head
uv run python -m app.cli create-admin
uv run uvicorn app.main:create_app --factory --reload
```

`create-admin` 會互動詢問帳號、姓名與兩次密碼（密碼輸入不顯示）。帳號與姓名必填；密碼為 8～128 字元且不裁切空白。沒有預設帳密，也不提供公開註冊；後續員工由管理者在「員工帳號」頁新增。請勿將密碼放在命令列或版本控制中。

Schema 只由 Alembic 變更，應用程式啟動時不會自動執行 migration。確認：`curl http://localhost:8000/health` 回 `{"status":"ok","database":"ok"}`。

### 4. 前端（http://localhost:5173）

另開一個終端機：

```bash
cd frontend
npm ci
npm run dev
```

打開 http://localhost:5173 ，先以建立的管理者登入，首頁會顯示後端狀態。管理者可搜尋、新增、編輯、停用員工及重設密碼；帳號建立後固定。停用、降權、重設密碼及登出會使舊登入失效，最後一位有效管理者不能停用或降權。Vite 把 `/api` 與 `/health` 轉送到後端，所以維持同源、不開 CORS。

## 測試與檢查

CI（`.github/workflows/ci.yml`）跑的就是這些，開 PR 前先在本機跑過。

後端，在 `backend/` 內執行（整合測試需要資料庫正在執行，會清空 `foodflow_test`）：

```bash
uv run pytest
uv run ruff check .
uv run lint-imports
uv run alembic check
uv run alembic heads   # 只能有一個 head
```

前端，在 `frontend/` 內執行：

```bash
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
npm run gen:api
git diff --exit-code -- src/shared/api/schema.d.ts
```

## 常用工作

| 工作 | 指令 | 位置 |
| --- | --- | --- |
| 新增 migration | `uv run alembic revision --autogenerate -m "說明"`，檢查產物後再 commit | `backend/` |
| 改 API 後更新前端型別 | `npm run gen:api`，並提交 `schema.d.ts`；衝突時不手動合併，rebase 後重新產生 | `frontend/` |
| 庫存核對 | `uv run python -m app.cli verify-stock`，有差異時以非零狀態結束 | `backend/` |
| 灌示範資料 | `uv run python -m app.cli seed-demo`，說明見下方 | `backend/` |
| Demo（單一 port） | 先在 `frontend/` 執行 `npm run build`，再於 `backend/` 執行 `uv run uvicorn app.main:create_app --factory --host 0.0.0.0`，打開 http://localhost:8000 （區網裝置改用本機 IP） | |
| 固定時間測跨日 | `.env` 設 `APP_FIXED_NOW=2026-11-18T09:00:00+08:00`（`APP_ENV=production` 時無效） | |

### 示範資料

資料庫要已啟動並跑過 `uv run alembic upgrade head`。在 `backend/` 內執行（`APP_ENV=production` 時拒絕執行）：

```bash
uv run python -m app.cli seed-demo          # 資料庫已有資料時只提示，不做任何變更
uv run python -m app.cli seed-demo --reset  # 清空後重灌
uv run python -m app.cli verify-stock       # 灌完後應顯示「庫存核對通過」
```

內容是 5 個儲存位置、3 個供應商、5 個分類、13 種食材與 2 張已確認進貨單，涵蓋下列情境：

| 情境 | 食材或位置 |
| --- | --- |
| 已過期 | 鮮奶、冷凍蝦仁（各一批，另有正常批次） |
| 今日到期 | 鮮奶油 |
| 即期 | 雞胸肉（其中一批）、鮭魚片、冷凍水餃（其中一批）、醬油（其中一批） |
| 正常 | 雞胸肉（其中一批）、豬里肌、高麗菜、白米、醬油等 |
| 低於安全庫存量 | 雞蛋、沙拉油、起司片（完全沒有庫存） |
| 有兩個可用批次（可示範改選批次、非 FEFO） | 雞胸肉、豬里肌、高麗菜、白米、雞蛋 |
| 三種保存方式都有位置，且各有要注意的批次 | 冷藏 COLD-A、冷凍 FRZ-1、常溫 DRY-1 |
| 啟用但沒有庫存的位置 | COLD-B 備料冷藏櫃 |
| 已停用的位置 | DRY-2 舊儲藏室 |

- **日期：** 以 Clock 的當天（Asia/Taipei）相對計算，並依目前的預警天數調整，所以 `APP_FIXED_NOW` 也有效。到期狀態會隨日期變化，隔天或改過預警天數後，要重現上表的情境請加 `--reset` 重灌。預警天數為 0 時依規則不會有即期批次，指令會提示。
- **`--reset` 的範圍：** 會刪除帳號與預警設定以外的**所有**資料，包含你手動建立的進貨單、異動與報廢紀錄，無法復原。帳號與預警設定會保留。
- **操作者：** 異動記在停用的 `demo-seed` 帳號（顯示為「示範資料」）名下，這個帳號是停用的，無法登入，`--reset` 也不會刪除它。

模組分層與規則見 [架構主幹](_bmad-output/planning-artifacts/architecture/architecture-foodflow-2026-11-05/ARCHITECTURE-SPINE.md)。寫新模組時可參考 `backend/app/modules/health/`（router → service → repository 的完整範例）；前端參考 `frontend/src/features/health/`。

## 疑難排解

| 現象 | 原因與處理 |
| --- | --- |
| `Cannot find native binding` | Node 版本不對，改用 Node 24 後重新 `npm ci` |
| `JWT_SECRET 未設定或短於 32 bytes` | 依第 1 步設定 `.env` |
| 連資料庫卡住或逾時、`/health` 回 503 | `.env` 的連線字串要寫 `127.0.0.1`，不要寫 `localhost`（資料庫埠只綁 IPv4），請對照 `.env.example` |
| 整合測試連不上資料庫 | Docker Desktop 或容器沒有啟動，執行 `docker compose up -d --wait` |
| `database "foodflow_test" does not exist` | 舊 volume，依第 2 步手動建立 |
| Git Bash 內 `docker compose` 出現 `docker-credential-desktop` 找不到 | 改用 PowerShell 執行 |
| Git Bash 內 `npm run`、`npx` 出現 `"node"` 不是內部或外部命令 | 改用 PowerShell 執行前端指令 |
| `npm audit` 回報 moderate | 來自開發工具；不要執行 `npm audit fix --force`，它會降級 ESLint 與 openapi-typescript |
