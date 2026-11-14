import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import CheckConstraint, inspect, select

from app.core.db import get_engine, get_session_factory
from app.db.base import Base
from app.db.models import AlertSetting
from tests.integration.conftest import alembic_config

EXPECTED_TABLES = {
    "alert_setting",
    "batch_location_change",
    "employee",
    "goods_receipt",
    "goods_receipt_item",
    "ingredient",
    "ingredient_category",
    "inventory_batch",
    "inventory_transaction",
    "storage_location",
    "supplier",
    "waste_record",
    "waste_request",
}


def _tables() -> set[str]:
    return set(inspect(get_engine()).get_table_names()) - {"alembic_version"}


def test_upgrade_matches_metadata_and_downgrade_preserves_audit_tables() -> None:
    config = alembic_config()

    with pytest.raises(RuntimeError, match="downgrade"):
        ScriptDirectory.from_config(config).get_revision("0002").module.downgrade()
    assert _tables() == EXPECTED_TABLES

    command.upgrade(config, "head")
    assert _tables() == EXPECTED_TABLES
    command.check(config)  # 模型與 migration 有差異時丟例外

    with get_session_factory()() as session:
        settings = session.scalars(select(AlertSetting)).all()
    assert [setting.warning_days for setting in settings] == [3]
    assert settings[0].created_at.tzinfo is not None


def test_migrated_check_constraints_match_metadata() -> None:
    """alembic check 不比對 CHECK，所以另外比對名稱。"""
    inspector = inspect(get_engine())

    for table in Base.metadata.sorted_tables:
        expected = {
            str(constraint.name)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        actual = {item["name"] for item in inspector.get_check_constraints(table.name)}
        assert actual == expected, table.name


def test_single_migration_head() -> None:
    assert len(ScriptDirectory.from_config(alembic_config()).get_heads()) == 1
