"""資料庫連線設定（AD-3、AD-6）與列鎖入口（AD-7）。"""

from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, Select, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def create_db_engine(url: str, *, connect_timeout: int = 3) -> Engine:
    return create_engine(
        url,
        isolation_level="READ COMMITTED",
        pool_pre_ping=True,
        hide_parameters=True,  # 例外與日誌不帶 SQL 參數（例如 password_hash）
        connect_args={"connect_timeout": connect_timeout},
    )


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False, autoflush=True)


@lru_cache
def get_engine() -> Engine:
    return create_db_engine(get_settings().database_url)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return create_session_factory(get_engine())


def for_update[T: tuple[Any, ...]](stmt: Select[T], *, key_share: bool = False) -> Select[T]:
    """所有鎖定查詢的唯一入口。

    populate_existing 確保取得鎖後，同一 Session 已載入的物件也會更新成鎖後的值（T2）。
    key_share=True 產生 FOR NO KEY UPDATE：不擋 FK 檢查的 KEY SHARE。
    目前用於換位置時鎖目標位置（避免對向換位置死結）。
    """
    return stmt.with_for_update(key_share=key_share).execution_options(populate_existing=True)
