#!/usr/bin/env bash
# 用備份還原 FoodFlow 資料庫（NFR-06）。
# 用法：scripts/restore.sh <backups/foodflow-YYYYmmdd-HHMMSS.dump> [--yes]
#   --yes  略過互動確認
# 還原前要先停止後端（uvicorn），並建議先執行 scripts/backup.sh 保留目前資料。
# 還原後自動執行 verify-stock，並比對批次與異動筆數是否與 .counts 相同。
# Windows 請在 Git Bash 執行。
set -euo pipefail
# Git Bash 會把 /tmp/... 這類參數改寫成 Windows 路徑，容器內的路徑要原樣傳給 docker
export MSYS_NO_PATHCONV=1

die() {
  printf '錯誤：%s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
}

assume_yes=0
file=""
for arg in "$@"; do
  case "$arg" in
    --yes) assume_yes=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "不認得的選項：${arg}（用 -h 看用法）" ;;
    *)
      [[ -z "$file" ]] || die "只能指定一個備份檔"
      file="$arg"
      ;;
  esac
done
[[ -n "$file" ]] || {
  usage >&2
  exit 1
}

# 相對路徑以呼叫者的目錄為準，切到 repo 根目錄前先轉成絕對路徑
if command -v cygpath >/dev/null 2>&1; then
  file="$(cygpath -u "$file")"
fi
[[ "$file" == /* ]] || file="$PWD/$file"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# docker.exe 不認 /c/... 形式的路徑，在 Git Bash 下轉成 Windows 路徑
to_native() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

# 在 db 容器內執行一句 SQL，帳號與資料庫取自容器的環境變數
db_sql() {
  docker compose exec -T db sh -c \
    'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1" |
    tr -d '\r'
}

COUNT_SQL="SELECT (SELECT count(*) FROM inventory_batch) || ' ' || (SELECT count(*) FROM inventory_transaction)"
CONN_SQL="SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND datname = current_database() AND pid <> pg_backend_pid()"

# --- 檔案檢查（動資料庫前）---
[[ "$file" == *.dump ]] || die "備份檔副檔名必須是 .dump：${file}"
[[ -f "$file" ]] || die "找不到備份檔：${file}"
counts="${file%.dump}.counts"
[[ -f "$counts" ]] || die "找不到對應的筆數檔：${counts}（備份要由 scripts/backup.sh 產生）"

# 每個鍵只取第一行
count_value() {
  { grep -m1 "^$1=" "$counts" || true; } | head -n1 | cut -d= -f2- | tr -d '\r'
}
expected_batches="$(count_value batches)"
expected_transactions="$(count_value transactions)"
backup_rev="$(count_value alembic)"
[[ "$expected_batches" =~ ^[0-9]+$ ]] || die "筆數檔格式錯誤，batches= 不是數字：${counts}"
[[ "$expected_transactions" =~ ^[0-9]+$ ]] || die "筆數檔格式錯誤，transactions= 不是數字：${counts}"
[[ -n "$backup_rev" ]] || die "筆數檔格式錯誤，缺少 alembic= 行：${counts}"

# --- 資料庫檢查 ---
if ! docker compose ps --status running --services 2>/dev/null | tr -d '\r' | grep -qx db; then
  die "db 容器沒有在執行，請先執行 docker compose up -d --wait"
fi

check_connections() {
  local n
  n="$(db_sql "$CONN_SQL")" || die "無法查詢資料庫連線"
  if [[ "$n" != 0 ]]; then
    die "資料庫還有 ${n} 個其他連線（後端或其他 psql 仍在使用），請先停止後端再還原。資料庫未變更"
  fi
}
check_connections

has_alembic="$(db_sql "SELECT to_regclass('public.alembic_version') IS NOT NULL")" ||
  die "無法查詢目前的 schema 版本"
if [[ "$has_alembic" == t ]]; then
  current_rev="$(db_sql "SELECT version_num FROM alembic_version")" ||
    die "無法讀取目前的 alembic_version"
  # alembic_version 是空的（例如 downgrade base 後）與全新資料庫一樣允許
  if [[ -n "$current_rev" && "$current_rev" != "$backup_rev" ]]; then
    {
      printf '錯誤：schema 版本不同，拒絕還原。資料庫未變更\n'
      printf '  目前資料庫：%s\n' "${current_rev:-（空）}"
      printf '  備份：      %s\n' "$backup_rev"
      printf '處理方式：先 cd backend && uv run alembic downgrade %s，再重新執行還原；\n' "$backup_rev"
      printf '還原完成後執行 uv run alembic upgrade head\n'
    } >&2
    exit 1
  fi
fi

# --- 確認 ---
rel="${file#"$ROOT"/}"
printf '即將用 %s 覆蓋資料庫（批次 %s 筆、異動 %s 筆，schema 版本 %s）。\n' \
  "$rel" "$expected_batches" "$expected_transactions" "$backup_rev"
if [[ "$assume_yes" != 1 ]]; then
  printf '還原前建議先執行 scripts/backup.sh 保留目前資料。\n'
  answer=""
  read -r -p '確定要還原請輸入 yes：' answer || answer=""
  if [[ "$answer" != yes ]]; then
    printf '已取消，資料庫未變更\n' >&2
    exit 1
  fi
fi

# 確認可能等了很久，期間後端可能已重新啟動
check_connections

# --- 還原 ---
container_tmp="/tmp/foodflow-restore-$$.dump"
cleanup() {
  docker compose exec -T db rm -f "$container_tmp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose cp "$(to_native "$file")" "db:${container_tmp}" >/dev/null ||
  die "無法把備份檔複製進容器，資料庫未變更"

if ! docker compose exec -T db sh -c \
  'pg_restore --clean --if-exists --no-owner --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$1"' \
  sh "$container_tmp"; then
  die "pg_restore 失敗，交易已回復，資料庫維持原狀"
fi
printf '還原完成，開始驗證\n'

# --- 驗證 ---
status=0
if ! (cd backend && PYTHONIOENCODING=utf-8 uv run python -m app.cli verify-stock); then
  status=1
fi

if actual="$(db_sql "$COUNT_SQL")"; then
  read -r actual_batches actual_transactions <<<"$actual"
  if [[ "$actual_batches" != "$expected_batches" ]]; then
    printf '批次筆數不符：備份時 %s，還原後 %s\n' "$expected_batches" "$actual_batches" >&2
    status=1
  fi
  if [[ "$actual_transactions" != "$expected_transactions" ]]; then
    printf '異動筆數不符：備份時 %s，還原後 %s\n' "$expected_transactions" "$actual_transactions" >&2
    status=1
  fi
else
  printf '無法查詢還原後的筆數\n' >&2
  status=1
fi

if [[ "$status" != 0 ]]; then
  {
    printf '錯誤：還原後驗證失敗。注意：資料庫已換成備份的內容，不是還原前的狀態。\n'
    printf '若要回到還原前的資料，請用還原前以 scripts/backup.sh 做的備份再執行一次 restore.sh\n'
  } >&2
  exit "$status"
fi

printf '還原驗證通過：批次 %s 筆、異動 %s 筆，與備份相符\n' "$expected_batches" "$expected_transactions"
