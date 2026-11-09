#!/usr/bin/env bash
# 備份 FoodFlow 資料庫（NFR-06）。
# 用法：scripts/backup.sh
# 產物：backups/foodflow-YYYYmmdd-HHMMSS.dump 與同名 .counts（批次、異動筆數與 Alembic 版本）。
# Windows 請在 Git Bash 執行。
set -euo pipefail
umask 077
# Git Bash 會把 /tmp/... 這類參數改寫成 Windows 路徑，容器內的路徑要原樣傳給 docker
export MSYS_NO_PATHCONV=1

case "${1:-}" in
  -h | --help)
    sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    printf '錯誤：backup.sh 不接受參數：%s\n' "$1" >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die() {
  printf '錯誤：%s\n' "$*" >&2
  exit 1
}

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

if ! docker compose ps --status running --services 2>/dev/null | tr -d '\r' | grep -qx db; then
  die "db 容器沒有在執行，請先執行 docker compose up -d --wait"
fi

stamp="$(date +%Y%m%d-%H%M%S)"
name="foodflow-${stamp}"
mkdir -p backups
dump="$ROOT/backups/${name}.dump"
counts="$ROOT/backups/${name}.counts"
container_tmp="/tmp/${name}-$$.dump"

if [[ -e "$dump" || -e "$counts" ]]; then
  die "備份檔 ${name} 已存在，請稍候一秒再執行"
fi

ok=0
cleanup() {
  docker compose exec -T db rm -f "$container_tmp" >/dev/null 2>&1 || true
  if [[ "$ok" != 1 ]]; then
    rm -f "$dump" "$counts"
  fi
}
trap cleanup EXIT

before="$(db_sql "$COUNT_SQL")" || die "無法查詢批次與異動筆數，請確認已執行 alembic upgrade head"
alembic_rev="$(db_sql "SELECT version_num FROM alembic_version")" || die "無法讀取 alembic_version，請確認已執行 alembic upgrade head"
[[ -n "$alembic_rev" ]] || die "alembic_version 是空的，請確認已執行 alembic upgrade head"

docker compose exec -T db sh -c \
  'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"' sh "$container_tmp" ||
  die "pg_dump 失敗"
docker compose cp "db:${container_tmp}" "$(to_native "$dump")" >/dev/null ||
  die "無法從容器取出備份檔"
# docker compose cp 不套用 umask，取出後要另外收緊權限
chmod 600 "$dump"

after="$(db_sql "$COUNT_SQL")" || die "無法再次查詢批次與異動筆數"
if [[ "$before" != "$after" ]]; then
  die "備份期間資料有變動（備份前 ${before}，備份後 ${after}，依序為批次、異動筆數），已刪除本次產物。請稍後重試，或先停止後端再備份"
fi

read -r batches transactions <<<"$after"
{
  printf 'batches=%s\n' "$batches"
  printf 'transactions=%s\n' "$transactions"
  printf 'alembic=%s\n' "$alembic_rev"
} >"$counts"

ok=1
printf '備份完成：\n  %s\n  %s\n' "backups/${name}.dump" "backups/${name}.counts"
printf '批次 %s 筆、異動 %s 筆，schema 版本 %s\n' "$batches" "$transactions" "$alembic_rev"
