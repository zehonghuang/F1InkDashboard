import argparse
import asyncio
import json
from pathlib import Path

import httpx

from .f1_circuit_assets import fetch_f1_circuit_assets
from .third_party import (
    ergast_constructor_standings_for_season,
    ergast_schedule_for_season,
    ergast_driver_standings_for_season,
)
from .db_mysql import mysql_connect
from .ergast_ingest_mysql import (
    ingest_constructor_standings_json,
    ingest_driver_standings_json,
    ingest_schedule_json,
)
from .circuit_assets_ingest_mysql import default_circuits_json_path, ingest_circuit_assets_file


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="toinc_F1-backend")
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

    i = sub.add_parser("ingest-ergast")
    i.add_argument("--season", type=int, default=2026)
    i.add_argument("--schedule", action="store_true", default=False, help="ingest schedule only")
    i.add_argument("--standings", action="store_true", default=False, help="ingest standings only")

    ca = sub.add_parser("ingest-circuit-assets")
    ca.add_argument("--season", type=int, default=2026)
    ca.add_argument("--static-dir", type=str, default=None)
    return p.parse_args()


async def _run_update_circuits(args: argparse.Namespace) -> None:
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
        )


async def _run_ingest_ergast(args: argparse.Namespace) -> None:
    season = int(args.season)
    only_schedule = bool(args.schedule)
    only_standings = bool(args.standings)
    do_schedule = only_schedule or (not only_schedule and not only_standings)
    do_standings = only_standings or (not only_schedule and not only_standings)

    timeout = httpx.Timeout(20.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "toinc_F1-backend/0.1"}) as client:
        conn = mysql_connect()
        try:
            if do_schedule:
                schedule_json = await ergast_schedule_for_season(client, season)
                r = ingest_schedule_json(conn, schedule_json)
                print(json.dumps({"kind": "schedule", "season": season, "result": r}, ensure_ascii=False))
            if do_standings:
                drv_json = await ergast_driver_standings_for_season(client, season)
                r1 = ingest_driver_standings_json(conn, drv_json)
                print(json.dumps({"kind": "driver_standings", "season": season, "result": r1}, ensure_ascii=False))
                cst_json = await ergast_constructor_standings_for_season(client, season)
                r2 = ingest_constructor_standings_json(conn, cst_json)
                print(json.dumps({"kind": "constructor_standings", "season": season, "result": r2}, ensure_ascii=False))
        finally:
            conn.close()


async def _run_ingest_circuit_assets(args: argparse.Namespace) -> None:
    season = int(args.season)
    static_dir = (
        Path(args.static_dir).resolve()
        if args.static_dir
        else (Path(__file__).resolve().parent.parent / "static").resolve()
    )
    path = default_circuits_json_path(static_dir, season)
    conn = mysql_connect()
    try:
        r = ingest_circuit_assets_file(conn, season=season, circuits_json_path=path)
        print(json.dumps({"kind": "circuit_assets", "season": season, "result": r, "path": str(path)}, ensure_ascii=False))
    finally:
        conn.close()



def main() -> None:
    args = _parse_args()
    if args.cmd == "update-circuits":
        asyncio.run(_run_update_circuits(args))
    elif args.cmd == "ingest-ergast":
        asyncio.run(_run_ingest_ergast(args))
    elif args.cmd == "ingest-circuit-assets":
        asyncio.run(_run_ingest_circuit_assets(args))


if __name__ == "__main__":
    main()
