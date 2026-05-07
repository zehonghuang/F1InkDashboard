import argparse
import io
from pathlib import Path


def _to_epd_png(src_bytes: bytes, w: int, h: int, contrast: float) -> bytes:
    from PIL import Image, ImageEnhance, ImageOps

    im = Image.open(io.BytesIO(src_bytes))
    im.load()

    if im.mode in ("RGBA", "LA") or ("transparency" in im.info):
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im.convert("RGBA")).convert("RGB")
    else:
        im = im.convert("RGB")

    im = im.convert("L")
    im = ImageOps.autocontrast(im, cutoff=2)
    im = im.resize((w, h), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(contrast)
    im = ImageOps.autocontrast(im, cutoff=1)
    im = im.convert("1")

    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--w", type=int, required=True)
    ap.add_argument("--h", type=int, required=True)
    ap.add_argument("--contrast", type=float, default=1.8)
    args = ap.parse_args()

    inp = Path(args.inp)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    src = inp.read_bytes()
    dst = _to_epd_png(src, args.w, args.h, args.contrast)
    out.write_bytes(dst)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

