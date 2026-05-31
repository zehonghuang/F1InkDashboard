import argparse
import asyncio
import datetime as dt
import hashlib
import html as html_lib
from html.parser import HTMLParser
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

import httpx


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


async def _fetch_text(client: httpx.AsyncClient, url: str) -> str:
    r = await client.get(url, follow_redirects=True)
    r.raise_for_status()
    return r.text


async def _fetch_fully_rendered_html_playwright(url: str, timeout_s: float) -> str:
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "missing playwright dependency. Install: pip install playwright && playwright install chromium"
        ) from e

    timeout_ms = int(max(timeout_s, 1.0) * 1000)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
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
            return html
        finally:
            await browser.close()


async def _fetch_article_html(
    client: httpx.AsyncClient,
    *,
    url: str,
    fetch_mode: str,
    timeout_s: float,
) -> str:
    url = _normalize_url(url)
    if not url.startswith("http"):
        raise ValueError("bad_url")

    if fetch_mode == "playwright":
        return await _fetch_fully_rendered_html_playwright(url, timeout_s)

    if fetch_mode == "httpx":
        return await _fetch_text(client, url)

    try:
        return await _fetch_text(client, url)
    except httpx.HTTPStatusError as e:
        status = int(getattr(e.response, "status_code", 0) or 0)
        if status in {403, 429}:
            return await _fetch_fully_rendered_html_playwright(url, timeout_s)
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
    ap.add_argument("--extract", choices=["none", "html/body/div[3]/main"], default="html/body/div[3]/main")
    ap.add_argument("--keep-raw", action="store_true")
    ap.add_argument("--no-strip-script-style", action="store_true")
    args = ap.parse_args()

    default_out_dir = Path(__file__).resolve().parent / "raw_html" / "autosport"
    out_dir = (Path(args.out_dir).expanduser() if str(args.out_dir or "").strip() else default_out_dir).resolve()
    if args.date_subdir:
        out_dir = out_dir / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d")
    out_dir.mkdir(parents=True, exist_ok=True)

    timeout = httpx.Timeout(args.timeout, connect=args.timeout)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.autosport.com/",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        rss_xml = await _fetch_text(client, str(args.rss_url))
        items = _iter_unique(_discover_autosport_f1_news_from_rss(rss_xml))
        if args.max_items > 0:
            items = items[: args.max_items]

        for it in items:
            url = _normalize_url(it.url)
            html = await _fetch_article_html(client, url=url, fetch_mode=args.fetch_mode, timeout_s=args.timeout)
            fn = _guess_filename(url, it.title, it.published_at)
            p = out_dir / fn
            extracted = _extract_html_body_div3_main(html) if args.extract == "html/body/div[3]/main" else html
            cleaned = extracted if args.no_strip_script_style else _strip_style_and_script_tags(extracted)
            p.write_text(cleaned, encoding="utf-8")
            if args.keep_raw:
                raw_path = p.with_name(p.stem + ".raw.html")
                raw_path.write_text(html, encoding="utf-8")
            await asyncio.sleep(max(args.sleep_ms, 0) / 1000.0)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
