import argparse
import json
import os
from pathlib import Path
from typing import Any

import pymysql
from pymysql.constants import CLIENT


def _connect():
    return pymysql.connect(
        host=os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("TOINC_F1_MYSQL_PORT", "3306")),
        user=os.getenv("TOINC_F1_MYSQL_USER", "root"),
        password=os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456"),
        db=os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1"),
        charset="utf8mb4",
        autocommit=True,
        client_flag=CLIENT.MULTI_STATEMENTS,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _load_seed(seed_path: Path) -> dict[str, Any]:
    if not seed_path.exists():
        raise SystemExit(f"seed file not found: {seed_path}")
    return json.loads(seed_path.read_text(encoding="utf-8"))


def _constructor_id(team_name: str) -> str:
    s = (team_name or "").strip().lower()
    if not s:
        return ""
    s = s.replace("&", "and")
    s = "_".join([p for p in s.split(" ") if p])
    if len(s) > 48:
        s = s[:48]
    return s


def _seed_text(seed: dict[str, Any], entity_type: str, entity_key: str, field: str) -> str:
    et = seed.get(entity_type) or {}
    ek = et.get(str(entity_key)) or {}
    v = ek.get(field)
    if v is None:
        return ""
    return str(v).strip()


def _source_text_map(conn, season: int, req: list[tuple[str, str, str]]) -> dict[tuple[str, str, str], str]:
    if not req:
        return {}

    by_type: dict[str, set[str]] = {}
    for et, ek, _fd in req:
        by_type.setdefault(et, set()).add(str(ek))

    out: dict[tuple[str, str, str], str] = {}
    with conn.cursor() as cur:
        driver_keys = sorted(by_type.get("driver") or set())
        if driver_keys:
            cur.execute(
                """
                SELECT driver_number, full_name, session_key
                FROM openf1_drivers
                WHERE driver_number IN %s
                ORDER BY session_key DESC
                """,
                (driver_keys,),
            )
            seen = set()
            for r in cur.fetchall():
                dn = r.get("driver_number")
                if dn is None:
                    continue
                k = str(int(dn))
                if k in seen:
                    continue
                seen.add(k)
                v = str(r.get("full_name") or "").strip()
                if v:
                    out[("driver", k, "full_name")] = v

        constructor_keys = set(by_type.get("constructor") or set())
        if constructor_keys:
            cur.execute(
                """
                SELECT DISTINCT team_name AS team_name
                FROM openf1_championship_teams
                WHERE team_name IS NOT NULL AND TRIM(team_name) != ''
                ORDER BY team_name ASC
                """
            )
            for r in cur.fetchall():
                tn = str(r.get("team_name") or "").strip()
                if not tn:
                    continue
                cid = _constructor_id(tn)
                if cid and cid in constructor_keys:
                    out[("constructor", cid, "name")] = tn

        circuit_keys = sorted(by_type.get("circuit") or set())
        if circuit_keys:
            cur.execute(
                """
                SELECT ergast_circuit_id AS circuit_id, name, country, locality
                FROM f1_circuit
                WHERE ergast_circuit_id IN %s
                """,
                (circuit_keys,),
            )
            for r in cur.fetchall():
                cid = str(r.get("circuit_id") or "").strip()
                if not cid:
                    continue
                name = str(r.get("name") or "").strip()
                country = str(r.get("country") or "").strip()
                locality = str(r.get("locality") or "").strip()
                if name:
                    out[("circuit", cid, "name")] = name
                if country:
                    out[("circuit", cid, "country")] = country
                if locality:
                    out[("circuit", cid, "locality")] = locality

        cur.execute(
            """
            SELECT season_year, round, race_name
            FROM f1_race
            WHERE season_year = %s
            """,
            (int(season),),
        )
        for r in cur.fetchall():
            sy = r.get("season_year")
            rd = r.get("round")
            if sy is None or rd is None:
                continue
            key = f"{int(sy)}_{int(rd)}"
            if key not in (by_type.get("race") or set()):
                continue
            v = str(r.get("race_name") or "").strip()
            if v:
                out[("race", key, "race_name")] = v

        meeting_keys = sorted(by_type.get("openf1_meeting") or set())
        if meeting_keys:
            cur.execute(
                """
                SELECT meeting_key, meeting_name, location, country_name, circuit_short_name
                FROM openf1_meetings
                WHERE year = %s AND meeting_key IN %s
                """,
                (int(season), meeting_keys),
            )
            for r in cur.fetchall():
                mk = r.get("meeting_key")
                if mk is None:
                    continue
                key = str(int(mk))
                mn = str(r.get("meeting_name") or "").strip()
                loc = str(r.get("location") or "").strip()
                cn = str(r.get("country_name") or "").strip()
                csn = str(r.get("circuit_short_name") or "").strip()
                if mn:
                    out[("openf1_meeting", key, "meeting_name")] = mn
                if loc:
                    out[("openf1_meeting", key, "location")] = loc
                if cn:
                    out[("openf1_meeting", key, "country_name")] = cn
                if csn:
                    out[("openf1_meeting", key, "circuit_short_name")] = csn

    return out


def _required_from_db(conn, season: int) -> list[tuple[str, str, str]]:
    req: list[tuple[str, str, str]] = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT cd.driver_number AS driver_number
            FROM openf1_championship_drivers cd
            WHERE cd.driver_number IS NOT NULL
            ORDER BY cd.driver_number ASC
            """
        )
        for r in cur.fetchall():
            dn = r.get("driver_number")
            if dn is None:
                continue
            req.append(("driver", str(int(dn)), "full_name"))

        cur.execute(
            """
            SELECT DISTINCT team_name AS team_name
            FROM openf1_championship_teams
            WHERE team_name IS NOT NULL AND TRIM(team_name) != ''
            ORDER BY team_name ASC
            """
        )
        for r in cur.fetchall():
            tn = (r.get("team_name") or "").strip()
            if not tn:
                continue
            cid = _constructor_id(tn)
            if cid:
                req.append(("constructor", cid, "name"))

        cur.execute(
            """
            SELECT DISTINCT c.ergast_circuit_id AS circuit_id
            FROM f1_race r
            JOIN f1_circuit c ON c.id = r.circuit_id
            WHERE r.season_year = %s
            ORDER BY c.ergast_circuit_id ASC
            """
            ,
            (season,),
        )
        for r in cur.fetchall():
            cid = (r.get("circuit_id") or "").strip()
            if not cid:
                continue
            req.append(("circuit", cid, "name"))
            req.append(("circuit", cid, "country"))
            req.append(("circuit", cid, "locality"))

        cur.execute(
            """
            SELECT season_year AS season_year, round AS round
            FROM f1_race
            WHERE season_year = ?
            ORDER BY round ASC
            """.replace("?", "%s"),
            (season,),
        )
        for r in cur.fetchall():
            sy = r.get("season_year")
            rd = r.get("round")
            if sy is None or rd is None:
                continue
            req.append(("race", f"{int(sy)}_{int(rd)}", "race_name"))

        cur.execute(
            """
            SELECT meeting_key AS meeting_key
            FROM openf1_meetings
            WHERE year = ?
            ORDER BY meeting_key ASC
            """.replace("?", "%s"),
            (season,),
        )
        for r in cur.fetchall():
            mk = r.get("meeting_key")
            if mk is None:
                continue
            key = str(int(mk))
            req.append(("openf1_meeting", key, "meeting_name"))
            req.append(("openf1_meeting", key, "location"))
            req.append(("openf1_meeting", key, "country_name"))
            req.append(("openf1_meeting", key, "circuit_short_name"))

    seen = set()
    uniq: list[tuple[str, str, str]] = []
    for it in req:
        if it in seen:
            continue
        seen.add(it)
        uniq.append(it)
    return uniq


def _existing_in_db(conn, lang: str, req: list[tuple[str, str, str]]) -> set[tuple[str, str, str]]:
    if not req:
        return set()
    entity_types = sorted({it[0] for it in req})
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT entity_type, entity_key, field
            FROM i18n_text
            WHERE lang = %s AND entity_type IN %s
            """,
            (lang, entity_types),
        )
        rows = cur.fetchall()
    out: set[tuple[str, str, str]] = set()
    for r in rows:
        et = (r.get("entity_type") or "").strip()
        ek = (r.get("entity_key") or "").strip()
        fd = (r.get("field") or "").strip()
        if et and ek and fd:
            out.add((et, ek, fd))
    return out


def _upsert(conn, lang: str, rows: list[tuple[str, str, str, str]]) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO i18n_text (entity_type, entity_key, field, lang, text)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE text = VALUES(text)
            """,
            [(et, ek, fd, lang, text) for et, ek, fd, text in rows],
        )
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="zh-CN")
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--seed", default=str(Path(__file__).resolve().parent.parent / "i18n" / "zh-CN.json"))
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--out-missing", default=str(Path(__file__).resolve().parent.parent / "i18n" / "_missing.zh-CN.json"))
    args = ap.parse_args()

    seed_path = Path(args.seed).resolve()
    seed = _load_seed(seed_path)

    conn = _connect()
    try:
        req = _required_from_db(conn, season=int(args.season))
        exist = _existing_in_db(conn, args.lang, req)
        source_map = _source_text_map(conn, season=int(args.season), req=req)

        to_upsert: list[tuple[str, str, str, str]] = []
        missing: list[dict[str, Any]] = []
        for et, ek, fd in req:
            if (et, ek, fd) in exist:
                continue
            text = _seed_text(seed, et, ek, fd)
            if text:
                to_upsert.append((et, ek, fd, text))
            else:
                src = source_map.get((et, ek, fd), "")
                missing.append({"entity_type": et, "entity_key": ek, "field": fd, "source_text": src})

        out_missing = Path(args.out_missing).resolve()
        out_missing.parent.mkdir(parents=True, exist_ok=True)
        out_missing.write_text(json.dumps({"lang": args.lang, "missing": missing}, ensure_ascii=False, indent=2), encoding="utf-8")

        if args.apply:
            n = _upsert(conn, args.lang, to_upsert)
            print(f"upserted={n} missing={len(missing)}")
        else:
            print(f"dry_run_upsert={len(to_upsert)} missing={len(missing)}")

        if args.strict and missing:
            return 2
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
