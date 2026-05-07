from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

import pymysql


def _as_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(v)
    except Exception:
        return None


def _as_decimal(v: Any) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None


def _as_date(v: Any) -> Optional[date]:
    s = str(v or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except Exception:
        return None


def _parse_ergast_dt(date_s: Any, time_s: Any) -> Optional[datetime]:
    ds = str(date_s or "").strip()
    if not ds:
        return None
    ts = str(time_s or "").strip()
    try:
        if not ts:
            return datetime.fromisoformat(ds).replace(tzinfo=timezone.utc)
        t = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(f"{ds}T{t}").astimezone(timezone.utc)
    except Exception:
        return None


def _dt_to_mysql(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _upsert_season(cur: pymysql.cursors.Cursor, year: int, ergast_url: Optional[str]) -> None:
    cur.execute(
        """
        INSERT INTO f1_season (`year`, `ergast_url`)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE
          `ergast_url` = VALUES(`ergast_url`)
        """,
        (int(year), ergast_url),
    )


def _upsert_circuit(cur: pymysql.cursors.Cursor, circuit: Dict[str, Any]) -> int:
    circuit_id = str(circuit.get("circuitId") or "").strip()
    if not circuit_id:
        raise ValueError("missing Circuit.circuitId")

    loc = circuit.get("Location") or {}
    lat = None
    lng = None
    try:
        if loc.get("lat") is not None:
            lat = float(loc.get("lat"))
        if loc.get("long") is not None:
            lng = float(loc.get("long"))
    except Exception:
        lat = None
        lng = None

    cur.execute(
        """
        INSERT INTO f1_circuit (
          `ergast_circuit_id`, `name`, `locality`, `country`, `latitude`, `longitude`, `ergast_url`
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          `id` = LAST_INSERT_ID(`id`),
          `name` = VALUES(`name`),
          `locality` = VALUES(`locality`),
          `country` = VALUES(`country`),
          `latitude` = VALUES(`latitude`),
          `longitude` = VALUES(`longitude`),
          `ergast_url` = VALUES(`ergast_url`)
        """,
        (
            circuit_id,
            circuit.get("circuitName"),
            loc.get("locality"),
            loc.get("country"),
            lat,
            lng,
            circuit.get("url"),
        ),
    )
    return int(cur.lastrowid)


def _upsert_race(cur: pymysql.cursors.Cursor, race: Dict[str, Any], season_year: int, circuit_pk: int) -> int:
    race_round = _as_int(race.get("round"))
    if race_round is None:
        raise ValueError("missing race.round")
    race_name = str(race.get("raceName") or "").strip()
    if not race_name:
        raise ValueError("missing race.raceName")

    race_start_utc = _dt_to_mysql(_parse_ergast_dt(race.get("date"), race.get("time")))
    cur.execute(
        """
        INSERT INTO f1_race (
          `season_year`, `round`, `race_name`, `ergast_url`, `circuit_id`, `race_start_utc`
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          `id` = LAST_INSERT_ID(`id`),
          `race_name` = VALUES(`race_name`),
          `ergast_url` = VALUES(`ergast_url`),
          `circuit_id` = VALUES(`circuit_id`),
          `race_start_utc` = VALUES(`race_start_utc`)
        """,
        (int(season_year), int(race_round), race_name, race.get("url"), int(circuit_pk), race_start_utc),
    )
    return int(cur.lastrowid)


def _upsert_race_session(
    cur: pymysql.cursors.Cursor,
    race_pk: int,
    session_type: str,
    start_utc: Optional[datetime],
) -> int:
    cur.execute(
        """
        INSERT INTO f1_race_session (`race_id`, `session_type`, `start_utc`)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
          `id` = LAST_INSERT_ID(`id`),
          `start_utc` = VALUES(`start_utc`)
        """,
        (int(race_pk), session_type, _dt_to_mysql(start_utc)),
    )
    return int(cur.lastrowid)


def ingest_schedule_json(conn: pymysql.Connection, schedule_json: Dict[str, Any]) -> Dict[str, int]:
    mr = (schedule_json or {}).get("MRData", {}) or {}
    rt = mr.get("RaceTable", {}) or {}
    season_year = _as_int(rt.get("season"))
    if season_year is None:
        raise ValueError("missing MRData.RaceTable.season")

    races = rt.get("Races", []) or []
    if not isinstance(races, list):
        raise ValueError("MRData.RaceTable.Races must be list")

    ergast_url = mr.get("url")
    out = {"seasons": 0, "circuits": 0, "races": 0, "sessions": 0}

    with conn.cursor() as cur:
        _upsert_season(cur, season_year, str(ergast_url) if ergast_url else None)
        out["seasons"] += 1

        for race in races:
            if not isinstance(race, dict):
                continue
            circuit = race.get("Circuit") or {}
            if not isinstance(circuit, dict):
                continue

            circuit_pk = _upsert_circuit(cur, circuit)
            out["circuits"] += 1
            race_pk = _upsert_race(cur, race, season_year=season_year, circuit_pk=circuit_pk)
            out["races"] += 1

            session_map = {
                "FirstPractice": "FP1",
                "SecondPractice": "FP2",
                "ThirdPractice": "FP3",
                "SprintQualifying": "SQ",
                "SprintShootout": "SQ",
                "Qualifying": "Q",
                "Sprint": "SPRINT",
            }
            for k, typ in session_map.items():
                sess = race.get(k)
                if not isinstance(sess, dict):
                    continue
                dt = _parse_ergast_dt(sess.get("date"), sess.get("time"))
                _upsert_race_session(cur, race_pk=race_pk, session_type=typ, start_utc=dt)
                out["sessions"] += 1

            race_dt = _parse_ergast_dt(race.get("date"), race.get("time"))
            _upsert_race_session(cur, race_pk=race_pk, session_type="RACE", start_utc=race_dt)
            out["sessions"] += 1

    conn.commit()
    return out


def _upsert_driver(cur: pymysql.cursors.Cursor, drv: Dict[str, Any]) -> int:
    driver_id = str(drv.get("driverId") or "").strip()
    if not driver_id:
        raise ValueError("missing Driver.driverId")
    cur.execute(
        """
        INSERT INTO f1_driver (
          `ergast_driver_id`, `code`, `permanent_number`, `given_name`, `family_name`,
          `date_of_birth`, `nationality`, `ergast_url`
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          `id` = LAST_INSERT_ID(`id`),
          `code` = VALUES(`code`),
          `permanent_number` = VALUES(`permanent_number`),
          `given_name` = VALUES(`given_name`),
          `family_name` = VALUES(`family_name`),
          `date_of_birth` = VALUES(`date_of_birth`),
          `nationality` = VALUES(`nationality`),
          `ergast_url` = VALUES(`ergast_url`)
        """,
        (
            driver_id,
            drv.get("code"),
            _as_int(drv.get("permanentNumber")),
            drv.get("givenName"),
            drv.get("familyName"),
            _as_date(drv.get("dateOfBirth")),
            drv.get("nationality"),
            drv.get("url"),
        ),
    )
    return int(cur.lastrowid)


def _upsert_constructor(cur: pymysql.cursors.Cursor, cst: Dict[str, Any]) -> int:
    constructor_id = str(cst.get("constructorId") or "").strip()
    if not constructor_id:
        raise ValueError("missing Constructor.constructorId")
    name = str(cst.get("name") or "").strip()
    if not name:
        raise ValueError("missing Constructor.name")
    cur.execute(
        """
        INSERT INTO f1_constructor (`ergast_constructor_id`, `name`, `nationality`, `ergast_url`)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          `id` = LAST_INSERT_ID(`id`),
          `name` = VALUES(`name`),
          `nationality` = VALUES(`nationality`),
          `ergast_url` = VALUES(`ergast_url`)
        """,
        (constructor_id, name, cst.get("nationality"), cst.get("url")),
    )
    return int(cur.lastrowid)


def ingest_driver_standings_json(conn: pymysql.Connection, standings_json: Dict[str, Any]) -> Dict[str, int]:
    mr = (standings_json or {}).get("MRData", {}) or {}
    st = mr.get("StandingsTable", {}) or {}
    lists = st.get("StandingsLists", []) or []
    if not isinstance(lists, list) or not lists:
        raise ValueError("MRData.StandingsTable.StandingsLists missing")
    entry = lists[0]
    if not isinstance(entry, dict):
        raise ValueError("StandingsLists[0] invalid")

    season_year = _as_int(entry.get("season"))
    round_no = _as_int(entry.get("round"))
    if season_year is None or round_no is None:
        raise ValueError("StandingsLists[0].season/round missing")

    out = {"seasons": 0, "drivers": 0, "constructors": 0, "driver_standings": 0}
    ergast_url = mr.get("url")

    with conn.cursor() as cur:
        _upsert_season(cur, season_year, str(ergast_url) if ergast_url else None)
        out["seasons"] += 1

        items = entry.get("DriverStandings", []) or []
        if not isinstance(items, list):
            raise ValueError("DriverStandings must be list")
        for it in items:
            if not isinstance(it, dict):
                continue
            drv = it.get("Driver") or {}
            if not isinstance(drv, dict):
                continue
            driver_pk = _upsert_driver(cur, drv)
            out["drivers"] += 1

            constructors = it.get("Constructors") or []
            if isinstance(constructors, list):
                for cst in constructors:
                    if isinstance(cst, dict):
                        _upsert_constructor(cur, cst)
                        out["constructors"] += 1

            pos = _as_int(it.get("position")) or 0
            points = _as_decimal(it.get("points")) or Decimal("0")
            wins = _as_int(it.get("wins")) or 0

            cur.execute(
                """
                INSERT INTO f1_driver_standing (
                  `season_year`, `round`, `driver_id`, `position`, `points`, `wins`
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  `position` = VALUES(`position`),
                  `points` = VALUES(`points`),
                  `wins` = VALUES(`wins`)
                """,
                (int(season_year), int(round_no), int(driver_pk), int(pos), points, int(wins)),
            )
            out["driver_standings"] += 1

    conn.commit()
    return out


def ingest_constructor_standings_json(conn: pymysql.Connection, standings_json: Dict[str, Any]) -> Dict[str, int]:
    mr = (standings_json or {}).get("MRData", {}) or {}
    st = mr.get("StandingsTable", {}) or {}
    lists = st.get("StandingsLists", []) or []
    if not isinstance(lists, list) or not lists:
        raise ValueError("MRData.StandingsTable.StandingsLists missing")
    entry = lists[0]
    if not isinstance(entry, dict):
        raise ValueError("StandingsLists[0] invalid")

    season_year = _as_int(entry.get("season"))
    round_no = _as_int(entry.get("round"))
    if season_year is None or round_no is None:
        raise ValueError("StandingsLists[0].season/round missing")

    out = {"seasons": 0, "constructors": 0, "constructor_standings": 0}
    ergast_url = mr.get("url")

    with conn.cursor() as cur:
        _upsert_season(cur, season_year, str(ergast_url) if ergast_url else None)
        out["seasons"] += 1

        items = entry.get("ConstructorStandings", []) or []
        if not isinstance(items, list):
            raise ValueError("ConstructorStandings must be list")
        for it in items:
            if not isinstance(it, dict):
                continue
            cst = it.get("Constructor") or {}
            if not isinstance(cst, dict):
                continue
            constructor_pk = _upsert_constructor(cur, cst)
            out["constructors"] += 1

            pos = _as_int(it.get("position")) or 0
            points = _as_decimal(it.get("points")) or Decimal("0")
            wins = _as_int(it.get("wins")) or 0

            cur.execute(
                """
                INSERT INTO f1_constructor_standing (
                  `season_year`, `round`, `constructor_id`, `position`, `points`, `wins`
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  `position` = VALUES(`position`),
                  `points` = VALUES(`points`),
                  `wins` = VALUES(`wins`)
                """,
                (int(season_year), int(round_no), int(constructor_pk), int(pos), points, int(wins)),
            )
            out["constructor_standings"] += 1

    conn.commit()
    return out
