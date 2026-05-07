from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--w", type=int, required=True)
    ap.add_argument("--h", type=int, required=True)
    ap.add_argument("--dither", action="store_true")
    ap.add_argument("--preview", default="")
    args = ap.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    preview = Path(args.preview) if args.preview else None

    img = Image.open(src)
    img = _contain_resize(img, args.w, args.h)
    mono = _mono_1bit(img, dither=args.dither)
    packed = _pack_1bpp_black1(mono)

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(packed)

    if preview is not None:
        preview.parent.mkdir(parents=True, exist_ok=True)
        mono.convert("RGB").save(preview, format="PNG", optimize=False)


if __name__ == "__main__":
    main()

