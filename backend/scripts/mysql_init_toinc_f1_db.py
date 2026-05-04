import argparse
import os
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT


def _render_sql(sql: str, db_name: str) -> str:
    db_name = str(db_name).strip()
    if not db_name:
        raise SystemExit("db_name is required")
    sql = sql.replace("`toinc_F1`", f"`{db_name}`")
    sql = sql.replace("USE toinc_F1;", f"USE `{db_name}`;")
    sql = sql.replace("USE `toinc_F1`;", f"USE `{db_name}`;")
    sql = sql.replace("CREATE DATABASE IF NOT EXISTS toinc_F1", f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
    return sql


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.getenv("TOINC_F1_MYSQL_PORT", "3306")))
    ap.add_argument("--user", default=os.getenv("TOINC_F1_MYSQL_USER", "root"))
    ap.add_argument("--password", default=os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456"))
    ap.add_argument("--db", default=os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1"))
    ap.add_argument("--sql-dir", default=str(Path(__file__).resolve().parent.parent / "sql"))
    args = ap.parse_args()

    sql_dir = Path(args.sql_dir).resolve()
    if not sql_dir.exists():
        raise SystemExit(f"sql dir not found: {sql_dir}")

    sql_files = sorted([p for p in sql_dir.glob("*.sql") if p.is_file()])
    if not sql_files:
        raise SystemExit(f"no .sql files under: {sql_dir}")

    conn = pymysql.connect(
        host=args.host,
        port=int(args.port),
        user=args.user,
        password=args.password,
        charset="utf8mb4",
        autocommit=True,
        client_flag=CLIENT.MULTI_STATEMENTS,
    )
    try:
        with conn.cursor() as cur:
            for p in sql_files:
                sql = p.read_text(encoding="utf-8")
                sql = _render_sql(sql, db_name=args.db)
                cur.execute(sql)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

