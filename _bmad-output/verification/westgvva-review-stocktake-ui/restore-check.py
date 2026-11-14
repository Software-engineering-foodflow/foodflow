"""將指定備份還原到全新隔離庫，驗證升級保留所有舊表資料；不修改來源庫。"""

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, inspect, text

from app.core.config import Settings, get_settings


def snapshot(engine):
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        tables = {}
        quote = conn.dialect.identifier_preparer.quote
        for name in inspect(conn).get_table_names(schema="public"):
            table = f"public.{quote(name)}"
            rows = conn.execute(text(f"SELECT row_to_json(t)::text FROM {table} t")).scalars()
            values = sorted(rows)
            tables[name] = {"rows": len(values), "sha256": hashlib.sha256("\n".join(values).encode()).hexdigest()}
        mismatch = conn.scalar(text("SELECT count(*) FROM inventory_batch b LEFT JOIN (SELECT batch_id, sum(quantity_delta) AS balance FROM inventory_transaction GROUP BY batch_id) t ON t.batch_id=b.id WHERE b.remaining_quantity <> coalesce(t.balance, 0)"))
        revision = conn.scalar(text("SELECT version_num FROM alembic_version"))
        return {"revision": revision, "tables": tables, "stock_mismatches": mismatch}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", type=Path, required=True)
    parser.add_argument("--source-env", type=Path, required=True)
    parser.add_argument("--compose-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    dump = args.dump.resolve(strict=True)
    counts = dict(line.split("=", 1) for line in dump.with_suffix(".counts").read_text().splitlines())
    source = create_engine(Settings(_env_file=args.source_env).database_url)
    source_before = snapshot(source)
    name = "foodflow_restore_" + uuid4().hex[:12] + "_test"
    target_url = source.url.set(database=name)
    assert name != source.url.database
    admin = create_engine(source.url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()
    remote_dump = f"/tmp/{name}.dump"
    def docker(*parts):
        subprocess.run(["docker", "compose", *parts], cwd=args.compose_root, check=True)
    docker("cp", str(dump), "db:" + remote_dump)
    docker("exec", "-T", "db", "sh", "-c", 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1" "$2"', "sh", name, remote_dump)
    target = create_engine(target_url)
    before = snapshot(target)
    assert before["revision"] == counts["alembic"]
    assert before["tables"]["inventory_batch"]["rows"] == int(counts["batches"])
    assert before["tables"]["inventory_transaction"]["rows"] == int(counts["transactions"])
    assert before["stock_mismatches"] == 0
    os.environ["DATABASE_URL"] = target_url.render_as_string(hide_password=False)
    os.environ["TEST_DATABASE_URL"] = os.environ["DATABASE_URL"]
    os.environ["JWT_SECRET"] = "restore-check-test-only-secret-at-least-32-bytes"
    get_settings.cache_clear()
    from alembic import command
    from alembic.config import Config
    command.upgrade(Config("alembic.ini"), "head")
    command.check(Config("alembic.ini"))
    after = snapshot(target)
    assert after["revision"] == "0002"
    assert after["stock_mismatches"] == 0
    assert after["tables"]["waste_request"]["rows"] == 0
    for table, evidence in before["tables"].items():
        if table != "alembic_version":
            assert after["tables"][table] == evidence, table
    source_after = snapshot(source)
    assert source_after == source_before, "來源庫在驗證期間有變動，需另核對"
    report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "dump": str(dump), "dump_sha256": hashlib.sha256(dump.read_bytes()).hexdigest(), "restored_database": name, "source_unchanged": True, "restored_matches_current_source": before == source_before, "before_upgrade": before, "after_upgrade": after, "alembic_check": "passed", "retained_database": True}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("dump_sha256", "restored_database", "source_unchanged", "restored_matches_current_source", "alembic_check")}))
    target.dispose()
    source.dispose()


if __name__ == "__main__":
    main()
