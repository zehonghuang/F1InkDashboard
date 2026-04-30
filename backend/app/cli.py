import argparse
import asyncio
from pathlib import Path

import httpx

from .f1_circuit_assets import fetch_f1_circuit_assets


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="zectrix-backend")
    sub = p.add_subparsers(dest="cmd", required=True)

    u = sub.add_parser("update-circuits")
    u.add_argument("--season", type=int, default=2026)
    u.add_argument("--static-dir", type=str, default=None)
    u.add_argument("--force", action="store_true", default=False)
    u.add_argument("--limit", type=int, default=None)
    u.add_argument("--width", type=int, default=200)
    u.add_argument("--height", type=int, default=130)
    u.add_argument("--detail-width", type=int, default=400)
    u.add_argument("--detail-height", type=int, default=300)
    return p.parse_args()


async def _run_update_circuits(args: argparse.Namespace) -> None:
    static_dir = (
        Path(args.static_dir).resolve()
        if args.static_dir
        else (Path(__file__).resolve().parent.parent / "static").resolve()
    )
    static_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(headers={"User-Agent": "zectrix-backend/0.1"}) as client:
        await fetch_f1_circuit_assets(
            client,
            int(args.season),
            static_dir,
            force_download=bool(args.force),
            limit=args.limit,
            target_width=int(args.width),
            target_height=int(args.height),
            detail_width=int(args.detail_width),
            detail_height=int(args.detail_height),
        )


def main() -> None:
    args = _parse_args()
    if args.cmd == "update-circuits":
        asyncio.run(_run_update_circuits(args))


if __name__ == "__main__":
    main()
