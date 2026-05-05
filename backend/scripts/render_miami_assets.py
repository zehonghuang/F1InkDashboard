import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pymysql
from PIL import Image, ImageDraw, ImageFont

from render_lap_traces_png import render_one


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
        autocommit=True,
    )


def _fmt_lap_ms(ms: int | None) -> str:
    if ms is None or ms <= 0:
        return ""
    total_s = ms // 1000
    m = total_s // 60
    s = total_s % 60
    rem = ms % 1000
    return f"{m}:{s:02d}.{rem:03d}"


def _fmt_gap_ms(ms: int | None) -> str:
    if ms is None or ms <= 0:
        return "---"
    return f"+{ms / 1000.0:.3f}"


def _pick_stage(vals: list, idx: int) -> float | None:
    try:
        v = vals[idx]
    except Exception:
        return None
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _pick_quali_duration(vals: list) -> float | None:
    return _pick_stage(vals, 2) or _pick_stage(vals, 1) or _pick_stage(vals, 0)


def _pick_quali_gap(vals: list) -> float | None:
    return _pick_stage(vals, 2) or _pick_stage(vals, 1) or _pick_stage(vals, 0)


def _render_quali_table_png(rows: list[dict], out_path: Path, title: str) -> None:
    w, h = 1200, 760
    pad = 24
    top = 64
    row_h = 28

    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    draw.text((pad, 18), title, fill=(20, 20, 20), font=font)

    x_pos = pad
    x_drv = pad + 70
    x_team = pad + 170
    x_time = pad + 640
    x_gap = pad + 860

    y = top
    draw.line([(pad, y - 10), (w - pad, y - 10)], fill=(30, 30, 30), width=1)
    draw.text((x_pos, y), "POS", fill=(50, 50, 50), font=font)
    draw.text((x_drv, y), "DRV", fill=(50, 50, 50), font=font)
    draw.text((x_team, y), "TEAM", fill=(50, 50, 50), font=font)
    draw.text((x_time, y), "TIME", fill=(50, 50, 50), font=font)
    draw.text((x_gap, y), "GAP", fill=(50, 50, 50), font=font)
    y += row_h
    draw.line([(pad, y - 6), (w - pad, y - 6)], fill=(30, 30, 30), width=1)

    for it in rows[:20]:
        pos = str(it.get("pos") or "")
        drv = str(it.get("drv") or "")
        team = str(it.get("team") or "")
        lap = str(it.get("lap") or "")
        gap = str(it.get("gap") or "")
        draw.text((x_pos, y), pos, fill=(0, 0, 0), font=font)
        draw.text((x_drv, y), drv, fill=(0, 0, 0), font=font)
        draw.text((x_team, y), team, fill=(0, 0, 0), font=font)
        draw.text((x_time, y), lap, fill=(0, 0, 0), font=font)
        draw.text((x_gap, y), gap, fill=(0, 0, 0), font=font)
        y += row_h
        if y >= h - 20:
            break

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG")


def _render_quali_driver_card_png(*, out_path: Path, title: str, pos: str, drv: str, team: str, lap: str, gap: str) -> None:
    w, h = 960, 480
    pad = 24
    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    draw.text((pad, 16), title, fill=(20, 20, 20), font=font)
    draw.line([(pad, 44), (w - pad, 44)], fill=(30, 30, 30), width=1)

    y = 70
    step = 36
    draw.text((pad, y), f"POS: {pos}", fill=(0, 0, 0), font=font)
    y += step
    draw.text((pad, y), f"DRV: {drv}", fill=(0, 0, 0), font=font)
    y += step
    draw.text((pad, y), f"TEAM: {team}", fill=(0, 0, 0), font=font)
    y += step
    draw.text((pad, y), f"TIME: {lap}", fill=(0, 0, 0), font=font)
    y += step
    draw.text((pad, y), f"GAP: {gap}", fill=(0, 0, 0), font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--meeting-like", default="Miami")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--max-points", type=int, default=900)
    args = ap.parse_args()

    out_dir = Path(args.out_dir) if args.out_dir else (Path(__file__).resolve().parents[1] / "static" / "assets" / "miami")
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = _mysql_connect()
    try:
        with conn.cursor() as cur:
            year = args.year
            if year is None:
                cur.execute(
                    """
                    SELECT year
                    FROM openf1_meetings
                    WHERE meeting_name LIKE %s
                    ORDER BY date_start_utc DESC
                    LIMIT 1
                    """,
                    (f"%{args.meeting_like}%",),
                )
                row = cur.fetchone() or {}
                year = int(row.get("year")) if row.get("year") is not None else datetime.utcnow().year

            cur.execute(
                """
                SELECT meeting_key, meeting_name, year, date_start_utc
                FROM openf1_meetings
                WHERE year = %s AND meeting_name LIKE %s
                ORDER BY date_start_utc DESC
                LIMIT 1
                """,
                (int(year), f"%{args.meeting_like}%"),
            )
            meeting = cur.fetchone()
            if not meeting:
                raise SystemExit(f"meeting not found: year={year} like={args.meeting_like}")
            meeting_key = int(meeting["meeting_key"])
            meeting_name = str(meeting.get("meeting_name") or "").strip() or f"MEETING {meeting_key}"

            cur.execute(
                """
                SELECT session_key
                FROM openf1_sessions
                WHERE meeting_key = %s
                  AND (LOWER(session_name) = 'qualifying' OR LOWER(session_type) = 'qualifying')
                ORDER BY date_start_utc DESC
                LIMIT 1
                """,
                (meeting_key,),
            )
            row = cur.fetchone()
            if not row or row.get("session_key") is None:
                raise SystemExit(f"qualifying session not found for meeting_key={meeting_key}")
            quali_sk = int(row["session_key"])

            cur.execute(
                """
                SELECT session_key
                FROM openf1_sessions
                WHERE meeting_key = %s
                  AND (LOWER(session_name) = 'race' OR LOWER(session_type) = 'race')
                ORDER BY date_start_utc DESC
                LIMIT 1
                """,
                (meeting_key,),
            )
            row = cur.fetchone()
            if not row or row.get("session_key") is None:
                raise SystemExit(f"race session not found for meeting_key={meeting_key}")
            race_sk = int(row["session_key"])

            cur.execute(
                """
                SELECT
                  sr.position,
                  sr.driver_number,
                  sr.duration_s,
                  sr.gap_to_leader_s,
                  sr.duration_json,
                  sr.gap_to_leader_json,
                  d.name_acronym,
                  d.team_name
                FROM openf1_session_result sr
                LEFT JOIN openf1_drivers d
                  ON d.session_key = sr.session_key AND d.driver_number = sr.driver_number
                WHERE sr.session_key = %s
                ORDER BY sr.position ASC
                """,
                (quali_sk,),
            )
            qrows = cur.fetchall() or []
            table_rows: list[dict] = []
            for it in qrows:
                if not isinstance(it, dict):
                    continue
                pos = it.get("position")
                dn = it.get("driver_number")
                if pos is None or dn is None:
                    continue
                try:
                    pos_i = int(pos)
                    dn_i = int(dn)
                except Exception:
                    continue
                dur_s = float(it["duration_s"]) if isinstance(it.get("duration_s"), (int, float)) else None
                gap_s = float(it["gap_to_leader_s"]) if isinstance(it.get("gap_to_leader_s"), (int, float)) else None

                dj = it.get("duration_json")
                gj = it.get("gap_to_leader_json")
                try:
                    dv = json.loads(dj) if isinstance(dj, (str, bytes, bytearray)) else dj
                except Exception:
                    dv = None
                try:
                    gv = json.loads(gj) if isinstance(gj, (str, bytes, bytearray)) else gj
                except Exception:
                    gv = None
                if dur_s is None and isinstance(dv, list):
                    dur_s = _pick_quali_duration(dv)
                if gap_s is None and isinstance(gv, list):
                    gap_s = _pick_quali_gap(gv)

                lap_ms = None if dur_s is None else int(round(dur_s * 1000.0))
                gap_ms = None if gap_s is None else int(round(gap_s * 1000.0))
                drv = str(it.get("name_acronym") or "").strip().upper() or str(dn_i)
                team = str(it.get("team_name") or "").strip().upper()
                table_rows.append(
                    {
                        "pos": str(pos_i).zfill(2),
                        "drv": drv,
                        "team": team,
                        "lap": _fmt_lap_ms(lap_ms),
                        "gap": "---" if pos_i == 1 else _fmt_gap_ms(gap_ms),
                    }
                )

            q_png = out_dir / "miami_quali_final.png"
            _render_quali_table_png(table_rows, q_png, title=f"{meeting_name.upper()}  QUALIFYING FINAL")
            (out_dir / "miami_quali_final.json").write_text(
                json.dumps(
                    {"ok": True, "found": True, "meeting_key": meeting_key, "qualifying_session_key": quali_sk, "rows": table_rows},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            q_driver_numbers = [int(it["driver_number"]) for it in qrows if isinstance(it, dict) and it.get("driver_number") is not None]
            q_index = {"ok": True, "found": True, "meeting_key": meeting_key, "qualifying_session_key": quali_sk, "drivers": q_driver_numbers}
            (out_dir / "miami_quali_driver_final_index.json").write_text(json.dumps(q_index, ensure_ascii=False), encoding="utf-8")

            for it in qrows:
                if not isinstance(it, dict):
                    continue
                pos = it.get("position")
                dn = it.get("driver_number")
                if pos is None or dn is None:
                    continue
                try:
                    pos_i = int(pos)
                    dn_i = int(dn)
                except Exception:
                    continue

                dur_s = float(it["duration_s"]) if isinstance(it.get("duration_s"), (int, float)) else None
                gap_s = float(it["gap_to_leader_s"]) if isinstance(it.get("gap_to_leader_s"), (int, float)) else None
                dj = it.get("duration_json")
                gj = it.get("gap_to_leader_json")
                try:
                    dv = json.loads(dj) if isinstance(dj, (str, bytes, bytearray)) else dj
                except Exception:
                    dv = None
                try:
                    gv = json.loads(gj) if isinstance(gj, (str, bytes, bytearray)) else gj
                except Exception:
                    gv = None
                if dur_s is None and isinstance(dv, list):
                    dur_s = _pick_quali_duration(dv)
                if gap_s is None and isinstance(gv, list):
                    gap_s = _pick_quali_gap(gv)

                lap_ms = None if dur_s is None else int(round(dur_s * 1000.0))
                gap_ms = None if gap_s is None else int(round(gap_s * 1000.0))

                drv = str(it.get("name_acronym") or "").strip().upper() or str(dn_i)
                team = str(it.get("team_name") or "").strip().upper()
                lap_txt = _fmt_lap_ms(lap_ms)
                gap_txt = "---" if pos_i == 1 else _fmt_gap_ms(gap_ms)

                out_png = out_dir / f"miami_quali_driver_{dn_i}_final.png"
                _render_quali_driver_card_png(
                    out_path=out_png,
                    title=f"{meeting_name.upper()}  QUALI FINAL",
                    pos=str(pos_i).zfill(2),
                    drv=drv,
                    team=team,
                    lap=lap_txt,
                    gap=gap_txt,
                )
                meta = {
                    "ok": True,
                    "found": True,
                    "meeting_key": meeting_key,
                    "qualifying_session_key": quali_sk,
                    "driver_number": dn_i,
                    "position": pos_i,
                    "lap_duration_s": (float(dur_s) if dur_s is not None else None),
                    "gap_to_leader_s": (float(gap_s) if gap_s is not None else None),
                }
                (out_dir / f"miami_quali_driver_{dn_i}_final.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

            cur.execute(
                """
                SELECT DISTINCT driver_number
                FROM openf1_session_result
                WHERE session_key = %s
                ORDER BY driver_number ASC
                """,
                (race_sk,),
            )
            race_driver_numbers = [int(it["driver_number"]) for it in (cur.fetchall() or []) if isinstance(it, dict) and it.get("driver_number") is not None]

            cur.execute(
                """
                SELECT
                  driver_number,
                  lap_number,
                  date_start_utc,
                  lap_duration,
                  duration_sector_1,
                  duration_sector_2,
                  duration_sector_3
                FROM openf1_laps
                WHERE session_key = %s
                  AND lap_duration IS NOT NULL
                  AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
                ORDER BY driver_number ASC, lap_duration ASC, date_start_utc ASC
                """,
                (race_sk,),
            )
            best_by_driver: dict[int, dict[str, Any]] = {}
            for it in (cur.fetchall() or []):
                if not isinstance(it, dict):
                    continue
                dn = it.get("driver_number")
                if dn is None:
                    continue
                try:
                    dn_i = int(dn)
                except Exception:
                    continue
                if dn_i in best_by_driver:
                    continue
                best_by_driver[dn_i] = it

            index = {"ok": True, "found": True, "meeting_key": meeting_key, "race_session_key": race_sk, "drivers": race_driver_numbers}
            (out_dir / "miami_race_driver_best_index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")

            for dn in race_driver_numbers:
                best = best_by_driver.get(int(dn))
                if best:
                    ln = int(best.get("lap_number") or 0)
                    start_dt = best.get("date_start_utc")
                    dur = float(best.get("lap_duration") or 0.0)
                    if not isinstance(start_dt, datetime) or not (dur > 0.01) or ln <= 0:
                        best = None
                if not best:
                    out_png = out_dir / f"miami_race_driver_{int(dn)}_best.png"
                    render_one(
                        driver_number=int(dn),
                        session_key=race_sk,
                        lap_number=0,
                        duration_s=1.0,
                        points=[],
                        out_path=out_png,
                        canvas_w=960,
                        canvas_h=480,
                    )
                    meta = {"ok": True, "found": False, "meeting_key": meeting_key, "race_session_key": race_sk, "driver_number": int(dn)}
                    (out_dir / f"miami_race_driver_{int(dn)}_best.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
                    continue

                ln = int(best.get("lap_number") or 0)
                start_dt = best.get("date_start_utc")
                dur = float(best.get("lap_duration") or 0.0)
                end_dt = start_dt + timedelta(seconds=dur)

                cur.execute(
                    """
                    SELECT date_utc, throttle, brake
                    FROM openf1_car_data
                    WHERE session_key = %s AND driver_number = %s
                      AND date_utc >= %s AND date_utc <= %s
                    ORDER BY date_utc ASC
                    """,
                    (race_sk, int(dn), start_dt, end_dt),
                )
                car = cur.fetchall() or []
                points: list[dict] = []
                for it in car:
                    if not isinstance(it, dict):
                        continue
                    dt = it.get("date_utc")
                    if not isinstance(dt, datetime):
                        continue
                    t_s = (dt - start_dt).total_seconds()
                    if t_s < 0:
                        continue
                    points.append({"t_s": float(t_s), "throttle": it.get("throttle"), "brake": it.get("brake")})

                if points and len(points) > int(args.max_points):
                    step = max(1, len(points) // int(args.max_points))
                    points = points[::step]

                out_png = out_dir / f"miami_race_driver_{int(dn)}_best.png"
                render_one(
                    driver_number=int(dn),
                    session_key=race_sk,
                    lap_number=ln,
                    duration_s=dur,
                    points=points,
                    out_path=out_png,
                    canvas_w=960,
                    canvas_h=480,
                )
                meta = {
                    "ok": True,
                    "found": True,
                    "meeting_key": meeting_key,
                    "race_session_key": race_sk,
                    "driver_number": int(dn),
                    "lap_number": ln,
                    "lap_duration_s": dur,
                    "s1_s": best.get("duration_sector_1"),
                    "s2_s": best.get("duration_sector_2"),
                    "s3_s": best.get("duration_sector_3"),
                }
                (out_dir / f"miami_race_driver_{int(dn)}_best.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
