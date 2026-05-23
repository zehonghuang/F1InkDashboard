import argparse
import json
import os
from datetime import datetime

import pymysql


def _mysql_connect():
    host = os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("TOINC_F1_MYSQL_PORT", "3306"))
    user = os.getenv("TOINC_F1_MYSQL_USER", "root").strip() or "root"
    password = os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456")
    db = os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1").strip() or "toinc_F1"
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=db,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def _table_exists(cur, name: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = %s
        LIMIT 1
        """,
        (name,),
    )
    return cur.fetchone() is not None


def _fetch_sessions(cur, year_from: int | None, year_to: int | None, session_key: int | None) -> list[dict]:
    where = ["session_key IS NOT NULL"]
    params: list[object] = []
    if session_key is not None:
        where.append("session_key = %s")
        params.append(int(session_key))
    if year_from is not None:
        where.append("year >= %s")
        params.append(int(year_from))
    if year_to is not None:
        where.append("year <= %s")
        params.append(int(year_to))
    cur.execute(
        f"""
        SELECT session_key, year, session_type, session_name, date_start_utc, date_end_utc, is_cancelled
        FROM openf1_sessions
        WHERE {' AND '.join(where)}
        ORDER BY date_start_utc DESC
        """,
        params,
    )
    return cur.fetchall() or []


def _fetch_table_stats(cur, table: str, ts_col: str) -> tuple[dict[int, int], dict[int, datetime]]:
    cur.execute(
        f"""
        SELECT session_key, COUNT(*) AS c, MAX({ts_col}) AS mx
        FROM {table}
        WHERE session_key IS NOT NULL
        GROUP BY session_key
        """
    )
    rows = cur.fetchall() or []
    cnt: dict[int, int] = {}
    mx: dict[int, datetime] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        sk = r.get("session_key")
        if sk is None:
            continue
        try:
            sk_i = int(sk)
        except Exception:
            continue
        c = r.get("c") or 0
        try:
            cnt[sk_i] = int(c)
        except Exception:
            cnt[sk_i] = 0
        dt = r.get("mx")
        if isinstance(dt, datetime):
            mx[sk_i] = dt
    return cnt, mx


def _upsert_status(cur, row: dict):
    cur.execute(
        """
        INSERT INTO openf1_sync_session_status
          (session_key, last_attempt_at_utc, last_success_at_utc, last_ok,
           last_duration_ms, last_total_rows, last_total_insert_attempt, last_error_message)
        VALUES
          (%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          last_attempt_at_utc=VALUES(last_attempt_at_utc),
          last_success_at_utc=COALESCE(VALUES(last_success_at_utc), last_success_at_utc),
          last_ok=VALUES(last_ok),
          last_duration_ms=VALUES(last_duration_ms),
          last_total_rows=VALUES(last_total_rows),
          last_total_insert_attempt=VALUES(last_total_insert_attempt),
          last_error_message=VALUES(last_error_message)
        """,
        (
            row["session_key"],
            row.get("last_attempt_at_utc"),
            row.get("last_success_at_utc"),
            row.get("last_ok"),
            row.get("last_duration_ms"),
            row.get("last_total_rows"),
            row.get("last_total_insert_attempt"),
            row.get("last_error_message"),
        ),
    )


def _insert_seed_run(cur, row: dict):
    cur.execute(
        """
        INSERT INTO openf1_sync_runs
          (session_key, started_at_utc, finished_at_utc, ok, duration_ms, total_rows, total_insert_attempt, endpoints_json, error_message)
        VALUES
          (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            row["session_key"],
            row["started_at_utc"],
            row.get("finished_at_utc"),
            row.get("ok"),
            row.get("duration_ms"),
            row.get("total_rows"),
            row.get("total_insert_attempt"),
            row.get("endpoints_json"),
            row.get("error_message"),
        ),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year-from", type=int, default=None)
    ap.add_argument("--year-to", type=int, default=None)
    ap.add_argument("--session-key", type=int, default=None)
    ap.add_argument("--seed-runs", action="store_true", default=False)
    ap.add_argument("--reset-seed-runs", action="store_true", default=False)
    ap.add_argument("--dry-run", action="store_true", default=False)
    args = ap.parse_args()

    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            if not _table_exists(cur, "openf1_sync_runs") or not _table_exists(cur, "openf1_sync_session_status"):
                raise SystemExit("openf1_sync_* tables not found, please apply backend/sql/005_create_openf1_scheduler_mysql.sql first")

            if args.reset_seed_runs and args.seed_runs and not args.dry_run:
                cur.execute("DELETE FROM openf1_sync_runs WHERE error_message LIKE 'backfill_seed%'")

            sessions = _fetch_sessions(cur, args.year_from, args.year_to, args.session_key)
            if not sessions:
                return 0

            tables = [
                ("openf1_drivers", "updated_at_utc"),
                ("openf1_session_result", "updated_at_utc"),
                ("openf1_starting_grid", "updated_at_utc"),
                ("openf1_stints", "updated_at_utc"),
                ("openf1_championship_drivers", "updated_at_utc"),
                ("openf1_championship_teams", "updated_at_utc"),
                ("openf1_car_data", "created_at_utc"),
                ("openf1_laps", "created_at_utc"),
                ("openf1_location", "created_at_utc"),
                ("openf1_position", "created_at_utc"),
                ("openf1_intervals", "created_at_utc"),
                ("openf1_weather", "created_at_utc"),
                ("openf1_race_control", "created_at_utc"),
                ("openf1_pit", "created_at_utc"),
                ("openf1_overtakes", "created_at_utc"),
                ("openf1_team_radio", "created_at_utc"),
            ]

            stats_cnt: dict[str, dict[int, int]] = {}
            stats_mx: dict[str, dict[int, datetime]] = {}
            for tn, ts_col in tables:
                if not _table_exists(cur, tn):
                    continue
                c, mx = _fetch_table_stats(cur, tn, ts_col)
                stats_cnt[tn] = c
                stats_mx[tn] = mx

            written_status = 0
            seeded_runs = 0

            for s in sessions:
                sk = int(s["session_key"])
                endpoints = {"source": "backfill", "tables": {}}
                total_rows = 0
                last_attempt: datetime | None = None
                for tn, _ in tables:
                    c = (stats_cnt.get(tn) or {}).get(sk) or 0
                    if c:
                        endpoints["tables"][tn] = {"rows": int(c)}
                    total_rows += int(c)
                    mx = (stats_mx.get(tn) or {}).get(sk)
                    if isinstance(mx, datetime):
                        if last_attempt is None or mx > last_attempt:
                            last_attempt = mx

                ok = 1 if total_rows > 0 else 0
                err_msg = None if ok else "no_data"
                status_row = {
                    "session_key": sk,
                    "last_attempt_at_utc": last_attempt,
                    "last_success_at_utc": last_attempt if ok else None,
                    "last_ok": ok,
                    "last_duration_ms": None,
                    "last_total_rows": total_rows if total_rows > 0 else None,
                    "last_total_insert_attempt": None,
                    "last_error_message": err_msg,
                }

                if not args.dry_run:
                    _upsert_status(cur, status_row)
                written_status += 1

                if args.seed_runs and last_attempt is not None:
                    run_row = {
                        "session_key": sk,
                        "started_at_utc": last_attempt,
                        "finished_at_utc": last_attempt,
                        "ok": ok,
                        "duration_ms": None,
                        "total_rows": total_rows if total_rows > 0 else None,
                        "total_insert_attempt": None,
                        "endpoints_json": json.dumps(endpoints, ensure_ascii=False, separators=(",", ":")),
                        "error_message": "backfill_seed" if ok else "backfill_seed:no_data",
                    }
                    if not args.dry_run:
                        _insert_seed_run(cur, run_row)
                    seeded_runs += 1

            print(
                json.dumps(
                    {"ok": True, "status_written": written_status, "runs_seeded": seeded_runs},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                flush=True,
            )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

