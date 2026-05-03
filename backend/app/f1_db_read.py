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


def schedule_json_from_db(conn: pymysql.Connection, season: int) -> Dict[str, Any]:
    season = int(season)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              r.id AS race_pk,
              r.season_year,
              r.round,
              r.race_name,
              r.ergast_url AS race_url,
              r.race_start_utc,
              c.ergast_circuit_id,
              c.name AS circuit_name,
              c.ergast_url AS circuit_url,
              c.locality,
              c.country,
              c.latitude,
              c.longitude
            FROM f1_race r
            JOIN f1_circuit c ON c.id = r.circuit_id
            WHERE r.season_year = %s
            ORDER BY r.round ASC
            """,
            (season,),
        )
        races_raw = cur.fetchall() or []

        if not races_raw:
            raise ValueError(f"no races in db for season={season}")

        cur.execute(
            """
            SELECT
              rs.race_id AS race_pk,
              rs.session_type,
              rs.start_utc
            FROM f1_race_session rs
            JOIN f1_race r ON r.id = rs.race_id
            WHERE r.season_year = %s
            """,
            (season,),
        )
        sess_raw = cur.fetchall() or []

    by_race: dict[int, dict[str, datetime]] = {}
    for row in sess_raw:
        if not isinstance(row, dict):
            continue
        race_pk = row.get("race_pk")
        st = row.get("session_type")
        dt = row.get("start_utc")
        if not isinstance(race_pk, int):
            continue
        if not isinstance(st, str):
            continue
        if not isinstance(dt, datetime):
            continue
        by_race.setdefault(race_pk, {})[st.upper()] = dt

    def _sess_obj(dt: Optional[datetime]) -> Optional[Dict[str, Any]]:
        d, t = _dt_to_ergast_parts(dt)
        if not d:
            return None
        out = {"date": d}
        if t:
            out["time"] = t
        return out

    races: list[Dict[str, Any]] = []
    for row in races_raw:
        if not isinstance(row, dict):
            continue
        race_pk = row.get("race_pk")
        if not isinstance(race_pk, int):
            continue
        ss = by_race.get(race_pk, {})
        race_dt = ss.get("RACE")
        if not isinstance(race_dt, datetime):
            race_dt = row.get("race_start_utc") if isinstance(row.get("race_start_utc"), datetime) else None
        date_s, time_s = _dt_to_ergast_parts(race_dt)
        if not date_s:
            continue

        circuit = {
            "circuitId": row.get("ergast_circuit_id"),
            "url": row.get("circuit_url"),
            "circuitName": row.get("circuit_name"),
            "Location": {
                "lat": None if row.get("latitude") is None else str(row.get("latitude")),
                "long": None if row.get("longitude") is None else str(row.get("longitude")),
                "locality": row.get("locality"),
                "country": row.get("country"),
            },
        }

        race_obj: Dict[str, Any] = {
            "season": str(season),
            "round": str(row.get("round")),
            "url": row.get("race_url"),
            "raceName": row.get("race_name"),
            "Circuit": circuit,
            "date": date_s,
        }
        if time_s:
            race_obj["time"] = time_s

        if (o := _sess_obj(ss.get("FP1"))) is not None:
            race_obj["FirstPractice"] = o
        if (o := _sess_obj(ss.get("FP2"))) is not None:
            race_obj["SecondPractice"] = o
        if (o := _sess_obj(ss.get("FP3"))) is not None:
            race_obj["ThirdPractice"] = o
        if (o := _sess_obj(ss.get("Q"))) is not None:
            race_obj["Qualifying"] = o
        if (o := _sess_obj(ss.get("SQ"))) is not None:
            race_obj["SprintQualifying"] = o
        if (o := _sess_obj(ss.get("SPRINT"))) is not None:
            race_obj["Sprint"] = o

        races.append(race_obj)

    return {
        "MRData": {
            "series": "f1",
            "url": f"mysql://toinc_F1/f1_race?season={season}",
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
