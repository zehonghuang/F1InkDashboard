import os
from dataclasses import dataclass
from typing import Any, Dict, Iterator, Optional

import pymysql


@dataclass(frozen=True)
class MySqlConfig:
    host: str
    port: int
    user: str
    password: str
    database: str
    charset: str

    @staticmethod
    def from_env() -> "MySqlConfig":
        host = os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1").strip() or "127.0.0.1"
        port = int(os.getenv("TOINC_F1_MYSQL_PORT", "3306"))
        user = os.getenv("TOINC_F1_MYSQL_USER", "root")
        password = os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456")
        database = os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1").strip() or "toinc_F1"
        charset = os.getenv("TOINC_F1_MYSQL_CHARSET", "utf8mb4").strip() or "utf8mb4"
        return MySqlConfig(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset=charset,
        )


def mysql_enabled() -> bool:
    return (os.getenv("TOINC_F1_MYSQL_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"})



def mysql_connect(cfg: Optional[MySqlConfig] = None) -> pymysql.Connection:
    cfg = cfg or MySqlConfig.from_env()
    return pymysql.connect(
        host=cfg.host,
        user=cfg.user,
        password=cfg.password,
        database=cfg.database,
        charset=cfg.charset,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=10,
        read_timeout=30,
        write_timeout=30,
    )


def mysql_exec_many(
    conn: pymysql.Connection,
    sql: str,
    rows: list[tuple[Any, ...]],
) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        return cur.executemany(sql, rows)


def mysql_exec(
    conn: pymysql.Connection,
    sql: str,
    args: tuple[Any, ...] | None = None,
) -> int:
    with conn.cursor() as cur:
        return cur.execute(sql, args)


def mysql_fetch_one(
    conn: pymysql.Connection,
    sql: str,
    args: tuple[Any, ...] | None = None,
) -> Optional[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(sql, args)
        row = cur.fetchone()
        return row if isinstance(row, dict) else None


def mysql_fetch_all(
    conn: pymysql.Connection,
    sql: str,
    args: tuple[Any, ...] | None = None,
) -> list[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(sql, args)
        rows = cur.fetchall()
        return [r for r in rows if isinstance(r, dict)]
