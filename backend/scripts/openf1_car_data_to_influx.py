import argparse
import os
import time
from datetime import datetime, timezone
import sys

import httpx


def _parse_rfc3339_to_ns(s: str) -> int:
    s = (s or "").strip()
    if not s:
        return 0
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1_000_000_000)


def _escape_tag(v: str) -> str:
    return (v or "").replace("\\", "\\\\").replace(",", "\\,").replace(" ", "\\ ").replace("=", "\\=")


def _escape_measurement(v: str) -> str:
    return (v or "").replace("\\", "\\\\").replace(",", "\\,").replace(" ", "\\ ")


def _line_protocol(measurement: str, tags: dict, fields: dict, ts_ns: int) -> str:
    m = _escape_measurement(measurement)
    t = ",".join([f"{k}={_escape_tag(str(v))}" for k, v in tags.items() if v is not None])
    f_parts = []
    for k, v in fields.items():
        if v is None:
            continue
        if isinstance(v, bool):
            vv = "true" if v else "false"
        elif isinstance(v, int):
            vv = f"{v}i"
        elif isinstance(v, float):
            vv = repr(v)
        else:
            continue
        f_parts.append(f"{k}={vv}")
    f_str = ",".join(f_parts)
    if not f_str:
        return ""
    if t:
        return f"{m},{t} {f_str} {ts_ns}"
    return f"{m} {f_str} {ts_ns}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--openf1-base", default=os.getenv("OPENF1_API_BASE", "https://api.openf1.org"))
    ap.add_argument("--driver-number", type=int, required=True)
    ap.add_argument("--session-key", default="latest")
    ap.add_argument("--meeting-key", default="latest")
    ap.add_argument("--influx-url", default=os.getenv("INFLUXDB_URL", "http://localhost:8086"))
    ap.add_argument("--influx-org", default=os.getenv("INFLUXDB_ORG", "toinc_F1"))
    ap.add_argument("--influx-bucket", default=os.getenv("INFLUXDB_BUCKET", "openf1"))
    ap.add_argument("--influx-token", default=os.getenv("INFLUXDB_TOKEN", "changeme"))
    ap.add_argument("--measurement", default="car_data")
    ap.add_argument("--poll-interval-s", type=float, default=2.0)
    ap.add_argument("--max-batch", type=int, default=256)
    ap.add_argument("--quiet", action="store_true", default=False)
    args = ap.parse_args()

    poll_interval_s = max(float(args.poll_interval_s), 2.0)
    openf1_base = (args.openf1_base or "").rstrip("/")
    influx_url = (args.influx_url or "").rstrip("/")

    last_ts_ns = 0
    last_poll = 0.0

    if not args.quiet:
        print(
            "openf1->influx started "
            f"driver={args.driver_number} session_key={args.session_key} meeting_key={args.meeting_key} "
            f"poll_interval_s={poll_interval_s} date_filter=disabled",
            flush=True,
        )

    with httpx.Client(timeout=20.0) as client:
        while True:
            now = time.time()
            wait = (last_poll + poll_interval_s) - now
            if wait > 0:
                time.sleep(wait)
            last_poll = time.time()

            params = {
                "driver_number": str(int(args.driver_number)),
                "session_key": str(args.session_key),
                "meeting_key": str(args.meeting_key),
            }

            try:
                r = client.get(f"{openf1_base}/v1/car_data", params=params)
                if r.status_code == 429:
                    if not args.quiet:
                        print("openf1 429 rate_limited; backing off", flush=True)
                    time.sleep(poll_interval_s)
                    continue
                r.raise_for_status()
            except Exception as e:
                if not args.quiet:
                    print(f"openf1 request failed: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
                time.sleep(poll_interval_s)
                continue

            rows = r.json()
            if not isinstance(rows, list) or not rows:
                if not args.quiet:
                    print("openf1 ok: 0 rows", flush=True)
                continue

            max_batch = max(1, int(args.max_batch))
            if len(rows) > max_batch:
                rows = rows[-max_batch:]

            lines = []
            skipped = 0
            new_max_ts_ns = last_ts_ns

            for it in rows:
                if not isinstance(it, dict):
                    continue
                dt = str(it.get("date") or "")
                ts_ns = _parse_rfc3339_to_ns(dt)
                if ts_ns <= 0:
                    continue
                if ts_ns <= last_ts_ns:
                    skipped += 1
                    continue
                if ts_ns > new_max_ts_ns:
                    new_max_ts_ns = ts_ns

                fields = {
                    "speed": int(it["speed"]) if it.get("speed") is not None else None,
                    "throttle": int(it["throttle"]) if it.get("throttle") is not None else None,
                    "brake": int(it["brake"]) if it.get("brake") is not None else None,
                    "rpm": int(it["rpm"]) if it.get("rpm") is not None else None,
                    "n_gear": int(it["n_gear"]) if it.get("n_gear") is not None else None,
                    "drs": int(it["drs"]) if it.get("drs") is not None else None,
                }
                tags = {
                    "driver_number": it.get("driver_number"),
                    "session_key": it.get("session_key"),
                    "meeting_key": it.get("meeting_key"),
                }
                lp = _line_protocol(args.measurement, tags=tags, fields=fields, ts_ns=ts_ns)
                if lp:
                    lines.append(lp)

            last_ts_ns = new_max_ts_ns
            if not lines:
                if not args.quiet:
                    print(
                        f"openf1 ok: {len(rows)} rows, 0 new points (skipped={skipped})",
                        flush=True,
                    )
                continue

            write_url = f"{influx_url}/api/v2/write"
            try:
                w = client.post(
                    write_url,
                    params={"org": args.influx_org, "bucket": args.influx_bucket, "precision": "ns"},
                    content=("\n".join(lines)).encode("utf-8"),
                    headers={
                        "Authorization": f"Token {args.influx_token}",
                        "Content-Type": "text/plain; charset=utf-8",
                    },
                )
                if w.status_code == 429:
                    if not args.quiet:
                        print("influx 429 rate_limited; backing off", flush=True)
                    time.sleep(poll_interval_s)
                    continue
                w.raise_for_status()
            except Exception as e:
                if not args.quiet:
                    print(f"influx write failed: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
                time.sleep(poll_interval_s)
                continue

            if not args.quiet:
                print(
                    f"openf1 ok: {len(rows)} rows -> influx wrote {len(lines)} points (skipped={skipped})",
                    flush=True,
                )


if __name__ == "__main__":
    raise SystemExit(main())
