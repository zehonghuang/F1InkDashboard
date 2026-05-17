import argparse
import json
import os
from datetime import datetime, timedelta

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
    )


def _parse_int_list(values) -> list[int]:
    out: list[int] = []
    for v in values or []:
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        for p in [x.strip() for x in s.split(",") if x.strip()]:
            out.append(int(p))
    return sorted(set(out))


def _ms(v: float | None) -> int | None:
    if v is None:
        return None
    try:
        vv = float(v)
    except Exception:
        return None
    if vv <= 0:
        return None
    return int(round(vv * 1000.0))


def _find_end_index(points: list[list[int | None]], end_ms: int | None) -> int | None:
    if end_ms is None:
        return None
    for i, p in enumerate(points):
        if int(p[0] or 0) >= end_ms:
            return i
    return len(points) - 1 if points else 0


def _sample_points(points: list[list[int | None]], max_points: int) -> list[list[int | None]]:
    if max_points <= 0 or len(points) <= max_points:
        return points
    step = len(points) // max_points
    if step < 1:
        step = 1
    out: list[list[int | None]] = []
    i = 0
    while i < len(points):
        out.append(points[i])
        i += step
    if out and out[-1] != points[-1]:
        out.append(points[-1])
    return out


def _fetch_finished_session_keys(cur, *, race_only: bool, newest_first: bool) -> list[int]:
    where = ["is_cancelled = 0", "date_end_utc IS NOT NULL", "date_end_utc < UTC_TIMESTAMP()"]
    if race_only:
        where.append("session_type = 'Race'")
    order = "DESC" if newest_first else "ASC"
    cur.execute(f"SELECT session_key FROM openf1_sessions WHERE {' AND '.join(where)} ORDER BY date_end_utc {order}")
    rows = cur.fetchall() or []
    out: list[int] = []
    for r in rows:
        v = r.get("session_key") if isinstance(r, dict) else None
        if v is None:
            continue
        out.append(int(v))
    return out


def _fetch_driver_numbers_in_session(cur, session_key: int) -> list[int]:
    cur.execute(
        """
        SELECT DISTINCT driver_number
        FROM openf1_laps
        WHERE session_key = %s
          AND driver_number IS NOT NULL
          AND lap_duration IS NOT NULL AND lap_duration > 0
          AND date_start_utc IS NOT NULL
        ORDER BY driver_number ASC
        """,
        (int(session_key),),
    )
    rows = cur.fetchall() or []
    out: list[int] = []
    for r in rows:
        dn = r.get("driver_number") if isinstance(r, dict) else None
        if dn is None:
            continue
        out.append(int(dn))
    return out


def _fetch_laps_for_driver(cur, *, session_key: int, driver_number: int, lap_numbers: list[int]) -> list[dict]:
    params: list[object] = [int(session_key), int(driver_number)]
    where = ["session_key = %s", "driver_number = %s", "lap_duration IS NOT NULL", "lap_duration > 0", "date_start_utc IS NOT NULL"]
    if lap_numbers:
        where.append(f"lap_number IN ({','.join(['%s'] * len(lap_numbers))})")
        params.extend([int(x) for x in lap_numbers])
    cur.execute(
        f"""
        SELECT
          session_key,
          driver_number,
          lap_number,
          date_start_utc,
          lap_duration,
          duration_sector_1,
          duration_sector_2,
          duration_sector_3
        FROM openf1_laps
        WHERE {' AND '.join(where)}
        ORDER BY lap_number ASC, date_start_utc ASC
        """,
        params,
    )
    rows = cur.fetchall() or []
    out: list[dict] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        ln = r.get("lap_number")
        st = r.get("date_start_utc")
        dur = r.get("lap_duration")
        if ln is None or st is None or dur is None:
            continue
        try:
            ln_i = int(ln)
            dur_f = float(dur)
        except Exception:
            continue
        if dur_f <= 0:
            continue
        out.append(
            {
                "session_key": int(session_key),
                "driver_number": int(driver_number),
                "lap_number": ln_i,
                "date_start_utc": st,
                "lap_duration": dur_f,
                "duration_sector_1": r.get("duration_sector_1"),
                "duration_sector_2": r.get("duration_sector_2"),
                "duration_sector_3": r.get("duration_sector_3"),
            }
        )
    return out


def _insert_one(cur, *, lap: dict, max_points: int, points: list[list[int | None]]):
    dur_s = float(lap.get("lap_duration") or 0.0)
    s1_ms = _ms(lap.get("duration_sector_1"))
    s2_ms = None
    if lap.get("duration_sector_1") is not None and lap.get("duration_sector_2") is not None:
        try:
            s2_ms = _ms(float(lap.get("duration_sector_1")) + float(lap.get("duration_sector_2")))
        except Exception:
            s2_ms = None

    points = _sample_points(points, max_points)
    s1_i = _find_end_index(points, s1_ms)
    s2_i = _find_end_index(points, s2_ms)
    payload = {
        "v": 1,
        "t_end_ms": int(round(dur_s * 1000.0)),
        "s1_end_ms": s1_ms,
        "s2_end_ms": s2_ms,
        "s1_end_i": s1_i,
        "s2_end_i": s2_i,
        "points": points,
        "units": {"speed": "kmh", "throttle": "pct", "brake": "pct"},
    }
    payload_s = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    points_count = len(points)

    cur.execute(
        """
        INSERT INTO openf1_lap_controls_series
          (session_key, driver_number, lap_number, date_start_utc,
           lap_duration, duration_sector_1, duration_sector_2, duration_sector_3,
           max_points, points_count, payload_json)
        VALUES
          (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          lap_duration=VALUES(lap_duration),
          duration_sector_1=VALUES(duration_sector_1),
          duration_sector_2=VALUES(duration_sector_2),
          duration_sector_3=VALUES(duration_sector_3),
          max_points=VALUES(max_points),
          points_count=VALUES(points_count),
          payload_json=VALUES(payload_json)
        """,
        (
            lap["session_key"],
            lap["driver_number"],
            lap["lap_number"],
            lap["date_start_utc"],
            lap.get("lap_duration"),
            lap.get("duration_sector_1"),
            lap.get("duration_sector_2"),
            lap.get("duration_sector_3"),
            max_points,
            points_count,
            payload_s,
        ),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-key", type=int, default=None)
    ap.add_argument("--driver-number", action="append")
    ap.add_argument("--lap-number", action="append")
    ap.add_argument("--max-points", type=int, default=900)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--overwrite", action="store_true", default=False)
    ap.add_argument("--truncate", action="store_true", default=False)
    ap.add_argument("--all-sessions", action="store_true", default=False)
    ap.add_argument("--include-non-race", action="store_true", default=False)
    ap.add_argument("--oldest-first", action="store_true", default=False)
    ap.add_argument("--dry-run", action="store_true", default=False)
    args = ap.parse_args()

    driver_numbers = _parse_int_list(args.driver_number)
    lap_numbers = _parse_int_list(args.lap_number)
    max_points = int(args.max_points)
    if max_points < 0:
        max_points = 0
    if max_points > 20000:
        max_points = 20000

    conn_w = _mysql_connect()
    conn_r = _mysql_connect()
    try:
        if args.truncate and not args.dry_run:
            with conn_w.cursor() as cur:
                cur.execute("TRUNCATE TABLE openf1_lap_controls_series")

        race_only = not bool(args.include_non_race)
        newest_first = not bool(args.oldest_first)

        session_keys: list[int] = []
        with conn_w.cursor() as cur:
            if args.session_key is not None:
                session_keys = [int(args.session_key)]
            else:
                if args.all_sessions:
                    order = "DESC" if newest_first else "ASC"
                    cur.execute(f"SELECT DISTINCT session_key FROM openf1_laps WHERE session_key IS NOT NULL ORDER BY session_key {order}")
                    session_keys = [int(r["session_key"]) for r in (cur.fetchall() or []) if isinstance(r, dict) and r.get("session_key") is not None]
                else:
                    session_keys = _fetch_finished_session_keys(cur, race_only=race_only, newest_first=newest_first)
                    if not session_keys:
                        order = "DESC" if newest_first else "ASC"
                        cur.execute(f"SELECT DISTINCT session_key FROM openf1_laps WHERE session_key IS NOT NULL ORDER BY session_key {order}")
                        session_keys = [int(r["session_key"]) for r in (cur.fetchall() or []) if isinstance(r, dict) and r.get("session_key") is not None]

        if driver_numbers and not session_keys:
            return 0

        total_written = 0
        total_sessions = len(session_keys)
        for si, sk in enumerate(session_keys, start=1):
            with conn_w.cursor() as cur:
                dns = _fetch_driver_numbers_in_session(cur, sk)
            if driver_numbers:
                dns = [x for x in dns if x in driver_numbers]
            if not dns:
                continue

            for dn in dns:
                with conn_w.cursor() as cur:
                    laps = _fetch_laps_for_driver(cur, session_key=sk, driver_number=dn, lap_numbers=lap_numbers)
                if not laps:
                    continue
                if args.limit and args.limit > 0:
                    laps = laps[: int(args.limit)]

                li = 0
                points: list[list[int | None]] = []
                last_t: int | None = None

                def flush_one(idx: int):
                    nonlocal points, last_t, total_written
                    if idx < 0 or idx >= len(laps):
                        points = []
                        last_t = None
                        return
                    lap = laps[idx]
                    if not args.dry_run:
                        with conn_w.cursor() as curw:
                            _insert_one(curw, lap=lap, max_points=max_points, points=points)
                    total_written += 1
                    points = []
                    last_t = None

                if not args.overwrite and not args.dry_run:
                    with conn_w.cursor() as cur:
                        cur.execute(
                            """
                            SELECT lap_number, date_start_utc
                            FROM openf1_lap_controls_series
                            WHERE session_key=%s AND driver_number=%s AND max_points=%s AND points_count>0
                            """,
                            (sk, dn, max_points),
                        )
                        existing = {(int(r["lap_number"]), r["date_start_utc"]) for r in (cur.fetchall() or []) if isinstance(r, dict)}
                    laps = [it for it in laps if (int(it["lap_number"]), it["date_start_utc"]) not in existing]
                    if not laps:
                        continue
                    li = 0

                start0 = min([it["date_start_utc"] for it in laps if it.get("date_start_utc") is not None])
                end_last = max([it["date_start_utc"] + timedelta(seconds=float(it["lap_duration"])) for it in laps if it.get("date_start_utc") is not None])

                stream_cur = conn_r.cursor(pymysql.cursors.SSCursor)
                try:
                    stream_cur.execute(
                        """
                        SELECT date_utc, speed, throttle, brake
                        FROM openf1_car_data
                        WHERE session_key=%s AND driver_number=%s AND date_utc >= %s AND date_utc <= %s
                        ORDER BY date_utc ASC
                        """,
                        (sk, dn, start0, end_last),
                    )
                    while True:
                        batch = stream_cur.fetchmany(2000)
                        if not batch:
                            break
                        for dt, sp, th, br in batch:
                            while li < len(laps):
                                lap = laps[li]
                                st: datetime = lap["date_start_utc"]
                                en: datetime = st + timedelta(seconds=float(lap["lap_duration"]))
                                if dt > en:
                                    flush_one(li)
                                    li += 1
                                    continue
                                if dt < st:
                                    break
                                t_ms = int(round((dt - st).total_seconds() * 1000.0))
                                if t_ms < 0:
                                    break
                                sp_i = int(sp) if sp is not None else None
                                th_i = int(th) if th is not None else None
                                br_i = int(br) if br is not None else None
                                if last_t is not None and t_ms == last_t and points:
                                    points[-1] = [t_ms, sp_i, th_i, br_i]
                                else:
                                    points.append([t_ms, sp_i, th_i, br_i])
                                    last_t = t_ms
                                break
                finally:
                    stream_cur.close()

                while li < len(laps):
                    flush_one(li)
                    li += 1

            if not args.dry_run:
                print(f"session {si}/{total_sessions} done: session_key={sk} drivers={len(dns)} total_written={total_written}", flush=True)
    finally:
        conn_w.close()
        conn_r.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
