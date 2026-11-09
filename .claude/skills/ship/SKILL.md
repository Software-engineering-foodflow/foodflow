---
name: ship
description: 把目前分支的工作一次收尾：產生 AI 使用紀錄、commit、push、開 PR。使用者說 ship、收尾、推上去、開 PR、提交這次的工作時使用。
---

# ship：收尾並開 PR

把目前分支的變更整理成一個 commit，連同 AI 使用紀錄推上 GitHub 並開 PR。實際動作由 `scripts/ship.mjs` 執行，你負責檢查、寫訊息、呼叫它。

## 步驟

1. **確認分支**：`git rev-parse --abbrev-ref HEAD`。如果是 `main`，停下來請使用者先開分支（`git switch -c feat/<模組>`），不要自己決定分支名稱。
2. **看變更**：`git status --short` 與 `git diff --stat`。有 `.env`、金鑰、`node_modules`、建置產物出現在變更裡就停下來告訴使用者。
3. **跑相關檢查**（只跑有改到的部分，失敗就停下來回報，不要 push）：
   - 改到 `backend/`：在 `backend` 執行 `uv run pytest -q`、`uv run ruff check .`
   - 改到 `frontend/`：在 `frontend` 執行 `npm run lint`、`npx vitest run`、`npm run build`
   - 只改文件就跳過
4. **寫 commit 訊息**：格式 `<類型>(<模組>): <中文描述>`，類型為 feat、fix、docs、test、refactor、chore、style。一行，描述這次做了什麼，例如 `feat(issue): FEFO 領用建議與扣庫存`。
5. **寫 PR 說明**（繁體中文，簡短）：
   - 做了什麼（2～4 點）
   - 對應的 Story 或 FR 編號（看 `_bmad-output/planning-artifacts/epics.md`）
   - 怎麼測試（實際跑過的指令或操作）
   - 改到共用檔案（`frontend/src/shared/`、`frontend/src/app/`、`backend/app/core/`、`backend/app/db/models/`）時，列出來提醒組員
6. **執行**（在專案根目錄）：
   ```
   node scripts/ship.mjs "<commit 訊息>" --body "<PR 說明>"
   ```
   使用者說要自動合併時加 `--merge`。
7. **回報**：PR 網址（或腳本印出的手動開 PR 網址），以及 AI 紀錄有沒有產生成功。提醒使用者每週確認一次自己的 `docs/ai-evidence/*/rows.md`。

## 規則

- commit 訊息與 PR 說明**不可以**加任何 AI 署名（Co-Authored-By、Generated with 等）。
- 不要用 `--force` push，不要改寫已推上去的歷史。
- push 失敗時不要自己 rebase 或解衝突，把錯誤回報給使用者。
