"""Explicit deployment and isolated CI verification; never cleans the source database."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import create_engine, text
from app.core.config import Settings, get_settings

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("restore_check", ROOT / "restore-check.py")
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["ci", "deploy", "verify"])
    parser.add_argument("--source-env", required=True)
    args = parser.parse_args()
    settings = Settings(_env_file=args.source_env)
    source = create_engine(settings.database_url)
    evidence = {"checked_at_utc": datetime.now(timezone.utc).isoformat()}
    if args.mode == "ci":
        name = "foodflow_ci_" + uuid4().hex[:12] + "_test"
        admin = create_engine(source.url.set(database="postgres"), isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
        admin.dispose()
        os.environ["DATABASE_URL"] = source.url.set(database=name).render_as_string(hide_password=False)
        os.environ["TEST_DATABASE_URL"] = os.environ["DATABASE_URL"]
        os.environ["JWT_SECRET"] = "isolated-ci-only-secret-at-least-32-bytes"
        get_settings.cache_clear()
        from alembic import command
        from alembic.config import Config
        command.upgrade(Config("alembic.ini"), "head")
        command.check(Config("alembic.ini"))
        result = subprocess.run([sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "-q"])
        evidence.update(database=name, upgrade="passed", alembic_check="passed", pytest_exit=result.returncode)
        (ROOT / "ci-results.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        sys.exit(result.returncode)
    if args.mode == "deploy":
        restored = json.loads((ROOT / "restore-results.json").read_text(encoding="utf-8"))
        assert hashlib.sha256(Path(restored["dump"]).read_bytes()).hexdigest() == restored["dump_sha256"]
        before = restore.snapshot(source)
        assert before == restored["before_upgrade"], "Source changed since verified backup; make a fresh backup first"
        assert before["revision"] == "0001"
        os.environ["DATABASE_URL"] = settings.database_url
        os.environ["JWT_SECRET"] = settings.jwt_secret.get_secret_value()
        get_settings.cache_clear()
        from alembic import command
        from alembic.config import Config
        command.upgrade(Config("alembic.ini"), "0002")
        command.check(Config("alembic.ini"))
        after = restore.snapshot(source)
        assert after["revision"] == "0002" and after["stock_mismatches"] == 0
        assert after["tables"]["waste_request"]["rows"] == 0
        for table, old in before["tables"].items():
            if table != "alembic_version":
                assert after["tables"][table] == old, table
        evidence.update(database=source.url.database, before=before, after=after,
                        dump_sha256=restored["dump_sha256"], old_data_preserved=True, alembic_check="passed")
        (ROOT / "deployment-results.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print("Deployment verified: revision 0002; all existing table hashes unchanged; stock consistent.")
    if args.mode == "verify":
        from urllib.request import Request, urlopen
        import jwt
        before = restore.snapshot(source)
        with source.connect() as conn:
            employee = conn.execute(text("SELECT id, token_version FROM employee WHERE is_active = true ORDER BY id LIMIT 1")).one()
        now = settings.app_fixed_now or datetime.now(timezone.utc)
        token = jwt.encode({"sub": str(employee.id), "token_version": employee.token_version,
                            "exp": int((now + timedelta(minutes=5)).timestamp())},
                           settings.jwt_secret.get_secret_value(), algorithm="HS256")
        routes = ["/health", "/api/v1/auth/me", "/api/v1/waste-records/requests?page=1",
                  "/api/v1/waste-records?page=1", "/api/v1/stocktakes/batches?page=1",
                  "/api/v1/inventory-transactions?page=1"]
        statuses = {}
        for route in [*routes, "/"]:
            request = Request("http://127.0.0.1:18866" + route,
                              headers={"Cookie": settings.auth_cookie_name + "=" + token})
            with urlopen(request, timeout=10) as response:
                statuses[route] = response.status
                assert response.status == 200
        assert restore.snapshot(source) == before
        evidence.update(routes=statuses, source_unchanged=True,
                        auth="short-lived signed test session; password login not exercised",
                        frontend="http://127.0.0.1:18866")
        (ROOT / "service-results.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print(json.dumps(evidence))


if __name__ == "__main__":
    main()
