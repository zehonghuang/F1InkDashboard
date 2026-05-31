import argparse
import datetime as dt
import json
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Task:
    name: str
    cwd: Path
    cmd: list[str]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _utc_iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def _write_json(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_tasks(config_path: Path) -> tuple[int, Path, list[Task]]:
    cfg = _read_json(config_path)
    interval_minutes = int(cfg.get("interval_minutes") or 10)
    indices_dir = str(cfg.get("indices_dir") or "mp_news_ingest/indices")
    tasks_raw = cfg.get("tasks")
    if not isinstance(tasks_raw, list) or not tasks_raw:
        raise RuntimeError("no_tasks")

    root = _repo_root()
    tasks: list[Task] = []
    for t in tasks_raw:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "").strip()
        if not name:
            continue
        cwd = str(t.get("cwd") or ".").strip()
        cmd = t.get("cmd")
        if not isinstance(cmd, list) or not all(isinstance(x, str) and x.strip() for x in cmd):
            continue
        tasks.append(Task(name=name, cwd=(root / cwd).resolve(), cmd=[str(x) for x in cmd]))

    if not tasks:
        raise RuntimeError("no_valid_tasks")

    return interval_minutes, (root / indices_dir).resolve(), tasks


def _scan_html_entries(root: Path, source: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in root.rglob("*.html"):
        if p.name.endswith(".raw.html"):
            continue
        meta_path = p.with_suffix(".json")
        meta: dict[str, Any] = {}
        if meta_path.exists():
            try:
                obj = _read_json(meta_path)
                if isinstance(obj, dict):
                    meta = obj
            except Exception:
                meta = {}

        try:
            st = p.stat()
        except Exception:
            continue

        rel = str(p.resolve().relative_to(_repo_root().resolve())).replace("\\", "/")
        out.append(
            {
                "source": source,
                "file": rel,
                "filename": p.name,
                "size": int(st.st_size),
                "mtime_utc": _utc_iso(st.st_mtime),
                "url": str(meta.get("url") or ""),
                "title": str(meta.get("title") or ""),
                "published_at": str(meta.get("published_at") or ""),
                "fetched_at_utc": str(meta.get("fetched_at_utc") or ""),
            }
        )

    out.sort(key=lambda x: (x.get("mtime_utc") or "", x.get("file") or ""), reverse=True)
    return out


def _update_indices(indices_dir: Path, tasks: list[Task]) -> None:
    root = _repo_root()
    all_items: list[dict[str, Any]] = []

    for t in tasks:
        out_dir = root / "mp_news_ingest" / "raw_html" / t.name
        items = _scan_html_entries(out_dir, t.name) if out_dir.exists() else []
        all_items.extend(items)
        _write_json(indices_dir / f"{t.name}.json", {"source": t.name, "updated_at_utc": _utc_iso(time.time()), "items": items})

    all_items.sort(key=lambda x: (x.get("mtime_utc") or "", x.get("file") or ""), reverse=True)
    _write_json(indices_dir / "all.json", {"updated_at_utc": _utc_iso(time.time()), "items": all_items})


def _run_once(tasks: list[Task], indices_dir: Path) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for t in tasks:
        started = time.time()
        try:
            p = subprocess.run(t.cmd, cwd=str(t.cwd), capture_output=True, text=True)
            results.append(
                {
                    "name": t.name,
                    "ok": p.returncode == 0,
                    "returncode": int(p.returncode),
                    "started_at_utc": _utc_iso(started),
                    "ended_at_utc": _utc_iso(time.time()),
                    "stdout_tail": (p.stdout or "")[-4000:],
                    "stderr_tail": (p.stderr or "")[-4000:],
                }
            )
        except Exception as e:
            results.append(
                {
                    "name": t.name,
                    "ok": False,
                    "returncode": -1,
                    "started_at_utc": _utc_iso(started),
                    "ended_at_utc": _utc_iso(time.time()),
                    "stdout_tail": "",
                    "stderr_tail": str(e),
                }
            )

    _update_indices(indices_dir, tasks)
    return {"ran_at_utc": _utc_iso(time.time()), "results": results}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="mp_news_ingest/crawlers.json")
    ap.add_argument("--interval-minutes", type=int, default=0)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()

    root = _repo_root()
    config_path = (root / str(args.config)).resolve()
    interval_minutes, indices_dir, tasks = _load_tasks(config_path)
    if int(args.interval_minutes or 0) > 0:
        interval_minutes = int(args.interval_minutes)

    if args.once:
        report = _run_once(tasks, indices_dir)
        _write_json(indices_dir / "last_run.json", report)
        return 0

    while True:
        report = _run_once(tasks, indices_dir)
        _write_json(indices_dir / "last_run.json", report)
        time.sleep(max(interval_minutes, 1) * 60)


if __name__ == "__main__":
    raise SystemExit(main())

