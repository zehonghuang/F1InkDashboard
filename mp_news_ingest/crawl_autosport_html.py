import argparse
import asyncio
import datetime as dt
import hashlib
import html as html_lib
import json
import os
from html.parser import HTMLParser
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

try:
    import httpx
except ModuleNotFoundError:
    raise SystemExit('missing dependency: httpx. Install: pip install "httpx==0.28.1" (or pip install -r backend/requirements.txt)')


@dataclass(frozen=True)
class AutosportRssItem:
    url: str
    title: str
    published_at: str


def _normalize_url(u: str) -> str:
    u = str(u or "").strip()
    u = u.strip("`").strip()
    if (u.startswith('"') and u.endswith('"')) or (u.startswith("'") and u.endswith("'")):
        u = u[1:-1].strip()
    u = u.strip("`").strip()
    return u


def _dbg_emit(*_args: Any, **_kwargs: Any) -> None:
    return


def _safe_slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(s or "").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _sha1_10(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]


def _xml_text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def _discover_autosport_f1_news_from_rss(xml_text: str) -> list[AutosportRssItem]:
    xml_text = str(xml_text or "").strip()
    if not xml_text:
        return []

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    out: list[AutosportRssItem] = []
    for it in root.findall("./channel/item"):
        url = _normalize_url(_xml_text(it.find("link")))
        if not url.startswith("http"):
            continue
        path = (urlparse(url).path or "").lower()
        if "/f1/" not in path or "/news/" not in path:
            continue
        title = _xml_text(it.find("title"))
        published_at = _xml_text(it.find("pubDate"))
        out.append(AutosportRssItem(url=url, title=title, published_at=published_at))
    return out


def _iter_unique(items: Iterable[AutosportRssItem]) -> list[AutosportRssItem]:
    out: list[AutosportRssItem] = []
    seen: set[str] = set()
    for it in items:
        u = str(it.url or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(it)
    return out


def _guess_filename(url: str, title: str, published_at: str) -> str:
    p = urlparse(url)
    slug = _safe_slug(p.path.split("/")[-1])
    if not slug:
        slug = _safe_slug(title)
    if not slug:
        slug = "article"

    ymd = ""
    try:
        t = dt.datetime.strptime(published_at, "%a, %d %b %Y %H:%M:%S %z")
        ymd = t.strftime("%Y%m%d")
    except Exception:
        ymd = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d")

    base = f"{ymd}_autosport_{slug}"
    base = base[:160].rstrip("_")
    return f"{base}_{_sha1_10(url)}.html"


def _strip_style_and_script_tags(html: str) -> str:
    html = str(html or "")
    html = re.sub(r"<link\b[^>]*?/?>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<meta\b[^>]*?/?>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<style\b[\s\S]*?</style\s*>", "", html, flags=re.IGNORECASE)
    html = re.sub(
        r'<span\b[^>]*\bclass=["\'][^"\']*\brelatedContent__title\b[^"\']*["\'][^>]*>[\s\S]*?</span\s*>',
        "",
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(
        r'<svg\b[^>]*\bclass=["\'][^"\']*\bw-6\b[^"\']*\bh-6\b[^"\']*["\'][^>]*>[\s\S]*?</svg\s*>',
        "",
        html,
        flags=re.IGNORECASE,
    )

    def _keep_jsonld(m: re.Match[str]) -> str:
        tag = m.group(0) or ""
        t = (m.group(1) or "").strip().lower()
        if t in {"application/ld+json"}:
            return tag
        return ""

    html = re.sub(
        r'(<script\b[^>]*\btype=["\']([^"\']+)["\'][^>]*>[\s\S]*?</script\s*>)',
        _keep_jsonld,
        html,
        flags=re.IGNORECASE,
    )
    html = re.sub(r"<script\b[\s\S]*?</script\s*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\r\n", "\n", html)
    html = re.sub(r"\n[ \t]*\n+", "\n", html)
    html = html.strip() + "\n"
    return html


@dataclass
class _HtmlNode:
    tag: str
    attrs: list[tuple[str, str | None]]
    children: list["_HtmlNode"]
    text: str


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _HtmlNode(tag="__root__", attrs=[], children=[], text="")
        self._stack: list[_HtmlNode] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        n = _HtmlNode(tag=tag.lower(), attrs=attrs, children=[], text="")
        self._stack[-1].children.append(n)
        self._stack.append(n)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        n = _HtmlNode(tag=tag.lower(), attrs=attrs, children=[], text="")
        self._stack[-1].children.append(n)

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == t:
                del self._stack[i:]
                break

    def handle_data(self, data: str) -> None:
        if not data:
            return
        self._stack[-1].text += data


_VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


def _serialize_node(n: _HtmlNode) -> str:
    if n.tag == "__root__":
        return "".join(_serialize_node(c) for c in n.children)

    attr_parts: list[str] = []
    for k, v in n.attrs:
        kk = (k or "").strip()
        if not kk:
            continue
        if v is None:
            attr_parts.append(kk)
        else:
            vv = html_lib.escape(str(v), quote=True)
            attr_parts.append(f'{kk}="{vv}"')
    attrs = (" " + " ".join(attr_parts)) if attr_parts else ""

    if n.tag in _VOID_TAGS:
        return f"<{n.tag}{attrs}>"

    inner = html_lib.escape(n.text) if n.text else ""
    if n.children:
        inner += "".join(_serialize_node(c) for c in n.children)
    return f"<{n.tag}{attrs}>{inner}</{n.tag}>"


def _find_first(n: _HtmlNode, tag: str) -> _HtmlNode | None:
    tag = tag.lower()
    for c in n.children:
        if c.tag == tag:
            return c
        found = _find_first(c, tag)
        if found is not None:
            return found
    return None


def _attr_get(n: _HtmlNode, key: str) -> str:
    k = key.lower()
    for kk, vv in n.attrs:
        if (kk or "").lower() == k:
            return str(vv or "")
    return ""


def _find_first_by_class(n: _HtmlNode, tag: str, class_name: str) -> _HtmlNode | None:
    tag = tag.lower()
    class_name = class_name.strip()
    for c in n.children:
        if c.tag == tag:
            cls = _attr_get(c, "class")
            if cls and class_name in cls.split():
                return c
        found = _find_first_by_class(c, tag, class_name)
        if found is not None:
            return found
    return None


def _extract_html_body_div3_main(html: str) -> str:
    parser = _TreeBuilder()
    parser.feed(str(html or ""))
    root = parser.root

    html_node = _find_first(root, "html") or root
    body = _find_first(html_node, "body") or html_node

    divs = [c for c in body.children if c.tag == "div"]
    div3 = divs[2] if len(divs) >= 3 else None
    scope = div3 or body

    main = _find_first(scope, "main") or _find_first(body, "main") or scope
    return _serialize_node(main)


def _class_tokens(n: _HtmlNode) -> set[str]:
    raw = _attr_get(n, "class").strip()
    if not raw:
        return set()
    return {x for x in raw.split() if x}


def _should_drop_node(n: _HtmlNode) -> bool:
    tag = (n.tag or "").lower()
    if tag in {"template"}:
        return True

    if tag.startswith("msnt-"):
        return True

    if tag in {"script", "style", "link", "meta"}:
        return True

    if (_attr_get(n, "data-msnt-label") or "").strip().lower() == "advertisement":
        return True

    node_id = (_attr_get(n, "id") or "").strip()
    if node_id.startswith("ads_") or node_id.startswith("ad_"):
        return True

    cls = _class_tokens(n)
    if cls & {
        "ad-calc-data",
        "ms-apb",
        "ms-ap",
        "ms-ap-native",
        "ms-recommendations-placeholder",
        "outstream_partner",
    }:
        return True

    if tag == "section" and any(x.startswith("relatedContent") for x in cls):
        return True

    return False


def _prune_tree(n: _HtmlNode) -> _HtmlNode | None:
    if _should_drop_node(n):
        return None
    kept_children: list[_HtmlNode] = []
    for c in n.children:
        pc = _prune_tree(c)
        if pc is not None:
            kept_children.append(pc)
    n.children = kept_children
    return n


def _extract_ms_article_detail(html: str) -> str:
    parser = _TreeBuilder()
    parser.feed(str(html or ""))
    root = parser.root

    html_node = _find_first(root, "html") or root
    body = _find_first(html_node, "body") or html_node

    node = _find_first_by_class(body, "div", "ms-article_detail")
    if node is None:
        return _extract_html_body_div3_main(html)
    content = _find_first_by_class(node, "div", "ms-article-content")
    target = content or node
    pruned = _prune_tree(target)
    if pruned is None:
        return ""
    return _serialize_node(pruned)


def _read_json_file(p: Path) -> dict:
    try:
        obj = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return obj if isinstance(obj, dict) else {}


def _write_json_file(p: Path, obj: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(p)


def _select_new_items(
    items: list[AutosportRssItem],
    last_url: str,
    seen_urls: list[str],
    max_items: int,
) -> tuple[list[AutosportRssItem], str]:
    last_url = _normalize_url(last_url)
    seen = {_normalize_url(u) for u in (seen_urls or []) if str(u or "").strip()}
    out: list[AutosportRssItem] = []
    for it in items:
        u = _normalize_url(it.url)
        if last_url and u == last_url:
            break
        if u and u in seen:
            continue
        out.append(it)
        if max_items > 0 and len(out) >= max_items:
            break
    new_last_url = _normalize_url(items[0].url) if items else last_url
    return out, new_last_url


async def _fetch_text(client: httpx.AsyncClient, url: str) -> str:
    r = await client.get(url, follow_redirects=True)
    _dbg_emit("A", "[DEBUG] httpx_get", {"url": url, "status": int(r.status_code), "content_type": str(r.headers.get("content-type") or ""), "len": int(len(r.text or ""))})
    r.raise_for_status()
    return r.text


def _pick_xml_from_text(s: str) -> str:
    s = str(s or "")
    markers = ["<?xml", "<rss", "<feed"]
    best = -1
    for m in markers:
        i = s.lower().find(m.lower())
        if i >= 0 and (best < 0 or i < best):
            best = i
    if best >= 0:
        return s[best:]
    return s


def _looks_like_rss_or_atom(s: str) -> bool:
    s = (s or "").lower()
    return "<rss" in s or "<feed" in s


async def _fetch_rss_xml(
    client: httpx.AsyncClient,
    url: str,
    *,
    rss_fetch_mode: str,
    timeout_s: float,
    interactive: bool,
    storage_state_path: str,
) -> str:
    rss_fetch_mode = str(rss_fetch_mode or "auto").strip().lower()

    if rss_fetch_mode not in {"auto", "httpx", "playwright"}:
        rss_fetch_mode = "auto"

    if rss_fetch_mode in {"auto", "httpx"}:
        try:
            t = await _fetch_text(client, url)
            picked = _pick_xml_from_text(t)
            if _looks_like_rss_or_atom(picked) and not _is_human_verification_page(picked):
                return picked
            if rss_fetch_mode == "httpx":
                return picked
        except httpx.HTTPStatusError as e:
            status = int(getattr(e.response, "status_code", 0) or 0)
            if rss_fetch_mode == "httpx":
                raise
            if status not in {403, 405, 429}:
                raise

    picked = _pick_xml_from_text(
        await _fetch_fully_rendered_html_playwright(
            url, timeout_s, interactive=interactive, storage_state_path=storage_state_path
        )
    )
    if not _looks_like_rss_or_atom(picked):
        if interactive:
            raise RuntimeError("rss_not_xml_after_interactive")
    return picked


def _is_human_verification_page(html: str) -> bool:
    s = (html or "").lower()
    hits = [
        "verify you are human",
        "we need to verify",
        "安全检查",
        "我们需要确认您是人类",
        "captcha",
        "cloudflare",
    ]
    return any(h.lower() in s for h in hits)


async def _fetch_fully_rendered_html_playwright(
    url: str,
    timeout_s: float,
    *,
    interactive: bool = False,
    storage_state_path: str = "",
) -> str:
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "missing playwright dependency. Install: pip install playwright && playwright install chromium"
        ) from e

    timeout_ms = int(max(timeout_s, 1.0) * 1000)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=(not interactive))
        try:
            storage_state: str | None = None
            sp = str(storage_state_path or "").strip()
            if sp and Path(sp).exists():
                storage_state = sp
            context = await browser.new_context(storage_state=storage_state)
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            try:
                await page.wait_for_selector("article", timeout=min(timeout_ms, 15000))
            except Exception:
                pass

            last_len = -1
            stable_count = 0
            while stable_count < 3:
                html = await page.content()
                cur_len = len(html)
                if cur_len == last_len and cur_len > 0:
                    stable_count += 1
                else:
                    stable_count = 0
                    last_len = cur_len
                await page.wait_for_timeout(500)

            _dbg_emit("A", "[DEBUG] pw_content", {"url": url, "interactive": bool(interactive), "len": int(len(html or "")), "human_verification": bool(_is_human_verification_page(html)), "storage_state_in": bool(storage_state is not None)})
            if _is_human_verification_page(html):
                if not interactive:
                    raise RuntimeError("blocked_by_human_verification")
                await asyncio.to_thread(input, "页面需要人机验证。请在弹出的浏览器中完成验证后按回车继续...")
                try:
                    await page.wait_for_timeout(500)
                    html = await page.content()
                except Exception:
                    pass
                _dbg_emit("A", "[DEBUG] pw_after_interactive", {"url": url, "len": int(len(html or "")), "human_verification": bool(_is_human_verification_page(html))})

            sp2 = str(storage_state_path or "").strip()
            if interactive and sp2:
                Path(sp2).parent.mkdir(parents=True, exist_ok=True)
                await context.storage_state(path=sp2)
                try:
                    sz = int(Path(sp2).stat().st_size)
                except Exception:
                    sz = 0
                _dbg_emit("A", "[DEBUG] pw_storage_saved", {"path": sp2, "size": sz})
            return html
        finally:
            await browser.close()


async def _fetch_article_html(
    client: httpx.AsyncClient,
    *,
    url: str,
    fetch_mode: str,
    timeout_s: float,
    interactive: bool,
    storage_state_path: str,
) -> str:
    url = _normalize_url(url)
    if not url.startswith("http"):
        raise ValueError("bad_url")

    if fetch_mode == "playwright":
        return await _fetch_fully_rendered_html_playwright(
            url, timeout_s, interactive=interactive, storage_state_path=storage_state_path
        )

    if fetch_mode == "httpx":
        return await _fetch_text(client, url)

    try:
        return await _fetch_text(client, url)
    except httpx.HTTPStatusError as e:
        status = int(getattr(e.response, "status_code", 0) or 0)
        if status in {403, 429}:
            return await _fetch_fully_rendered_html_playwright(
                url, timeout_s, interactive=interactive, storage_state_path=storage_state_path
            )
        raise


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rss-url", default="https://www.autosport.com/rss/f1/news/")
    ap.add_argument("--out-dir", default="")
    ap.add_argument("--date-subdir", action="store_true")
    ap.add_argument("--max-items", type=int, default=10)
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--sleep-ms", type=int, default=300)
    ap.add_argument("--fetch-mode", choices=["auto", "httpx", "playwright"], default="auto")
    ap.add_argument("--rss-fetch-mode", choices=["auto", "httpx", "playwright"], default="auto")
    ap.add_argument(
        "--extract",
        choices=["none", "html/body/div[3]/main", "ms-article_detail"],
        default="ms-article_detail",
    )
    ap.add_argument("--keep-raw", action="store_true")
    ap.add_argument("--no-strip-script-style", action="store_true")
    ap.add_argument("--state-file", default="")
    ap.add_argument("--interactive", action="store_true")
    ap.add_argument("--storage-state", default=os.getenv("AUTOSPORT_STORAGE_STATE", "").strip())
    args = ap.parse_args()

    default_out_dir = Path(__file__).resolve().parent / "raw_html" / "autosport"
    out_dir = (Path(args.out_dir).expanduser() if str(args.out_dir or "").strip() else default_out_dir).resolve()
    if args.date_subdir:
        out_dir = out_dir / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d")
    out_dir.mkdir(parents=True, exist_ok=True)

    default_state_file = Path(__file__).resolve().parent / "state" / "autosport.json"
    state_file = (Path(args.state_file).expanduser() if str(args.state_file or "").strip() else default_state_file).resolve()
    state = _read_json_file(state_file) if state_file.exists() else {}
    last_url = _normalize_url(str(state.get("last_url") or ""))
    seen_urls = state.get("seen_urls")
    if not isinstance(seen_urls, list):
        seen_urls = []
    prev_runs = state.get("runs")
    if not isinstance(prev_runs, list):
        prev_runs = []

    timeout = httpx.Timeout(args.timeout, connect=args.timeout)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.autosport.com/",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        default_storage_state = Path(__file__).resolve().parent / "state" / "autosport_playwright_state.json"
        storage_state_path = str(args.storage_state or "").strip()
        if not storage_state_path and bool(args.interactive):
            storage_state_path = str(default_storage_state)

        _dbg_emit(
            "C",
            "[DEBUG] state_loaded",
            {
                "last_url_set": bool(last_url),
                "seen_urls_count": int(len(seen_urls)),
                "storage_state_path": storage_state_path,
                "storage_state_exists": bool(storage_state_path and Path(storage_state_path).exists()),
                "fetch_mode": str(args.fetch_mode),
                "interactive": bool(args.interactive),
            },
        )
        rss_xml = await _fetch_rss_xml(
            client,
            str(args.rss_url),
            rss_fetch_mode=str(args.rss_fetch_mode),
            timeout_s=float(args.timeout),
            interactive=bool(args.interactive),
            storage_state_path=storage_state_path,
        )
        _dbg_emit(
            "A",
            "[DEBUG] rss_fetched",
            {
                "rss_len": int(len(rss_xml or "")),
                "rss_has_rss_tag": bool("<rss" in (rss_xml or "").lower()),
                "rss_has_feed_tag": bool("<feed" in (rss_xml or "").lower()),
                "rss_human_verification": bool(_is_human_verification_page(rss_xml)),
                "rss_sha1_2k": hashlib.sha1((rss_xml or "")[:2000].encode("utf-8", errors="ignore")).hexdigest(),
            },
        )
        items = _iter_unique(_discover_autosport_f1_news_from_rss(rss_xml))
        _dbg_emit("B", "[DEBUG] rss_parsed", {"items_count": int(len(items))})
        to_fetch, new_last_url = _select_new_items(items, last_url, seen_urls, int(args.max_items or 0))
        _dbg_emit("C", "[DEBUG] rss_selected", {"to_fetch_count": int(len(to_fetch)), "new_last_url_set": bool(new_last_url), "hit_last_url": bool(last_url and new_last_url == last_url)})

        run_at_utc = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        fetched_records: list[dict] = []
        for it in to_fetch:
            url = _normalize_url(it.url)
            html = await _fetch_article_html(
                client,
                url=url,
                fetch_mode=args.fetch_mode,
                timeout_s=args.timeout,
                interactive=bool(args.interactive),
                storage_state_path=storage_state_path,
            )
            fn = _guess_filename(url, it.title, it.published_at)
            p = out_dir / fn
            if args.extract == "ms-article_detail":
                extracted = _extract_ms_article_detail(html)
            elif args.extract == "html/body/div[3]/main":
                extracted = _extract_html_body_div3_main(html)
            else:
                extracted = html
            cleaned = extracted if args.no_strip_script_style else _strip_style_and_script_tags(extracted)
            p.write_text(cleaned, encoding="utf-8")
            if args.keep_raw:
                raw_path = p.with_name(p.stem + ".raw.html")
                raw_path.write_text(html, encoding="utf-8")
            meta = {
                "source": "autosport",
                "url": url,
                "title": str(it.title or ""),
                "published_at": str(it.published_at or ""),
                "fetched_at_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                "fetch_mode": str(args.fetch_mode),
                "extract": str(args.extract),
                "cleaned": bool(not args.no_strip_script_style),
                "file": p.name,
            }
            p.with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            fetched_records.append(
                {
                    "url": url,
                    "file": p.name,
                    "title": str(it.title or ""),
                    "published_at": str(it.published_at or ""),
                    "fetched_at_utc": str(meta.get("fetched_at_utc") or ""),
                }
            )
            await asyncio.sleep(max(args.sleep_ms, 0) / 1000.0)

        runs_limit = 20
        this_run = {"ran_at_utc": run_at_utc, "fetched": fetched_records, "fetched_count": len(fetched_records)}
        runs = [this_run]
        for r in prev_runs:
            if not isinstance(r, dict):
                continue
            if len(runs) >= runs_limit:
                break
            runs.append(r)

        seen_limit = 5000
        merged_seen: list[str] = []
        merged_seen_set: set[str] = set()
        for u in [r.get("url") for r in fetched_records] + list(seen_urls):
            un = _normalize_url(str(u or ""))
            if not un or un in merged_seen_set:
                continue
            merged_seen_set.add(un)
            merged_seen.append(un)
            if len(merged_seen) >= seen_limit:
                break

        _write_json_file(
            state_file,
            {
                "source": "autosport",
                "rss_url": str(args.rss_url),
                "last_url": new_last_url,
                "previous_last_url": last_url,
                "updated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                "fetched_count": len(to_fetch),
                "seen_urls": merged_seen,
                "seen_urls_limit": seen_limit,
                "seen_urls_truncated": len(merged_seen) >= seen_limit and len(merged_seen_set) > len(merged_seen),
                "last_run": {"ran_at_utc": run_at_utc, "fetched": fetched_records},
                "runs": runs,
                "runs_limit": runs_limit,
            },
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
