from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="convert_circuits_raw_maps_to_png")
    p.add_argument("--season", type=int, default=2026)
    p.add_argument("--static-dir", type=str, default=None)
    p.add_argument("--force", action="store_true", default=False)
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    static_dir = (
        Path(args.static_dir).resolve()
        if args.static_dir
        else (Path(__file__).resolve().parent.parent / "static").resolve()
    )
    raw_dir = static_dir / "circuits" / str(int(args.season)) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted(raw_dir.glob("*_map.*")):
        if not src.is_file():
            continue
        if src.suffix.lower() == ".png":
            continue
        dst = src.with_suffix(".png")
        if dst.exists() and dst.stat().st_size > 0 and not bool(args.force):
            continue
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(src), str(dst)],
            check=True,
        )


if __name__ == "__main__":
    main()

