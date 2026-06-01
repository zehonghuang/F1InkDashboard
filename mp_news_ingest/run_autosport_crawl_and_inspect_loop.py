import argparse
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _utc_iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json_or_default(p: Path, default: Any) -> Any:
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json_atomic(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(p)


def _rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(_repo_root().resolve())).replace("\\", "/")
    except Exception:
        return str(p.resolve()).replace("\\", "/")


def _run(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")


def _list_html(raw_dir: Path) -> list[Path]:
    if not raw_dir.exists():
        return []
    files = [p for p in raw_dir.glob("*.html") if not p.name.endswith(".raw.html")]
    files.sort(key=lambda x: x.stat().st_mtime if x.exists() else 0, reverse=True)
    return files


def _inspect_one(inspect_py: Path, html_file: Path) -> dict[str, Any]:
    p = _run(
        [
            sys.executable,
            str(inspect_py),
            "--file",
            str(html_file),
            "--limit-paragraphs",
            "0",
            "--json",
        ],
        cwd=_repo_root(),
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "").strip() or "inspect_failed")
    try:
        obj = json.loads(p.stdout or "")
    except Exception:
        raise RuntimeError("inspect_bad_json")
    if not isinstance(obj, list) or not obj or not isinstance(obj[0], dict):
        raise RuntimeError("inspect_unexpected_output")
    return obj[0]


def _write_extracted(out_dir: Path, html_file: Path, extracted: dict[str, Any]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / (html_file.stem + ".extracted.json")
    payload = dict(extracted)
    payload["source"] = "autosport"
    payload["html_file"] = _rel(html_file)
    payload["generated_at_utc"] = _utc_iso(time.time())
    _write_json_atomic(out_path, payload)
    return out_path


def _run_once(
    *,
    crawl_py: Path,
    inspect_py: Path,
    raw_dir: Path,
    extracted_dir: Path,
    state_path: Path,
    max_items: int,
) -> dict[str, Any]:
    started = time.time()
    state = _read_json_or_default(state_path, {})
    if not isinstance(state, dict):
        state = {}

    processed = state.get("processed_files")
    if not isinstance(processed, list):
        processed = []
    processed_set = {str(x) for x in processed if isinstance(x, str) and x.strip()}

    crawl_cmd = [sys.executable, str(crawl_py), "--max-items", str(int(max_items))]
    crawl = _run(crawl_cmd, cwd=_repo_root())

    html_files = _list_html(raw_dir)
    new_files = [p for p in html_files if _rel(p) not in processed_set]

    extracted_paths: list[str] = []
    extracted_items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for f in reversed(new_files):
        try:
            it = _inspect_one(inspect_py, f)
            out_path = _write_extracted(extracted_dir, f, it)
            extracted_items.append(it)
            extracted_paths.append(_rel(out_path))
            processed_set.add(_rel(f))
        except Exception as e:
            errors.append({"file": _rel(f), "error": str(e)})

    processed_list = sorted(processed_set)
    runs = state.get("runs")
    if not isinstance(runs, list):
        runs = []
    runs.append(
        {
            "started_at_utc": _utc_iso(started),
            "ended_at_utc": _utc_iso(time.time()),
            "crawl": {
                "cmd": crawl_cmd,
                "ok": crawl.returncode == 0,
                "returncode": int(crawl.returncode),
                "stdout_tail": (crawl.stdout or "")[-4000:],
                "stderr_tail": (crawl.stderr or "")[-4000:],
            },
            "new_files": [_rel(p) for p in new_files],
            "extracted_files": extracted_paths,
            "errors": errors,
        }
    )
    runs = runs[-50:]

    next_state = {
        "updated_at_utc": _utc_iso(time.time()),
        "processed_files": processed_list,
        "runs": runs,
    }
    _write_json_atomic(state_path, next_state)

    return {
        "ok": crawl.returncode == 0 and not errors,
        "new_files_count": len(new_files),
        "extracted_count": len(extracted_paths),
        "errors_count": len(errors),
        "state": _rel(state_path),
        "extracted_dir": _rel(extracted_dir),
        "raw_dir": _rel(raw_dir),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--interval-minutes", type=int, default=10)
    ap.add_argument("--max-items", type=int, default=10)
    ap.add_argument("--raw-dir", default="mp_news_ingest/raw_html/autosport")
    ap.add_argument("--extracted-dir", default="mp_news_ingest/extracted/autosport")
    ap.add_argument("--state-file", default="mp_news_ingest/state/autosport_crawl_inspect.json")
    args = ap.parse_args()

    root = _repo_root()
    crawl_py = (root / "mp_news_ingest" / "crawl_autosport_html.py").resolve()
    inspect_py = (root / "mp_news_ingest" / "inspect_autosport_html_tags.py").resolve()
    raw_dir = (root / str(args.raw_dir)).resolve()
    extracted_dir = (root / str(args.extracted_dir)).resolve()
    state_path = (root / str(args.state_file)).resolve()

    if args.once:
        report = _run_once(
            crawl_py=crawl_py,
            inspect_py=inspect_py,
            raw_dir=raw_dir,
            extracted_dir=extracted_dir,
            state_path=state_path,
            max_items=int(args.max_items),
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    while True:
        report = _run_once(
            crawl_py=crawl_py,
            inspect_py=inspect_py,
            raw_dir=raw_dir,
            extracted_dir=extracted_dir,
            state_path=state_path,
            max_items=int(args.max_items),
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        time.sleep(max(int(args.interval_minutes), 1) * 60)


if __name__ == "__main__":
    raise SystemExit(main())
