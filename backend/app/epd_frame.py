from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Optional

import httpx
from PIL import Image


@dataclass(frozen=True)
class EpdFrame:
    w: int
    h: int
    bin_1bpp_black1: bytes
    preview_png: bytes


def _contain_resize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    img = img.convert("RGBA")
    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        return img.resize((target_w, target_h))

    scale = min(target_w / src_w, target_h / src_h)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    img = img.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    left = max(0, (target_w - new_w) // 2)
    top = max(0, (target_h - new_h) // 2)
    canvas.paste(img, (left, top), img)
    return canvas


def _mono_1bit(img: Image.Image, dither: bool) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(bg, img).convert("RGB")
    if dither:
        return img.convert("1")
    return img.convert("1", dither=Image.Dither.NONE)


def _pack_1bpp_black1(img_1bit: Image.Image) -> bytes:
    img = img_1bit.convert("1")
    w, h = img.size
    src = img.tobytes()
    row_bytes = (w + 7) >> 3
    out = bytearray(row_bytes * h)

    for y in range(h):
        for x in range(w):
            white = src[y * row_bytes + (x >> 3)] & (1 << (7 - (x & 7))) != 0
            if not white:
                out[y * row_bytes + (x >> 3)] |= 1 << (7 - (x & 7))

    return bytes(out)


async def build_epd_frame(
    client: httpx.AsyncClient,
    *,
    png_url: str,
    w: int,
    h: int,
    dither: bool,
) -> EpdFrame:
    r = await client.get(png_url, follow_redirects=True, timeout=15.0)
    r.raise_for_status()
    img = Image.open(BytesIO(r.content))
    img = _contain_resize(img, w, h)
    mono = _mono_1bit(img, dither=dither)

    preview = mono.convert("RGB")
    bio = BytesIO()
    preview.save(bio, format="PNG", optimize=False)
    preview_png = bio.getvalue()

    bin_1bpp_black1 = _pack_1bpp_black1(mono)
    return EpdFrame(w=w, h=h, bin_1bpp_black1=bin_1bpp_black1, preview_png=preview_png)

