import argparse
import datetime as dt
import hashlib
import json
import re
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from html import unescape as _html_unescape
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlparse, urlunparse


@dataclass(frozen=True)
class Config:
    raw_html_dir: Path
    ingest_url: str
    token: str
    poll_interval_sec: float
    state_path: Path
    out_dir: Path
    dry_run: bool
    timeout_sec: float


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _utc_iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def _write_json(p: Path, data: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _safe_id(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(s or "").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _sha1_hex(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def _parse_time_or_none(s: str | None) -> dt.datetime | None:
    raw = str(s or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        t = dt.datetime.fromisoformat(raw)
        if not t.tzinfo:
            t = t.replace(tzinfo=dt.timezone.utc)
        return t
    except Exception:
        try:
            t = parsedate_to_datetime(raw)
            if not isinstance(t, dt.datetime):
                return None
            if not t.tzinfo:
                t = t.replace(tzinfo=dt.timezone.utc)
            return t
        except Exception:
            return None


def _normalize_published_at(s: str | None, fallback_ts: float) -> str:
    t = _parse_time_or_none(s)
    if not t:
        return _utc_iso(fallback_ts)
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_title_from_html(html: str) -> str:
    html = str(html or "")
    m = re.search(r"<title[^>]*>([\s\S]*?)</title>", html, flags=re.IGNORECASE)
    if not m:
        return ""
    s = re.sub(r"\s+", " ", (m.group(1) or "").strip())
    s = re.sub(r"<[^>]+>", "", s).strip()
    return _html_unescape(s)


def _extract_og_image(html: str) -> str:
    html = str(html or "")
    # og:image
    m = re.search(
        r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>""",
        html,
        flags=re.IGNORECASE,
    )
    if not m:
        # twitter:image
        m = re.search(
            r"""<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>""",
            html,
            flags=re.IGNORECASE,
        )
    if not m:
        return ""
    return str(m.group(1) or "").strip()


def _extract_first_img_src(html: str) -> str:
    html = str(html or "")
    m = re.search(r"""<img[^>]+src=["']([^"']+)["'][^>]*>""", html, flags=re.IGNORECASE)
    if not m:
        return ""
    src = str(m.group(1) or "").strip()
    if not src or src.startswith("data:"):
        return ""
    return src


def _html_to_text(html: str) -> str:
    """
    把 HTML 转成“可读纯文本”，尽量保留段落换行。
    注意：这里只做轻量处理，不追求完美的正文抽取。
    """
    html = str(html or "")
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.IGNORECASE)

    # 段落/换行：先把常见块级标签替换为换行，再去标签
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"</(p|div|li|h[1-6])\s*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<(p|div|li|h[1-6])(\s[^>]*)?>", "\n", html, flags=re.IGNORECASE)

    # 列表项前加一个短横线，便于形成 bulletin 的文本形态
    html = re.sub(r"<li(\s[^>]*)?>", "\n- ", html, flags=re.IGNORECASE)

    # 去掉剩余标签
    html = re.sub(r"<[^>]+>", " ", html)
    html = _html_unescape(html)

    # 规范化空白：保留换行
    html = html.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for raw in html.split("\n"):
        s = re.sub(r"[ \t\u00A0]+", " ", raw).strip()
        if not s:
            continue
        lines.append(s)
    return "\n\n".join(lines).strip()


def _text_to_nodes(text: str, *, cover_url: str = "") -> list[dict[str, Any]]:
    """
    把纯文本拆成富文本 nodes（p + text），满足 mp_news_content.md 的约定。
    """
    t = str(text or "").strip()
    if not t:
        return []
    nodes: list[dict[str, Any]] = []
    for para in re.split(r"\n\s*\n+", t):
        s = str(para or "").strip()
        if not s:
            continue
        nodes.append({"name": "p", "children": [{"type": "text", "text": s}]})
    if cover_url.strip():
        nodes.insert(0, {"name": "img", "attrs": {"src": cover_url.strip(), "mode": "widthFix", "style": "width:100%;display:block;"}})
    return nodes


def _infer_layout_code(title: str, text: str) -> str:
    s = (str(title or "") + "\n" + str(text or "")).lower()
    if any(k in s for k in ["breaking", "confirmed", "official", "sacked", "resigns", "crash", "hospital", "disqualified", "ban", "penalty"]):
        return "BREAKING"

    # bulletin：很短且有明显列表/要点结构
    if len(str(text or "")) < 600 and ("\n- " in str(text or "") or " - " in s or "•" in s):
        return "BULLETIN"

    # feature：长文/专访/解析
    if len(str(text or "")) >= 4000 or any(k in s for k in ["interview", "feature", "analysis", "explained", "long read"]):
        return "FEATURE"
    return "STANDARD"


def _infer_type_code(title: str, text: str) -> str:
    s = (str(title or "") + "\n" + str(text or "")).lower()
    if any(k in s for k in ["fia", "stewards", "regulation", "rule", "rules", "penalty points", "ban", "disqualified"]):
        return "REGULATION"
    if any(k in s for k in ["strategy", "tyre", "tire", "pit stop", "undercut", "overcut", "safety car"]):
        return "STRATEGY"
    if any(k in s for k in ["technical", "tech", "aero", "aerodynamic", "floor", "wing", "power unit", "engine", "upgrade"]):
        return "TECH"
    if any(k in s for k in ["driver", "rookie", "contract", "helmet", "race ban", "qualifying", "podium"]):
        return "DRIVER"
    return "PADDOCK"


_TAG_PATTERNS: list[tuple[str, str]] = [
    # Teams
    (r"\bred bull\b", "Red Bull"),
    (r"\bferrari\b", "Ferrari"),
    (r"\bmercedes\b", "Mercedes"),
    (r"\bmclaren\b", "McLaren"),
    (r"\baston martin\b", "Aston Martin"),
    (r"\balpine\b", "Alpine"),
    (r"\bwilliams\b", "Williams"),
    (r"\bhaas\b", "Haas"),
    (r"\bsauber\b|\bkick sauber\b", "Sauber"),
    (r"\bracing bulls\b|\bvisa cash app\b|\brb\b", "RB"),
    # Drivers (partial list)
    (r"\bverstappen\b", "Verstappen"),
    (r"\bhamilton\b", "Hamilton"),
    (r"\bleclerc\b", "Leclerc"),
    (r"\bnorris\b", "Norris"),
    (r"\bpiastri\b", "Piastri"),
    (r"\balonso\b", "Alonso"),
    (r"\bsainz\b", "Sainz"),
    (r"\brussell\b", "Russell"),
    (r"\bantonelli\b", "Antonelli"),
]


def _extract_tags(title: str, text: str) -> list[str]:
    s = (str(title or "") + "\n" + str(text or "")).lower()
    tags: list[str] = []
    for pat, tag in _TAG_PATTERNS:
        if re.search(pat, s, flags=re.IGNORECASE):
            tags.append(tag)
    # 去重 + 稳定排序
    seen: set[str] = set()
    out: list[str] = []
    for t in tags:
        key = t.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(t.strip())
    out.sort(key=lambda x: x.lower())
    return out[:20]


def _normalize_ingest_url(base: str, token: str) -> str:
    base = str(base or "").strip()
    token = str(token or "").strip()
    if not base:
        raise RuntimeError("missing_ingest_url")
    if not token:
        return base
    p = urlparse(base)
    q: dict[str, str] = {}
    if p.query.strip():
        for kv in p.query.split("&"):
            if not kv.strip():
                continue
            if "=" in kv:
                k, v = kv.split("=", 1)
                q[k] = v
            else:
                q[kv] = ""
    q["token"] = token
    return urlunparse(p._replace(query=urlencode(q)))


def _load_config(path: Path) -> Config:
    root = _repo_root()
    cfg = _read_json(path)
    if not isinstance(cfg, dict):
        raise RuntimeError("bad_config")

    raw_html_dir = (root / str(cfg.get("raw_html_dir") or "mp_news_ingest/raw_html")).resolve()
    ingest_url = str(cfg.get("ingest_url") or "").strip()
    token = str(cfg.get("token") or "").strip()
    poll_interval_sec = float(cfg.get("poll_interval_sec") or 5)
    state_path = (root / str(cfg.get("state_path") or "mp_news_ingest/state/raw_html_watch_ingest_state.json")).resolve()
    out_dir = (root / str(cfg.get("out_dir") or "mp_news_ingest/out_ingest_payloads")).resolve()
    dry_run = bool(cfg.get("dry_run") or False)
    timeout_sec = float(cfg.get("timeout_sec") or 20)

    ingest_url = _normalize_ingest_url(ingest_url, token)
    return Config(
        raw_html_dir=raw_html_dir,
        ingest_url=ingest_url,
        token=token,
        poll_interval_sec=max(poll_interval_sec, 1.0),
        state_path=state_path,
        out_dir=out_dir,
        dry_run=dry_run,
        timeout_sec=max(timeout_sec, 5.0),
    )


def _load_state(p: Path) -> dict[str, Any]:
    if not p.exists():
        return {"updated_at_utc": _utc_iso(time.time()), "processed": {}}
    try:
        obj = _read_json(p)
    except Exception:
        return {"updated_at_utc": _utc_iso(time.time()), "processed": {}}
    if not isinstance(obj, dict):
        return {"updated_at_utc": _utc_iso(time.time()), "processed": {}}
    if not isinstance(obj.get("processed"), dict):
        obj["processed"] = {}
    return obj


def _save_state(p: Path, state: dict[str, Any]) -> None:
    state["updated_at_utc"] = _utc_iso(time.time())
    _write_json(p, state)


def _iter_html_files(raw_html_dir: Path) -> list[Path]:
    if not raw_html_dir.exists():
        return []
    out: list[Path] = []
    for p in raw_html_dir.rglob("*.html"):
        if p.name.endswith(".raw.html"):
            continue
        if not p.is_file():
            continue
        out.append(p)
    out.sort(key=lambda x: str(x).lower())
    return out


def _read_meta_for_html(html_path: Path) -> dict[str, Any]:
    meta_path = html_path.with_suffix(".json")
    if not meta_path.exists():
        return {}
    try:
        obj = _read_json(meta_path)
        if isinstance(obj, dict):
            return obj
    except Exception:
        return {}
    return {}


def _make_item_id(source: str, url: str, published_at: str, file_rel: str) -> str:
    t = _parse_time_or_none(published_at) or dt.datetime.now(dt.timezone.utc)
    ymd = t.strftime("%Y%m%d")
    slug = _safe_id(urlparse(url).path.split("/")[-1]) if url.strip() else ""
    if not slug:
        slug = _safe_id(Path(file_rel).stem)
    if not slug:
        slug = _sha1_hex(file_rel)[:10]
    uniq = _sha1_hex((url or "") + "|" + published_at + "|" + file_rel)[:8]
    base = _safe_id(f"n_{ymd}_{source}_{slug}_{uniq}")
    if not base.startswith("n_"):
        base = "n_" + base
    return base[:64]


def _build_ingest_payload(source: str, html_path: Path) -> dict[str, Any]:
    meta = _read_meta_for_html(html_path)
    url = str(meta.get("url") or "").strip()
    title = str(meta.get("title") or "").strip()
    published_at_raw = str(meta.get("published_at") or "").strip()

    st = html_path.stat()
    published_at = _normalize_published_at(published_at_raw, st.st_mtime)

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    if not title:
        title = _extract_title_from_html(html)
    if not title:
        title = html_path.stem

    cover_url = str(meta.get("cover_url") or "").strip()
    if not cover_url:
        cover_url = _extract_og_image(html)
    if not cover_url:
        cover_url = _extract_first_img_src(html)

    text = _html_to_text(html)
    summary = ""
    if text:
        # 摘要取首段前 160 字
        summary = (re.split(r"\n\s*\n+", text, maxsplit=1)[0] or "").strip()[:160]

    layout_code = str(meta.get("layout_code") or "").strip().upper()
    if layout_code not in {"BREAKING", "HERO", "FEATURE", "STANDARD", "BULLETIN"}:
        layout_code = _infer_layout_code(title, text)

    type_code = str(meta.get("type_code") or "").strip().upper()
    if type_code not in {"REGULATION", "PADDOCK", "STRATEGY", "DRIVER", "TECH"}:
        type_code = _infer_type_code(title, text)

    tags = meta.get("tags") if isinstance(meta.get("tags"), list) else []
    tags = [str(x).strip() for x in tags if str(x).strip()] if isinstance(tags, list) else []
    if not tags:
        tags = _extract_tags(title, text)

    tag_text = str(meta.get("tag_text") or "").strip()
    if not tag_text and tags:
        tag_text = tags[0]

    nodes = _text_to_nodes(text, cover_url=cover_url)

    root = _repo_root()
    file_rel = str(html_path.resolve().relative_to(root)).replace("\\", "/")
    item_id = _make_item_id(source, url, published_at, file_rel)

    payload: dict[str, Any] = {
        "id": item_id,
        "layout_code": layout_code,
        "type_code": type_code,
        "pinned": False,
        "weight": 0,
        "tag_text": tag_text[:64],
        "tags": tags,
        "title": title[:256],
        "summary": summary[:1024],
        "cover_url": cover_url[:512],
        "published_at": published_at,
        "source": {"name": source[:64], "url": url[:1024]},
        "content": {"format_code": ("RICH_TEXT_NODES" if nodes else "PLAIN"), "text": text, "nodes": nodes},
        "raw": {"file": file_rel, "fetched_at_utc": str(meta.get("fetched_at_utc") or ""), "url": url},
    }
    return payload


def _post_ingest(ingest_url: str, payload: dict[str, Any], *, timeout_sec: float) -> dict[str, Any]:
    b = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        ingest_url,
        data=b,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "F1InkDashboardRawHtmlIngest/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            resp_b = resp.read()
    except urllib.error.HTTPError as e:
        try:
            resp_b = e.read()
        except Exception:
            resp_b = b""
    data: Any = {}
    try:
        data = json.loads((resp_b or b"").decode("utf-8", errors="ignore") or "{}")
    except Exception:
        data = {}
    if isinstance(data, dict):
        return data
    return {"ok": False, "error": "bad_response"}


def _scan_and_process(cfg: Config, *, once: bool) -> None:
    state = _load_state(cfg.state_path)
    processed: dict[str, Any] = state.get("processed") if isinstance(state.get("processed"), dict) else {}
    while True:
        html_files = _iter_html_files(cfg.raw_html_dir)
        root = _repo_root()
        any_changed = False

        for p in html_files:
            try:
                st = p.stat()
            except Exception:
                continue
            rel = str(p.resolve().relative_to(root)).replace("\\", "/")
            prev = processed.get(rel) if isinstance(processed.get(rel), dict) else None
            prev_mtime = float(prev.get("mtime") or 0) if isinstance(prev, dict) else 0.0
            prev_size = int(prev.get("size") or 0) if isinstance(prev, dict) else 0

            if prev and prev_mtime == float(st.st_mtime) and prev_size == int(st.st_size):
                continue

            source = p.parent.name
            payload = _build_ingest_payload(source, p)
            out_path = cfg.out_dir / f"{payload['id']}.json"
            _write_json(out_path, payload)

            ok = True
            resp: dict[str, Any] = {}
            err = ""
            if not cfg.dry_run:
                try:
                    resp = _post_ingest(cfg.ingest_url, payload, timeout_sec=cfg.timeout_sec)
                    ok = bool(resp.get("ok") is True or resp.get("id"))
                    if not ok and not str(resp.get("error") or "").strip():
                        resp["error"] = "unknown_error"
                except Exception as e:
                    ok = False
                    err = str(e)

            processed[rel] = {
                "mtime": float(st.st_mtime),
                "size": int(st.st_size),
                "id": payload.get("id"),
                "source": source,
                "out_file": str(out_path.resolve().relative_to(root)).replace("\\", "/"),
                "posted": bool(ok and not cfg.dry_run),
                "posted_at_utc": _utc_iso(time.time()),
                "resp": resp,
                "error": err,
            }
            any_changed = True

        state["processed"] = processed
        if any_changed:
            _save_state(cfg.state_path, state)

        if once:
            return
        time.sleep(cfg.poll_interval_sec)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="mp_news_ingest/solo_tasks/raw_html_watch_ingest/config.json")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = _repo_root()
    config_path = (root / str(args.config)).resolve()
    if not config_path.exists():
        config_path = (Path(__file__).resolve().parent / "config.example.json").resolve()
    cfg = _load_config(config_path)
    if args.dry_run:
        cfg = Config(**{**cfg.__dict__, "dry_run": True})

    _scan_and_process(cfg, once=bool(args.once))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
