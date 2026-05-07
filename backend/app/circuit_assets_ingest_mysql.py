import json
from pathlib import Path
from typing import Any, Dict

import pymysql


def _normalize_public_static_url(u: Any) -> str | None:
    if u is None:
        return None
    s = str(u).strip()
    if not s:
        return None
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


def ingest_circuit_assets_file(conn: pymysql.Connection, season: int, circuits_json_path: Path) -> Dict[str, int]:
    season = int(season)
    p = circuits_json_path.resolve()
    data = json.loads(p.read_text(encoding="utf-8"))
    items = (data or {}).get("items") or []
    if not isinstance(items, list):
        raise ValueError("circuits.json missing items list")

    out = {"circuits": 0}
    with conn.cursor() as cur:
        for it in items:
            if not isinstance(it, dict):
                continue
            if int(it.get("season") or season) != season:
                continue
            circuit_id = str(it.get("circuit_id") or "").strip()
            if not circuit_id:
                continue

            name = it.get("circuit_name")
            locality = it.get("locality")
            country = it.get("country")
            lat = None
            lng = None
            try:
                if it.get("lat") is not None and str(it.get("lat")).strip() != "":
                    lat = float(it.get("lat"))
                if it.get("long") is not None and str(it.get("long")).strip() != "":
                    lng = float(it.get("long"))
            except Exception:
                lat = None
                lng = None
            ergast_url = it.get("ergast_url")

            formula1_slug = it.get("formula1_slug")
            track_key = it.get("track_key")
            map_url = _normalize_public_static_url(it.get("public_map_image_url") or it.get("map_image_url"))
            assets_json = json.dumps(it, ensure_ascii=False)

            cur.execute(
                """
                INSERT INTO f1_circuit (
                  `ergast_circuit_id`, `name`, `locality`, `country`, `latitude`, `longitude`, `ergast_url`,
                  `formula1_slug`, `track_key`, `map_image_url`, `assets_json`
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  `name` = VALUES(`name`),
                  `locality` = VALUES(`locality`),
                  `country` = VALUES(`country`),
                  `latitude` = VALUES(`latitude`),
                  `longitude` = VALUES(`longitude`),
                  `ergast_url` = VALUES(`ergast_url`),
                  `formula1_slug` = VALUES(`formula1_slug`),
                  `track_key` = VALUES(`track_key`),
                  `map_image_url` = VALUES(`map_image_url`),
                  `assets_json` = VALUES(`assets_json`)
                """,
                (
                    circuit_id,
                    name,
                    locality,
                    country,
                    lat,
                    lng,
                    ergast_url,
                    formula1_slug,
                    track_key,
                    map_url,
                    assets_json,
                ),
            )
            out["circuits"] += 1

    conn.commit()
    return out


def default_circuits_json_path(static_dir: Path, season: int) -> Path:
    return (static_dir / "circuits" / str(int(season)) / "circuits.json").resolve()
