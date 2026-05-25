import argparse
import json
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


def _mysql_connect():
    host = os.getenv("TOINC_F1_MYSQL_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("TOINC_F1_MYSQL_PORT", "3306"))
    user = os.getenv("TOINC_F1_MYSQL_USER", "root")
    password = os.getenv("TOINC_F1_MYSQL_PASSWORD", "123456")
    db = os.getenv("TOINC_F1_MYSQL_DB", "toinc_F1").strip() or "toinc_F1"
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        db=db,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=5,
        read_timeout=60,
        write_timeout=60,
    )


def _http_get_json(client: httpx.Client, limiter: _RateLimiter, url: str, params: dict) -> list[dict]:
    last_err = None
    for attempt in range(4):
        limiter.wait()
        try:
            r = client.get(url, params=params)
            if r.status_code == 429:
                raise RuntimeError("openf1 429 rate_limited")
            if r.status_code == 404:
                try:
                    data = r.json()
                    if isinstance(data, dict) and data.get("detail") == "No results found.":
                        return []
                except Exception:
                    pass
                return []
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict) and data.get("detail") == "No results found.":
                return []
            if not isinstance(data, list):
                raise RuntimeError("openf1 response is not a list")
            return [it for it in data if isinstance(it, dict)]
        except Exception as e:
            last_err = e
            if attempt >= 3:
                break
            time.sleep(2.0 + attempt * 2.0)
    raise RuntimeError(f"openf1 request failed: {type(last_err).__name__}: {last_err}")


def _as_json(v) -> str | None:
    if v is None:
        return None
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


_laps_has_segments_cols: bool | None = None


def _detect_openf1_laps_segments_cols(cur) -> bool:
    global _laps_has_segments_cols
    if _laps_has_segments_cols is not None:
        return _laps_has_segments_cols
    try:
        cur.execute("SHOW COLUMNS FROM openf1_laps LIKE %s", ("segments_sector_1",))
        row = cur.fetchone()
        _laps_has_segments_cols = bool(row)
    except Exception:
        _laps_has_segments_cols = False
    return bool(_laps_has_segments_cols)


def _upsert_meetings(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        mk = it.get("meeting_key")
        if mk is None:
            continue
        ins.append(
            (
                int(mk),
                it.get("year"),
                it.get("meeting_name"),
                it.get("meeting_official_name"),
                it.get("location"),
                it.get("country_name"),
                it.get("country_code"),
                it.get("country_key"),
                it.get("circuit_key"),
                it.get("circuit_short_name"),
                it.get("circuit_type"),
                it.get("circuit_image"),
                it.get("circuit_info_url"),
                it.get("country_flag"),
                _parse_rfc3339_to_dt_utc_naive(str(it.get("date_start") or "")),
                _parse_rfc3339_to_dt_utc_naive(str(it.get("date_end") or "")),
                it.get("gmt_offset"),
                1 if bool(it.get("is_cancelled")) else 0 if it.get("is_cancelled") is not None else None,
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_meetings
        (meeting_key, year, meeting_name, meeting_official_name, location, country_name, country_code, country_key,
         circuit_key, circuit_short_name, circuit_type, circuit_image, circuit_info_url, country_flag,
         date_start_utc, date_end_utc, gmt_offset, is_cancelled)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          year=VALUES(year),
          meeting_name=VALUES(meeting_name),
          meeting_official_name=VALUES(meeting_official_name),
          location=VALUES(location),
          country_name=VALUES(country_name),
          country_code=VALUES(country_code),
          country_key=VALUES(country_key),
          circuit_key=VALUES(circuit_key),
          circuit_short_name=VALUES(circuit_short_name),
          circuit_type=VALUES(circuit_type),
          circuit_image=VALUES(circuit_image),
          circuit_info_url=VALUES(circuit_info_url),
          country_flag=VALUES(country_flag),
          date_start_utc=VALUES(date_start_utc),
          date_end_utc=VALUES(date_end_utc),
          gmt_offset=VALUES(gmt_offset),
          is_cancelled=VALUES(is_cancelled)
        """,
        ins,
    )
    return len(ins)


def _upsert_sessions(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        if sk is None:
            continue
        ins.append(
            (
                int(sk),
                it.get("meeting_key"),
                it.get("year"),
                it.get("session_name"),
                it.get("session_type"),
                it.get("location"),
                it.get("country_name"),
                it.get("country_code"),
                it.get("country_key"),
                it.get("circuit_key"),
                it.get("circuit_short_name"),
                _parse_rfc3339_to_dt_utc_naive(str(it.get("date_start") or "")),
                _parse_rfc3339_to_dt_utc_naive(str(it.get("date_end") or "")),
                it.get("gmt_offset"),
                1 if bool(it.get("is_cancelled")) else 0 if it.get("is_cancelled") is not None else None,
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_sessions
        (session_key, meeting_key, year, session_name, session_type, location, country_name, country_code, country_key,
         circuit_key, circuit_short_name, date_start_utc, date_end_utc, gmt_offset, is_cancelled)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          year=VALUES(year),
          session_name=VALUES(session_name),
          session_type=VALUES(session_type),
          location=VALUES(location),
          country_name=VALUES(country_name),
          country_code=VALUES(country_code),
          country_key=VALUES(country_key),
          circuit_key=VALUES(circuit_key),
          circuit_short_name=VALUES(circuit_short_name),
          date_start_utc=VALUES(date_start_utc),
          date_end_utc=VALUES(date_end_utc),
          gmt_offset=VALUES(gmt_offset),
          is_cancelled=VALUES(is_cancelled)
        """,
        ins,
    )
    return len(ins)


def _upsert_drivers(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        dn = it.get("driver_number")
        if sk is None or dn is None:
            continue
        ins.append(
            (
                int(sk),
                int(dn),
                it.get("meeting_key"),
                it.get("broadcast_name"),
                it.get("first_name"),
                it.get("last_name"),
                it.get("full_name"),
                it.get("name_acronym"),
                it.get("country_code"),
                it.get("headshot_url"),
                it.get("team_name"),
                it.get("team_colour"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_drivers
        (session_key, driver_number, meeting_key, broadcast_name, first_name, last_name, full_name, name_acronym,
         country_code, headshot_url, team_name, team_colour)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          broadcast_name=VALUES(broadcast_name),
          first_name=VALUES(first_name),
          last_name=VALUES(last_name),
          full_name=VALUES(full_name),
          name_acronym=VALUES(name_acronym),
          country_code=VALUES(country_code),
          headshot_url=VALUES(headshot_url),
          team_name=VALUES(team_name),
          team_colour=VALUES(team_colour)
        """,
        ins,
    )
    return len(ins)


def _insert_car_data(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                int(dn),
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
    has_segments = _detect_openf1_laps_segments_cols(cur)
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date_start") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                int(dn),
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
        if has_segments:
            ins[-1] = ins[-1] + (
                _as_json(it.get("segments_sector_1")),
                _as_json(it.get("segments_sector_2")),
                _as_json(it.get("segments_sector_3")),
            )
    if not ins:
        return 0
    if has_segments:
        cur.executemany(
            """
            INSERT IGNORE INTO openf1_laps
            (meeting_key, session_key, driver_number, lap_number, date_start_utc,
             lap_duration, duration_sector_1, duration_sector_2, duration_sector_3,
             i1_speed, i2_speed, st_speed, is_pit_out_lap,
             segments_sector_1, segments_sector_2, segments_sector_3)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            ins,
        )
    else:
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


def _insert_location(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append((it.get("meeting_key"), it.get("session_key"), int(dn), dt, it.get("x"), it.get("y"), it.get("z")))
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_location
        (meeting_key, session_key, driver_number, date_utc, x, y, z)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_position(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append((it.get("meeting_key"), it.get("session_key"), int(dn), dt, it.get("position")))
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_position
        (meeting_key, session_key, driver_number, date_utc, position)
        VALUES (%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_intervals(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                int(dn),
                dt,
                it.get("gap_to_leader"),
                it.get("interval"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_intervals
        (meeting_key, session_key, driver_number, date_utc, gap_to_leader, interval_to_ahead)
        VALUES (%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_pit(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                int(dn),
                dt,
                it.get("lap_number"),
                it.get("lane_duration"),
                it.get("pit_duration"),
                it.get("stop_duration"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_pit
        (meeting_key, session_key, driver_number, date_utc, lap_number, lane_duration, pit_duration, stop_duration)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_race_control(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        q = it.get("qualifying_phase")
        try:
            q = int(q) if q is not None else None
        except Exception:
            q = None
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                dt,
                it.get("category"),
                it.get("scope"),
                it.get("message"),
                it.get("flag"),
                it.get("driver_number"),
                it.get("lap_number"),
                q,
                it.get("sector"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_race_control
        (meeting_key, session_key, date_utc, category, scope, message, flag, driver_number, lap_number, qualifying_phase, sector)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_weather(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                dt,
                it.get("air_temperature"),
                it.get("track_temperature"),
                it.get("humidity"),
                it.get("pressure"),
                1 if bool(it.get("rainfall")) else 0 if it.get("rainfall") is not None else None,
                it.get("wind_direction"),
                it.get("wind_speed"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_weather
        (meeting_key, session_key, date_utc, air_temperature, track_temperature, humidity, pressure, rainfall, wind_direction, wind_speed)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_team_radio(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dn = it.get("driver_number")
        if dn is None:
            continue
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append((it.get("meeting_key"), it.get("session_key"), int(dn), dt, it.get("recording_url")))
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_team_radio
        (meeting_key, session_key, driver_number, date_utc, recording_url)
        VALUES (%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _insert_overtakes(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        dt = _parse_rfc3339_to_dt_utc_naive(str(it.get("date") or ""))
        if dt is None:
            continue
        ins.append(
            (
                it.get("meeting_key"),
                it.get("session_key"),
                dt,
                it.get("overtaking_driver_number"),
                it.get("overtaken_driver_number"),
                it.get("position"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT IGNORE INTO openf1_overtakes
        (meeting_key, session_key, date_utc, overtaking_driver_number, overtaken_driver_number, position)
        VALUES (%s,%s,%s,%s,%s,%s)
        """,
        ins,
    )
    return len(ins)


def _upsert_stints(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        dn = it.get("driver_number")
        sn = it.get("stint_number")
        if sk is None or dn is None or sn is None:
            continue
        ins.append(
            (
                int(sk),
                int(dn),
                int(sn),
                it.get("meeting_key"),
                it.get("compound"),
                it.get("lap_start"),
                it.get("lap_end"),
                it.get("tyre_age_at_start"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_stints
        (session_key, driver_number, stint_number, meeting_key, compound, lap_start, lap_end, tyre_age_at_start)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          compound=VALUES(compound),
          lap_start=VALUES(lap_start),
          lap_end=VALUES(lap_end),
          tyre_age_at_start=VALUES(tyre_age_at_start)
        """,
        ins,
    )
    return len(ins)


def _upsert_session_result(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        dn = it.get("driver_number")
        if sk is None or dn is None:
            continue
        duration = it.get("duration")
        gap = it.get("gap_to_leader")
        duration_s = float(duration) if isinstance(duration, (int, float)) else None
        gap_s = float(gap) if isinstance(gap, (int, float)) else None
        duration_json = _as_json(duration) if isinstance(duration, (list, str)) else None
        gap_json = _as_json(gap) if isinstance(gap, (list, str)) else None
        ins.append(
            (
                int(sk),
                int(dn),
                it.get("meeting_key"),
                it.get("position"),
                it.get("number_of_laps"),
                1 if bool(it.get("dnf")) else 0 if it.get("dnf") is not None else None,
                1 if bool(it.get("dns")) else 0 if it.get("dns") is not None else None,
                1 if bool(it.get("dsq")) else 0 if it.get("dsq") is not None else None,
                duration_s,
                gap_s,
                duration_json,
                gap_json,
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_session_result
        (session_key, driver_number, meeting_key, position, number_of_laps, dnf, dns, dsq,
         duration_s, gap_to_leader_s, duration_json, gap_to_leader_json)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          position=VALUES(position),
          number_of_laps=VALUES(number_of_laps),
          dnf=VALUES(dnf),
          dns=VALUES(dns),
          dsq=VALUES(dsq),
          duration_s=VALUES(duration_s),
          gap_to_leader_s=VALUES(gap_to_leader_s),
          duration_json=VALUES(duration_json),
          gap_to_leader_json=VALUES(gap_to_leader_json)
        """,
        ins,
    )
    return len(ins)


def _upsert_starting_grid(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        pos = it.get("position")
        if sk is None or pos is None:
            continue
        ins.append((int(sk), int(pos), it.get("driver_number"), it.get("meeting_key"), it.get("lap_duration")))
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_starting_grid
        (session_key, position, driver_number, meeting_key, lap_duration)
        VALUES (%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          driver_number=VALUES(driver_number),
          meeting_key=VALUES(meeting_key),
          lap_duration=VALUES(lap_duration)
        """,
        ins,
    )
    return len(ins)


def _upsert_championship_drivers(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        dn = it.get("driver_number")
        if sk is None or dn is None:
            continue
        ins.append(
            (
                int(sk),
                int(dn),
                it.get("meeting_key"),
                it.get("position_start"),
                it.get("position_current"),
                it.get("points_start"),
                it.get("points_current"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_championship_drivers
        (session_key, driver_number, meeting_key, position_start, position_current, points_start, points_current)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          position_start=VALUES(position_start),
          position_current=VALUES(position_current),
          points_start=VALUES(points_start),
          points_current=VALUES(points_current)
        """,
        ins,
    )
    return len(ins)


def _upsert_championship_teams(cur, rows: list[dict]) -> int:
    ins = []
    for it in rows:
        sk = it.get("session_key")
        tn = it.get("team_name")
        if sk is None or tn is None:
            continue
        ins.append(
            (
                int(sk),
                str(tn),
                it.get("meeting_key"),
                it.get("position_start"),
                it.get("position_current"),
                it.get("points_start"),
                it.get("points_current"),
            )
        )
    if not ins:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_championship_teams
        (session_key, team_name, meeting_key, position_start, position_current, points_start, points_current)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          meeting_key=VALUES(meeting_key),
          position_start=VALUES(position_start),
          position_current=VALUES(position_current),
          points_start=VALUES(points_start),
          points_current=VALUES(points_current)
        """,
        ins,
    )
    return len(ins)


def _sync_one(
    client: httpx.Client,
    limiter: _RateLimiter,
    conn: pymysql.Connection,
    base: str,
    endpoint: str,
    params: dict,
    inserter,
    label: str,
    quiet: bool,
    summary: dict | None = None,
) -> tuple[int, int]:
    url = f"{base}/v1/{endpoint}"
    try:
        rows = _http_get_json(client, limiter, url, params=params)
    except Exception as e:
        if not quiet:
            print(f"openf1 failed ({label}): {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        if summary is not None:
            summary[label] = {"endpoint": endpoint, "rows": 0, "insert_attempt": 0, "error": f"{type(e).__name__}: {e}"}
        return (0, 0)
    inserted = 0
    if rows:
        with conn.cursor() as cur:
            inserted = inserter(cur, rows)
        conn.commit()
    if not quiet:
        print(f"openf1 ok ({label}): rows={len(rows)} insert_attempt={inserted}", flush=True)
    if summary is not None:
        summary[label] = {"endpoint": endpoint, "rows": len(rows) if rows else 0, "insert_attempt": int(inserted)}
    return (len(rows), inserted)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--openf1-base", default=os.getenv("OPENF1_API_BASE", "https://api.openf1.org"))
    ap.add_argument("--session-key", default="latest")
    ap.add_argument("--meeting-key", default=None)
    ap.add_argument("--driver-number", action="append", default=None)
    ap.add_argument("--mode", default="full")
    ap.add_argument("--sync-all-sessions", action="store_true", default=False)
    ap.add_argument("--sync-all-team-radio", action="store_true", default=False)
    ap.add_argument("--sync-all-data", action="store_true", default=False)
    ap.add_argument("--year-from", type=int, default=2023)
    ap.add_argument("--year-to", type=int, default=int(datetime.now(timezone.utc).year))
    ap.add_argument("--max-req-per-second", type=int, default=3)
    ap.add_argument("--max-req-per-minute", type=int, default=30)
    ap.add_argument("--quiet", action="store_true", default=False)
    ap.add_argument("--summary-json", action="store_true", default=False)
    args = ap.parse_args()

    base = (args.openf1_base or "").rstrip("/")
    if not base:
        raise SystemExit("--openf1-base is required")

    limiter = _RateLimiter(max_per_second=args.max_req_per_second, max_per_minute=args.max_req_per_minute)

    mode = str(args.mode or "full").strip().lower()
    if mode not in ("full", "laps", "results"):
        raise SystemExit("--mode must be: full|laps|results")

    driver_numbers: list[int] = []
    if args.driver_number:
        for v in args.driver_number:
            if v is None:
                continue
            s = str(v).strip()
            if not s:
                continue
            parts = [p.strip() for p in s.split(",") if p.strip()]
            for p in parts:
                driver_numbers.append(int(p))
    driver_numbers = sorted(set(driver_numbers))

    conn = _mysql_connect()
    try:
        with httpx.Client(timeout=30.0) as client:
            summary: dict | None = {} if args.summary_json else None
            summary_session_key: int | None = None

            def _sync_one_session_data(resolved_session_key: int, driver_numbers_override: list[int] | None) -> None:
                drivers = _http_get_json(client, limiter, f"{base}/v1/drivers", params={"session_key": str(resolved_session_key)})
                if drivers:
                    with conn.cursor() as cur:
                        n = _upsert_drivers(cur, drivers)
                    conn.commit()
                    if not args.quiet:
                        print(f"openf1 ok (drivers session_key={resolved_session_key}): rows={len(drivers)} upsert={n}", flush=True)

                dns = driver_numbers_override or []
                if not dns:
                    dns = sorted({int(it.get("driver_number")) for it in drivers if it.get("driver_number") is not None})

                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "race_control",
                    {"session_key": str(resolved_session_key)},
                    _insert_race_control,
                    f"race_control session_key={resolved_session_key}",
                    args.quiet,
                )
                if mode in ("full", "results"):
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "session_result",
                        {"session_key": str(resolved_session_key)},
                        _upsert_session_result,
                        f"session_result session_key={resolved_session_key}",
                        args.quiet,
                    )
                if mode == "full":
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "starting_grid",
                        {"session_key": str(resolved_session_key)},
                        _upsert_starting_grid,
                        f"starting_grid session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "stints",
                        {"session_key": str(resolved_session_key)},
                        _upsert_stints,
                        f"stints session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "championship_drivers",
                        {"session_key": str(resolved_session_key)},
                        _upsert_championship_drivers,
                        f"championship_drivers session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "championship_teams",
                        {"session_key": str(resolved_session_key)},
                        _upsert_championship_teams,
                        f"championship_teams session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "weather",
                        {"session_key": str(resolved_session_key)},
                        _insert_weather,
                        f"weather session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "pit",
                        {"session_key": str(resolved_session_key)},
                        _insert_pit,
                        f"pit session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "overtakes",
                        {"session_key": str(resolved_session_key)},
                        _insert_overtakes,
                        f"overtakes session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "intervals",
                        {"session_key": str(resolved_session_key)},
                        _insert_intervals,
                        f"intervals session_key={resolved_session_key}",
                        args.quiet,
                    )
                    _sync_one(
                        client,
                        limiter,
                        conn,
                        base,
                        "team_radio",
                        {"session_key": str(resolved_session_key)},
                        _insert_team_radio,
                        f"team_radio session_key={resolved_session_key}",
                        args.quiet,
                    )

                for dn in dns:
                    params = {"session_key": str(resolved_session_key), "driver_number": str(int(dn))}
                    _sync_one(client, limiter, conn, base, "laps", params, _insert_laps, f"laps session_key={resolved_session_key} driver={dn}", args.quiet)
                    if mode == "full":
                        _sync_one(client, limiter, conn, base, "car_data", params, _insert_car_data, f"car_data session_key={resolved_session_key} driver={dn}", args.quiet)
                        _sync_one(client, limiter, conn, base, "location", params, _insert_location, f"location session_key={resolved_session_key} driver={dn}", args.quiet)
                        _sync_one(client, limiter, conn, base, "position", params, _insert_position, f"position session_key={resolved_session_key} driver={dn}", args.quiet)

            if args.sync_all_sessions:
                y0 = int(args.year_from)
                y1 = int(args.year_to)
                if y0 <= 0 or y1 <= 0 or y1 < y0:
                    raise SystemExit("--year-from/--year-to invalid")
                all_sessions: dict[int, dict] = {}
                for year in range(y0, y1 + 1):
                    meetings = _http_get_json(client, limiter, f"{base}/v1/meetings", params={"year": str(year)})
                    if meetings:
                        with conn.cursor() as cur:
                            n = _upsert_meetings(cur, meetings)
                        conn.commit()
                        if not args.quiet:
                            print(f"openf1 ok (meetings year={year}): rows={len(meetings)} upsert={n}", flush=True)
                    sessions = _http_get_json(client, limiter, f"{base}/v1/sessions", params={"year": str(year)})
                    if sessions:
                        with conn.cursor() as cur:
                            n = _upsert_sessions(cur, sessions)
                        conn.commit()
                        if not args.quiet:
                            print(f"openf1 ok (sessions year={year}): rows={len(sessions)} upsert={n}", flush=True)
                        for it in sessions:
                            sk = it.get("session_key")
                            if sk is None:
                                continue
                            try:
                                sk_i = int(sk)
                                if sk_i not in all_sessions:
                                    all_sessions[sk_i] = it
                            except Exception:
                                continue

                if args.sync_all_data and all_sessions:
                    override = driver_numbers if driver_numbers else None
                    start_sk: int | None = None
                    sk_raw = str(args.session_key).strip()
                    if sk_raw.isdigit():
                        start_sk = int(sk_raw)

                    session_keys = sorted(all_sessions.keys())
                    if start_sk is not None:
                        session_keys = [k for k in session_keys if k <= start_sk]
                        session_keys.sort(reverse=True)

                    for sk in session_keys:
                        if not args.quiet:
                            print(f"sync session_key={sk}", flush=True)
                        _sync_one_session_data(int(sk), override)

                    if args.session_key in (None, "", "none"):
                        return 0
                    if str(args.session_key).strip().lower() == "all":
                        return 0
                    if start_sk is not None:
                        return 0

                if args.sync_all_team_radio and all_sessions:
                    for sk in sorted(all_sessions.keys()):
                        _sync_one(
                            client,
                            limiter,
                            conn,
                            base,
                            "team_radio",
                            {"session_key": str(int(sk))},
                            _insert_team_radio,
                            f"team_radio session_key={sk}",
                            args.quiet,
                        )

                if args.session_key in (None, "", "none"):
                    return 0

            session_key = str(args.session_key)
            sessions = _http_get_json(client, limiter, f"{base}/v1/sessions", params={"session_key": session_key})
            if not sessions:
                raise SystemExit(f"no sessions found for session_key={session_key}")
            session = sessions[0]
            resolved_session_key = int(session.get("session_key"))
            summary_session_key = int(resolved_session_key)
            resolved_meeting_key = session.get("meeting_key")
            if args.meeting_key is not None:
                mk = str(args.meeting_key)
                if mk == "latest":
                    meetings = _http_get_json(client, limiter, f"{base}/v1/meetings", params={"meeting_key": "latest"})
                    if meetings:
                        resolved_meeting_key = int(meetings[0].get("meeting_key"))
                else:
                    resolved_meeting_key = int(mk)

            if not args.quiet:
                print(f"resolved: session_key={resolved_session_key} meeting_key={resolved_meeting_key}", flush=True)

            _sync_one(
                client,
                limiter,
                conn,
                base,
                "sessions",
                {"session_key": str(resolved_session_key)},
                _upsert_sessions,
                f"sessions session_key={resolved_session_key}",
                args.quiet,
                summary,
            )
            if resolved_meeting_key is not None:
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "meetings",
                    {"meeting_key": str(int(resolved_meeting_key))},
                    _upsert_meetings,
                    f"meetings meeting_key={resolved_meeting_key}",
                    args.quiet,
                    summary,
                )

            drivers = _http_get_json(client, limiter, f"{base}/v1/drivers", params={"session_key": str(resolved_session_key)})
            if drivers:
                with conn.cursor() as cur:
                    n = _upsert_drivers(cur, drivers)
                conn.commit()
                if not args.quiet:
                    print(f"openf1 ok (drivers): rows={len(drivers)} upsert={n}", flush=True)
                if summary is not None:
                    summary["drivers"] = {"endpoint": "drivers", "rows": len(drivers), "insert_attempt": int(n)}

            if not driver_numbers:
                driver_numbers = sorted({int(it.get("driver_number")) for it in drivers if it.get("driver_number") is not None})

            _sync_one(
                client,
                limiter,
                conn,
                base,
                "race_control",
                {"session_key": str(resolved_session_key)},
                _insert_race_control,
                "race_control",
                args.quiet,
                summary,
            )
            if mode in ("full", "results"):
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "session_result",
                    {"session_key": str(resolved_session_key)},
                    _upsert_session_result,
                    "session_result",
                    args.quiet,
                    summary,
                )
            if mode == "full":
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "starting_grid",
                    {"session_key": str(resolved_session_key)},
                    _upsert_starting_grid,
                    "starting_grid",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "stints",
                    {"session_key": str(resolved_session_key)},
                    _upsert_stints,
                    "stints",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "championship_drivers",
                    {"session_key": str(resolved_session_key)},
                    _upsert_championship_drivers,
                    "championship_drivers",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "championship_teams",
                    {"session_key": str(resolved_session_key)},
                    _upsert_championship_teams,
                    "championship_teams",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "weather",
                    {"session_key": str(resolved_session_key)},
                    _insert_weather,
                    "weather",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "pit",
                    {"session_key": str(resolved_session_key)},
                    _insert_pit,
                    "pit",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "overtakes",
                    {"session_key": str(resolved_session_key)},
                    _insert_overtakes,
                    "overtakes",
                    args.quiet,
                    summary,
                )
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "intervals",
                    {"session_key": str(resolved_session_key)},
                    _insert_intervals,
                    "intervals",
                    args.quiet,
                    summary,
                )

            for dn in driver_numbers:
                params = {"session_key": str(resolved_session_key), "driver_number": str(int(dn))}
                _sync_one(client, limiter, conn, base, "laps", params, _insert_laps, f"laps driver={dn}", args.quiet, summary)
                if mode == "full":
                    _sync_one(client, limiter, conn, base, "car_data", params, _insert_car_data, f"car_data driver={dn}", args.quiet, summary)
                    _sync_one(client, limiter, conn, base, "location", params, _insert_location, f"location driver={dn}", args.quiet, summary)
                    _sync_one(client, limiter, conn, base, "position", params, _insert_position, f"position driver={dn}", args.quiet, summary)
            if mode == "full" or (mode == "results" and args.sync_all_team_radio):
                _sync_one(
                    client,
                    limiter,
                    conn,
                    base,
                    "team_radio",
                    {"session_key": str(resolved_session_key)},
                    _insert_team_radio,
                    "team_radio",
                    args.quiet,
                    summary,
                )

            if summary is not None and summary_session_key is not None:
                totals_rows = 0
                totals_ins = 0
                ok = True
                for v in summary.values():
                    if not isinstance(v, dict):
                        continue
                    rr = v.get("rows") or 0
                    ii = v.get("insert_attempt") or 0
                    try:
                        totals_rows += int(rr)
                    except Exception:
                        pass
                    try:
                        totals_ins += int(ii)
                    except Exception:
                        pass
                    if v.get("error"):
                        ok = False
                print(
                    json.dumps(
                        {"ok": ok, "session_key": int(summary_session_key), "totals": {"rows": totals_rows, "insert_attempt": totals_ins}, "endpoints": summary},
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
