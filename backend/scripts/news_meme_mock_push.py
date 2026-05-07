import argparse
import asyncio
import json
import os
import mimetypes
from pathlib import Path

import httpx


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("TOINC_F1_BACKEND_URL") or os.getenv("ZECTRIX_BACKEND_URL", "http://127.0.0.1:8008"))
    ap.add_argument("--token", default=os.getenv("NEWS_INGEST_TOKEN"))
    ap.add_argument("--title", default="MEME TEST")
    ap.add_argument("--image", default=None, help="path to image (png/jpg)")
    ap.add_argument("--audio", default=None, help="path to audio (wav recommended)")
    args = ap.parse_args()

    base_url = args.base_url.rstrip("/")
    url = f"{base_url}/api/v1/news/meme/ws/ingest"
    params = {}
    if args.token:
        params["token"] = args.token

    timeout = httpx.Timeout(20.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        data = {"title": args.title}
        files: dict = {}
        if args.image:
            p = Path(args.image).expanduser().resolve()
            mime = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            files["image"] = (p.name, p.read_bytes(), mime)
        if args.audio:
            p = Path(args.audio).expanduser().resolve()
            mime = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            files["audio"] = (p.name, p.read_bytes(), mime)

        r = await client.post(url, params=params, data=data, files=files if files else None)
        try:
            r.raise_for_status()
        except Exception as e:
            raise SystemExit(f"push failed: {e}\n{r.text}") from e
        print(json.dumps(r.json(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
