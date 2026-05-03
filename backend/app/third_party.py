import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from .f1_circuit_assets import pick_circuit_for_race


def _parse_ergast_dt(date_s: str, time_s: Optional[str]) -> datetime:
    if not time_s:
        return datetime.fromisoformat(date_s).replace(tzinfo=timezone.utc)
    t = time_s.replace("Z", "+00:00")
    return datetime.fromisoformat(f"{date_s}T{t}").astimezone(timezone.utc)


def _fmt_hhmm(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%H:%M")


def _fmt_day(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%a").upper()


def _fmt_header_date(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%a %b %d, %Y").upper()


def _format_hms(delta: timedelta) -> str:
    s = int(delta.total_seconds())
    if s < 0:
        s = 0
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    return f"{h:02d}:{m:02d}:{sec:02d}"


async def ergast_current_schedule(client: httpx.AsyncClient) -> Dict[str, Any]:
    r = await client.get("https://api.jolpi.ca/ergast/f1/current.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_schedule_for_season(client: httpx.AsyncClient, season: int) -> Dict[str, Any]:
    season = int(season)
    r = await client.get(f"https://api.jolpi.ca/ergast/f1/{season}.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_driver_standings(client: httpx.AsyncClient) -> Dict[str, Any]:
    r = await client.get("https://api.jolpi.ca/ergast/f1/current/driverStandings.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_driver_standings_for_season(client: httpx.AsyncClient, season: int) -> Dict[str, Any]:
    season = int(season)
    r = await client.get(f"https://api.jolpi.ca/ergast/f1/{season}/driverStandings.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_constructor_standings(client: httpx.AsyncClient) -> Dict[str, Any]:
    r = await client.get("https://api.jolpi.ca/ergast/f1/current/constructorStandings.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_constructor_standings_for_season(client: httpx.AsyncClient, season: int) -> Dict[str, Any]:
    season = int(season)
    r = await client.get(f"https://api.jolpi.ca/ergast/f1/{season}/constructorStandings.json", timeout=10)
    r.raise_for_status()
    return r.json()


async def ergast_last_winner(client: httpx.AsyncClient) -> Optional[str]:
    r = await client.get("https://api.jolpi.ca/ergast/f1/current/last/results/1.json", timeout=10)
    r.raise_for_status()
    data = r.json()
    races = (
        data.get("MRData", {})
        .get("RaceTable", {})
        .get("Races", [])
    )
    if not races:
        return None
    results = races[0].get("Results", [])
    if not results:
        return None
    drv = results[0].get("Driver", {})
    given = drv.get("givenName", "")
    family = drv.get("familyName", "")
    if not given and not family:
        return None
    return f"{given[:1]}. {family}".strip()


async def ergast_last_n_results(client: httpx.AsyncClient, n: int) -> Dict[str, Any]:
    n = int(n)
    if n <= 0:
        n = 1
    if n > 20:
        n = 20
    try:
        r = await client.get("https://api.jolpi.ca/ergast/f1/current/results.json", params={"limit": "1000"}, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception:
        return {"MRData": {"RaceTable": {"Races": []}}}

    mr = data.get("MRData", {}) or {}
    rt = mr.get("RaceTable", {}) or {}
    races = rt.get("Races", []) or []

    races_dt: List[tuple[datetime, Dict[str, Any]]] = []
    for race in races:
        if not isinstance(race, dict):
            continue
        if not race.get("date"):
            continue
        results = race.get("Results") or []
        if not results:
            continue
        try:
            dt = _parse_ergast_dt(race.get("date", ""), race.get("time"))
        except Exception:
            continue
        races_dt.append((dt, race))

    races_dt.sort(key=lambda x: x[0])
    last_races = [r for _, r in races_dt[-n:]]

    out_mr: Dict[str, Any] = {}
    for k in ["xmlns", "series", "url", "limit", "offset", "total"]:
        if k in mr:
            out_mr[k] = mr.get(k)
    out_rt: Dict[str, Any] = {}
    for k in ["season"]:
        if k in rt:
            out_rt[k] = rt.get(k)
    out_rt["Races"] = last_races
    out_mr["RaceTable"] = out_rt
    return {"MRData": out_mr}


async def ergast_qualifying_results(client: httpx.AsyncClient, season: int, round: int) -> Dict[str, Any]:
    season = int(season)
    round = int(round)
    r = await client.get(
        f"https://api.jolpi.ca/ergast/f1/{season}/{round}/qualifying.json",
        params={"limit": "1000"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


async def ergast_race_results(client: httpx.AsyncClient, season: int, round: int) -> Dict[str, Any]:
    season = int(season)
    round = int(round)
    r = await client.get(
        f"https://api.jolpi.ca/ergast/f1/{season}/{round}/results.json",
        params={"limit": "1000"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def _parse_lap_time_ms(s: str) -> Optional[int]:
    s = (s or "").strip()
    if not s:
        return None
    try:
        mm_ss = s.split(":")
        if len(mm_ss) != 2:
            return None
        m = int(mm_ss[0])
        sec_part = mm_ss[1]
        if "." in sec_part:
            sec_s, ms_s = sec_part.split(".", 1)
            sec = int(sec_s)
            ms = int((ms_s + "000")[:3])
        else:
            sec = int(sec_part)
            ms = 0
        return (m * 60 + sec) * 1000 + ms
    except Exception:
        return None


def _fmt_gap(delta_ms: Optional[int]) -> str:
    if delta_ms is None:
        return "---"
    if delta_ms <= 0:
        return "---"
    return f"+{delta_ms / 1000.0:.3f}"


def _session_kind_from_key(key: str) -> str:
    k = (key or "").strip().upper()
    if k.startswith("FP"):
        return "practice"
    if k in ("QUALI", "QUALIFYING", "Q"):
        return "qualifying"
    if k in ("SQ", "SPRINT_QUALI", "SPRINT_QUALIFYING", "SPRINT_QUALIFY", "SPRINT_SHOOTOUT", "SS"):
        return "qualifying"
    if k in ("SPRINT",):
        return "race"
    if k == "RACE":
        return "race"
    return "unknown"


def _last_race_before(schedule_json: Dict[str, Any], now_utc: datetime) -> Optional[Dict[str, Any]]:
    races: List[Dict[str, Any]] = schedule_json.get("MRData", {}).get("RaceTable", {}).get("Races", []) or []
    last_race = None
    last_dt = None
    for r in races:
        if not isinstance(r, dict) or not r.get("date"):
            continue
        try:
            dt = _parse_ergast_dt(r.get("date", ""), r.get("time"))
        except Exception:
            continue
        if dt <= now_utc and (last_dt is None or dt >= last_dt):
            last_dt = dt
            last_race = r
    return last_race


def _select_race_and_sessions(
    schedule_json: Dict[str, Any],
    now_utc: datetime,
    tz_name: str,
    round_override: Optional[int],
) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], str]:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz_name = "UTC"
        tz = ZoneInfo("UTC")

    races: List[Dict[str, Any]] = schedule_json.get("MRData", {}).get("RaceTable", {}).get("Races", []) or []
    races_dt: List[tuple[datetime, Dict[str, Any]]] = []
    for r in races:
        if not isinstance(r, dict):
            continue
        if not r.get("date"):
            continue
        try:
            races_dt.append((_parse_ergast_dt(r.get("date", ""), r.get("time")), r))
        except Exception:
            continue
    races_dt.sort(key=lambda x: x[0])

    race: Optional[Dict[str, Any]] = None
    race_dt: Optional[datetime] = None
    if round_override is not None:
        ro = str(int(round_override))
        for dt, r in races_dt:
            if str(r.get("round")) == ro:
                race = r
                race_dt = dt
                break
    if race is None:
        last_race = None
        last_race_dt = None
        next_race = None
        next_race_dt = None
        for dt, r in races_dt:
            if dt <= now_utc:
                last_race = r
                last_race_dt = dt
            elif next_race is None:
                next_race = r
                next_race_dt = dt
                break
        if next_race is None:
            race = last_race
            race_dt = last_race_dt
        elif last_race is None or next_race_dt is None:
            race = next_race
            race_dt = next_race_dt
        else:
            decision_tz = "Asia/Shanghai"
            try:
                sh_tz = ZoneInfo(decision_tz)
            except ZoneInfoNotFoundError:
                sh_tz = ZoneInfo("UTC")

            # Race week rule (Shanghai TZ):
            # - From the Monday you get by counting back to Monday from race day.
            # - If race day is Monday, count back one full week to the previous Monday.
            now_sh = now_utc.astimezone(sh_tz)
            is_race_week = False
            try:
                race_dt_sh = next_race_dt.astimezone(sh_tz)
                wd = race_dt_sh.weekday()  # Mon=0..Sun=6
                back_days = wd if wd > 0 else 7
                start_d = race_dt_sh.date() - timedelta(days=back_days)
                start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=sh_tz)
                if start_dt <= now_sh <= race_dt_sh:
                    is_race_week = True
            except Exception:
                is_race_week = False

            # If not race week, anchor on the most recent round (last_race).
            # If race week, anchor on current round (next_race).
            if is_race_week:
                race = next_race
                race_dt = next_race_dt
            else:
                race = last_race
                race_dt = last_race_dt

    sessions: List[Dict[str, Any]] = []
    if race is not None:
        items: List[tuple[datetime, str, Dict[str, Any]]] = []
        s_map = [
            ("FP1", race.get("FirstPractice")),
            ("FP2", race.get("SecondPractice")),
            ("FP3", race.get("ThirdPractice")),
            ("SQ", race.get("SprintQualifying") or race.get("SprintShootout")),
            ("SPRINT", race.get("Sprint")),
            ("QUALI", race.get("Qualifying")),
            ("RACE", {"date": race.get("date"), "time": race.get("time")}),
        ]
        for key, s in s_map:
            if not isinstance(s, dict):
                continue
            if not s.get("date"):
                continue
            dt = _parse_ergast_dt(s.get("date", ""), s.get("time"))
            items.append((dt, key, s))
        items.sort(key=lambda x: x[0])
        for dt, key, _s in items:
            sessions.append({"key": key, "starts_at_utc": dt.isoformat(), "when": f"{_fmt_day(dt, tz)} {_fmt_hhmm(dt, tz)}"})

    return race, sessions, tz_name


def _choose_session_key(now_utc: datetime, sessions: List[Dict[str, Any]], session: str) -> str:
    s = (session or "").strip().lower()
    if s in ("fp1", "fp2", "fp3"):
        return s.upper()
    if s in ("q", "quali", "qualifying"):
        return "QUALI"
    if s in ("sq", "sprintquali", "sprint_qualifying", "sprint_qualify", "sprintshootout", "shootout", "ss"):
        return "SQ"
    if s in ("sprint", "spr"):
        return "SPRINT"
    if s in ("race", "r"):
        return "RACE"
    if s in ("auto", ""):
        return "AUTO"
    return s.upper()


def _session_label(key: str, q: int) -> str:
    k = (key or "").upper()
    if k == "QUALI":
        q = int(q)
        if q < 1:
            q = 1
        if q > 3:
            q = 3
        return f"Q{q}"
    return k


def _sec123_synth(pos_s: str) -> str:
    p = (pos_s or "").strip()
    if p == "02":
        return "PP-"
    if p == "04":
        return "GG-"
    if p == "06":
        return "G--"
    if p == "11":
        return "P--"
    return "---"


def _infer_quali_q(now_utc: datetime, starts_at_utc: Optional[str]) -> int:
    if not starts_at_utc:
        return 2
    try:
        start_dt = datetime.fromisoformat(starts_at_utc).astimezone(timezone.utc)
    except Exception:
        return 2

    elapsed_s = int((now_utc - start_dt).total_seconds())
    if elapsed_s < 0:
        return 1

    q1_s = 18 * 60
    gap_s = 7 * 60
    q2_s = 15 * 60
    q3_s = 12 * 60

    if elapsed_s < q1_s:
        return 1
    if elapsed_s < q1_s + gap_s:
        return 1
    if elapsed_s < q1_s + gap_s + q2_s:
        return 2
    if elapsed_s < q1_s + gap_s + q2_s + gap_s:
        return 2
    if elapsed_s < q1_s + gap_s + q2_s + gap_s + q3_s:
        return 3
    return 3


def _session_duration_s(key: str) -> int:
    k = (key or "").upper()
    if k.startswith("FP"):
        return 60 * 60
    if k == "QUALI":
        return (18 + 7 + 15 + 7 + 12) * 60
    if k == "SQ":
        return 60 * 60
    if k == "SPRINT":
        return 60 * 60
    if k == "RACE":
        return 2 * 60 * 60
    return 60 * 60


def _choose_auto_session_with_state(now_utc: datetime, sessions: List[Dict[str, Any]]) -> tuple[str | None, str]:
    items: List[tuple[datetime, str]] = []
    for it in sessions:
        try:
            dt = datetime.fromisoformat(it.get("starts_at_utc") or "").astimezone(timezone.utc)
        except Exception:
            continue
        key = (it.get("key") or "").upper()
        if not key:
            continue
        items.append((dt, key))
    items.sort(key=lambda x: x[0])
    if not items:
        return None, "no_schedule"

    first_dt, first_key = items[0]
    if now_utc < first_dt:
        return first_key, "pre_event"

    last_key = items[-1][1]
    cur_dt = None
    cur_key = None
    next_dt = None
    next_key = None
    for dt, key in items:
        if dt <= now_utc:
            cur_dt = dt
            cur_key = key
        else:
            next_dt = dt
            next_key = key
            break

    if cur_dt is None or cur_key is None:
        return first_key, "pre_event"

    end_dt = cur_dt + timedelta(seconds=_session_duration_s(cur_key))
    if now_utc <= end_dt:
        return cur_key, "live"

    if next_dt is not None and now_utc < next_dt:
        return cur_key, "between"

    return last_key, "post_event"


async def build_sessions_payload(
    client: httpx.AsyncClient,
    now_utc: datetime,
    tz_name: str,
    schedule_json: Dict[str, Any],
    season: int,
    round_override: Optional[int],
    session: str,
    q: Optional[int],
    limit: int,
) -> Dict[str, Any]:
    race, sessions, tz_name = _select_race_and_sessions(schedule_json, now_utc, tz_name, round_override)
    state = "explicit"
    key = _choose_session_key(now_utc, sessions, session)
    if key == "AUTO":
        auto_key, state = _choose_auto_session_with_state(now_utc, sessions)
        key = auto_key or "FP1"
    kind = _session_kind_from_key(key)

    race_name = (race or {}).get("raceName") or ""
    rnd = (race or {}).get("round")
    country = ((race or {}).get("Circuit") or {}).get("Location", {}).get("country") or ""

    starts_at_utc = None
    for it in sessions:
        if (it.get("key") or "").upper() == key:
            starts_at_utc = it.get("starts_at_utc")
            break

    if state in ("pre_event", "no_schedule"):
        out: Dict[str, Any] = {
            "generated_at_utc": now_utc.isoformat(),
            "tz": tz_name,
            "race": {"season": int(season), "round": int(rnd) if rnd is not None else None, "name": race_name, "country": country},
            "session": {"key": key, "kind": "practice", "label": "FP1", "starts_at_utc": starts_at_utc, "time_remain": None},
            "schedule": sessions,
            "state": state,
            "no_data": True,
            "message": "NO DATA",
            "table": {"kind": "practice", "rows": []},
        }
        return out

    if kind == "qualifying":
        if q is None:
            q = _infer_quali_q(now_utc, starts_at_utc)
        else:
            q = max(1, min(3, int(q)))
    else:
        q = 2 if q is None else int(q)

    label = _session_label(key, q)

    time_remain = None
    if starts_at_utc:
        try:
            dt = datetime.fromisoformat(starts_at_utc).astimezone(timezone.utc)
            dur_s = 3600 if kind in ("practice", "qualifying") else 2 * 3600
            if key == "RACE":
                dur_s = 2 * 3600
            remain = dt + timedelta(seconds=dur_s) - now_utc
            if remain.total_seconds() >= 0:
                time_remain = _format_hms(remain)[3:8]
            else:
                time_remain = "00:00"
        except Exception:
            time_remain = None

    out: Dict[str, Any] = {
        "generated_at_utc": now_utc.isoformat(),
        "tz": tz_name,
        "race": {"season": int(season), "round": int(rnd) if rnd is not None else None, "name": race_name, "country": country},
        "session": {
            "key": key,
            "kind": kind,
            "label": label,
            "starts_at_utc": starts_at_utc,
            "time_remain": time_remain,
        },
        "schedule": sessions,
        "state": state,
    }

    limit = int(limit)
    if limit < 1:
        limit = 1
    if limit > 30:
        limit = 30

    if kind == "qualifying" and rnd is not None:
        async def _fetch_quali_rows(round_n: int) -> List[Dict[str, Any]]:
            data = await ergast_qualifying_results(client, season, int(round_n))
            races = data.get("MRData", {}).get("RaceTable", {}).get("Races", []) or []
            qres = (races[0].get("QualifyingResults") or []) if races else []

            rows: List[Dict[str, Any]] = []
            best_ms = None
            for it in qres:
                drv = it.get("Driver") or {}
                code = (drv.get("code") or (drv.get("driverId") or "").upper()[:3]).upper()
                no = drv.get("permanentNumber") or ""
                pos = str(it.get("position") or "").zfill(2) if str(it.get("position") or "").isdigit() else str(it.get("position") or "")
                if int(q) == 1:
                    lap = it.get("Q1") or ""
                elif int(q) == 2:
                    lap = it.get("Q2") or it.get("Q1") or ""
                else:
                    lap = it.get("Q3") or it.get("Q2") or it.get("Q1") or ""
                ms = _parse_lap_time_ms(lap)
                if best_ms is None and ms is not None:
                    best_ms = ms
                gap = _fmt_gap(None if best_ms is None or ms is None else ms - best_ms)
                if pos in ("01", "1"):
                    gap = "---"
                rows.append(
                    {
                        "pos": pos,
                        "no": str(no),
                        "drv": code,
                        "lap_time": lap,
                        "gap": gap,
                        "st": "---",
                        "sec123": _sec123_synth(pos),
                    }
                )
                if len(rows) >= limit:
                    break
            return rows

        rows = await _fetch_quali_rows(int(rnd))
        results_race = {"season": int(season), "round": int(rnd), "name": race_name, "country": country}

        if len(rows) >= 10:
            dz_i = None
            for i, r in enumerate(rows):
                if r.get("pos") in ("10", "10".zfill(2)):
                    dz_i = i
                    break
            out["table"] = {"kind": "qualifying", "rows": rows, "drop_zone_after_index": dz_i, "q": q}
        else:
            out["table"] = {"kind": "qualifying", "rows": rows, "drop_zone_after_index": None, "q": q}
        out["results_race"] = results_race
        return out

    if kind == "race" and rnd is not None:
        def _parse_race_time_ms(s: str) -> Optional[int]:
            s = (s or "").strip()
            if not s:
                return None
            try:
                parts = s.split(":")
                if len(parts) == 3:
                    h = int(parts[0])
                    m = int(parts[1])
                    sec_part = parts[2]
                elif len(parts) == 2:
                    h = 0
                    m = int(parts[0])
                    sec_part = parts[1]
                else:
                    return None
                if "." in sec_part:
                    sec_s, ms_s = sec_part.split(".", 1)
                    sec = int(sec_s)
                    ms = int((ms_s + "000")[:3])
                else:
                    sec = int(sec_part)
                    ms = 0
                return ((h * 3600 + m * 60 + sec) * 1000) + ms
            except Exception:
                return None

        async def _fetch_race_rows(round_n: int) -> List[Dict[str, Any]]:
            data = await ergast_race_results(client, season, int(round_n))
            races = data.get("MRData", {}).get("RaceTable", {}).get("Races", []) or []
            res = (races[0].get("Results") or []) if races else []

            rows: List[Dict[str, Any]] = []
            winner_ms = None
            winner_time = ""
            if res:
                t0 = (res[0].get("Time") or {})
                try:
                    if t0.get("millis"):
                        winner_ms = int(t0.get("millis"))
                except Exception:
                    winner_ms = None
                winner_time = (t0.get("time") or "") if isinstance(t0, dict) else ""
                if not winner_time:
                    winner_time = res[0].get("status") or ""
                if winner_ms is None and winner_time:
                    winner_ms = _parse_race_time_ms(winner_time)

            for it in res:
                drv = it.get("Driver") or {}
                code = (drv.get("code") or (drv.get("driverId") or "").upper()[:3]).upper()
                no = drv.get("permanentNumber") or ""
                pos = str(it.get("position") or "").zfill(2) if str(it.get("position") or "").isdigit() else str(it.get("position") or "")
                status = it.get("status") or ""
                pts = it.get("points") or ""
                t = (it.get("Time") or {}) if isinstance(it.get("Time"), dict) else {}
                gap_status = ""
                if pos in ("01", "1", "P1"):
                    gap_status = (t.get("time") or "") if isinstance(t, dict) else ""
                    if not gap_status:
                        gap_status = winner_time or status
                else:
                    if isinstance(status, str) and status.startswith("+"):
                        gap_status = status
                    elif isinstance(status, str) and status and status != "Finished":
                        gap_status = status
                    else:
                        ms = None
                        try:
                            if t.get("millis"):
                                ms = int(t.get("millis"))
                        except Exception:
                            ms = None
                        if ms is None:
                            ms = _parse_race_time_ms(t.get("time") or "")
                        if ms is not None and winner_ms is not None and ms >= winner_ms:
                            gap_status = f"+{(ms - winner_ms) / 1000.0:.3f}"
                        else:
                            gap_status = status

                rows.append(
                    {
                        "pos": pos,
                        "no": str(no),
                        "drv": code,
                        "gap_status": gap_status,
                        "status": status,
                        "pts": str(pts),
                        "pit": "",
                    }
                )
                if len(rows) >= limit:
                    break
            return rows

        rows = await _fetch_race_rows(int(rnd))
        results_race = {"season": int(season), "round": int(rnd), "name": race_name, "country": country}
        out["table"] = {"kind": "race", "rows": rows}
        out["results_race"] = results_race
        return out


    def fmt_ms(ms: int) -> str:
        if ms < 0:
            ms = 0
        total_s = ms // 1000
        m = total_s // 60
        s = total_s % 60
        rem = ms % 1000
        return f"{m}:{s:02d}.{rem:03d}"

    mock = [
        ("01", "01", "VER", 90056, 24),
        ("02", "16", "LEC", 90421, 22),
        ("03", "04", "NOR", 90882, 26),
        ("04", "44", "HAM", 91012, 18),
        ("05", "81", "PIA", 91150, 25),
        ("06", "63", "RUS", 91220, 20),
        ("07", "55", "SAI", 91405, 23),
        ("08", "14", "ALO", 91550, 19),
        ("09", "27", "HUL", 91880, 21),
        ("10", "18", "STR", 92105, 17),
        ("11", "23", "ALB", 92240, 16),
    ]
    base_ms = mock[0][3] if mock else 0
    rows: List[Dict[str, Any]] = []
    for i in range(min(limit, len(mock))):
        pos, no, drv, best_ms, laps = mock[i]
        gap = "---" if i == 0 else _fmt_gap(best_ms - base_ms)
        rows.append(
            {
                "pos": pos,
                "no": no,
                "drv": drv,
                "best_time": fmt_ms(best_ms),
                "best": fmt_ms(best_ms),
                "gap": gap,
                "laps": str(laps),
            }
        )

    out["table"] = {"kind": "practice", "rows": rows}
    out["panel"] = {
        "status": "GREEN",
        "track_temp_c": 42,
        "air_temp_c": 29,
        "humidity_pct": 55,
    }
    return out


async def open_meteo_current_temp_c(client: httpx.AsyncClient) -> Optional[float]:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": "26.0325",
        "longitude": "50.5106",
        "current": "temperature_2m",
        "timezone": "UTC",
    }
    r = await client.get(url, params=params, timeout=10)
    r.raise_for_status()
    data = r.json()
    cur = data.get("current") or {}
    t = cur.get("temperature_2m")
    if isinstance(t, (int, float)):
        return float(t)
    return None


async def fetch_rss_first_title(client: httpx.AsyncClient) -> Optional[Dict[str, str]]:
    urls = os.getenv(
        "NEWS_RSS_URLS",
        "https://www.autosport.com/rss/f1/news/|https://www.motorsport.com/rss/f1/news/|https://www.grandprix.com/rss.xml",
    ).split("|")

    def norm_list(xs: List[str]) -> List[str]:
        out: List[str] = []
        for u in xs:
            u = (u or "").strip()
            if u:
                out.append(u)
        return out

    urls = norm_list(urls)

    for url in urls:
        try:
            r = await client.get(url, timeout=10, follow_redirects=True)
            r.raise_for_status()
            text = r.text
            items = _rss_items(text)
            if not items:
                continue
            pick = items[0]

            title = (pick.get("title") or "").strip()
            link = (pick.get("url") or "").strip()
            if title:
                final_url = link or url
                base = f"{title}|{final_url}".encode("utf-8", errors="ignore")
                nid = hashlib.sha1(base).hexdigest()
                return {"id": nid, "title": title, "url": final_url}
        except Exception:
            continue
    return None


async def fetch_f1_breaking_rss(client: httpx.AsyncClient) -> Optional[Dict[str, str]]:
    official_urls = os.getenv("NEWS_RSS_F1_OFFICIAL_URLS", "").split("|")
    breaking_kw = os.getenv("NEWS_BREAKING_KEYWORD", "BREAKING").strip() or "BREAKING"

    urls = [u.strip() for u in official_urls if (u or "").strip()]
    if not urls:
        return None

    for url in urls:
        try:
            r = await client.get(url, timeout=10, follow_redirects=True)
            r.raise_for_status()
            items = _rss_items(r.text)
            if not items:
                continue
            pick = None
            for it in items:
                t = (it.get("title") or "").upper()
                if breaking_kw.upper() in t:
                    pick = it
                    break
            if pick is None:
                continue
            title = (pick.get("title") or "").strip()
            link = (pick.get("url") or "").strip()
            if title:
                final_url = link or url
                base = f"{title}|{final_url}".encode("utf-8", errors="ignore")
                nid = hashlib.sha1(base).hexdigest()
                return {"id": nid, "title": title, "url": final_url}
        except Exception:
            continue
    return None


def _rss_items(xml_text: str) -> List[Dict[str, str]]:
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    items: List[Dict[str, str]] = []

    for item in root.findall(".//channel/item"):
        title_el = item.find("title")
        link_el = item.find("link")
        title = " ".join((title_el.text or "").split()) if title_el is not None and title_el.text else ""
        link = (link_el.text or "").strip() if link_el is not None and link_el.text else ""
        if title:
            items.append({"title": title, "url": link})

    for entry in root.findall(".//entry"):
        title_el = entry.find("title")
        title = " ".join((title_el.text or "").split()) if title_el is not None and title_el.text else ""
        link = ""
        for link_el in entry.findall("link"):
            href = link_el.attrib.get("href")
            if href:
                link = href
                break
        if title:
            items.append({"title": title, "url": link})

    return items


def build_pages_payload(
    now_utc: datetime,
    tz_name: str,
    schedule_json: Dict[str, Any],
    driver_standings_json: Dict[str, Any],
    constructor_standings_json: Dict[str, Any],
    last_n_results_json: Optional[Dict[str, Any]],
    last_winner: Optional[str],
    air_temp_c: Optional[float],
    news: Optional[Dict[str, str]],
    circuit_assets: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz_name = "UTC"
        tz = ZoneInfo("UTC")

    races: List[Dict[str, Any]] = (
        schedule_json.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    )
    races_dt: List[tuple[datetime, Dict[str, Any]]] = []
    for r in races:
        if not r.get("date"):
            continue
        races_dt.append((_parse_ergast_dt(r.get("date", ""), r.get("time")), r))
    races_dt.sort(key=lambda x: x[0])

    next_race = None
    next_race_dt = None
    last_race = None
    last_race_dt = None

    for dt, r in races_dt:
        if dt <= now_utc:
            last_race = r
            last_race_dt = dt
        elif next_race is None:
            next_race = r
            next_race_dt = dt
            break

    if next_race is None and last_race is not None:
        next_race = last_race
        next_race_dt = last_race_dt

    decision_tz = "Asia/Shanghai"
    try:
        sh_tz = ZoneInfo(decision_tz)
    except ZoneInfoNotFoundError:
        sh_tz = ZoneInfo("UTC")
        decision_tz = "UTC"

    def _week_start(d):
        return d - timedelta(days=d.weekday())

    # Decide which race to show on "race_day":
    # - Default to next_race
    # - But before race-week starts (computed by counting back to Monday from race day, Shanghai TZ),
    #   keep showing last_race.
    now_sh = now_utc.astimezone(sh_tz)
    display_race = next_race
    display_race_dt = next_race_dt
    if next_race_dt is not None:
        race_dt_sh = next_race_dt.astimezone(sh_tz)
        wd = race_dt_sh.weekday()  # Mon=0..Sun=6
        back_days = wd if wd > 0 else 7
        start_d = race_dt_sh.date() - timedelta(days=back_days)
        start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=sh_tz)
        if now_sh < start_dt and last_race is not None:
            display_race = last_race
            display_race_dt = last_race_dt

    preview_race = next_race
    preview_race_dt = next_race_dt
    if (
        next_race_dt is not None
        and display_race_dt is not None
        and str((display_race or {}).get("round") or "") == str((next_race or {}).get("round") or "")
    ):
        for dt, r in races_dt:
            if dt > next_race_dt:
                preview_race = r
                preview_race_dt = dt
                break

    header = {
        "time": now_utc.astimezone(tz).strftime("%H:%M"),
        "date": _fmt_header_date(now_utc, tz),
        "battery_pct": None,
    }

    sessions = []
    if display_race:
        items: List[tuple[datetime, str]] = []
        s_map = [
            ("FP1", display_race.get("FirstPractice")),
            ("FP2", display_race.get("SecondPractice")),
            ("FP3", display_race.get("ThirdPractice")),
            ("SQ", display_race.get("SprintQualifying") or display_race.get("SprintShootout")),
            ("SPRINT", display_race.get("Sprint")),
            ("QUALI", display_race.get("Qualifying")),
            ("RACE", {"date": display_race.get("date"), "time": display_race.get("time")}),
        ]

        for key, s in s_map:
            if not isinstance(s, dict):
                continue
            if not s.get("date"):
                continue
            dt = _parse_ergast_dt(s.get("date", ""), s.get("time"))
            items.append((dt, key))

        items.sort(key=lambda x: x[0])
        for dt, key in items:
            status = "DONE" if dt <= now_utc else "UPCOMING"
            sessions.append({"key": key, "when": f"{_fmt_day(dt, tz)} {_fmt_hhmm(dt, tz)}", "status": status, "utc": dt.isoformat()})

    next_session = None
    for s in sessions:
        try:
            dt = datetime.fromisoformat(s["utc"]).astimezone(timezone.utc)
        except Exception:
            continue
        if dt > now_utc:
            next_session = {
                "key": s["key"],
                "starts_at_utc": dt.isoformat(),
                "in": _format_hms(dt - now_utc),
                "seconds": int((dt - now_utc).total_seconds()),
            }
            break
    if (
        next_session is None
        and next_race_dt is not None
        and next_race_dt > now_utc
        and str((display_race or {}).get("round") or "") == str((next_race or {}).get("round") or "")
    ):
        next_session = {
            "key": "RACE",
            "starts_at_utc": next_race_dt.isoformat(),
            "in": _format_hms(next_race_dt - now_utc),
            "seconds": int((next_race_dt - now_utc).total_seconds()),
        }

    weather = {
        "air_c": air_temp_c,
        "track_c": None if air_temp_c is None else round(air_temp_c + 13.0, 1),
        "track_c_estimated": air_temp_c is not None,
    }

    circuit_id = (display_race or {}).get("Circuit", {}).get("circuitId")
    lap_record = "1:31.447" if circuit_id == "bahrain" else None

    race_day = {
        "header": header,
        "race": {
            "name": (display_race or {}).get("raceName"),
            "round": (display_race or {}).get("round"),
        },
        "preview_race": {
            "name": (preview_race or {}).get("raceName"),
            "round": (preview_race or {}).get("round"),
            "starts_at_utc": preview_race_dt.isoformat() if preview_race_dt is not None else None,
        },
        "next_race": {
            "name": (next_race or {}).get("raceName"),
            "round": (next_race or {}).get("round"),
            "starts_at_utc": next_race_dt.isoformat() if next_race_dt is not None else None,
        },
        "last_race": {
            "name": (last_race or {}).get("raceName"),
            "round": (last_race or {}).get("round"),
            "starts_at_utc": last_race_dt.isoformat() if last_race_dt is not None else None,
        },
        "next_session": next_session,
        "schedule": sessions,
        "weather": weather,
        "tyre": None,
        "last_winner": last_winner,
        "lap_record": lap_record,
    }
    race_day["circuit"] = None
    if display_race:
        hit = pick_circuit_for_race(display_race.get("raceName"), circuit_id, circuit_assets)
        if hit:
            stats = hit.get("stats") if isinstance(hit.get("stats"), dict) else {}
            race_day["circuit"] = {
                "name": display_race.get("raceName"),
                "circuit_id": hit.get("circuit_id"),
                "circuit_name": hit.get("circuit_name"),
                "formula1_slug": hit.get("formula1_slug"),
                "image_kind": hit.get("image_kind"),
                "map_image_url": hit.get("public_map_image_url"),
                "map_image_url_detail": hit.get("public_map_image_url_detail"),
                "source_map_image_url": hit.get("source_map_image_url"),
                "downloaded": bool(hit.get("downloaded")),
                "downloaded_detail": bool(hit.get("downloaded_detail")),
                "circuit_length_km": stats.get("circuit_length_km"),
                "first_grand_prix_year": stats.get("first_grand_prix_year"),
                "number_of_laps": stats.get("number_of_laps"),
                "race_distance_km": stats.get("race_distance_km"),
                "fastest_lap_time": stats.get("fastest_lap_time"),
                "fastest_lap_driver": stats.get("fastest_lap_driver"),
                "fastest_lap_year": stats.get("fastest_lap_year"),
            }

    driver_rows = (
        driver_standings_json.get("MRData", {})
        .get("StandingsTable", {})
        .get("StandingsLists", [{}])[0]
        .get("DriverStandings", [])
    )
    drivers = []
    drivers_all = []
    for it in driver_rows:
        drv = it.get("Driver", {})
        code = drv.get("code") or (drv.get("driverId") or "").upper()[:3]
        family = (drv.get("familyName") or "").upper()
        given = (drv.get("givenName") or "").upper()
        pts = it.get("points")
        constructors = it.get("Constructors") or []
        c0 = constructors[0] if constructors else {}
        drivers_all.append(
            {
                "pos": int(it.get("position", 0)),
                "driver_id": drv.get("driverId"),
                "code": code,
                "given": given,
                "family": family,
                "name": f"{given[:1]}. {family}".strip() if given or family else family,
                "constructor_id": c0.get("constructorId"),
                "constructor": (c0.get("name") or "").upper(),
                "points": int(float(pts)),
            }
        )
    drivers = drivers_all[:5]

    constructor_rows = (
        constructor_standings_json.get("MRData", {})
        .get("StandingsTable", {})
        .get("StandingsLists", [{}])[0]
        .get("ConstructorStandings", [])
    )
    constructors = []
    constructors_all = []
    for it in constructor_rows:
        c = it.get("Constructor", {})
        pts = it.get("points")
        constructors_all.append(
            {
                "pos": int(it.get("position", 0)),
                "constructor_id": c.get("constructorId"),
                "name": (c.get("name") or "").upper(),
                "points": int(float(pts)),
            }
        )
    constructors = constructors_all[:3]

    days_to_next = None
    until = None
    if next_race_dt is not None and next_race is not None:
        days_to_next = (next_race_dt.astimezone(tz).date() - now_utc.astimezone(tz).date()).days
        until = (next_race.get("raceName") or "").upper().replace(" GRAND PRIX", "")

    off_week = {
        "header": {
            "title": "2026 F1 SEASON STANDINGS",
            "days_to_next": days_to_next,
            "until": until,
        },
        "drivers": drivers,
        "constructors": constructors,
        "drivers_all": drivers_all,
        "constructors_all": constructors_all,
        "news": news,
    }

    last_n = []
    if last_n_results_json:
        last_n = (
            last_n_results_json.get("MRData", {})
            .get("RaceTable", {})
            .get("Races", [])
        )

    return {
        "generated_at_utc": now_utc.isoformat(),
        "tz": tz_name,
        "circuits": circuit_assets,
        "race_day": race_day,
        "off_week": off_week,
        "last_results": {"races": last_n},
    }


def build_ui_pages_payload(pages_payload: Dict[str, Any]) -> Dict[str, Any]:
    tz_name = pages_payload.get("tz") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz_name = "UTC"
        tz = ZoneInfo("UTC")

    screen_w = 400
    screen_h = 300
    header_h = 26
    mid_h = 162
    bottom_h = screen_h - header_h - mid_h
    col_w = screen_w // 2
    box_pad = 4
    inner_w = col_w - box_pad * 2

    now_str = (pages_payload.get("generated_at_utc") or "").replace("Z", "+00:00")
    try:
        now_utc = datetime.fromisoformat(now_str).astimezone(timezone.utc)
    except Exception:
        now_utc = datetime.now(timezone.utc)

    race_day = pages_payload.get("race_day") or {}
    off_week = pages_payload.get("off_week") or {}

    header_time = (race_day.get("header") or {}).get("time") or now_utc.astimezone(tz).strftime("%H:%M")
    header_date = (race_day.get("header") or {}).get("date") or _fmt_header_date(now_utc, tz)
    battery_pct = (race_day.get("header") or {}).get("battery_pct")
    battery_text = f"[||||] {battery_pct}%" if isinstance(battery_pct, (int, float)) else "[||||] 85%"

    race = race_day.get("race") or {}
    gp_name = (race.get("name") or "").upper()
    if gp_name and not gp_name.endswith(" GRAND PRIX"):
        gp_name = f"{gp_name} GRAND PRIX"
    round_raw = race.get("round")
    try:
        round_no = int(round_raw)
    except Exception:
        round_no = None
    round_text = f"ROUND {round_no:02d}" if isinstance(round_no, int) else (f"ROUND {round_raw}" if round_raw else None)

    next_session = race_day.get("next_session") or {}
    countdown = next_session.get("in") or None
    next_label = "NEXT SESSION IN:" if countdown else ""

    pr = race_day.get("preview_race") or {}
    pr_name = (pr.get("name") or "").upper()
    if pr_name and not pr_name.endswith(" GRAND PRIX"):
        pr_name = f"{pr_name} GRAND PRIX"
    next_gp_text = f"NEXT: {pr_name}" if pr_name and pr_name != gp_name else ""

    schedule_src = race_day.get("schedule") or []
    schedule_src = list(reversed(schedule_src))

    def _split_when(when: str) -> Dict[str, str]:
        parts = (when or "").split()
        if len(parts) >= 2:
            return {"day": parts[0], "time": parts[1]}
        if len(parts) == 1:
            return {"day": parts[0], "time": ""}
        return {"day": "", "time": ""}

    def _status_tag(status: str) -> str:
        if (status or "").upper() == "DONE":
            return "[DONE]"
        return ""

    schedule_table = {
        "title": "SCHEDULE (Local Time)",
        "columns": [
            {"key": "session", "w": 44, "align": "left"},
            {"key": "day", "w": 36, "align": "left"},
            {"key": "time", "w": 52, "align": "left"},
            {"key": "status", "w": inner_w - (44 + 36 + 52), "align": "right"},
        ],
        "rows": [],
    }
    for it in schedule_src:
        when = _split_when(it.get("when") or "")
        schedule_table["rows"].append(
            {
                "session": f"{it.get('key', '')}:",
                "day": when["day"],
                "time": when["time"],
                "status": _status_tag(it.get("status") or ""),
                "status_raw": it.get("status"),
                "utc": it.get("utc"),
            }
        )

    weather = race_day.get("weather") or {}
    air_c = weather.get("air_c")
    track_c = weather.get("track_c")
    tyre = race_day.get("tyre") or {"source": "static", "text": "C1, C2, C3"}
    if isinstance(tyre, str):
        tyre = {"source": "static", "text": tyre}
    last_winner = race_day.get("last_winner")
    lap_record = race_day.get("lap_record")

    def _fmt_temp(v: Any) -> str:
        if isinstance(v, (int, float)):
            return f"{int(round(float(v)))}°C"
        return "--"

    weather_kv = {
        "title": "WEATHER",
        "columns": [
            {"key": "k", "w": 78, "align": "left"},
            {"key": "v", "w": inner_w - 78, "align": "left"},
        ],
        "rows": [
            {"k": "WEATHER:", "v": _fmt_temp(air_c)},
            {"k": "TRACK:", "v": _fmt_temp(track_c)},
            {"k": "TYRE:", "v": tyre.get("text") or ""},
            {"k": "LAST WINNER:", "v": last_winner or ""},
            {"k": "LAP RECORD:", "v": lap_record or ""},
        ],
    }

    race_day_ui = {
        "screen": {"w": screen_w, "h": screen_h},
        "layout": {"header_h": header_h, "mid_h": mid_h, "bottom_h": bottom_h, "col_w": col_w, "pad": box_pad},
        "header": {"left": header_time, "center": header_date, "right": battery_text},
        "race": {"grand_prix": gp_name or None, "round": round_text},
        "next_session": {"label": next_label, "countdown": countdown},
        "next_gp": {"text": next_gp_text},
        "schedule": schedule_table,
        "weather": weather_kv,
        "circuit": race_day.get("circuit"),
    }

    drivers = off_week.get("drivers") or []
    constructors = off_week.get("constructors") or []
    drivers_all = off_week.get("drivers_all") or []
    constructors_all = off_week.get("constructors_all") or []
    news = off_week.get("news")
    header2 = off_week.get("header") or {}
    days_to_next = header2.get("days_to_next")
    until = header2.get("until")

    driver_cols = {
        "rank_w": 22,
        "name_w": inner_w - 22 - 46 - 34,
        "code_w": 46,
        "pts_w": 34,
    }
    constructor_cols = {
        "rank_w": 22,
        "team_w": inner_w - 22 - 34,
        "pts_w": 34,
    }

    off_week_ui = {
        "screen": {"w": screen_w, "h": screen_h},
        "layout": {"header_h": header_h, "mid_h": mid_h, "bottom_h": bottom_h, "col_w": col_w, "pad": box_pad},
        "header": {"left": "2026 F1 SEASON STANDINGS", "right": "DAYS TO NEXT"},
        "days": {"value": days_to_next, "unit": "DAYS", "until": until},
        "drivers_table": {
            "columns": [
                {"key": "pos", "w": driver_cols["rank_w"], "align": "left"},
                {"key": "name", "w": driver_cols["name_w"], "align": "left"},
                {"key": "code", "w": driver_cols["code_w"], "align": "left"},
                {"key": "points", "w": driver_cols["pts_w"], "align": "right"},
            ],
            "rows": [
                {
                    "pos": d.get("pos"),
                    "name": d.get("name"),
                    "code": f"[{d.get('code')}]" if d.get("code") else "",
                    "points": d.get("points"),
                }
                for d in drivers
            ],
        },
        "constructors_table": {
            "columns": [
                {"key": "pos", "w": constructor_cols["rank_w"], "align": "left"},
                {"key": "name", "w": constructor_cols["team_w"], "align": "left"},
                {"key": "points", "w": constructor_cols["pts_w"], "align": "right"},
            ],
            "rows": [
                {"pos": c.get("pos"), "name": c.get("name"), "points": c.get("points")}
                for c in constructors
            ],
        },
        "news": news,
    }

    def _trend_map() -> Dict[str, List[str]]:
        races = (pages_payload.get("last_results") or {}).get("races") or []
        m: Dict[str, List[str]] = {}
        for r in races:
            results = r.get("Results") or []
            for res in results:
                drv = res.get("Driver") or {}
                driver_id = drv.get("driverId")
                if not driver_id:
                    continue
                try:
                    pos = int(res.get("position", 0))
                except Exception:
                    pos = 0
                try:
                    pts = float(res.get("points", 0))
                except Exception:
                    pts = 0.0
                if pos and pos <= 3:
                    sym = "#"
                elif pts > 0:
                    sym = "o"
                else:
                    sym = "."
                m.setdefault(driver_id, []).append(sym)
        for k, v in m.items():
            if len(v) < 5:
                v[:] = (["."] * (5 - len(v))) + v
            if len(v) > 5:
                m[k] = v[-5:]
        return m

    trends = _trend_map()

    def _chunks(items: list, n: int) -> List[list]:
        if n <= 0:
            return [items]
        return [items[i : i + n] for i in range(0, len(items), n)]

    wdc_rows = []
    for d in drivers_all:
        driver_id = d.get("driver_id")
        t = trends.get(driver_id, [".", ".", ".", ".", "."])
        wdc_rows.append(
            {
                "pos": d.get("pos"),
                "driver": d.get("name"),
                "team": d.get("constructor"),
                "points": d.get("points"),
                "trend": f"[ {' '.join(t)} ]",
            }
        )
    wdc_pages = []
    page_size = 8
    pages_list = _chunks(wdc_rows, page_size)
    for idx, rows in enumerate(pages_list):
        wdc_pages.append(
            {
                "page": idx + 1,
                "page_count": len(pages_list),
                "rows": rows,
            }
        )

    leader_pts = constructors_all[0].get("points") if constructors_all else None
    wcc_rows = []
    by_team: Dict[str, List[Dict[str, Any]]] = {}
    for d in drivers_all:
        cid = d.get("constructor_id")
        if not cid:
            continue
        by_team.setdefault(cid, []).append(d)
    for c in constructors_all:
        pts = c.get("points")
        gap = None
        if isinstance(leader_pts, int) and isinstance(pts, int):
            gap = pts - leader_pts
        drivers_for_team = sorted(
            by_team.get(c.get("constructor_id"), []),
            key=lambda x: x.get("points") or 0,
            reverse=True,
        )
        p1 = drivers_for_team[0].get("points") if len(drivers_for_team) > 0 else 0
        p2 = drivers_for_team[1].get("points") if len(drivers_for_team) > 1 else 0
        total = (p1 or 0) + (p2 or 0)
        bar_n = 12
        fill = 0 if total <= 0 else int(round((p1 / total) * bar_n))
        fill = max(0, min(bar_n, fill))
        bar = "[" + ("=" * fill) + (" " * (bar_n - fill)) + "]"
        wcc_rows.append(
            {
                "pos": c.get("pos"),
                "constructor": c.get("name"),
                "points": pts,
                "gap": "--" if c.get("pos") == 1 else (str(gap) if gap is not None else ""),
                "split_bar": bar,
                "split_value": f"{p1}/{p2}",
            }
        )
    wcc_page_size = 8
    wcc_pages = []
    wcc_pages_list = _chunks(wcc_rows, wcc_page_size)
    for idx, rows in enumerate(wcc_pages_list):
        wcc_pages.append(
            {
                "page": idx + 1,
                "page_count": len(wcc_pages_list),
                "rows": rows,
            }
        )

    details = {
        "wdc": {
            "title": "2026 DRIVER STANDINGS (WDC)",
            "page_size": page_size,
            "pages": wdc_pages,
        },
        "wcc": {
            "title": "2026 CONSTRUCTOR STANDINGS (WCC)",
            "page_size": wcc_page_size,
            "pages": wcc_pages,
        },
    }

    decision_tz = "Asia/Shanghai"
    try:
        sh_tz = ZoneInfo(decision_tz)
    except ZoneInfoNotFoundError:
        sh_tz = ZoneInfo("UTC")
        decision_tz = "UTC"

    def _week_start(d):
        return d - timedelta(days=d.weekday())

    is_race_week = False
    now_sh = now_utc.astimezone(sh_tz)
    rr = race_day.get("next_race") or {}
    s = rr.get("starts_at_utc")
    if s:
        try:
            race_dt_sh = datetime.fromisoformat(str(s)).astimezone(sh_tz)
            # "Race week" means: from the Monday you get by counting back to Monday from race day.
            # If race day itself is Monday, count back one full week to the previous Monday.
            wd = race_dt_sh.weekday()  # Mon=0 .. Sun=6
            back_days = wd if wd > 0 else 7
            start_d = race_dt_sh.date() - timedelta(days=back_days)
            start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=sh_tz)
            if start_dt <= now_sh <= race_dt_sh:
                is_race_week = True
        except Exception:
            pass

    default_page = "race_day" if is_race_week else "off_week"

    # During race week we are already showing the active race weekend.
    # Hide "NEXT: ..." to avoid confusing "next GP" messaging.
    if is_race_week:
        try:
            if isinstance(race_day_ui.get("next_gp"), dict):
                race_day_ui["next_gp"]["text"] = ""
        except Exception:
            pass

    return {
        "generated_at_utc": pages_payload.get("generated_at_utc"),
        "tz": tz_name,
        "format": "ui.v1",
        "decision_tz": decision_tz,
        "is_race_week": is_race_week,
        "default_page": default_page,
        "details": details,
        "pages": {"race_day": race_day_ui, "off_week": off_week_ui},
    }
