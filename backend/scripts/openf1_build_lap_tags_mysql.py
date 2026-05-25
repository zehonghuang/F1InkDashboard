import argparse
import json
import os
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


def _is_race_row(r: dict) -> bool:
    sn = str(r.get("session_name") or "").strip().lower()
    st = str(r.get("session_type") or "").strip().lower()
    return sn == "race" or st == "race"


def _select_race_session_keys(cur, *, year: int | None, finished_only: bool) -> list[int]:
    where = ["is_cancelled = 0", "(LOWER(session_name) = 'race' OR LOWER(session_type) = 'race')"]
    params: list[object] = []
    if year is not None:
        where.append("year = %s")
        params.append(int(year))
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


def _flag_tokens(s: str) -> set[str]:
    s = (s or "").lower()
    out: set[str] = set()
    for token in (
        "yellow",
        "vsc",
        "virtual safety car",
        "safety car",
        "sc",
        "red",
        "red flag",
    ):
        if token in s:
            out.add(token)
    return out


def _derive_flags(flag: str | None, category: str | None, message: str | None) -> dict:
    raw = f"{flag or ''} {category or ''} {message or ''}".strip()
    toks = _flag_tokens(raw)
    has_yellow = "yellow" in toks
    has_vsc = ("vsc" in toks) or ("virtual safety car" in toks)
    has_sc = ("safety car" in toks) or ("sc" in toks and not has_vsc)
    has_red = ("red flag" in toks) or ("red" in toks and "yellow" not in toks)
    return {
        "yellow": bool(has_yellow),
        "sc": bool(has_sc),
        "vsc": bool(has_vsc),
        "red": bool(has_red),
        "raw_flag": (flag or "").strip() or None,
        "raw_category": (category or "").strip() or None,
        "raw_message": (message or "").strip() or None,
    }


def _merge_flags(dst: dict, src: dict) -> dict:
    dst["yellow"] = bool(dst.get("yellow") or src.get("yellow"))
    dst["sc"] = bool(dst.get("sc") or src.get("sc"))
    dst["vsc"] = bool(dst.get("vsc") or src.get("vsc"))
    dst["red"] = bool(dst.get("red") or src.get("red"))
    ev = dst.get("events")
    if not isinstance(ev, list):
        ev = []
    ev.append(
        {
            "flag": src.get("raw_flag"),
            "category": src.get("raw_category"),
            "message": src.get("raw_message"),
        }
    )
    dst["events"] = ev
    return dst


def _build_tags_for_session(cur, session_key: int) -> tuple[int, int]:
    cur.execute(
        """
        SELECT lap_number, flag, category, message
        FROM openf1_race_control
        WHERE session_key = %s
          AND lap_number IS NOT NULL
        """,
        (int(session_key),),
    )
    rc = cur.fetchall() or []
    flags_by_lap: dict[int, dict] = {}
    for r in rc:
        ln = r.get("lap_number") if isinstance(r, dict) else None
        if ln is None:
            continue
        try:
            ln_i = int(ln)
        except Exception:
            continue
        f = _derive_flags(r.get("flag"), r.get("category"), r.get("message"))
        if ln_i not in flags_by_lap:
            flags_by_lap[ln_i] = {"yellow": False, "sc": False, "vsc": False, "red": False, "events": []}
        flags_by_lap[ln_i] = _merge_flags(flags_by_lap[ln_i], f)

    cur.execute(
        """
        SELECT driver_number, lap_number, date_start_utc, is_pit_out_lap
        FROM openf1_laps
        WHERE session_key = %s
          AND driver_number IS NOT NULL
          AND lap_number IS NOT NULL
          AND date_start_utc IS NOT NULL
        """,
        (int(session_key),),
    )
    laps = cur.fetchall() or []
    ins: list[tuple] = []
    for r in laps:
        dn = r.get("driver_number")
        ln = r.get("lap_number")
        ds = r.get("date_start_utc")
        if dn is None or ln is None or ds is None:
            continue
        try:
            dn_i = int(dn)
            ln_i = int(ln)
        except Exception:
            continue
        flags = flags_by_lap.get(ln_i) or {"yellow": False, "sc": False, "vsc": False, "red": False, "events": []}
        flags_json = json.dumps(flags, ensure_ascii=False, separators=(",", ":"))
        pit_out = r.get("is_pit_out_lap")
        pit_out_v = None
        if pit_out is not None:
            pit_out_v = 1 if bool(pit_out) else 0
        ins.append(
            (
                int(session_key),
                dn_i,
                ln_i,
                ds,
                pit_out_v,
                1 if flags.get("yellow") else 0,
                1 if flags.get("sc") else 0,
                1 if flags.get("vsc") else 0,
                flags_json,
            )
        )

    if not ins:
        return (len(laps), 0)

    cur.executemany(
        """
        INSERT INTO openf1_lap_tags
        (session_key, driver_number, lap_number, date_start_utc, is_pit_out_lap, has_yellow, has_sc, has_vsc, flags_json)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          is_pit_out_lap=VALUES(is_pit_out_lap),
          has_yellow=VALUES(has_yellow),
          has_sc=VALUES(has_sc),
          has_vsc=VALUES(has_vsc),
          flags_json=VALUES(flags_json)
        """,
        ins,
    )
    return (len(laps), len(ins))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--session-key", action="append", default=None)
    ap.add_argument("--include-unfinished", action="store_true", default=False)
    args = ap.parse_args()

    session_keys = _parse_int_list(args.session_key)

    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            if not session_keys:
                session_keys = _select_race_session_keys(cur, year=args.year, finished_only=not bool(args.include_unfinished))

            total_laps = 0
            total_upsert = 0
            for sk in session_keys:
                n_laps, n_up = _build_tags_for_session(cur, int(sk))
                total_laps += int(n_laps)
                total_upsert += int(n_up)
                print(f"lap_tags ok: session_key={sk} laps={n_laps} upsert={n_up}", flush=True)

            print(
                json.dumps(
                    {
                        "ok": True,
                        "year": args.year,
                        "sessions": len(session_keys),
                        "totals": {"laps": total_laps, "upsert": total_upsert},
                        "finished_only": not bool(args.include_unfinished),
                        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                    },
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
