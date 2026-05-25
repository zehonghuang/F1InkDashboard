import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone

import pymysql


def _mysql_connect():
    host = os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("TOINC_F1_MYSQL_PORT", "3306"))
    user = os.getenv("TOINC_F1_MYSQL_USER", "root")
    password = os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456")
    db = os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1")
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        db=db,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=5,
        read_timeout=60,
        write_timeout=60,
    )


def _select_race_session_keys(cur, *, year: int, finished_only: bool) -> list[int]:
    where = ["is_cancelled = 0", "year = %s", "(LOWER(session_name) = 'race' OR LOWER(session_type) = 'race')"]
    params: list[object] = [int(year)]
    if finished_only:
        where.append("date_end_utc IS NOT NULL")
        where.append("date_end_utc < UTC_TIMESTAMP()")
    cur.execute(f"SELECT session_key FROM openf1_sessions WHERE {' AND '.join(where)} ORDER BY date_start_utc ASC", params)
    rows = cur.fetchall() or []
    out: list[int] = []
    for r in rows:
        v = r.get("session_key") if isinstance(r, dict) else None
        if v is None:
            continue
        out.append(int(v))
    return out


def _run_py(script_path: str, args: list[str]) -> None:
    cmd = [sys.executable, script_path] + args
    subprocess.check_call(cmd, cwd=os.path.dirname(script_path) or None)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=int(datetime.now(timezone.utc).year))
    ap.add_argument("--include-unfinished", action="store_true", default=False)
    ap.add_argument("--skip-sync-sessions", action="store_true", default=False)
    ap.add_argument("--max-req-per-second", type=int, default=3)
    ap.add_argument("--max-req-per-minute", type=int, default=30)
    ap.add_argument("--dry-run", action="store_true", default=False)
    args = ap.parse_args()

    year = int(args.year)
    finished_only = not bool(args.include_unfinished)

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    sync_script = os.path.join(scripts_dir, "openf1_sync_all_mysql.py")
    tags_script = os.path.join(scripts_dir, "openf1_build_lap_tags_mysql.py")

    if not bool(args.skip_sync_sessions):
        _run_py(
            sync_script,
            [
                "--sync-all-sessions",
                "--year-from",
                str(year),
                "--year-to",
                str(year),
                "--max-req-per-second",
                str(int(args.max_req_per_second)),
                "--max-req-per-minute",
                str(int(args.max_req_per_minute)),
                "--quiet",
            ],
        )

    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            session_keys = _select_race_session_keys(cur, year=year, finished_only=finished_only)
    finally:
        conn.close()

    print(f"race sessions: year={year} finished_only={finished_only} count={len(session_keys)}", flush=True)
    if not session_keys:
        return 0

    if bool(args.dry_run):
        for sk in session_keys:
            print(f"dry-run: would sync session_key={sk}", flush=True)
        return 0

    for sk in session_keys:
        _run_py(
            sync_script,
            [
                "--session-key",
                str(int(sk)),
                "--mode",
                "laps",
                "--max-req-per-second",
                str(int(args.max_req_per_second)),
                "--max-req-per-minute",
                str(int(args.max_req_per_minute)),
                "--summary-json",
                "--quiet",
            ],
        )
        _run_py(tags_script, ["--session-key", str(int(sk))])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
