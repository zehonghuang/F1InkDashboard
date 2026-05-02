import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("ZECTRIX_BACKEND_URL", "http://127.0.0.1:8008"))
    ap.add_argument("--token", default=os.getenv("OPENF1_INGEST_TOKEN"))
    ap.add_argument("--file", default=str(Path(__file__).resolve().parent.parent / "mock" / "openf1_mock_packets.jsonl"))
    ap.add_argument("--interval", type=float, default=0.2)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--loop", action="store_true")
    args = ap.parse_args()

    file_path = Path(args.file).resolve()
    if not file_path.exists():
        raise SystemExit(f"file not found: {file_path}")

    base_url = args.base_url.rstrip("/")
    url = f"{base_url}/api/v1/openf1/ingest"
    params = {}
    if args.token:
        params["token"] = args.token

    timeout = httpx.Timeout(10.0, connect=10.0)
    lines = [ln.strip() for ln in file_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not lines:
        raise SystemExit(f"mock file is empty: {file_path}")
    if not args.loop and args.repeat < 1:
        raise SystemExit("--repeat must be >= 1 (or use --loop)")

    async with httpx.AsyncClient(timeout=timeout) as client:
        seq = 0
        rounds = 0
        while True:
            rounds += 1
            for idx, line in enumerate(lines, start=1):
                seq += 1
                payload = json.loads(line)
                r = await client.post(url, params=params, json=payload)
                try:
                    r.raise_for_status()
                except Exception as e:
                    raise SystemExit(
                        f"push failed at line {idx} (event #{seq}, round #{rounds}): {e}\n{r.text}"
                    ) from e
                if args.interval > 0:
                    await asyncio.sleep(args.interval)
            if not args.loop and rounds >= args.repeat:
                break
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
