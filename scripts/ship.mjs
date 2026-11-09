#!/usr/bin/env node
// 一行完成：產生 AI 使用紀錄 → git add → commit → push → 開 PR
//
// 用法（專案根目錄）：
//   node scripts/ship.mjs "feat(issue): FEFO 領用建議"
//   node scripts/ship.mjs "feat(issue): FEFO 領用建議" --body "PR 說明…"
//   node scripts/ship.mjs "feat(issue): FEFO 領用建議" --merge    # CI 通過後自動合併（需要 gh）
// 其他選項：--no-evidence（不產生 AI 紀錄）、--no-pr（只 push 不開 PR）

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const message = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--body");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
// 不經過 shell：Windows 上 shell: true 會把含空格的 commit 訊息與 PR 標題拆成多個參數。git、node、gh 都是 .exe，不需要 shell。
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { cwd: root, stdio: "inherit", ...opts });
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▶ ${msg}`);

if (!message) fail('請給 commit 訊息，例如：node scripts/ship.mjs "feat(issue): FEFO 領用建議"');
if (!/^(feat|fix|docs|test|refactor|chore|style)(\([^)]+\))?: .+/.test(message))
  fail("commit 訊息格式要是 <類型>(<模組>): <描述>，類型是 feat、fix、docs、test、refactor、chore、style");

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === "main" || branch === "HEAD") fail(`你在 ${branch}，請先開自己的分支：git switch -c feat/<模組>`);

// 1. AI 使用紀錄（會讀到目前還在進行中的對話，不用先 /clear）
if (!has("--no-evidence")) {
  step("產生 AI 使用紀錄");
  const r = run("node", [path.join("scripts", "ai-evidence", "capture.mjs"), "--all"]);
  if (r.status !== 0) console.warn("⚠ AI 紀錄產生失敗，繼續提交程式；之後可再跑 node scripts/ai-evidence/capture.mjs --all");
}

// 2. commit
step("commit");
git("add", "-A");
const staged = git("diff", "--cached", "--name-only");
if (staged) {
  const leaked = staged.split("\n").filter((f) => /(^|\/)\.env$|\.pem$|id_rsa/.test(f));
  if (leaked.length) {
    git("reset", "-q");
    fail(`這些檔案不能 commit：${leaked.join("、")}`);
  }
  const r = run("git", ["commit", "-m", message]);
  if (r.status !== 0) fail("commit 失敗，看上面的訊息");
} else {
  console.log("沒有新的變更要 commit，直接 push 現有 commit");
}

// 3. push
step(`push ${branch}`);
if (run("git", ["push", "-u", "origin", branch]).status !== 0) fail("push 失敗：先 git pull --rebase origin main 解決衝突，或確認有登入 GitHub");

// 4. 開 PR
if (has("--no-pr")) process.exit(0);
step("開 PR");
const ghOk = spawnSync("gh", ["--version"], { shell: process.platform === "win32", encoding: "utf8" }).status === 0;
const remote = git("remote", "get-url", "origin").replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/");
if (!ghOk) {
  console.log(`沒有安裝 GitHub CLI（gh），請自己開 PR：\n${remote}/compare/main...${branch}?expand=1`);
  console.log("裝了 gh 之後（winget install GitHub.cli，再 gh auth login），這步就會自動完成。");
  process.exit(0);
}
const exists = spawnSync("gh", ["pr", "view", branch, "--json", "url", "-q", ".url"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
if (exists.status === 0 && exists.stdout.trim()) {
  console.log(`PR 已存在，已更新：${exists.stdout.trim()}`);
} else {
  const bodyFile = path.join(os.tmpdir(), `foodflow-pr-${Date.now()}.md`);
  fs.writeFileSync(bodyFile, valueOf("--body") ?? `${message}\n\n（由 scripts/ship.mjs 建立）`);
  const r = run("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", message, "--body-file", bodyFile]);
  fs.unlinkSync(bodyFile);
  if (r.status !== 0) fail(`開 PR 失敗，請自己開：${remote}/compare/main...${branch}?expand=1`);
}
if (has("--merge")) {
  step("CI 通過後自動合併（squash）");
  if (run("gh", ["pr", "merge", branch, "--squash", "--auto", "--delete-branch"]).status !== 0)
    console.warn("⚠ 無法設定自動合併：到 repo Settings → General 勾「Allow auto-merge」，或到 PR 頁面手動合併");
}
console.log("\n✔ 完成");
