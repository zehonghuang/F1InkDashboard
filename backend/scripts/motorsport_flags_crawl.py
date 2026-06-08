import os
import sys
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


def _norm_url(u: str) -> str:
    u = (u or "").strip()
    if not u:
        return ""
    if u.startswith("//"):
        return "https:" + u
    return u


def crawl_flag_svgs(page_url: str) -> list[str]:
    html = requests.get(
        page_url,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0"},
    ).text
    soup = BeautifulSoup(html, "html.parser")
    urls: set[str] = set()

    for el in soup.select(".msnt-select__option-flag"):
        if el.name == "img":
            urls.add(_norm_url(el.get("src")))
        for img in el.select("img"):
            urls.add(_norm_url(img.get("src")))

    out = []
    for u in urls:
        if not u:
            continue
        if "/static/img/cf/" not in u:
            continue
        if not u.lower().endswith(".svg"):
            continue
        out.append(u)

    out.sort()
    return out


def download_svgs(urls: list[str], out_dir: str) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    saved: list[str] = []

    for u in urls:
        name = os.path.basename(urlparse(u).path)
        if not name:
            continue
        dst = os.path.join(out_dir, name)
        b = requests.get(
            u,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0"},
        ).content
        if b:
            with open(dst, "wb") as f:
                f.write(b)
            saved.append(dst)

    return saved


def read_urls_file(p: str) -> list[str]:
    try:
        with open(p, "r", encoding="utf-8") as f:
            lines = [x.strip() for x in f.read().splitlines()]
    except OSError:
        return []
    out: list[str] = []
    for x in lines:
        if not x:
            continue
        if x.startswith("#"):
            continue
        out.append(_norm_url(x))
    return out


def main() -> None:
    page_url = "https://www.motorsport.com/f1/results/2026/monaco-gp-661660/?st=RACE"
    out_dir = os.path.join("backend", "static", "flags", "motorsport")
    url_file = os.path.join("backend", "scripts", "motorsport_flags_urls.txt")
    urls = read_urls_file(url_file)
    if not urls:
        urls = crawl_flag_svgs(page_url)
    if not urls:
        print("urls=0 saved=0", file=sys.stderr)
        return
    saved = download_svgs(urls, out_dir)
    print(f"urls={len(urls)} saved={len(saved)} out_dir={out_dir}")
    for p in saved:
        print(p)


if __name__ == "__main__":
    main()
