from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pymysql


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
    )


def _slugify(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower().replace("&", " and ")
    s = re.sub(r"\bgrand prix\b", "", s)
    s = re.sub(r"\bgp\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def _date_only(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    return s[:10] if len(s) >= 10 else s


def _preferred_track_key(circuit_id: str, current: str) -> str:
    cid = (circuit_id or "").strip().lower()
    aliases = {
        "albert_park": "melbourne",
        "americas": "austin",
        "baku": "baku",
        "catalunya": "catalunya",
        "hungaroring": "hungaroring",
        "interlagos": "interlagos",
        "losail": "lusail",
        "marina_bay": "singapore",
        "miami": "miami",
        "monaco": "montecarlo",
        "monza": "monza",
        "red_bull_ring": "spielberg",
        "rodriguez": "mexicocity",
        "shanghai": "shanghai",
        "silverstone": "silverstone",
        "spa": "spafrancorchamps",
        "suzuka": "suzuka",
        "vegas": "lasvegas",
        "villeneuve": "montreal",
        "yas_marina": "yasmarinacircuit",
        "zandvoort": "zandvoort",
    }
    return aliases.get(cid, (current or "").strip())


def _pick_map_url(static_root: Path, season: int, circuit_id: str) -> tuple[str, str]:
    circuit_id = (circuit_id or "").strip()
    raw_map = static_root / "circuits" / str(season) / "raw" / f"{circuit_id}_map.png"
    map_png = static_root / "circuits" / str(season) / f"{circuit_id}.png"
    detail_png = static_root / "circuits" / str(season) / f"{circuit_id}_detail.png"

    if raw_map.exists() and raw_map.stat().st_size > 0:
        map_url = f"/static/circuits/{season}/raw/{circuit_id}_map.png"
    else:
        map_url = f"/static/circuits/{season}/{circuit_id}.png"

    if detail_png.exists() and detail_png.stat().st_size > 0:
        detail_url = f"/static/circuits/{season}/{circuit_id}_detail.png"
    else:
        detail_url = f"/static/circuits/{season}/{circuit_id}_detail.png"

    if not map_png.exists() and not raw_map.exists():
        raise FileNotFoundError(f"map asset not found for circuit_id={circuit_id}")
    return map_url, detail_url


@dataclass
class RaceAsset:
    season_year: int
    round: int
    race_name: str
    race_name_slug: str
    race_date: str
    circuit_id: str
    circuit_name: str
    circuit_name_slug: str
    country: str
    country_slug: str
    locality: str
    locality_slug: str
    track_key: str


@dataclass
class MeetingRace:
    meeting_key: int
    season_year: int
    meeting_name: str
    meeting_name_slug: str
    race_date: str
    country_name: str
    country_slug: str
    location: str
    location_slug: str
    circuit_short_name: str
    circuit_short_name_slug: str


def _load_race_assets(cur, season: int) -> list[RaceAsset]:
    cur.execute(
        """
        SELECT
          r.season_year,
          r.round,
          r.race_name,
          DATE(COALESCE(rs.start_utc, r.race_start_utc)) AS race_date,
          c.ergast_circuit_id,
          c.name AS circuit_name,
          c.country,
          c.locality,
          c.track_key
        FROM f1_race r
        JOIN f1_circuit c ON c.id = r.circuit_id
        LEFT JOIN f1_race_session rs ON rs.race_id = r.id AND rs.session_type = 'RACE'
        WHERE r.season_year = %s
        ORDER BY r.round ASC
        """,
        (int(season),),
    )
    out: list[RaceAsset] = []
    for row in cur.fetchall() or []:
        race_name = str(row.get("race_name") or "").strip()
        circuit_name = str(row.get("circuit_name") or "").strip()
        country = str(row.get("country") or "").strip()
        locality = str(row.get("locality") or "").strip()
        out.append(
            RaceAsset(
                season_year=int(row.get("season_year") or season),
                round=int(row.get("round") or 0),
                race_name=race_name,
                race_name_slug=_slugify(race_name),
                race_date=_date_only(row.get("race_date")),
                circuit_id=str(row.get("ergast_circuit_id") or "").strip(),
                circuit_name=circuit_name,
                circuit_name_slug=_slugify(circuit_name),
                country=country,
                country_slug=_slugify(country),
                locality=locality,
                locality_slug=_slugify(locality),
                track_key=str(row.get("track_key") or "").strip(),
            )
        )
    return out


def _load_meeting_races(cur, season: int) -> list[MeetingRace]:
    cur.execute(
        """
        SELECT
          m.meeting_key,
          m.year AS season_year,
          m.meeting_name,
          DATE(COALESCE(
            race_s.date_start_utc,
            m.date_start_utc
          )) AS race_date,
          m.country_name,
          m.location,
          m.circuit_short_name
        FROM openf1_meetings m
        LEFT JOIN openf1_sessions race_s
          ON race_s.meeting_key = m.meeting_key
         AND race_s.date_start_utc = (
              SELECT MIN(s2.date_start_utc)
              FROM openf1_sessions s2
              WHERE s2.meeting_key = m.meeting_key
                AND (
                     LOWER(COALESCE(s2.session_name, '')) = 'race'
                  OR LOWER(COALESCE(s2.session_type, '')) = 'race'
                )
         )
        WHERE m.year = %s
        ORDER BY COALESCE(race_s.date_start_utc, m.date_start_utc) ASC, m.meeting_key ASC
        """,
        (int(season),),
    )
    out: list[MeetingRace] = []
    for row in cur.fetchall() or []:
        meeting_name = str(row.get("meeting_name") or "").strip()
        country = str(row.get("country_name") or "").strip()
        location = str(row.get("location") or "").strip()
        short_name = str(row.get("circuit_short_name") or "").strip()
        out.append(
            MeetingRace(
                meeting_key=int(row.get("meeting_key") or 0),
                season_year=int(row.get("season_year") or season),
                meeting_name=meeting_name,
                meeting_name_slug=_slugify(meeting_name),
                race_date=_date_only(row.get("race_date")),
                country_name=country,
                country_slug=_slugify(country),
                location=location,
                location_slug=_slugify(location),
                circuit_short_name=short_name,
                circuit_short_name_slug=_slugify(short_name),
            )
        )
    return out


def _load_existing_map_keys(cur, season: int) -> set[int]:
    cur.execute(
        """
        SELECT meeting_key
        FROM openf1_meeting_circuit_maps
        WHERE season_year = %s
        """,
        (int(season),),
    )
    return {int(row["meeting_key"]) for row in (cur.fetchall() or []) if row.get("meeting_key") is not None}


def _score_match(meeting: MeetingRace, race: RaceAsset) -> int:
    score = 0
    if meeting.race_date and race.race_date and meeting.race_date == race.race_date:
        score += 100
    if meeting.meeting_name_slug and meeting.meeting_name_slug == race.race_name_slug:
        score += 60
    if meeting.country_slug and meeting.country_slug == race.country_slug:
        score += 15
    if meeting.location_slug and (
        meeting.location_slug == race.locality_slug
        or meeting.location_slug in race.circuit_name_slug
        or race.locality_slug in meeting.meeting_name_slug
    ):
        score += 15
    if meeting.circuit_short_name_slug and (
        meeting.circuit_short_name_slug == race.circuit_name_slug
        or meeting.circuit_short_name_slug in race.circuit_name_slug
        or race.circuit_name_slug in meeting.circuit_short_name_slug
    ):
        score += 15
    if meeting.meeting_name_slug and (
        meeting.meeting_name_slug in race.race_name_slug or race.race_name_slug in meeting.meeting_name_slug
    ):
        score += 10
    return score


def _pick_best_race(meeting: MeetingRace, races: list[RaceAsset]) -> RaceAsset | None:
    candidates = [(race, _score_match(meeting, race)) for race in races]
    candidates = [it for it in candidates if it[1] > 0]
    if not candidates:
        return None
    candidates.sort(
        key=lambda it: (
            it[1],
            1 if it[0].race_date == meeting.race_date else 0,
            -abs(it[0].round),
        ),
        reverse=True,
    )
    best, best_score = candidates[0]
    if best_score < 100:
        return None
    if len(candidates) > 1 and candidates[1][1] == best_score and candidates[1][0].circuit_id != best.circuit_id:
        return None
    return best


def _upsert_rows(cur, rows: list[tuple]) -> int:
    if not rows:
        return 0
    cur.executemany(
        """
        INSERT INTO openf1_meeting_circuit_maps
        (meeting_key, season_year, ergast_circuit_id, circuit_name, track_key, map_image_url, map_image_url_detail)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          season_year = VALUES(season_year),
          ergast_circuit_id = VALUES(ergast_circuit_id),
          circuit_name = VALUES(circuit_name),
          track_key = VALUES(track_key),
          map_image_url = VALUES(map_image_url),
          map_image_url_detail = VALUES(map_image_url_detail)
        """,
        rows,
    )
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--meeting-key", type=int, default=0, help="只同步指定 meeting_key")
    ap.add_argument("--dry-run", action="store_true", default=False)
    ap.add_argument("--force", action="store_true", default=False, help="覆盖已存在映射")
    ap.add_argument("--verbose", action="store_true", default=False)
    args = ap.parse_args()

    static_root = (Path(__file__).resolve().parent.parent / "static").resolve()
    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            races = _load_race_assets(cur, args.season)
            meetings = _load_meeting_races(cur, args.season)
            existing_keys = _load_existing_map_keys(cur, args.season)

            if args.meeting_key > 0:
                meetings = [m for m in meetings if m.meeting_key == int(args.meeting_key)]

            rows_to_write: list[tuple] = []
            skipped_existing = 0
            unmatched = 0

            for meeting in meetings:
                if not args.force and meeting.meeting_key in existing_keys:
                    skipped_existing += 1
                    continue
                best = _pick_best_race(meeting, races)
                if best is None:
                    unmatched += 1
                    if args.verbose:
                        print(
                            f"unmatched meeting_key={meeting.meeting_key} name={meeting.meeting_name!r} date={meeting.race_date}",
                            file=sys.stderr,
                            flush=True,
                        )
                    continue
                try:
                    map_url, detail_url = _pick_map_url(static_root, args.season, best.circuit_id)
                except Exception as ex:
                    unmatched += 1
                    print(
                        f"skip meeting_key={meeting.meeting_key} race={best.race_name!r}: {type(ex).__name__}: {ex}",
                        file=sys.stderr,
                        flush=True,
                    )
                    continue
                rows_to_write.append(
                    (
                        meeting.meeting_key,
                        args.season,
                        best.circuit_id,
                        best.circuit_name,
                        _preferred_track_key(best.circuit_id, best.track_key),
                        map_url,
                        detail_url,
                    )
                )
                if args.verbose:
                    print(
                        f"match meeting_key={meeting.meeting_key} -> round={best.round} race={best.race_name} circuit={best.circuit_id}",
                        flush=True,
                    )

            if args.dry_run:
                print(
                    f"dry-run season={args.season} matched={len(rows_to_write)} skipped_existing={skipped_existing} unmatched={unmatched}",
                    flush=True,
                )
                for row in rows_to_write[:20]:
                    print(
                        f"  meeting_key={row[0]} circuit_id={row[2]} track_key={row[4]} map={row[5]}",
                        flush=True,
                    )
                conn.rollback()
                return 0

            count = 0
            if rows_to_write:
                with conn.cursor() as cur:
                    count = _upsert_rows(cur, rows_to_write)
                conn.commit()
            else:
                conn.rollback()
            print(
                f"sync done season={args.season} upserted={count} skipped_existing={skipped_existing} unmatched={unmatched}",
                flush=True,
            )
            return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
