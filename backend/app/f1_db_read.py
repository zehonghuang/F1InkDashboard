import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import pymysql


def _dt_to_ergast_parts(dt: Optional[datetime]) -> tuple[Optional[str], Optional[str]]:
    if not dt:
        return None, None
    dtu = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return dtu.date().isoformat(), dtu.strftime("%H:%M:%SZ")


def _load_json(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, (bytes, bytearray)):
        try:
            v = v.decode("utf-8")
        except Exception:
            return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except Exception:
            return None
    return None


def _normalize_public_static_url(u: Any, season: int, circuit_id: str, kind: str) -> str | None:
    s = str(u or "").strip()
    if not s:
        if kind == "detail":
            return f"/static/circuits/{int(season)}/{circuit_id}_detail.png"
        return f"/static/circuits/{int(season)}/{circuit_id}.png"
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if s.startswith("/static/"):
        return s
    if s.startswith("static/"):
        return "/" + s
    if s.startswith("/circuits/"):
        return "/static" + s
    if s.startswith("circuits/"):
        return "/static/" + s
    return s


def openf1_latest_race_session_key_from_db(conn: pymysql.Connection, season: int) -> int:
    season = int(season)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.session_key
            FROM openf1_sessions s
            WHERE s.year = %s
              AND s.is_cancelled IS NOT TRUE
              AND (LOWER(s.session_name) = 'race' OR LOWER(s.session_type) = 'race')
              AND EXISTS (
                SELECT 1
                FROM openf1_championship_drivers cd
                WHERE cd.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT 1
            """,
            (season,),
        )
        row = cur.fetchone()
        if isinstance(row, dict) and row.get("session_key") is not None:
            return int(row["session_key"])

        cur.execute(
            """
            SELECT s.session_key
            FROM openf1_sessions s
            WHERE s.year = %s
              AND EXISTS (
                SELECT 1
                FROM openf1_championship_drivers cd
                WHERE cd.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT 1
            """,
            (season,),
        )
        row = cur.fetchone()
    if not isinstance(row, dict) or row.get("session_key") is None:
        raise ValueError(f"no openf1 championship data found for season={season}")
    return int(row["session_key"])


def openf1_driver_standings_json_from_db(conn: pymysql.Connection, session_key: int) -> Dict[str, Any]:
    session_key = int(session_key)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              cd.driver_number,
              cd.meeting_key,
              cd.position_current,
              cd.points_current,
              d.first_name,
              d.last_name,
              d.name_acronym,
              d.team_name
            FROM openf1_championship_drivers cd
            LEFT JOIN openf1_drivers d
              ON d.session_key = cd.session_key AND d.driver_number = cd.driver_number
            WHERE cd.session_key = %s
            ORDER BY cd.position_current ASC
            """,
            (session_key,),
        )
        rows = cur.fetchall() or []
    if not rows:
        raise ValueError(f"no openf1 driver standings for session_key={session_key}")

    def _constructor_id(team_name: Any) -> str | None:
        s = str(team_name or "").strip().lower()
        if not s:
            return None
        s = s.replace("&", "and").replace(" ", "_")
        return s[:48]

    driver_rows: list[Dict[str, Any]] = []
    for it in rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        pos = it.get("position_current")
        pts = it.get("points_current")
        team = it.get("team_name")
        drv = {
            "driverId": None if dn is None else str(int(dn)),
            "code": (it.get("name_acronym") or "").strip().upper() or None,
            "givenName": (it.get("first_name") or "").strip(),
            "familyName": (it.get("last_name") or "").strip(),
        }
        c0 = {
            "constructorId": _constructor_id(team),
            "name": (team or "").strip(),
        }
        driver_rows.append(
            {
                "position": 0 if pos is None else int(pos),
                "points": 0 if pts is None else float(pts),
                "Driver": drv,
                "Constructors": [c0] if c0.get("name") else [],
            }
        )

    return {
        "MRData": {
            "series": "f1",
            "url": f"mysql://toinc_F1/openf1_championship_drivers?session_key={session_key}",
            "StandingsTable": {"StandingsLists": [{"DriverStandings": driver_rows}]},
        }
    }


def openf1_constructor_standings_json_from_db(conn: pymysql.Connection, session_key: int) -> Dict[str, Any]:
    session_key = int(session_key)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              team_name,
              position_current,
              points_current
            FROM openf1_championship_teams
            WHERE session_key = %s
            ORDER BY position_current ASC
            """,
            (session_key,),
        )
        rows = cur.fetchall() or []
    if not rows:
        raise ValueError(f"no openf1 constructor standings for session_key={session_key}")

    def _constructor_id(team_name: Any) -> str | None:
        s = str(team_name or "").strip().lower()
        if not s:
            return None
        s = s.replace("&", "and").replace(" ", "_")
        return s[:48]

    out_rows: list[Dict[str, Any]] = []
    for it in rows:
        if not isinstance(it, dict):
            continue
        tn = it.get("team_name")
        pos = it.get("position_current")
        pts = it.get("points_current")
        out_rows.append(
            {
                "position": 0 if pos is None else int(pos),
                "points": 0 if pts is None else float(pts),
                "Constructor": {"constructorId": _constructor_id(tn), "name": (tn or "").strip()},
            }
        )

    return {
        "MRData": {
            "series": "f1",
            "url": f"mysql://toinc_F1/openf1_championship_teams?session_key={session_key}",
            "StandingsTable": {"StandingsLists": [{"ConstructorStandings": out_rows}]},
        }
    }


def openf1_last_n_results_json_from_db(conn: pymysql.Connection, season: int, n: int) -> Dict[str, Any]:
    season = int(season)
    n = int(n)
    if n <= 0:
        return {"MRData": {"series": "f1", "url": "mysql://toinc_F1/openf1_session_result", "RaceTable": {"season": str(season), "Races": []}}}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              s.session_key,
              s.date_start_utc,
              COALESCE(m.meeting_name, '') AS meeting_name
            FROM openf1_sessions s
            LEFT JOIN openf1_meetings m ON m.meeting_key = s.meeting_key
            WHERE s.year = %s
              AND s.is_cancelled IS NOT TRUE
              AND (LOWER(s.session_name) = 'race' OR LOWER(s.session_type) = 'race')
              AND EXISTS (
                SELECT 1
                FROM openf1_session_result sr
                WHERE sr.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT %s
            """,
            (season, n),
        )
        sess = cur.fetchall() or []

    if not sess:
        return {"MRData": {"series": "f1", "url": "mysql://toinc_F1/openf1_session_result", "RaceTable": {"season": str(season), "Races": []}}}

    session_keys: list[int] = []
    meta: dict[int, dict] = {}
    for it in sess:
        if not isinstance(it, dict):
            continue
        sk = it.get("session_key")
        if sk is None:
            continue
        try:
            sk_i = int(sk)
        except Exception:
            continue
        session_keys.append(sk_i)
        meta[sk_i] = it

    session_keys = list(dict.fromkeys(session_keys))
    session_keys.sort(reverse=True)
    session_keys = list(reversed(session_keys))

    placeholders = ",".join(["%s"] * len(session_keys))
    sql = f"""
        SELECT
          sr.session_key,
          sr.driver_number,
          sr.position,
          cd.points_start,
          cd.points_current
        FROM openf1_session_result sr
        LEFT JOIN openf1_championship_drivers cd
          ON cd.session_key = sr.session_key AND cd.driver_number = sr.driver_number
        WHERE sr.session_key IN ({placeholders})
    """
    by_session: dict[int, list[dict]] = {sk: [] for sk in session_keys}
    with conn.cursor() as cur:
        cur.execute(sql, tuple(session_keys))
        rows = cur.fetchall() or []
    for it in rows:
        if not isinstance(it, dict):
            continue
        sk = it.get("session_key")
        dn = it.get("driver_number")
        pos = it.get("position")
        if sk is None or dn is None or pos is None:
            continue
        try:
            sk_i = int(sk)
            dn_i = int(dn)
            pos_i = int(pos)
        except Exception:
            continue
        pts = 0.0
        ps = it.get("points_start")
        pc = it.get("points_current")
        try:
            if ps is not None and pc is not None:
                pts = float(pc) - float(ps)
        except Exception:
            pts = 0.0
        by_session.setdefault(sk_i, []).append({"dn": dn_i, "pos": pos_i, "points": pts})

    races: list[Dict[str, Any]] = []
    for sk in session_keys:
        it = meta.get(sk, {})
        name = (it.get("meeting_name") or "").strip() or f"SESSION {sk}"
        results = sorted(by_session.get(sk, []), key=lambda x: x.get("pos") or 9999)
        races.append(
            {
                "season": str(season),
                "round": None,
                "raceName": name,
                "Results": [
                    {"position": str(r.get("pos")), "points": float(r.get("points") or 0.0), "Driver": {"driverId": str(r.get("dn"))}}
                    for r in results
                ],
            }
        )

    return {
        "MRData": {
            "series": "f1",
            "url": f"mysql://toinc_F1/openf1_session_result?season={season}&n={n}",
            "RaceTable": {"season": str(season), "Races": races},
        }
    }


def openf1_session_result_rows_from_db(conn: pymysql.Connection, session_key: int) -> list[Dict[str, Any]]:
    session_key = int(session_key)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              sr.session_key,
              sr.meeting_key,
              sr.driver_number,
              sr.position,
              sr.number_of_laps,
              sr.dnf,
              sr.dns,
              sr.dsq,
              sr.duration_s,
              sr.gap_to_leader_s,
              sr.duration_json,
              sr.gap_to_leader_json,
              d.name_acronym,
              d.team_name,
              cd.points_start,
              cd.points_current
            FROM openf1_session_result sr
            LEFT JOIN openf1_drivers d
              ON d.session_key = sr.session_key AND d.driver_number = sr.driver_number
            LEFT JOIN openf1_championship_drivers cd
              ON cd.session_key = sr.session_key AND cd.driver_number = sr.driver_number
            WHERE sr.session_key = %s
            ORDER BY sr.position ASC
            """,
            (session_key,),
        )
        return cur.fetchall() or []


def openf1_pit_counts_from_db(conn: pymysql.Connection, session_key: int) -> Dict[int, int]:
    session_key = int(session_key)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT driver_number, COUNT(*) AS n
            FROM openf1_pit
            WHERE session_key = %s
            GROUP BY driver_number
            """,
            (session_key,),
        )
        rows = cur.fetchall() or []
    out: Dict[int, int] = {}
    for it in rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        n = it.get("n")
        if dn is None or n is None:
            continue
        try:
            out[int(dn)] = int(n)
        except Exception:
            continue
    return out


def openf1_quali_sec123_from_db(conn: pymysql.Connection, session_key: int) -> Dict[int, str]:
    session_key = int(session_key)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              MIN(duration_sector_1) AS gb1,
              MIN(duration_sector_2) AS gb2,
              MIN(duration_sector_3) AS gb3
            FROM openf1_laps
            WHERE session_key = %s
              AND lap_duration IS NOT NULL
              AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
            """,
            (session_key,),
        )
        gb = cur.fetchone() or {}

        cur.execute(
            """
            SELECT
              driver_number,
              MIN(duration_sector_1) AS pb1,
              MIN(duration_sector_2) AS pb2,
              MIN(duration_sector_3) AS pb3
            FROM openf1_laps
            WHERE session_key = %s
              AND lap_duration IS NOT NULL
              AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
            GROUP BY driver_number
            """,
            (session_key,),
        )
        pb_rows = cur.fetchall() or []

        cur.execute(
            """
            SELECT
              l.driver_number,
              l.duration_sector_1 AS s1,
              l.duration_sector_2 AS s2,
              l.duration_sector_3 AS s3
            FROM openf1_laps l
            JOIN (
              SELECT driver_number, MIN(lap_duration) AS best_dur
              FROM openf1_laps
              WHERE session_key = %s
                AND lap_duration IS NOT NULL
                AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
              GROUP BY driver_number
            ) b
              ON b.driver_number = l.driver_number AND b.best_dur = l.lap_duration
            WHERE l.session_key = %s
              AND (l.is_pit_out_lap = 0 OR l.is_pit_out_lap IS NULL)
            """,
            (session_key, session_key),
        )
        best_rows = cur.fetchall() or []

    gb1 = gb.get("gb1")
    gb2 = gb.get("gb2")
    gb3 = gb.get("gb3")
    try:
        gb1 = float(gb1) if gb1 is not None else None
    except Exception:
        gb1 = None
    try:
        gb2 = float(gb2) if gb2 is not None else None
    except Exception:
        gb2 = None
    try:
        gb3 = float(gb3) if gb3 is not None else None
    except Exception:
        gb3 = None

    pb: Dict[int, tuple[float | None, float | None, float | None]] = {}
    for it in pb_rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        if dn is None:
            continue
        try:
            dn_i = int(dn)
        except Exception:
            continue
        def _f(x):
            try:
                return float(x) if x is not None else None
            except Exception:
                return None
        pb[dn_i] = (_f(it.get("pb1")), _f(it.get("pb2")), _f(it.get("pb3")))

    best: Dict[int, tuple[float | None, float | None, float | None]] = {}
    for it in best_rows:
        if not isinstance(it, dict):
            continue
        dn = it.get("driver_number")
        if dn is None:
            continue
        try:
            dn_i = int(dn)
        except Exception:
            continue
        def _f(x):
            try:
                return float(x) if x is not None else None
            except Exception:
                return None
        if dn_i not in best:
            best[dn_i] = (_f(it.get("s1")), _f(it.get("s2")), _f(it.get("s3")))

    eps = 0.0015

    def _sym(v: float | None, g: float | None, p: float | None) -> str:
        if v is None or not (v > 0.0):
            return "-"
        if g is not None and abs(v - g) <= eps:
            return "P"
        if p is not None and abs(v - p) <= eps:
            return "G"
        return "Y"

    out: Dict[int, str] = {}
    for dn, (s1, s2, s3) in best.items():
        pb1, pb2, pb3 = pb.get(dn, (None, None, None))
        out[dn] = _sym(s1, gb1, pb1) + _sym(s2, gb2, pb2) + _sym(s3, gb3, pb3)
    return out


def openf1_schedule_json_from_db(conn: pymysql.Connection, season: int) -> Dict[str, Any]:
    season = int(season)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              meeting_key,
              year,
              meeting_name,
              meeting_official_name,
              location,
              country_name,
              country_code,
              circuit_key,
              circuit_short_name,
              date_start_utc,
              date_end_utc,
              gmt_offset,
              is_cancelled
            FROM openf1_meetings
            WHERE year = %s
            """,
            (season,),
        )
        meetings_raw = cur.fetchall() or []
        cur.execute(
            """
            SELECT
              session_key,
              meeting_key,
              year,
              session_name,
              session_type,
              date_start_utc,
              date_end_utc,
              is_cancelled
            FROM openf1_sessions
            WHERE year = %s
            """,
            (season,),
        )
        sessions_raw = cur.fetchall() or []

    if not sessions_raw:
        raise ValueError(f"no openf1 sessions in db for season={season}")

    meetings_by_key: dict[int, dict] = {}
    for it in meetings_raw:
        if not isinstance(it, dict):
            continue
        mk = it.get("meeting_key")
        if mk is None:
            continue
        try:
            meetings_by_key[int(mk)] = it
        except Exception:
            continue

    def _map_session_type(name: str) -> str | None:
        s = (name or "").strip().lower()
        if not s:
            return None
        if "practice 1" in s or s in {"fp1", "p1"}:
            return "FP1"
        if "practice 2" in s or s in {"fp2", "p2"}:
            return "FP2"
        if "practice 3" in s or s in {"fp3", "p3"}:
            return "FP3"
        if "sprint shootout" in s or "sprint qualifying" in s:
            return "SQ"
        if s == "sprint":
            return "SPRINT"
        if s == "qualifying":
            return "Q"
        if s == "race":
            return "RACE"
        return None

    def _sess_obj(dt: Optional[datetime]) -> Optional[Dict[str, Any]]:
        d, t = _dt_to_ergast_parts(dt)
        if not d:
            return None
        out: Dict[str, Any] = {"date": d}
        if t:
            out["time"] = t
        return out

    by_meeting: dict[int, dict[str, Dict[str, Any]]] = {}
    by_meeting_any_dt: dict[int, datetime] = {}
    for row in sessions_raw:
        if not isinstance(row, dict):
            continue
        mk = row.get("meeting_key")
        sk = row.get("session_key")
        if mk is None:
            continue
        try:
            mk_i = int(mk)
        except Exception:
            continue
        dt = row.get("date_start_utc")
        if not isinstance(dt, datetime):
            continue
        st = _map_session_type(str(row.get("session_name") or "")) or _map_session_type(str(row.get("session_type") or ""))
        if st:
            by_meeting.setdefault(mk_i, {})[st] = {"dt": dt, "session_key": sk}
        if mk_i not in by_meeting_any_dt or dt < by_meeting_any_dt[mk_i]:
            by_meeting_any_dt[mk_i] = dt

    races_tmp: list[tuple[datetime, Dict[str, Any]]] = []
    def _sess_obj2(v: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(v, dict):
            return None
        dt = v.get("dt")
        if not isinstance(dt, datetime):
            return None
        d, t = _dt_to_ergast_parts(dt)
        if not d:
            return None
        out: Dict[str, Any] = {"date": d}
        if t:
            out["time"] = t
        if v.get("session_key") is not None:
            try:
                out["openf1_session_key"] = int(v.get("session_key"))
            except Exception:
                pass
        return out

    for mk, sess_map in by_meeting.items():
        race_rec = sess_map.get("RACE")
        race_dt = (race_rec.get("dt") if isinstance(race_rec, dict) else None) or by_meeting_any_dt.get(mk)
        if not isinstance(race_dt, datetime):
            continue
        date_s, time_s = _dt_to_ergast_parts(race_dt)
        if not date_s:
            continue
        m = meetings_by_key.get(mk, {})
        race_name = (m.get("meeting_name") or "").strip() or f"MEETING {mk}"

        circuit = {
            "url": None,
            "circuitName": (m.get("circuit_short_name") or "") or None,
            "Location": {
                "lat": None,
                "long": None,
                "locality": m.get("location"),
                "country": m.get("country_name"),
            },
        }

        race_obj: Dict[str, Any] = {
            "season": str(season),
            "round": None,
            "url": None,
            "raceName": race_name,
            "Circuit": circuit,
            "date": date_s,
        }
        if time_s:
            race_obj["time"] = time_s
        if isinstance(race_rec, dict) and race_rec.get("session_key") is not None:
            try:
                race_obj["openf1_race_session_key"] = int(race_rec.get("session_key"))
            except Exception:
                pass

        if (o := _sess_obj2(sess_map.get("FP1"))) is not None:
            race_obj["FirstPractice"] = o
        if (o := _sess_obj2(sess_map.get("FP2"))) is not None:
            race_obj["SecondPractice"] = o
        if (o := _sess_obj2(sess_map.get("FP3"))) is not None:
            race_obj["ThirdPractice"] = o
        if (o := _sess_obj2(sess_map.get("Q"))) is not None:
            race_obj["Qualifying"] = o
        if (o := _sess_obj2(sess_map.get("SQ"))) is not None:
            race_obj["SprintQualifying"] = o
        if (o := _sess_obj2(sess_map.get("SPRINT"))) is not None:
            race_obj["Sprint"] = o

        races_tmp.append((race_dt, race_obj))

    if not races_tmp:
        raise ValueError(f"no openf1 races derived for season={season}")

    races_tmp.sort(key=lambda x: x[0])
    races: list[Dict[str, Any]] = []
    for i, (_, obj) in enumerate(races_tmp, start=1):
        obj["round"] = str(i)
        races.append(obj)

    return {
        "MRData": {
            "series": "f1",
            "url": f"mysql://toinc_F1/openf1_sessions?season={season}",
            "RaceTable": {"season": str(season), "Races": races},
        }
    }


def circuit_assets_payload_from_db(conn: pymysql.Connection, season: int) -> Dict[str, Any]:
    season = int(season)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              r.round,
              r.race_name,
              COALESCE(rs.start_utc, r.race_start_utc) AS race_start_utc,
              c.ergast_circuit_id,
              c.name AS circuit_name,
              c.country,
              c.locality,
              c.latitude,
              c.longitude,
              c.ergast_url,
              c.formula1_slug,
              c.track_key,
              c.map_image_url,
              c.assets_json
            FROM f1_race r
            JOIN f1_circuit c ON c.id = r.circuit_id
            LEFT JOIN f1_race_session rs ON rs.race_id = r.id AND rs.session_type = 'RACE'
            WHERE r.season_year = %s
            ORDER BY r.round ASC
            """,
            (season,),
        )
        rows = cur.fetchall() or []
    if not rows:
        raise ValueError(f"no circuit assets in db for season={season}")

    items: list[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        circuit_id = str(row.get("ergast_circuit_id") or "").strip()
        if not circuit_id:
            continue
        payload = _load_json(row.get("assets_json"))
        if isinstance(payload, dict):
            if "circuit_id" not in payload:
                payload["circuit_id"] = circuit_id
            if "public_map_image_url" not in payload:
                payload["public_map_image_url"] = payload.get("map_image_url")
            payload["public_map_image_url"] = _normalize_public_static_url(
                payload.get("public_map_image_url"),
                season=season,
                circuit_id=circuit_id,
                kind="map",
            )
            if "public_map_image_url_detail" not in payload:
                payload["public_map_image_url_detail"] = payload.get("map_image_url_detail")
            payload["public_map_image_url_detail"] = _normalize_public_static_url(
                payload.get("public_map_image_url_detail"),
                season=season,
                circuit_id=circuit_id,
                kind="detail",
            )
            items.append(payload)
            continue

        date_s, time_s = _dt_to_ergast_parts(row.get("race_start_utc") if isinstance(row.get("race_start_utc"), datetime) else None)
        it: Dict[str, Any] = {
            "season": season,
            "round": row.get("round"),
            "race_name": row.get("race_name"),
            "date": date_s,
            "time": time_s,
            "circuit_id": circuit_id,
            "circuit_name": row.get("circuit_name"),
            "country": row.get("country"),
            "locality": row.get("locality"),
            "lat": None if row.get("latitude") is None else str(row.get("latitude")),
            "long": None if row.get("longitude") is None else str(row.get("longitude")),
            "ergast_url": row.get("ergast_url"),
            "formula1_slug": row.get("formula1_slug"),
            "track_key": row.get("track_key"),
            "public_map_image_url": _normalize_public_static_url(
                row.get("map_image_url"),
                season=season,
                circuit_id=circuit_id,
                kind="map",
            ),
            "downloaded": None,
            "public_map_image_url_detail": _normalize_public_static_url(
                None,
                season=season,
                circuit_id=circuit_id,
                kind="detail",
            ),
            "downloaded_detail": None,
            "stats": {},
        }
        items.append(it)

    return {
        "season": season,
        "source": "mysql",
        "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }
