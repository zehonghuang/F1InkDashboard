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
    async with httpx.AsyncClient(timeout=timeout) as client:
        for idx, line in enumerate(file_path.read_text(encoding="utf-8").splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            r = await client.post(url, params=params, json=payload)
            try:
                r.raise_for_status()
            except Exception as e:
                raise SystemExit(f"push failed at line {idx}: {e}\n{r.text}") from e
            if args.interval > 0:
                await asyncio.sleep(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
