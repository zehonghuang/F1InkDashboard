import asyncio
import base64
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cache import TtlCache
from .epd_frame import build_epd_frame
from .f1_circuit_assets import fetch_f1_circuit_assets
from .news_stream import NewsRelay, NewsRelayConfig
from .openf1_stream import OpenF1Relay, OpenF1RelayConfig
from .db_mysql import mysql_connect, mysql_enabled
from .f1_db_read import circuit_assets_payload_from_db, schedule_json_from_db
from .third_party import (
    build_pages_payload,
    build_sessions_payload,
    build_ui_pages_payload,
    ergast_constructor_standings,
    ergast_constructor_standings_for_season,
    ergast_current_schedule,
    ergast_schedule_for_season,
    ergast_driver_standings,
    ergast_driver_standings_for_season,
    fetch_f1_breaking_rss,
    ergast_last_n_results,
    ergast_last_winner,
    fetch_rss_first_title,
    open_meteo_current_temp_c,
)


app = FastAPI(title="toinc_F1-backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = TtlCache(default_ttl_s=60)
STATIC_DIR = (Path(__file__).resolve().parent.parent / "static").resolve()
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
UPDATE_DIR = (STATIC_DIR / "update").resolve()
UPDATE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/update", StaticFiles(directory=str(UPDATE_DIR)), name="update")

DEFAULT_DEVICE_WS_URL = os.getenv("TOINC_F1_DEVICE_WS_URL") or os.getenv("ZECTRIX_DEVICE_WS_URL", "ws://192.168.4.1:8080/ws")
openf1 = OpenF1Relay(OpenF1RelayConfig.from_env())
news_ws = NewsRelay(NewsRelayConfig.from_env(), static_dir=STATIC_DIR)

ws_clients: set[WebSocket] = set()
ws_clients_lock = asyncio.Lock()


@app.on_event("startup")
async def _startup() -> None:
    await openf1.start()
    await news_ws.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await openf1.stop()
    await news_ws.stop()


def _load_circuit_assets_from_disk(season: int) -> dict | None:
    p = STATIC_DIR / "circuits" / str(season) / "circuits.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


async def _build_pages(
    tz_name: str,
    include_circuit: bool = True,
    season: int = 2026,
    refresh_circuit: bool = False,
) -> dict:
    now_utc = datetime.now(timezone.utc)
    try:
        ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz_name = "UTC"
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        schedule = None
        schedule_source = "ergast"
        if mysql_enabled():
            try:
                conn = mysql_connect()
                try:
                    schedule = await asyncio.to_thread(schedule_json_from_db, conn, int(season))
                    schedule_source = "mysql"
                finally:
                    conn.close()
            except Exception:
                schedule = None
                schedule_source = "ergast"

        if schedule is None:
            schedule = await cache.get_or_set(
                f"ergast:schedule:{int(season)}",
                lambda: ergast_schedule_for_season(client, int(season)),
                ttl_s=300,
            )
        if int(season) == int(now_utc.year):
            drivers = await cache.get_or_set(
                "ergast:driver_standings:current",
                lambda: ergast_driver_standings(client),
                ttl_s=300,
            )
            constructors = await cache.get_or_set(
                "ergast:constructor_standings:current",
                lambda: ergast_constructor_standings(client),
                ttl_s=300,
            )
        else:
            drivers = await cache.get_or_set(
                f"ergast:driver_standings:{int(season)}",
                lambda: ergast_driver_standings_for_season(client, int(season)),
                ttl_s=300,
            )
            constructors = await cache.get_or_set(
                f"ergast:constructor_standings:{int(season)}",
                lambda: ergast_constructor_standings_for_season(client, int(season)),
                ttl_s=300,
            )
        last5 = await cache.get_or_set("ergast:last5", lambda: ergast_last_n_results(client, 5), ttl_s=300)
        winner = await cache.get_or_set("ergast:last_winner", lambda: ergast_last_winner(client), ttl_s=300)
        air_c = await cache.get_or_set("weather:air", lambda: open_meteo_current_temp_c(client), ttl_s=120)
        news = await cache.get_or_set("news:rss", lambda: fetch_rss_first_title(client), ttl_s=300)
        circuit_assets = None
        circuit_source = None
        if include_circuit:
            if mysql_enabled() and not refresh_circuit:
                try:
                    conn = mysql_connect()
                    try:
                        circuit_assets = await asyncio.to_thread(circuit_assets_payload_from_db, conn, int(season))
                    finally:
                        conn.close()
                    circuit_source = "mysql"
                except Exception:
                    circuit_assets = None

            if circuit_assets is None and not refresh_circuit:
                circuit_assets = _load_circuit_assets_from_disk(season)
                if circuit_assets is not None:
                    circuit_source = "disk"

            cache_key = f"f1:circuits:{season}"
            if circuit_assets is None:
                circuit_assets = await cache.get_or_set(
                    cache_key,
                    lambda: fetch_f1_circuit_assets(
                        client,
                        season,
                        STATIC_DIR,
                        force_download=refresh_circuit,
                    ),
                    ttl_s=6 * 3600,
                )
                circuit_source = "web"

    pages = build_pages_payload(
        now_utc=now_utc,
        tz_name=tz_name,
        schedule_json=schedule,
        driver_standings_json=drivers,
        constructor_standings_json=constructors,
        last_n_results_json=last5,
        last_winner=winner,
        air_temp_c=air_c,
        news=news,
        circuit_assets=circuit_assets,
    )
    pages["sources"] = {
        "mysql_enabled": mysql_enabled(),
        "schedule": schedule_source,
        "circuit": circuit_source,
    }
    return pages


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/api/v1/epd/frame.bin")
async def epd_frame_bin(
    png_url: str = Query(..., description="PNG URL (or any image URL Pillow can open)"),
    w: int = Query(400, ge=1, le=1200),
    h: int = Query(300, ge=1, le=1200),
    dither: bool = Query(False),
) -> Response:
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        frame = await build_epd_frame(client, png_url=png_url, w=w, h=h, dither=dither)
    expected = ((frame.w + 7) >> 3) * frame.h
    if len(frame.bin_1bpp_black1) != expected:
        raise HTTPException(status_code=500, detail="frame size mismatch")
    return Response(content=frame.bin_1bpp_black1, media_type="application/octet-stream")


@app.get("/api/v1/epd/frame.png")
async def epd_frame_png(
    png_url: str = Query(..., description="PNG URL (or any image URL Pillow can open)"),
    w: int = Query(400, ge=1, le=1200),
    h: int = Query(300, ge=1, le=1200),
    dither: bool = Query(False),
) -> Response:
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        frame = await build_epd_frame(client, png_url=png_url, w=w, h=h, dither=dither)
    return Response(content=frame.preview_png, media_type="image/png")


@app.get("/api/v1/telemetry/laps/available")
async def telemetry_laps_available() -> dict:
    if not mysql_enabled():
        return {"ok": False, "error": "mysql disabled", "items": []}
    conn = mysql_connect()
    try:
        def _q() -> list[dict]:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      driver_number,
                      MAX(session_key) AS latest_session_key,
                      COUNT(*) AS row_count
                    FROM openf1_laps
                    GROUP BY driver_number
                    ORDER BY driver_number ASC
                    """
                )
                return cur.fetchall() or []

        items = await asyncio.to_thread(_q)
    except Exception as e:
        return {"ok": False, "error": str(e), "items": []}
    finally:
        conn.close()
    out = []
    for row in items:
        if not isinstance(row, dict):
            continue
        dn = row.get("driver_number")
        if dn is None:
            continue
        out.append(
            {
                "driver_number": int(dn),
                "latest_session_key": int(row["latest_session_key"]) if row.get("latest_session_key") is not None else None,
                "row_count": int(row["row_count"]) if row.get("row_count") is not None else 0,
            }
        )
    return {"ok": True, "items": out}


@app.get("/api/v1/telemetry/laps")
async def telemetry_laps(
    driver_number: int = Query(..., ge=1),
    session_key: int | None = Query(None, ge=1),
) -> dict:
    if not mysql_enabled():
        raise HTTPException(status_code=400, detail="mysql disabled")
    conn = mysql_connect()
    try:
        def _q() -> tuple[int | None, list[dict]]:
            with conn.cursor() as cur:
                sk = session_key
                if sk is None:
                    cur.execute(
                        """
                        SELECT MAX(session_key) AS sk
                        FROM openf1_laps
                        WHERE driver_number=%s AND session_key IS NOT NULL
                        """,
                        (int(driver_number),),
                    )
                    r = cur.fetchone() or {}
                    sk = r.get("sk")
                    sk = int(sk) if sk is not None else None
                if sk is None:
                    return (None, [])

                cur.execute(
                    """
                    SELECT
                      lap_number,
                      date_start_utc,
                      lap_duration,
                      duration_sector_1,
                      duration_sector_2,
                      duration_sector_3,
                      i1_speed,
                      i2_speed,
                      st_speed,
                      is_pit_out_lap
                    FROM openf1_laps
                    WHERE driver_number=%s AND session_key=%s
                    ORDER BY lap_number ASC
                    """,
                    (int(driver_number), int(sk)),
                )
                return (int(sk), cur.fetchall() or [])

        sk, rows = await asyncio.to_thread(_q)
    finally:
        conn.close()

    laps = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        ln = row.get("lap_number")
        if ln is None:
            continue
        laps.append(
            {
                "lap_number": int(ln),
                "date_start_utc": row.get("date_start_utc").isoformat() if row.get("date_start_utc") else None,
                "lap_duration": float(row["lap_duration"]) if row.get("lap_duration") is not None else None,
                "duration_sector_1": float(row["duration_sector_1"]) if row.get("duration_sector_1") is not None else None,
                "duration_sector_2": float(row["duration_sector_2"]) if row.get("duration_sector_2") is not None else None,
                "duration_sector_3": float(row["duration_sector_3"]) if row.get("duration_sector_3") is not None else None,
                "i1_speed": int(row["i1_speed"]) if row.get("i1_speed") is not None else None,
                "i2_speed": int(row["i2_speed"]) if row.get("i2_speed") is not None else None,
                "st_speed": int(row["st_speed"]) if row.get("st_speed") is not None else None,
                "is_pit_out_lap": bool(row["is_pit_out_lap"]) if row.get("is_pit_out_lap") is not None else None,
            }
        )

    return {"ok": True, "driver_number": int(driver_number), "session_key": sk, "laps": laps}


@app.get("/api/v1/telemetry/lap_controls")
async def telemetry_lap_controls(
    driver_number: int = Query(..., ge=1),
    session_key: int | None = Query(None, ge=1),
) -> dict:
    if not mysql_enabled():
        raise HTTPException(status_code=400, detail="mysql disabled")
    conn = mysql_connect()
    try:
        def _q() -> tuple[int | None, list[dict], list[dict]]:
            with conn.cursor() as cur:
                sk = session_key
                if sk is None:
                    cur.execute(
                        """
                        SELECT MAX(session_key) AS sk
                        FROM openf1_laps
                        WHERE driver_number=%s AND session_key IS NOT NULL
                        """,
                        (int(driver_number),),
                    )
                    r = cur.fetchone() or {}
                    sk = r.get("sk")
                    sk = int(sk) if sk is not None else None
                if sk is None:
                    return (None, [], [])

                cur.execute(
                    """
                    SELECT
                      lap_number,
                      date_start_utc,
                      lap_duration
                    FROM openf1_laps
                    WHERE driver_number=%s AND session_key=%s
                    ORDER BY lap_number ASC
                    """,
                    (int(driver_number), int(sk)),
                )
                laps_rows = cur.fetchall() or []
                if not laps_rows:
                    return (int(sk), [], [])

                start0 = laps_rows[0].get("date_start_utc")
                end_last = None
                for row in laps_rows:
                    ds = row.get("date_start_utc")
                    dur = row.get("lap_duration")
                    if ds is None or dur is None:
                        continue
                    try:
                        cand = ds + timedelta(seconds=float(dur))
                    except Exception:
                        continue
                    if end_last is None or cand > end_last:
                        end_last = cand
                if start0 is None or end_last is None:
                    return (int(sk), laps_rows, [])

                cur.execute(
                    """
                    SELECT
                      date_utc,
                      throttle,
                      brake
                    FROM openf1_car_data
                    WHERE driver_number=%s AND session_key=%s AND date_utc >= %s AND date_utc <= %s
                    ORDER BY date_utc ASC
                    """,
                    (int(driver_number), int(sk), start0, end_last),
                )
                car_rows = cur.fetchall() or []
                return (int(sk), laps_rows, car_rows)

        sk, laps_rows, car_rows = await asyncio.to_thread(_q)
    finally:
        conn.close()

    if sk is None or not laps_rows:
        return {"ok": True, "driver_number": int(driver_number), "session_key": sk, "items": []}

    laps = []
    for row in laps_rows:
        if not isinstance(row, dict):
            continue
        ln = row.get("lap_number")
        ds = row.get("date_start_utc")
        dur = row.get("lap_duration")
        if ln is None or ds is None or dur is None:
            continue
        try:
            end = ds + timedelta(seconds=float(dur))
        except Exception:
            continue
        laps.append({"lap_number": int(ln), "start": ds, "end": end})

    items = []
    i = 0
    n = len(car_rows)
    for lap in laps:
        start = lap["start"]
        end = lap["end"]
        while i < n and car_rows[i].get("date_utc") is not None and car_rows[i]["date_utc"] < start:
            i += 1
        j = i
        sum_th = 0.0
        cnt_th = 0
        sum_br = 0.0
        cnt_br = 0
        while j < n:
            dt = car_rows[j].get("date_utc")
            if dt is None or dt > end:
                break
            th = car_rows[j].get("throttle")
            br = car_rows[j].get("brake")
            if th is not None:
                try:
                    sum_th += float(th)
                    cnt_th += 1
                except Exception:
                    pass
            if br is not None:
                try:
                    sum_br += float(br)
                    cnt_br += 1
                except Exception:
                    pass
            j += 1

        th_avg = (sum_th / cnt_th) if cnt_th else None
        br_avg = (sum_br / cnt_br) if cnt_br else None
        items.append(
            {
                "lap_number": lap["lap_number"],
                "date_start_utc": start.isoformat() if start else None,
                "throttle_avg": round(th_avg, 2) if th_avg is not None else None,
                "brake_avg": round(br_avg, 2) if br_avg is not None else None,
            }
        )

    return {"ok": True, "driver_number": int(driver_number), "session_key": int(sk), "items": items}


@app.get("/api/v1/telemetry/lap_trace")
async def telemetry_lap_trace(
    driver_number: int = Query(..., ge=1),
    session_key: int | None = Query(None, ge=1),
    lap_number: int = Query(..., ge=1),
    max_points: int = Query(600, ge=50, le=5000),
) -> dict:
    if not mysql_enabled():
        raise HTTPException(status_code=400, detail="mysql disabled")
    conn = mysql_connect()
    try:
        def _q() -> tuple[int | None, datetime | None, float | None, list[dict]]:
            with conn.cursor() as cur:
                sk = session_key
                if sk is None:
                    cur.execute(
                        """
                        SELECT MAX(session_key) AS sk
                        FROM openf1_laps
                        WHERE driver_number=%s AND session_key IS NOT NULL
                        """,
                        (int(driver_number),),
                    )
                    r = cur.fetchone() or {}
                    sk = r.get("sk")
                    sk = int(sk) if sk is not None else None
                if sk is None:
                    return (None, None, None, [])

                cur.execute(
                    """
                    SELECT date_start_utc, lap_duration
                    FROM openf1_laps
                    WHERE driver_number=%s AND session_key=%s AND lap_number=%s
                    ORDER BY date_start_utc ASC
                    LIMIT 1
                    """,
                    (int(driver_number), int(sk), int(lap_number)),
                )
                r = cur.fetchone() or {}
                start = r.get("date_start_utc")
                dur = r.get("lap_duration")
                if start is None or dur is None:
                    return (int(sk), None, None, [])
                try:
                    dur_s = float(dur)
                except Exception:
                    return (int(sk), start, None, [])
                end = start + timedelta(seconds=dur_s)

                cur.execute(
                    """
                    SELECT date_utc, throttle, brake
                    FROM openf1_car_data
                    WHERE driver_number=%s AND session_key=%s AND date_utc >= %s AND date_utc <= %s
                    ORDER BY date_utc ASC
                    """,
                    (int(driver_number), int(sk), start, end),
                )
                rows = cur.fetchall() or []
                return (int(sk), start, dur_s, rows)

        sk, start, dur_s, rows = await asyncio.to_thread(_q)
    finally:
        conn.close()

    if sk is None or start is None or dur_s is None:
        return {
            "ok": True,
            "driver_number": int(driver_number),
            "session_key": sk,
            "lap_number": int(lap_number),
            "date_start_utc": start.isoformat() if start else None,
            "duration_s": dur_s,
            "points": [],
        }

    points = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dt = row.get("date_utc")
        if dt is None:
            continue
        t_s = (dt - start).total_seconds()
        th = row.get("throttle")
        br = row.get("brake")
        points.append(
            {
                "t_s": round(float(t_s), 3),
                "throttle": float(th) if th is not None else None,
                "brake": float(br) if br is not None else None,
            }
        )

    if len(points) > int(max_points):
        step = max(1, len(points) // int(max_points))
        points = points[::step]

    return {
        "ok": True,
        "driver_number": int(driver_number),
        "session_key": int(sk),
        "lap_number": int(lap_number),
        "date_start_utc": start.isoformat(),
        "duration_s": round(float(dur_s), 3),
        "points": points,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    async with ws_clients_lock:
        ws_clients.add(ws)
    try:
        await ws.send_text("HELLO")
        while True:
            msg = await ws.receive_text()
            await ws.send_text(msg)
    except WebSocketDisconnect:
        pass
    finally:
        async with ws_clients_lock:
            ws_clients.discard(ws)


@app.websocket("/ws/openf1")
async def ws_openf1(ws: WebSocket):
    await ws.accept()
    await openf1.start()
    await openf1.register_ws(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "source": "openf1", "status": openf1.status()}, ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await openf1.unregister_ws(ws)


@app.websocket("/ws/openf1/raw")
async def ws_openf1_raw(ws: WebSocket):
    await ws.accept()
    await openf1.start()
    await openf1.register_ws_raw(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "source": "openf1", "status": openf1.status()}, ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await openf1.unregister_ws(ws)


@app.get("/api/v1/openf1/status")
async def openf1_status() -> dict:
    return openf1.status()


@app.post("/api/v1/openf1/ingest")
async def openf1_ingest(
    data: object = Body(...),
    token: str | None = Query(default=None),
) -> dict:
    if not openf1.enabled:
        raise HTTPException(
            status_code=400,
            detail="openf1 is disabled (set OPENF1_MODE=mock or OPENF1_ENABLED=1 and restart backend process)",
        )
    if not openf1.verify_ingest_token(token):
        raise HTTPException(status_code=401, detail="invalid ingest token")
    await openf1.start()

    topic = "mock"
    payload: object = data
    if isinstance(data, dict):
        if isinstance(data.get("topic"), str):
            topic = data["topic"]
        if "payload" in data:
            payload = data.get("payload")
    ok = await openf1.publish(topic=topic, payload=payload, source="mock")
    if not ok:
        raise HTTPException(status_code=500, detail="publish failed")
    return {"ok": True}


@app.websocket("/ws/openf1/ingest")
async def ws_openf1_ingest(ws: WebSocket):
    if not openf1.enabled:
        await ws.close(code=1008)
        return
    token = ws.query_params.get("token")
    if not openf1.verify_ingest_token(token):
        await ws.close(code=1008)
        return
    await openf1.start()
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                data = {"payload": raw}
            topic = "mock"
            payload: object = data
            if isinstance(data, dict):
                if isinstance(data.get("topic"), str):
                    topic = data["topic"]
                if "payload" in data:
                    payload = data.get("payload")
            await openf1.publish(topic=topic, payload=payload, source="mock")
    except WebSocketDisconnect:
        pass


@app.get("/api/v1/news/ws/status")
async def news_ws_status() -> dict:
    return news_ws.status()


@app.websocket("/ws/news")
async def ws_news(ws: WebSocket):
    if not news_ws.enabled:
        await ws.close(code=1008)
        return
    await news_ws.start()
    await ws.accept()
    await news_ws.register_ws(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "source": "news", "status": news_ws.status()}, ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await news_ws.unregister_ws(ws)


@app.post("/api/v1/news/ws/ingest")
async def news_ws_ingest(
    title: str = Form(..., min_length=1, max_length=200),
    image: UploadFile | None = File(default=None),
    token: str | None = Query(default=None),
) -> dict:
    if not news_ws.enabled:
        raise HTTPException(
            status_code=400,
            detail="news ws is disabled (set NEWS_WS_ENABLED=1 or NEWS_INGEST_TOKEN and restart backend process)",
        )
    if not news_ws.verify_ingest_token(token):
        raise HTTPException(status_code=401, detail="invalid ingest token")
    await news_ws.start()
    ok = await news_ws.publish_breaking_from_upload(title=title, image=image)
    if not ok:
        raise HTTPException(status_code=500, detail="publish failed")
    return {"ok": True}


@app.post("/api/v1/news/meme/ws/ingest")
async def news_meme_ws_ingest(
    title: str = Form(..., min_length=1, max_length=200),
    image: UploadFile | None = File(default=None),
    audio: UploadFile | None = File(default=None),
    token: str | None = Query(default=None),
) -> dict:
    if not news_ws.enabled:
        raise HTTPException(
            status_code=400,
            detail="news ws is disabled (set NEWS_WS_ENABLED=1 or NEWS_INGEST_TOKEN and restart backend process)",
        )
    if not news_ws.verify_ingest_token(token):
        raise HTTPException(status_code=401, detail="invalid ingest token")
    await news_ws.start()
    ok = await news_ws.publish_meme_from_upload(title=title, image=image, audio=audio)
    if not ok:
        raise HTTPException(status_code=500, detail="publish failed")
    return {"ok": True}


@app.post("/api/v1/news/ingest")
async def news_ingest_json(
    data: object = Body(...),
    token: str | None = Query(default=None),
) -> dict:
    if not news_ws.enabled:
        raise HTTPException(
            status_code=400,
            detail="news ws is disabled (set NEWS_WS_ENABLED=1 or NEWS_INGEST_TOKEN and restart backend process)",
        )
    if not news_ws.verify_ingest_token(token):
        raise HTTPException(status_code=401, detail="invalid ingest token")
    await news_ws.start()

    topic = "v1/breaking"
    payload: object = data
    if isinstance(data, dict):
        if isinstance(data.get("topic"), str) and data.get("topic"):
            topic = data["topic"]
        if "payload" in data:
            payload = data.get("payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        raise HTTPException(status_code=400, detail="missing title")
    date_utc = payload.get("date")
    if not isinstance(date_utc, str) or not date_utc.strip():
        date_utc = datetime.now(timezone.utc).isoformat()

    image_obj = payload.get("image")
    image_bytes = None
    image_mime = None
    image_url = None
    if isinstance(image_obj, dict):
        url = image_obj.get("url")
        if isinstance(url, str) and url.strip():
            image_url = url.strip()
        enc = image_obj.get("encoding")
        data_b64 = image_obj.get("data")
        image_mime = image_obj.get("mime")
        if image_url is None and enc == "base64" and isinstance(data_b64, str) and data_b64:
            try:
                image_bytes = base64.b64decode(data_b64, validate=True)
            except Exception:
                raise HTTPException(status_code=400, detail="invalid image base64")

    if topic == "v1/breaking":
        ok = await news_ws.publish_breaking(
            date_utc=date_utc,
            title=title.strip(),
            image_bytes=image_bytes,
            image_mime=image_mime if isinstance(image_mime, str) else None,
            image_url=image_url,
        )
    elif topic == "v1/meme":
        audio_obj = payload.get("audio")
        audio_bytes = None
        audio_mime = None
        audio_url = None
        if isinstance(audio_obj, dict):
            url = audio_obj.get("url")
            if isinstance(url, str) and url.strip():
                audio_url = url.strip()
            enc = audio_obj.get("encoding")
            data_b64 = audio_obj.get("data")
            audio_mime = audio_obj.get("mime")
            if audio_url is None and enc == "base64" and isinstance(data_b64, str) and data_b64:
                try:
                    audio_bytes = base64.b64decode(data_b64, validate=True)
                except Exception:
                    raise HTTPException(status_code=400, detail="invalid audio base64")
        ok = await news_ws.publish_meme(
            date_utc=date_utc,
            title=title.strip(),
            image_bytes=image_bytes,
            image_mime=image_mime if isinstance(image_mime, str) else None,
            audio_bytes=audio_bytes,
            audio_mime=audio_mime if isinstance(audio_mime, str) else None,
            image_url=image_url,
            audio_url=audio_url,
        )
    else:
        raise HTTPException(status_code=400, detail="unsupported topic")
    if not ok:
        raise HTTPException(status_code=500, detail="publish failed")
    return {"ok": True}

@app.get("/api/v1/ws/status")
async def ws_status() -> dict:
    async with ws_clients_lock:
        count = len(ws_clients)
    return {"ok": True, "clients": count}


@app.get("/api/v1/ws/broadcast")
@app.post("/api/v1/ws/broadcast")
async def ws_broadcast(text: str = Query(min_length=1, max_length=512)) -> dict:
    async with ws_clients_lock:
        clients = list(ws_clients)
    sent = 0
    for c in clients:
        try:
            await c.send_text(text)
            sent += 1
        except Exception:
            async with ws_clients_lock:
                ws_clients.discard(c)
    return {"ok": True, "sent": sent}


@app.post("/api/v1/device/ws/send")
async def device_ws_send(
    text: str = Query(min_length=1, max_length=512),
    ws_url: str = Query(default=DEFAULT_DEVICE_WS_URL),
    wait_echo: bool = Query(default=True),
) -> dict:
    try:
        import websockets
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"websockets import failed: {e}")

    echo = None
    async with websockets.connect(ws_url, ping_interval=None, close_timeout=1) as ws:
        await ws.send(text)
        if wait_echo:
            try:
                echo = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except Exception:
                echo = None
    return {"ok": True, "ws_url": ws_url, "sent": text, "echo": echo}


@app.get("/api/v1/pages")
async def pages(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    return await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)


@app.get("/api/v1/pages/race-day")
async def page_race_day(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    data = await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)
    return {
        "generated_at_utc": data.get("generated_at_utc"),
        "tz": data.get("tz"),
        "race_day": data.get("race_day"),
    }


@app.get("/api/v1/pages/off-week")
async def page_off_week(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    data = await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)
    return {
        "generated_at_utc": data.get("generated_at_utc"),
        "tz": data.get("tz"),
        "off_week": data.get("off_week"),
    }


@app.get("/api/v1/ui/pages")
async def ui_pages(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    data = await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)
    return build_ui_pages_payload(data)


@app.get("/api/v1/ui/pages/race-day")
async def ui_page_race_day(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    data = await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)
    ui = build_ui_pages_payload(data)
    return {
        "generated_at_utc": ui.get("generated_at_utc"),
        "tz": ui.get("tz"),
        "format": ui.get("format"),
        "race_day": (ui.get("pages") or {}).get("race_day"),
    }


@app.get("/api/v1/ui/pages/off-week")
async def ui_page_off_week(
    tz: str = Query(default="Asia/Shanghai"),
    include_circuit: bool = Query(default=True),
    season: int = Query(default=2026, ge=2020, le=2100),
    refresh_circuit: bool = Query(default=False),
) -> dict:
    data = await _build_pages(tz, include_circuit=include_circuit, season=season, refresh_circuit=refresh_circuit)
    ui = build_ui_pages_payload(data)
    return {
        "generated_at_utc": ui.get("generated_at_utc"),
        "tz": ui.get("tz"),
        "format": ui.get("format"),
        "off_week": (ui.get("pages") or {}).get("off_week"),
    }


@app.get("/api/v1/news/breaking")
async def news_breaking() -> dict:
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        item = await cache.get_or_set("news:rss:breaking", lambda: fetch_f1_breaking_rss(client), ttl_s=20)
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "rss-f1-official",
        "breaking": item,
    }


@app.get("/api/v1/f1/sessions")
async def f1_sessions(
    tz: str = Query(default="Asia/Shanghai"),
    season: int = Query(default=2026, ge=2020, le=2100),
    round: int | None = Query(default=None, ge=1, le=30),
    session: str = Query(default="auto"),
    q: int | None = Query(default=None, ge=1, le=3),
    limit: int = Query(default=13, ge=1, le=30),
) -> dict:
    now_utc = datetime.now(timezone.utc)
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        schedule = None
        if mysql_enabled():
            try:
                conn = mysql_connect()
                try:
                    schedule = await asyncio.to_thread(schedule_json_from_db, conn, int(season))
                finally:
                    conn.close()
            except Exception:
                schedule = None
        if schedule is None:
            schedule = await cache.get_or_set(
                f"ergast:schedule:{season}",
                lambda: ergast_schedule_for_season(client, season),
                ttl_s=300,
            )
        return await build_sessions_payload(
            client=client,
            now_utc=now_utc,
            tz_name=tz,
            schedule_json=schedule,
            season=season,
            round_override=round,
            session=session,
            q=q,
            limit=limit,
        )


@app.get("/api/v1/f1/sessions/current")
async def f1_sessions_current(
    tz: str = Query(default="Asia/Shanghai"),
    season: int = Query(default=2026, ge=2020, le=2100),
    round: int | None = Query(default=None, ge=1, le=30),
    q: int | None = Query(default=None, ge=1, le=3),
    limit: int = Query(default=13, ge=1, le=30),
) -> dict:
    now_utc = datetime.now(timezone.utc)
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        schedule = None
        if mysql_enabled():
            try:
                conn = mysql_connect()
                try:
                    schedule = await asyncio.to_thread(schedule_json_from_db, conn, int(season))
                finally:
                    conn.close()
            except Exception:
                schedule = None
        if schedule is None:
            schedule = await cache.get_or_set(
                f"ergast:schedule:{season}",
                lambda: ergast_schedule_for_season(client, season),
                ttl_s=300,
            )
        data = await build_sessions_payload(
            client=client,
            now_utc=now_utc,
            tz_name=tz,
            schedule_json=schedule,
            season=season,
            round_override=round,
            session="auto",
            q=q,
            limit=limit,
        )
    return {
        **data,
        "request_mode": "auto_by_time",
    }


@app.get("/api/v1/f1/sessions/{season}/{round}/{session_name}.json")
@app.get("/api/v1/f1/sessions/{season}/{round}/{session_name}")
async def f1_sessions_compat(
    season: int,
    round: int,
    session_name: str,
    tz: str = Query(default="Asia/Shanghai"),
    q: int | None = Query(default=None, ge=1, le=3),
    limit: int = Query(default=13, ge=1, le=30),
) -> dict:
    session_name = (session_name or "").strip()
    if session_name.lower().endswith(".json"):
        session_name = session_name[: -len(".json")]
    now_utc = datetime.now(timezone.utc)
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        schedule = None
        if mysql_enabled():
            try:
                conn = mysql_connect()
                try:
                    schedule = await asyncio.to_thread(schedule_json_from_db, conn, int(season))
                finally:
                    conn.close()
            except Exception:
                schedule = None
        if schedule is None:
            schedule = await cache.get_or_set(
                f"ergast:schedule:{season}",
                lambda: ergast_schedule_for_season(client, season),
                ttl_s=300,
            )
        return await build_sessions_payload(
            client=client,
            now_utc=now_utc,
            tz_name=tz,
            schedule_json=schedule,
            season=season,
            round_override=round,
            session=session_name,
            q=q,
            limit=limit,
        )
