from __future__ import annotations

import argparse
import asyncio
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="update_circuits")
    p.add_argument("--season", type=int, default=2026)
    p.add_argument("--static-dir", type=str, default=None)
    p.add_argument("--force", action="store_true", default=False)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--width", type=int, default=200)
    p.add_argument("--height", type=int, default=130)
    p.add_argument("--detail-width", type=int, default=400)
    p.add_argument("--detail-height", type=int, default=300)
    p.add_argument("--save-raw", type=int, default=1)
    return p.parse_args()


async def _run(args: argparse.Namespace) -> None:
    try:
        import httpx
    except Exception as ex:
        raise RuntimeError(f"httpx_not_available: {ex}") from ex

    from f1_circuit_assets import fetch_f1_circuit_assets

    static_dir = (
        Path(args.static_dir).resolve()
        if args.static_dir
        else (Path(__file__).resolve().parent.parent / "static").resolve()
    )
    static_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
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
            save_raw=bool(int(args.save_raw)),
        )


def main() -> None:
    args = _parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
