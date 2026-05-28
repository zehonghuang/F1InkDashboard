import argparse
import asyncio
import datetime as dt
import hashlib
import json
import os
import re
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET

import httpx


@dataclass(frozen=True)
class DiscoveredArticle:
    source_name: str
    url: str
    title: str | None = None
    published_at: str | None = None


def _now_utc_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_id(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(s or "").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _sha1_hex(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def _parse_rfc3339_or_none(s: str | None) -> dt.datetime | None:
    raw = str(s or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.datetime.fromisoformat(raw)
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


def _normalize_published_at(s: str | None) -> str | None:
    t = _parse_rfc3339_or_none(s)
    if not t:
        return None
    if not t.tzinfo:
        t = t.replace(tzinfo=dt.timezone.utc)
    return t.isoformat()


def _xml_text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def _discover_from_rss(xml_text: str, source_name: str) -> list[DiscoveredArticle]:
    xml_text = str(xml_text or "").strip()
    if not xml_text:
        return []
    out: list[DiscoveredArticle] = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    items = root.findall("./channel/item")
    for it in items[:30]:
        title = _xml_text(it.find("title"))
        link = _xml_text(it.find("link"))
        pub_date = _xml_text(it.find("pubDate"))
        out.append(
            DiscoveredArticle(
                source_name=source_name,
                url=link,
                title=title or None,
                published_at=pub_date or None,
            )
        )
    if out:
        return [a for a in out if a.url]

    ns_atom = {"atom": "http://www.w3.org/2005/Atom"}
    entries = root.findall("./atom:entry", namespaces=ns_atom)
    for e in entries[:30]:
        title = _xml_text(e.find("atom:title", namespaces=ns_atom))
        href = ""
        for link_el in e.findall("atom:link", namespaces=ns_atom):
            rel = (link_el.attrib.get("rel") or "").strip()
            if rel and rel != "alternate":
                continue
            href = (link_el.attrib.get("href") or "").strip()
            if href:
                break
        published = _xml_text(e.find("atom:published", namespaces=ns_atom))
        if not published:
            published = _xml_text(e.find("atom:updated", namespaces=ns_atom))
        out.append(
            DiscoveredArticle(
                source_name=source_name,
                url=href,
                title=title or None,
                published_at=published or None,
            )
        )
    return [a for a in out if a.url]


def _extract_links_from_list_page(html: str, base_url: str) -> list[str]:
    html = str(html or "")
    hrefs = re.findall(r'href="([^"]+)"', html, flags=re.IGNORECASE)
    out: list[str] = []
    seen: set[str] = set()
    base_host = (urlparse(base_url).netloc or "").lower()
    for h in hrefs:
        u = urljoin(base_url, h)
        if not u.startswith("http"):
            continue
        p = urlparse(u)
        if not p.netloc:
            continue
        host = (p.netloc or "").lower()
        path = (p.path or "").lower()
        if base_host and host != base_host:
            continue
        if "formula1.com" in host and "/en/latest/article/" not in path:
            continue
        if "autosport.com" in host and not ("/f1/" in path and "/news/" in path):
            continue
        if "motorsport.com" in host and not ("/f1/" in path and "/news/" in path):
            continue
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def _extract_json_ld_objects(html: str) -> list[dict[str, Any]]:
    html = str(html or "")
    out: list[dict[str, Any]] = []
    for m in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        raw = (m.group(1) or "").strip()
        if not raw:
            continue
        raw = re.sub(r"<!--|-->", "", raw).strip()
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if isinstance(obj, dict):
            out.append(obj)
        elif isinstance(obj, list):
            out.extend([x for x in obj if isinstance(x, dict)])
    return out


def _pick_article_from_json_ld(objs: list[dict[str, Any]]) -> dict[str, Any] | None:
    for o in objs:
        t = o.get("@type")
        types: list[str] = []
        if isinstance(t, str):
            types = [t]
        elif isinstance(t, list):
            types = [x for x in t if isinstance(x, str)]
        if any(x.lower() in {"newsarticle", "article", "reportage"} for x in types):
            return o
    for o in objs:
        if "@graph" in o and isinstance(o["@graph"], list):
            picked = _pick_article_from_json_ld([x for x in o["@graph"] if isinstance(x, dict)])
            if picked:
                return picked
    return None


def _meta_content(html: str, key: str) -> str:
    html = str(html or "")
    k = re.escape(key)
    m = re.search(rf'<meta[^>]+property=["\']{k}["\'][^>]+content=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)
    if m:
        return (m.group(1) or "").strip()
    m = re.search(rf'<meta[^>]+name=["\']{k}["\'][^>]+content=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)
    if m:
        return (m.group(1) or "").strip()
    return ""


def _strip_html(s: str) -> str:
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _extract_article_raw(html: str, url: str) -> dict[str, Any]:
    objs = _extract_json_ld_objects(html)
    art = _pick_article_from_json_ld(objs) or {}
    headline = art.get("headline") if isinstance(art, dict) else None
    date_published = art.get("datePublished") if isinstance(art, dict) else None
    date_modified = art.get("dateModified") if isinstance(art, dict) else None
    image = art.get("image") if isinstance(art, dict) else None
    author = art.get("author") if isinstance(art, dict) else None
    body = art.get("articleBody") if isinstance(art, dict) else None

    if not headline:
        headline = _meta_content(html, "og:title") or ""
    if not date_published:
        date_published = _meta_content(html, "article:published_time") or _meta_content(html, "og:updated_time") or ""
    if not body:
        body = _meta_content(html, "og:description") or ""

    author_name = ""
    if isinstance(author, dict):
        author_name = str(author.get("name") or "").strip()
    elif isinstance(author, list):
        for a in author:
            if isinstance(a, dict) and str(a.get("name") or "").strip():
                author_name = str(a.get("name") or "").strip()
                break
    elif isinstance(author, str):
        author_name = author.strip()

    image_url = ""
    if isinstance(image, str):
        image_url = image.strip()
    elif isinstance(image, dict):
        image_url = str(image.get("url") or "").strip()
    elif isinstance(image, list):
        for x in image:
            if isinstance(x, str) and x.strip():
                image_url = x.strip()
                break
            if isinstance(x, dict) and str(x.get("url") or "").strip():
                image_url = str(x.get("url") or "").strip()
                break
    if not image_url:
        image_url = _meta_content(html, "og:image") or ""

    return {
        "url": url,
        "headline": str(headline or "").strip(),
        "published_at": str(date_published or "").strip(),
        "modified_at": str(date_modified or "").strip(),
        "author": author_name,
        "image_url": image_url,
        "body_text": _strip_html(str(body or "")),
        "json_ld": art if isinstance(art, dict) else {},
    }


async def _http_get_text(client: httpx.AsyncClient, url: str) -> str:
    r = await client.get(url, follow_redirects=True)
    r.raise_for_status()
    return r.text


async def _http_get_bytes(client: httpx.AsyncClient, url: str) -> bytes:
    r = await client.get(url, follow_redirects=True)
    r.raise_for_status()
    return r.content


def _load_index(static_dir: Path) -> list[dict[str, Any]]:
    p = static_dir / "mp_news" / "index.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def _write_index(static_dir: Path, items: list[dict[str, Any]]) -> None:
    p = static_dir / "mp_news" / "index.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_item(static_dir: Path, item_id: str, item: dict[str, Any]) -> None:
    p = static_dir / "mp_news" / "items" / f"{item_id}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _index_source_url(it: dict[str, Any]) -> str:
    src = it.get("source")
    if isinstance(src, dict):
        return str(src.get("url") or "").strip()
    return ""


def _make_item_id(source_name: str, url: str, published_at: str | None) -> str:
    t = _parse_rfc3339_or_none(published_at)
    ymd = (t or dt.datetime.now(dt.timezone.utc)).strftime("%Y%m%d")
    slug = _safe_id(urlparse(url).path.split("/")[-1] or "")
    if not slug:
        slug = _sha1_hex(url)[:10]
    base = _safe_id(f"n_{ymd}_{source_name}_{slug}")
    if not base.startswith("n_"):
        base = "n_" + base
    return base[:80]


def _guess_ext_from_url(url: str) -> str:
    p = urlparse(url)
    ext = Path(p.path).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ext
    return ".jpg"


async def _download_cover(static_dir: Path, client: httpx.AsyncClient, item_id: str, image_url: str) -> str:
    image_url = str(image_url or "").strip()
    if not image_url.startswith("http"):
        return ""
    ext = _guess_ext_from_url(image_url)
    fn = f"{item_id}{ext}"
    rel = f"/static/news/{fn}"
    out_path = static_dir / "news" / fn
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists() and out_path.stat().st_size > 0:
        return rel
    b = await _http_get_bytes(client, image_url)
    out_path.write_bytes(b)
    return rel


def _clean_mp_news_item(obj: dict[str, Any]) -> dict[str, Any]:
    allowed_layout = {"BREAKING", "HERO", "FEATURE", "STANDARD", "BULLETIN"}
    allowed_type = {"REGULATION", "PADDOCK", "STRATEGY", "DRIVER", "TECH"}
    out = dict(obj or {})
    if out.get("layout_code") not in allowed_layout:
        out["layout_code"] = "FEATURE"
    if out.get("type_code") not in allowed_type:
        out["type_code"] = "PADDOCK"
    if not isinstance(out.get("pinned"), bool):
        out["pinned"] = False
    try:
        out["weight"] = int(out.get("weight") or 0)
    except Exception:
        out["weight"] = 0
    if not isinstance(out.get("tag_text"), str):
        out["tag_text"] = ""
    if not isinstance(out.get("tags"), list):
        out.pop("tags", None)
    else:
        out["tags"] = [str(x) for x in out["tags"] if str(x).strip()]
        if not out["tags"]:
            out.pop("tags", None)
    if "hero_display_code" in out and out["layout_code"] != "HERO":
        out.pop("hero_display_code", None)
    return out


async def _openclaw_run(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    path: str,
    auth_header: str,
    auth_value: str,
    skill: str,
    payload: dict[str, Any],
    timeout_s: float,
) -> dict[str, Any]:
    u = base_url.rstrip("/") + (path if path.startswith("/") else f"/{path}")
    headers: dict[str, str] = {}
    if auth_header.strip() and auth_value.strip():
        headers[auth_header.strip()] = auth_value.strip()
    r = await client.post(
        u,
        headers=headers,
        json={"skill": skill, "input": payload},
        timeout=timeout_s,
    )
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and "output" in data and isinstance(data["output"], dict):
        return data["output"]
    if isinstance(data, dict):
        return data
    raise RuntimeError("openclaw_bad_response")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--static-dir", default=str(Path(__file__).resolve().parents[1] / "static"))
    ap.add_argument("--rss-urls", default=os.getenv("NEWS_RSS_URLS", "https://www.autosport.com/rss/f1/news/|https://www.motorsport.com/rss/f1/news/|https://www.grandprix.com/rss.xml"))
    ap.add_argument("--list-urls", default=os.getenv("NEWS_LIST_URLS", "https://www.formula1.com/en/latest"))
    ap.add_argument("--openclaw-url", default=os.getenv("OPENCLAW_BASE_URL", "").strip())
    ap.add_argument("--openclaw-path", default=os.getenv("OPENCLAW_RUN_PATH", "/run"))
    ap.add_argument("--openclaw-skill", default=os.getenv("OPENCLAW_NEWS_SKILL", "f1_news_enrich_v1"))
    ap.add_argument("--openclaw-auth-header", default=os.getenv("OPENCLAW_AUTH_HEADER", "Authorization"))
    ap.add_argument("--openclaw-auth-value", default=os.getenv("OPENCLAW_AUTH_VALUE", "").strip())
    ap.add_argument("--max-new", type=int, default=int(os.getenv("NEWS_MAX_NEW", "10") or "10"))
    ap.add_argument("--timeout", type=float, default=float(os.getenv("NEWS_HTTP_TIMEOUT", "20") or "20"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    static_dir = Path(args.static_dir).resolve()
    existing = _load_index(static_dir)
    known_urls = {u for u in (_index_source_url(x) for x in existing) if u}
    known_ids = {str(x.get("id") or "").strip() for x in existing if isinstance(x, dict)}

    rss_urls = [u.strip() for u in str(args.rss_urls or "").split("|") if u.strip()]
    list_urls = [u.strip() for u in str(args.list_urls or "").split("|") if u.strip()]

    timeout = httpx.Timeout(args.timeout, connect=args.timeout)
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "F1InkDashboardNewsBot/1.0"}) as client:
        discovered: list[DiscoveredArticle] = []
        for u in rss_urls:
            try:
                xml = await _http_get_text(client, u)
            except Exception:
                continue
            src = urlparse(u).netloc or "rss"
            discovered.extend(_discover_from_rss(xml, src))

        for u in list_urls:
            try:
                html = await _http_get_text(client, u)
            except Exception:
                continue
            src = urlparse(u).netloc or "list"
            links = _extract_links_from_list_page(html, u)
            for link in links[:80]:
                discovered.append(DiscoveredArticle(source_name=src, url=link))

        new_candidates: list[DiscoveredArticle] = []
        seen: set[str] = set()
        for a in discovered:
            url = str(a.url or "").strip()
            if not url or not url.startswith("http"):
                continue
            if url in seen:
                continue
            seen.add(url)
            if url in known_urls:
                continue
            new_candidates.append(a)

        if not new_candidates:
            return 0

        if args.max_new > 0:
            new_candidates = new_candidates[: args.max_new]

        if not args.openclaw_url.strip():
            raise SystemExit("missing OPENCLAW_BASE_URL / --openclaw-url")

        out_index = list(existing)
        for a in new_candidates:
            try:
                html = await _http_get_text(client, a.url)
            except Exception:
                continue
            raw = _extract_article_raw(html, a.url)

            source_name = a.source_name or urlparse(a.url).netloc or "unknown"
            published_at = _normalize_published_at(raw.get("published_at")) or _normalize_published_at(a.published_at) or _now_utc_iso()
            item_id = _make_item_id(_safe_id(source_name), a.url, published_at)
            if item_id in known_ids:
                item_id = (item_id[:70] + "_" + _sha1_hex(a.url)[:8]).strip("_")

            openclaw_input = {
                "source": {"name": source_name, "url": a.url},
                "article": {
                    "url": a.url,
                    "title": raw.get("headline") or a.title or "",
                    "published_at": published_at,
                    "author": raw.get("author") or "",
                    "image_url": raw.get("image_url") or "",
                    "body_text": raw.get("body_text") or "",
                },
                "target": {
                    "tz": "Asia/Shanghai",
                    "content_format_code": "RICH_TEXT_NODES",
                    "type_codes": ["REGULATION", "PADDOCK", "STRATEGY", "DRIVER", "TECH"],
                    "layout_codes": ["BREAKING", "HERO", "FEATURE", "STANDARD", "BULLETIN"],
                },
            }

            if args.dry_run:
                print(json.dumps({"id": item_id, "openclaw_input": openclaw_input}, ensure_ascii=False, indent=2))
                continue

            oc = await _openclaw_run(
                client,
                base_url=args.openclaw_url,
                path=args.openclaw_path,
                auth_header=args.openclaw_auth_header,
                auth_value=args.openclaw_auth_value,
                skill=args.openclaw_skill,
                payload=openclaw_input,
                timeout_s=max(args.timeout, 10.0),
            )

            cover_url = str(oc.get("cover_url") or "").strip()
            if not cover_url:
                cover_url = await _download_cover(static_dir, client, item_id, str(raw.get("image_url") or ""))

            item = {
                "id": item_id,
                "layout_code": oc.get("layout_code") or "FEATURE",
                "hero_display_code": oc.get("hero_display_code") or "",
                "type_code": oc.get("type_code") or "PADDOCK",
                "pinned": bool(oc.get("pinned") or False),
                "weight": int(oc.get("weight") or 0),
                "tag_text": oc.get("tag_text") or "",
                "tags": oc.get("tags") if isinstance(oc.get("tags"), list) else None,
                "title": oc.get("title") or "",
                "summary": oc.get("summary") or "",
                "cover_url": cover_url,
                "published_at": published_at,
                "source": {"name": source_name, "url": a.url},
                "content": oc.get("content") if isinstance(oc.get("content"), dict) else None,
                "raw": {"extracted_at_utc": _now_utc_iso(), "image_url": raw.get("image_url") or "", "author": raw.get("author") or ""},
            }
            if not item["hero_display_code"]:
                item.pop("hero_display_code", None)
            if item.get("tags") is None:
                item.pop("tags", None)
            if item.get("content") is None:
                item["content"] = {"format_code": "PLAIN", "text": item["summary"]}
            item = _clean_mp_news_item(item)

            _write_item(static_dir, item_id, item)

            index_item = {k: v for k, v in item.items() if k not in {"content", "source", "raw"}}
            out_index.append(index_item)
            known_urls.add(a.url)
            known_ids.add(item_id)

        def sort_key(x: dict[str, Any]) -> tuple:
            pinned = bool(x.get("pinned"))
            weight = int(x.get("weight") or 0)
            t = _parse_rfc3339_or_none(str(x.get("published_at") or ""))
            ts = (t.timestamp() if t else 0.0)
            return (0 if pinned else 1, -weight, -ts)

        out_index = [x for x in out_index if isinstance(x, dict) and str(x.get("id") or "").strip()]
        out_index.sort(key=sort_key)
        _write_index(static_dir, out_index)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
