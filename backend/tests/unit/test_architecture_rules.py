"""架構規則：import-linter 管不到的部分，以 AST 或 mapper 走訪檢查。"""

import ast
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import BigInteger, Date, DateTime, inspect
from sqlalchemy.schema import Identity

import app.db.models  # noqa: F401
from app.db.base import Base

APP_ROOT = Path(__file__).resolve().parents[2] / "app"
ALEMBIC_ROOT = APP_ROOT.parent / "alembic"
LEDGER_FILES = {
    APP_ROOT / "modules" / "inventory" / "ledger.py",
    APP_ROOT / "modules" / "inventory" / "ledger_sqlalchemy.py",
}
PROTECTED_BATCH_FIELDS = {"remaining_quantity", "current_location_id"}


def _source_files(*roots: Path) -> Iterator[Path]:
    for root in roots:
        yield from root.rglob("*.py")


def _nodes(path: Path) -> Iterator[ast.AST]:
    yield from ast.walk(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))


def _assignment_targets(node: ast.AST) -> list[ast.expr]:
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, ast.AugAssign | ast.AnnAssign):
        return [node.target]
    return []


def _location(path: Path, node: ast.AST) -> str:
    return f"{path}:{getattr(node, 'lineno', '?')}"


def test_only_stock_ledger_assigns_protected_batch_fields() -> None:
    """AD-5：涵蓋屬性賦值，以及 `.values(...)`、`InventoryBatch(...)` 的關鍵字參數。"""
    violations = [
        _location(path, node)
        for path in _source_files(APP_ROOT)
        if path not in LEDGER_FILES
        for node in _nodes(path)
        for target in _assignment_targets(node)
        if isinstance(target, ast.Attribute) and target.attr in PROTECTED_BATCH_FIELDS
    ]
    violations += [
        _location(path, node)
        for path in _source_files(APP_ROOT)
        if path not in LEDGER_FILES
        for node in _nodes(path)
        if isinstance(node, ast.keyword) and node.arg in PROTECTED_BATCH_FIELDS
    ]
    assert violations == []


def test_no_async_def_in_app() -> None:
    """AD-6、T8。"""
    violations = [
        _location(path, node)
        for path in _source_files(APP_ROOT)
        for node in _nodes(path)
        if isinstance(node, ast.AsyncFunctionDef | ast.AsyncFor | ast.AsyncWith)
    ]
    assert violations == []


@pytest.mark.parametrize(
    ("attribute", "allowed"),
    [
        ("with_for_update", {APP_ROOT / "core" / "db.py"}),  # AD-7：只能透過 for_update()
        ("create_all", set()),  # AD-19
        ("begin_nested", set()),  # AD-6
    ],
)
def test_forbidden_calls(attribute: str, allowed: set[Path]) -> None:
    violations = [
        _location(path, node)
        for path in _source_files(APP_ROOT, ALEMBIC_ROOT)
        if path not in allowed
        for node in _nodes(path)
        if isinstance(node, ast.Attribute) and node.attr == attribute
    ]
    assert violations == []


def test_no_float_in_app() -> None:
    """AD-9：只有 JWT 的 Unix 時間比對可以用 float，數量與金額不可以。"""
    allowed = {APP_ROOT / "modules" / "auth" / "dependencies.py"}
    violations = [
        _location(path, node)
        for path in _source_files(APP_ROOT)
        if path not in allowed
        for node in _nodes(path)
        if isinstance(node, ast.Name) and node.id == "float"
    ]
    assert violations == []


def test_no_use_cache_false() -> None:
    """AD-2。"""
    violations = [
        _location(path, node)
        for path in _source_files(APP_ROOT)
        for node in _nodes(path)
        if isinstance(node, ast.keyword)
        and node.arg == "use_cache"
        and isinstance(node.value, ast.Constant)
        and node.value.value is False
    ]
    assert violations == []


def test_every_relationship_is_lazy_raise() -> None:
    """AD-3、T15：SQLAlchemy 沒有全域預設，漏寫就會靜默延遲載入。"""
    relationships = [
        relationship for mapper in Base.registry.mappers for relationship in mapper.relationships
    ]
    assert relationships
    assert [str(item) for item in relationships if item.lazy != "raise"] == []


def test_exactly_thirteen_tables() -> None:
    assert len(Base.metadata.tables) == 13


def test_primary_keys_are_bigint_identity() -> None:
    """AD-19、T14。"""
    for mapper in Base.registry.mappers:
        column = inspect(mapper.class_).primary_key[0]
        assert isinstance(column.type, BigInteger), mapper.class_
        assert isinstance(column.identity, Identity), mapper.class_


def test_no_time_column_has_a_server_default() -> None:
    """AD-10：時間由 Service 傳入，不可用 func.now()。"""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, DateTime | Date):
                assert column.server_default is None, f"{table.name}.{column.name}"


def test_constraint_names_fit_postgres_limit() -> None:
    for table in Base.metadata.tables.values():
        for constraint in table.constraints:
            assert len(str(constraint.name)) <= 63, constraint.name
