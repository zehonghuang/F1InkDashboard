import argparse
import os
import shutil
import subprocess
import sys
import wave
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

def _mono_1bit_bayer4(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    rgb = Image.alpha_composite(bg, img).convert("RGB")
    g = rgb.convert("L")
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
    return out


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

def _pack_2bpp_gray(img: Image.Image) -> bytes:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    g = Image.alpha_composite(bg, img).convert("L")
    w, h = g.size
    src = g.load()
    row_bytes = (w + 3) >> 2
    out = bytearray(row_bytes * h)
    for y in range(h):
        for x in range(w):
            v = int(src[x, y])
            lvl = int(((255 - v) * 3 + 127) // 255)
            shift = 6 - 2 * (x & 3)
            out[y * row_bytes + (x >> 2)] |= (lvl & 0x03) << shift
    return bytes(out)


def _ensure_pcm16_wav(path: Path) -> None:
    with wave.open(str(path), "rb") as w:
        if w.getcomptype() != "NONE":
            raise SystemExit(f"unsupported wav compression: {w.getcomptype()}")
        if w.getsampwidth() != 2:
            raise SystemExit(f"wav must be PCM16 (sampwidth=2), got {w.getsampwidth()}")
        if w.getnchannels() not in (1, 2):
            raise SystemExit(f"wav channels must be 1 or 2, got {w.getnchannels()}")
        if w.getframerate() <= 0:
            raise SystemExit(f"invalid wav sample rate: {w.getframerate()}")


def _convert_to_wav_pcm16(src: Path, dst: Path, *, ac: int, ar: int) -> None:
    ffmpeg = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit(
            "ffmpeg not found. Install ffmpeg, set FFMPEG_PATH, or provide a PCM16 wav.\n"
            "Example:\n"
            f'  ffmpeg -i "{src}" -ac {ac} -ar {ar} -c:a pcm_s16le "{dst}"'
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-ac",
        str(ac),
        "-ar",
        str(ar),
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip()
        raise SystemExit(f"ffmpeg convert failed (code={r.returncode})\n{err}")



def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", help="path to image (png/jpg/etc)")
    ap.add_argument("--audio", help="path to audio (wav/mp3/etc)")
    ap.add_argument("--out-dir", default=str(Path(__file__).resolve().parent.parent / "out"))
    ap.add_argument("--w", type=int, default=384)
    ap.add_argument("--h", type=int, default=240)
    ap.add_argument("--dither", action="store_true")
    ap.add_argument("--gray2bpp", action="store_true", help="export 2bpp grayscale bin (4 levels), packed MSB-first")
    ap.add_argument("--bayer4", action="store_true", help="export 1bpp using Bayer 4x4 ordered dithering")
    ap.add_argument("--audio-ac", type=int, default=1)
    ap.add_argument("--audio-ar", type=int, default=16000)
    ap.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH"), help="path to ffmpeg executable (optional)")
    ap.add_argument("--prefix", default="meme")
    args = ap.parse_args()

    out_dir = Path(args.out_dir).expanduser().resolve()

    if args.image:
        img_path = Path(args.image).expanduser().resolve()
        if not img_path.exists():
            raise SystemExit(f"image not found: {img_path}")
        img = Image.open(img_path)
        img = _contain_resize(img, args.w, args.h)
        if args.gray2bpp:
            bin_gray = _pack_2bpp_gray(img)
            name = f"{args.prefix}_{args.w}x{args.h}_g2"
            (out_dir / f"{name}.bin").write_bytes(bin_gray)
            img.convert("RGB").save(out_dir / f"{name}_preview.png", format="PNG", optimize=False)
            sys.stdout.write(str(out_dir / f"{name}.bin") + "\n")
        else:
            if args.bayer4:
                mono = _mono_1bit_bayer4(img)
            else:
                mono = _mono_1bit(img, dither=args.dither)
            bin_1bpp = _pack_1bpp_black1(mono)

            name = f"{args.prefix}_{args.w}x{args.h}"
            if args.bayer4:
                name += "_b4"
            elif args.dither:
                name += "_fs"
            (out_dir / f"{name}.bin").write_bytes(bin_1bpp)
            mono.convert("RGB").save(out_dir / f"{name}_preview.png", format="PNG", optimize=False)
            sys.stdout.write(str(out_dir / f"{name}.bin") + "\n")

    if args.audio:
        audio_path = Path(args.audio).expanduser().resolve()
        if not audio_path.exists():
            raise SystemExit(f"audio not found: {audio_path}")
        dst = out_dir / f"{args.prefix}.wav"
        if audio_path.suffix.lower() == ".wav":
            _ensure_pcm16_wav(audio_path)
            shutil.copyfile(audio_path, dst)
        else:
            if args.ffmpeg:
                ffmpeg_path = Path(args.ffmpeg).expanduser().resolve()
                if not ffmpeg_path.exists():
                    raise SystemExit(f"ffmpeg not found: {ffmpeg_path}")
                os.environ["FFMPEG_PATH"] = str(ffmpeg_path)
            _convert_to_wav_pcm16(audio_path, dst, ac=args.audio_ac, ar=args.audio_ar)
            _ensure_pcm16_wav(dst)
        sys.stdout.write(str(dst) + "\n")

    if not args.image and not args.audio:
        raise SystemExit("nothing to do: set --image and/or --audio")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
