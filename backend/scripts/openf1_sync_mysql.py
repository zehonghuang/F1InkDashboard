import argparse
import os
import sys
import time
from collections import deque
from datetime import datetime, timezone

import httpx
import pymysql


def _parse_rfc3339_to_dt_utc_naive(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


class _RateLimiter:
    def __init__(self, max_per_second: int, max_per_minute: int):
        self._max_per_second = int(max_per_second)
        self._max_per_minute = int(max_per_minute)
        self._t_1s = deque()
        self._t_60s = deque()

    def wait(self) -> None:
        while True:
            now = time.time()
            while self._t_1s and now - self._t_1s[0] >= 1.0:
                self._t_1s.popleft()
            while self._t_60s and now - self._t_60s[0] >= 60.0:
                self._t_60s.popleft()

            wait_s = 0.0
            if self._max_per_second > 0 and len(self._t_1s) >= self._max_per_second:
                wait_s = max(wait_s, (self._t_1s[0] + 1.0) - now)
            if self._max_per_minute > 0 and len(self._t_60s) >= self._max_per_minute:
                wait_s = max(wait_s, (self._t_60s[0] + 60.0) - now)

            if wait_s <= 0:
                self._t_1s.append(now)
                self._t_60s.append(now)
                return
            time.sleep(min(wait_s, 1.0))


def _parse_driver_numbers(values) -> list[int]:
    out = []
    for v in values or []:
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        parts = [p.strip() for p in s.split(",") if p.strip()]
        for p in parts:
            out.append(int(p))
    return sorted(set(out))


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
    )


def _insert_car_data(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        if dn is None:
            continue
        dn = int(dn)
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue

        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                dn,
                dt,
                it.get("speed"),
                it.get("throttle"),
                it.get("brake"),
                it.get("drs"),
                it.get("n_gear"),
                it.get("rpm"),
            )
        )
    if not ins:
        return 0

    cur.executemany(
        """
        INSERT IGNORE INTO openf1_car_data
        (meeting_key, session_key, driver_number, date_utc, speed, throttle, brake, drs, n_gear, rpm)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_laps(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        if dn is None:
            continue
        dn = int(dn)
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date_start") or ""))
        if dt is None:
            continue

        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                dn,
                it.get("lap_number"),
                dt,
                it.get("lap_duration"),
                it.get("duration_sector_1"),
                it.get("duration_sector_2"),
                it.get("duration_sector_3"),
                it.get("i1_speed"),
                it.get("i2_speed"),
                it.get("st_speed"),
                1 if bool(it.get("is_pit_out_lap")) else 0 if it.get("is_pit_out_lap") is not None else None,
            )
        )
    if not ins:
        return 0

    cur.executemany(
        """
        INSERT IGNORE INTO openf1_laps
        (meeting_key, session_key, driver_number, lap_number, date_start_utc,
         lap_duration, duration_sector_1, duration_sector_2, duration_sector_3,
         i1_speed, i2_speed, st_speed, is_pit_out_lap)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--openf1-base", default=os.getenv("OPENF1_API_BASE", "https://api.openf1.org"))
    ap.add_argument("--driver-number", action="append", required=True)
    ap.add_argument("--session-key", default="latest")
    ap.add_argument("--meeting-key", default="latest")
    ap.add_argument("--enable-laps", action="store_true", default=False)
    ap.add_argument("--max-req-per-second", type=int, default=3)
    ap.add_argument("--max-req-per-minute", type=int, default=30)
    ap.add_argument("--quiet", action="store_true", default=False)
    args = ap.parse_args()

    driver_numbers = _parse_driver_numbers(args.driver_number)
    if not driver_numbers:
        raise SystemExit("--driver-number is required")

    openf1_base = (args.openf1_base or "").rstrip("/")

    limiter = _RateLimiter(max_per_second=args.max_req_per_second, max_per_minute=args.max_req_per_minute)

    conn = _mysql_connect()
    try:
        with httpx.Client(timeout=20.0) as client:
            for dn in driver_numbers:
                limiter.wait()
                params = {
                    "driver_number": str(int(dn)),
                    "session_key": str(args.session_key),
                    "meeting_key": str(args.meeting_key),
                }
                try:
                    r = client.get(f"{openf1_base}/v1/car_data", params=params)
                    if r.status_code == 429:
                        raise RuntimeError("openf1 429 rate_limited")
                    r.raise_for_status()
                    rows = r.json()
                except Exception as e:
                    if not args.quiet:
                        print(f"openf1 request failed (car_data, driver={dn}): {type(e).__name__}: {e}", file=sys.stderr, flush=True)
                    continue

                if not isinstance(rows, list) or not rows:
                    if not args.quiet:
                        print(f"openf1 ok (car_data, driver={dn}): 0 rows", flush=True)
                else:
                    rows.sort(key=lambda it: str(it.get("date") or ""))
                    with conn.cursor() as cur:
                        ins = _insert_car_data(cur, rows)
                    if not args.quiet:
                        print(f"openf1 ok (car_data, driver={dn}): rows={len(rows)} insert_attempt={ins}", flush=True)

                if not args.enable_laps:
                    continue

                limiter.wait()
                try:
                    r = client.get(f"{openf1_base}/v1/laps", params=params)
                    if r.status_code == 429:
                        raise RuntimeError("openf1 429 rate_limited")
                    r.raise_for_status()
                    rows = r.json()
                except Exception as e:
                    if not args.quiet:
                        print(f"openf1 request failed (laps, driver={dn}): {type(e).__name__}: {e}", file=sys.stderr, flush=True)
                    continue

                if not isinstance(rows, list) or not rows:
                    if not args.quiet:
                        print(f"openf1 ok (laps, driver={dn}): 0 rows", flush=True)
                else:
                    rows.sort(key=lambda it: str(it.get("date_start") or ""))
                    with conn.cursor() as cur:
                        ins = _insert_laps(cur, rows)
                    if not args.quiet:
                        print(f"openf1 ok (laps, driver={dn}): rows={len(rows)} insert_attempt={ins}", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
