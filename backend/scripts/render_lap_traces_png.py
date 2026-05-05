import argparse
import json
import os
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont


def _fmt_clock(seconds: float) -> str:
    if seconds is None:
        return ""
    if seconds < 0:
        seconds = 0.0
    m = int(seconds // 60)
    s = seconds - m * 60
    return f"{m}:{s:05.2f}"


def _slice_by_third(seq: list, part: str) -> list:
    if part not in ("1", "2", "3"):
        return seq
    n = len(seq)
    if n < 6:
        return seq
    b1 = n // 3
    b2 = (n * 2) // 3
    if part == "1":
        return seq[: max(b1, 1)]
    if part == "2":
        return seq[max(b1, 0) : max(b2, b1 + 1)]
    return seq[max(b2, 0) :]


def _draw_grid(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int) -> None:
    grid = (230, 230, 230)
    for i in range(0, 6):
        y = y0 + int((y1 - y0) * i / 5)
        draw.line([(x0, y), (x1, y)], fill=grid, width=1)
    for i in range(0, 6):
        x = x0 + int((x1 - x0) * i / 5)
        draw.line([(x, y0), (x, y1)], fill=grid, width=1)


def _polyline(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], color: tuple[int, int, int], width: int) -> None:
    if len(pts) < 2:
        return
    draw.line(pts, fill=color, width=width, joint="curve")


def _dashed_polyline(
    draw: ImageDraw.ImageDraw,
    pts: list[tuple[float, float]],
    color: tuple[int, int, int],
    width: int,
    dash_len: float = 10.0,
    gap_len: float = 7.0,
) -> None:
    if len(pts) < 2:
        return
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx = x1 - x0
        dy = y1 - y0
        seg_len = (dx * dx + dy * dy) ** 0.5
        if seg_len <= 0.001:
            continue
        ux = dx / seg_len
        uy = dy / seg_len
        pos = 0.0
        while pos < seg_len:
            a = pos
            b = min(seg_len, pos + dash_len)
            xa = x0 + ux * a
            ya = y0 + uy * a
            xb = x0 + ux * b
            yb = y0 + uy * b
            draw.line([(xa, ya), (xb, yb)], fill=color, width=width)
            pos += dash_len + gap_len


def render_one(
    *,
    driver_number: int,
    session_key: int | None,
    lap_number: int,
    duration_s: float,
    points: list[dict],
    out_path: Path,
    canvas_w: int = 1200,
    canvas_h: int = 420,
) -> None:
    w = int(canvas_w)
    h = int(canvas_h)
    pad = max(1, int(round(w * 22 / 1200)))
    top = max(1, int(round(h * 46 / 420)))
    bottom = max(1, int(round(h * 62 / 420)))
    left = max(1, int(round(w * 60 / 1200)))
    right = max(1, int(round(w * 18 / 1200)))

    img = Image.new("RGB", (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    title = f"Throttle / Brake Trace  Driver {driver_number}  Lap {lap_number}"
    draw.text((pad, 14), title, fill=(20, 20, 20), font=font)

    x0 = left
    y0 = top
    x1 = w - right
    y1 = h - bottom

    _draw_grid(draw, x0, y0, x1, y1)

    def sx(t: float) -> float:
        if duration_s <= 0.001:
            return float(x0)
        return x0 + (x1 - x0) * max(0.0, min(1.0, t / duration_s))

    def sy(v: float) -> float:
        v = max(0.0, min(100.0, v))
        return y1 - (y1 - y0) * (v / 100.0)

    throttle_pts = []
    brake_pts = []
    for p in points:
        t = p.get("t_s")
        th = p.get("throttle")
        br = p.get("brake")
        if t is None:
            continue
        try:
            tt = float(t)
        except Exception:
            continue
        if th is not None:
            try:
                throttle_pts.append((sx(tt), sy(float(th))))
            except Exception:
                pass
        if br is not None:
            try:
                brake_pts.append((sx(tt), sy(float(br))))
            except Exception:
                pass

    _polyline(draw, throttle_pts, (0, 0, 0), 2)
    _dashed_polyline(draw, brake_pts, (70, 70, 70), 2)

    for i in range(0, 6):
        v = i * 20
        y = int(sy(float(v)))
        draw.text((8, y - 6), str(v), fill=(60, 60, 60), font=font)

    for i in range(0, 6):
        t = duration_s * i / 5
        x = int(sx(t))
        draw.text((x - 20, y1 + 12), _fmt_clock(t), fill=(60, 60, 60), font=font)

    draw.text((w // 2 - 10, h - max(1, int(round(h * 26 / 420)))), "t (s)", fill=(60, 60, 60), font=font)

    legend_y = h - max(1, int(round(h * 44 / 420)))
    draw.line([(pad, legend_y), (pad + 34, legend_y)], fill=(0, 0, 0), width=2)
    draw.text((pad + 42, legend_y - 7), "Throttle", fill=(60, 60, 60), font=font)

    x2 = pad + max(1, int(round(w * 140 / 1200)))
    _dashed_polyline(draw, [(x2, legend_y), (x2 + 34, legend_y)], (70, 70, 70), 2, dash_len=7.0, gap_len=5.0)
    draw.text((x2 + 42, legend_y - 7), "Brake", fill=(60, 60, 60), font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-base", default=os.getenv("TOINC_F1_API_BASE", "http://127.0.0.1:8008"))
    ap.add_argument("--driver-number", type=int, required=True)
    ap.add_argument("--session-key", type=int, default=None)
    ap.add_argument("--lap-third", default="all", choices=["all", "1", "2", "3"])
    ap.add_argument("--max-points", type=int, default=900)
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args()

    api_base = str(args.api_base).rstrip("/")
    driver_number = int(args.driver_number)
    session_key = int(args.session_key) if args.session_key is not None else None
    out_dir = Path(args.out_dir) if args.out_dir else (Path(__file__).resolve().parents[1] / "static" / "charts")

    with httpx.Client(timeout=60.0) as client:
        def _get_laps(sk: int | None) -> dict:
            rr = client.get(
                f"{api_base}/api/v1/telemetry/laps",
                params={"driver_number": driver_number, **({"session_key": sk} if sk else {})},
            )
            rr.raise_for_status()
            jj = rr.json()
            if not jj.get("ok"):
                raise SystemExit(jj.get("error") or "backend error")
            return jj

        j = _get_laps(session_key)
        laps = j.get("laps") or []
        sk = j.get("session_key")
        sk = int(sk) if sk is not None else session_key
        if not laps and session_key is not None:
            j2 = _get_laps(None)
            laps2 = j2.get("laps") or []
            sk2 = j2.get("session_key")
            sk2 = int(sk2) if sk2 is not None else None
            if laps2:
                print(f"warning: session_key={session_key} has no laps for driver={driver_number}; fallback to latest session_key={sk2}")
                j = j2
                laps = laps2
                sk = sk2
        laps = _slice_by_third(laps, args.lap_third)
        if not laps:
            try:
                r3 = client.get(f"{api_base}/api/v1/telemetry/laps/available")
                r3.raise_for_status()
                a = r3.json()
                items = a.get("items") or []
                mine = [it for it in items if int(it.get("driver_number") or -1) == driver_number]
                if mine:
                    it = mine[0]
                    raise SystemExit(
                        f"no laps for driver={driver_number} session_key={session_key}; "
                        f"available latest_session_key={it.get('latest_session_key')} row_count={it.get('row_count')}"
                    )
            except Exception:
                pass
            raise SystemExit(f"no laps for driver={driver_number} session_key={session_key}")

        best_ln = None
        best_dur = None
        best_it = None
        for it in laps:
            if it.get("is_pit_out_lap") is True:
                continue
            ln = it.get("lap_number")
            dur = it.get("lap_duration")
            if ln is None or dur is None:
                continue
            try:
                ln_i = int(ln)
                dur_f = float(dur)
            except Exception:
                continue
            if dur_f <= 0.0:
                continue
            if best_dur is None or dur_f < best_dur or (dur_f == best_dur and ln_i < best_ln):
                best_ln = ln_i
                best_dur = dur_f
                best_it = it

        if best_ln is None:
            for it in laps:
                ln = it.get("lap_number")
                dur = it.get("lap_duration")
                if ln is None or dur is None:
                    continue
                try:
                    ln_i = int(ln)
                    dur_f = float(dur)
                except Exception:
                    continue
                if dur_f <= 0.0:
                    continue
                if best_dur is None or dur_f < best_dur or (dur_f == best_dur and ln_i < best_ln):
                    best_ln = ln_i
                    best_dur = dur_f
                    best_it = it

        if best_ln is None or best_dur is None:
            raise SystemExit(f"no valid lap_duration for driver={driver_number} session_key={sk}")

        rr = client.get(
            f"{api_base}/api/v1/telemetry/lap_trace",
            params={
                "driver_number": driver_number,
                **({"session_key": sk} if sk else {}),
                "lap_number": int(best_ln),
                "max_points": int(args.max_points),
            },
        )
        rr.raise_for_status()
        tj = rr.json()
        if not tj.get("ok"):
            raise SystemExit(tj.get("error") or "backend error")
        points = tj.get("points") or []
        duration_s = tj.get("duration_s") or best_dur or 0.0
        out_path = out_dir / f"driver_{driver_number}" / f"session_{sk or 'latest'}" / f"fastest_lap_{int(best_ln):03d}.png"
        render_one(
            driver_number=driver_number,
            session_key=sk,
            lap_number=int(best_ln),
            duration_s=float(duration_s),
            points=points,
            out_path=out_path,
        )
        meta = {
            "ok": True,
            "found": True,
            "driver_number": int(driver_number),
            "session_key": int(sk) if sk is not None else None,
            "lap_number": int(best_ln),
            "lap_duration_s": float(best_it.get("lap_duration")) if best_it and best_it.get("lap_duration") is not None else float(duration_s),
            "s1_s": float(best_it.get("duration_sector_1")) if best_it and best_it.get("duration_sector_1") is not None else None,
            "s2_s": float(best_it.get("duration_sector_2")) if best_it and best_it.get("duration_sector_2") is not None else None,
            "s3_s": float(best_it.get("duration_sector_3")) if best_it and best_it.get("duration_sector_3") is not None else None,
        }
        meta_path = out_path.with_suffix(".json")
        meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
