import argparse
import io
import math
from pathlib import Path


def _cover_resize(img, target_w: int, target_h: int):
    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        return img.resize((target_w, target_h))

    scale = max(target_w / src_w, target_h / src_h)
    new_w = max(1, int(math.ceil(src_w * scale)))
    new_h = max(1, int(math.ceil(src_h * scale)))
    img = img.resize((new_w, new_h))

    left = max(0, (new_w - target_w) // 2)
    top = max(0, (new_h - target_h) // 2)
    right = left + target_w
    bottom = top + target_h
    return img.crop((left, top, right, bottom))


def _contain_resize(img, target_w: int, target_h: int, bg_rgba: tuple[int, int, int, int]):
    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        return img.resize((target_w, target_h))

    scale = min(target_w / src_w, target_h / src_h)
    new_w = max(1, int(math.floor(src_w * scale)))
    new_h = max(1, int(math.floor(src_h * scale)))
    img = img.resize((new_w, new_h))

    from PIL import Image
    canvas = Image.new("RGBA", (target_w, target_h), bg_rgba)
    left = max(0, (target_w - new_w) // 2)
    top = max(0, (target_h - new_h) // 2)
    canvas.paste(img, (left, top), img)
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--w", type=int, required=True)
    ap.add_argument("--h", type=int, required=True)
    ap.add_argument("--render_w", type=int, default=1200)
    ap.add_argument("--mode", choices=["contain", "cover"], default="contain")
    ap.add_argument("--color", choices=["rgb", "gray", "mono"], default="mono")
    ap.add_argument("--dither", choices=["none", "floyd"], default="floyd")
    args = ap.parse_args()

    from PIL import Image
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM

    inp = Path(args.inp)
    out = Path(args.out)
    drawing = svg2rlg(str(inp))
    if drawing is None:
        raise SystemExit(f"failed to parse svg: {inp}")
    if args.render_w > 0 and drawing.width and drawing.width > 0:
        scale = args.render_w / float(drawing.width)
        drawing.width *= scale
        drawing.height *= scale
        drawing.scale(scale, scale)
    png_bytes = renderPM.drawToString(drawing, fmt="PNG")

    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    if args.mode == "cover":
        img = _cover_resize(img, args.w, args.h)
    else:
        img = _contain_resize(img, args.w, args.h, (255, 255, 255, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.color == "gray":
        img_rgb = img.convert("L").convert("RGB")
    elif args.color == "mono":
        dither = Image.Dither.NONE if args.dither == "none" else Image.Dither.FLOYDSTEINBERG
        img_rgb = img.convert("L").convert("1", dither=dither).convert("RGB")
    else:
        img_rgb = img.convert("RGB")
    img_rgb.save(out, format="PNG", optimize=False)
    if "!" in out.name:
        alt = out.with_name(out.name.replace("!", "_"))
        img_rgb.save(alt, format="PNG", optimize=False)
    if out.name != "f1_boot.png":
        alt2 = out.with_name("f1_boot.png")
        img_rgb.save(alt2, format="PNG", optimize=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
