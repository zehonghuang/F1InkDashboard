import argparse
import asyncio
import json
import os
import mimetypes
from pathlib import Path

import httpx
from PIL import Image


def _image_to_1bit_png_bayer4(data: bytes) -> bytes:
    from io import BytesIO

    img = Image.open(BytesIO(data))
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(bg, img).convert("RGB")

    g = img.convert("L")
    w, h = g.size
    src = g.load()
    out = Image.new("1", (w, h), 1)
    dst = out.load()
    b4 = (
        (0, 8, 2, 10),
        (12, 4, 14, 6),
        (3, 11, 1, 9),
        (15, 7, 13, 5),
    )
    for y in range(h):
        row = b4[y & 3]
        for x in range(w):
            v = int(src[x, y])
            t = (row[x & 3] + 0.5) * (255.0 / 16.0)
            dst[x, y] = 1 if v >= t else 0

    o = BytesIO()
    out.save(o, format="PNG", optimize=False)
    return o.getvalue()


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=os.getenv("TOINC_F1_BACKEND_URL") or os.getenv("ZECTRIX_BACKEND_URL", "http://127.0.0.1:8008"))
    ap.add_argument("--token", default=os.getenv("NEWS_INGEST_TOKEN"))
    ap.add_argument("--title", default="MEME TEST")
    ap.add_argument("--image", default=None, help="path to image (png/jpg)")
    ap.add_argument("--audio", default=None, help="path to audio (wav recommended)")
    ap.add_argument("--gray", action="store_true", help="convert image to 1-bit dithered PNG (Bayer4) before upload")
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
            raw = p.read_bytes()
            if args.gray:
                png = _image_to_1bit_png_bayer4(raw)
                files["image"] = (p.stem + ".png", png, "image/png")
            else:
                mime = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
                files["image"] = (p.name, raw, mime)
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
