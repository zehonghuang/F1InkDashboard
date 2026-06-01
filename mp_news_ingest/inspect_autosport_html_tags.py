import argparse
import json
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable


@dataclass
class Node:
    tag: str
    attrs: dict[str, str]
    children: list["Node"]
    text: str


class TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node(tag="__root__", attrs={}, children=[], text="")
        self._stack: list[Node] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        n = Node(tag=tag.lower(), attrs={k: (v or "") for k, v in attrs if k}, children=[], text="")
        self._stack[-1].children.append(n)
        self._stack.append(n)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        n = Node(tag=tag.lower(), attrs={k: (v or "") for k, v in attrs if k}, children=[], text="")
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


def _class_has(n: Node, cls: str) -> bool:
    c = (n.attrs.get("class") or "").strip()
    if not c:
        return False
    return cls in c.split()


def _class_tokens(n: Node) -> set[str]:
    c = (n.attrs.get("class") or "").strip()
    if not c:
        return set()
    return {x for x in c.split() if x}


def _class_has_all(n: Node, classes: set[str]) -> bool:
    if not classes:
        return False
    return classes.issubset(_class_tokens(n))


def _find_first(n: Node, pred: Callable[[Node], bool]) -> Node | None:
    for c in n.children:
        if pred(c):
            return c
        found = _find_first(c, pred)
        if found is not None:
            return found
    return None


def _find_all(n: Node, pred: Callable[[Node], bool], limit: int) -> list[Node]:
    out: list[Node] = []

    def walk(x: Node) -> None:
        if limit > 0 and len(out) >= limit:
            return
        for c in x.children:
            if pred(c):
                out.append(c)
                if limit > 0 and len(out) >= limit:
                    return
            walk(c)
            if limit > 0 and len(out) >= limit:
                return

    walk(n)
    return out


def _text(n: Node) -> str:
    parts: list[str] = []

    def walk(x: Node) -> None:
        if x.text:
            parts.append(x.text)
        for c in x.children:
            walk(c)

    walk(n)
    s = ""
    for p in parts:
        if not p:
            continue
        if s and ((s[-1].isalnum() and p[0].isalnum()) or (s[-1] in ".!?" and p[0].isalnum())):
            s += " "
        s += p
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _collect_blocks(n: Node) -> list[dict]:
    out: list[dict] = []

    def walk(x: Node) -> None:
        if x.tag == "section" and (x.attrs.get("data-widget") or "").strip().lower() == "image":
            src = (x.attrs.get("data-src") or "").strip()
            if src.startswith("//"):
                src = "https:" + src
            if src:
                out.append(
                    {
                        "type": "img",
                        "src": src,
                        "alt": (x.attrs.get("data-title") or "").strip(),
                        "width": (x.attrs.get("data-width") or "").strip(),
                        "height": (x.attrs.get("data-height") or "").strip(),
                        "from": "section[data-widget=image]",
                    }
                )
            for c in x.children:
                if c.tag == "p":
                    walk(c)
            return
        if x.tag == "p":
            out.append({"type": "p", "text": _text(x)})
            return
        for c in x.children:
            walk(c)

    walk(n)
    return out


def _extract_cover_from_ms_content_main(root: Node) -> dict | None:
    container = _find_first(
        root,
        lambda x: x.tag == "div"
        and _class_has_all(x, {"ms-content__main", "ms-content__main--regular"}),
    )
    if container is None:
        return None

    sec = _find_first(
        container,
        lambda x: x.tag == "section" and (x.attrs.get("data-widget") or "").strip().lower() == "image",
    )
    if sec is not None:
        src = (sec.attrs.get("data-src") or "").strip()
        if src.startswith("//"):
            src = "https:" + src
        if src:
            return {
                "type": "img",
                "src": src,
                "alt": (sec.attrs.get("data-title") or "").strip(),
                "width": (sec.attrs.get("data-width") or "").strip(),
                "height": (sec.attrs.get("data-height") or "").strip(),
                "from": "div.ms-content__main--regular section[data-widget=image]",
            }

    img = _find_first(container, lambda x: x.tag == "img" and (x.attrs.get("src") or "").strip())
    if img is None:
        return None
    src = (img.attrs.get("src") or "").strip()
    if src.startswith("//"):
        src = "https:" + src
    if not src:
        return None
    return {
        "type": "img",
        "src": src,
        "alt": (img.attrs.get("alt") or "").strip(),
        "width": (img.attrs.get("width") or "").strip(),
        "height": (img.attrs.get("height") or "").strip(),
        "from": "div.ms-content__main--regular img",
    }


def _merge_paragraph_fragments(blocks: list[dict]) -> list[dict]:
    out: list[dict] = []
    prev_p_key = ""
    prev_img_key = ""
    for b in blocks:
        if b.get("type") != "p":
            if b.get("type") == "img" and out and out[-1].get("type") == "img":
                a = str(out[-1].get("src") or "").strip()
                bb = str(b.get("src") or "").strip()
                if a == bb:
                    continue
            if b.get("type") == "img":
                src = str(b.get("src") or "").strip()
                img_key = src
                if img_key and img_key == prev_img_key:
                    continue
                prev_img_key = img_key
            out.append(b)
            continue
        s = str(b.get("text") or "").strip()
        if not s:
            continue
        p_key = re.sub(r"[\s\u00a0\u200b]+", "", s).lower()
        if p_key and p_key == prev_p_key:
            continue
        prev_p_key = p_key
        if out and out[-1].get("type") == "p" and s.startswith((",", ";", ":", ")", "]", "}", "’", "'")):
            prev = str(out[-1].get("text") or "")
            if prev.endswith(".") and s.startswith(","):
                prev = prev[:-1]
            out[-1]["text"] = prev + s
            continue
        out.append({"type": "p", "text": s})
    return out


def _load_title_from_sidecar(html_path: Path) -> str:
    p = html_path.with_suffix(".json")
    if not p.exists():
        return ""
    try:
        obj = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return ""
    if isinstance(obj, dict):
        return str(obj.get("title") or "").strip()
    return ""


def _inspect_one(html_path: Path, limit_paragraphs: int) -> dict:
    html = html_path.read_text(encoding="utf-8", errors="ignore")
    tb = TreeBuilder()
    tb.feed(html)
    root = tb.root

    ms_detail = _find_first(root, lambda x: x.tag == "div" and _class_has(x, "ms-article_detail"))
    scope = ms_detail or root

    title_node = _find_first(scope, lambda x: x.tag == "h1")

    content_node = _find_first(scope, lambda x: x.tag == "div" and _class_has(x, "ms-article-content"))
    if content_node is None:
        content_node = _find_first(scope, lambda x: x.tag == "div" and _class_has(x, "ms-article__body"))
    if content_node is None:
        content_node = scope

    blocks = _merge_paragraph_fragments(_collect_blocks(content_node))
    cover = _extract_cover_from_ms_content_main(root)
    if cover is not None:
        cover_src = str(cover.get("src") or "").strip()
        blocks = [cover] + [
            b for b in blocks if not (b.get("type") == "img" and str(b.get("src") or "").strip() == cover_src)
        ]
    if int(limit_paragraphs or 0) > 0:
        kept: list[dict] = []
        p_count = 0
        for b in blocks:
            kept.append(b)
            if b.get("type") == "p":
                p_count += 1
                if p_count >= int(limit_paragraphs):
                    break
        blocks = kept

    raw_title_tag = ""
    raw_title_class = ""
    raw_title_text = ""
    raw_path = html_path.with_suffix(".raw.html")
    if raw_path.exists():
        raw_html = raw_path.read_text(encoding="utf-8", errors="ignore")
        tb2 = TreeBuilder()
        tb2.feed(raw_html)
        raw_root = tb2.root
        h1 = _find_first(raw_root, lambda x: x.tag == "h1")
        if h1 is not None:
            raw_title_tag = h1.tag
            raw_title_class = (h1.attrs.get("class") or "").strip()
            raw_title_text = _text(h1)

    widget_images = _find_all(
        content_node,
        lambda x: x.tag == "section" and (x.attrs.get("data-widget") or "").strip().lower() == "image",
        100,
    )
    images_widget = []
    for s in widget_images:
        src = (s.attrs.get("data-src") or "").strip()
        if src.startswith("//"):
            src = "https:" + src
        if src:
            images_widget.append(src)

    return {
        "file": str(html_path),
        "title_from_html": _text(title_node) if title_node is not None else "",
        "title_from_json": _load_title_from_sidecar(html_path),
        "title_tag_raw": raw_title_tag,
        "title_class_raw": raw_title_class,
        "title_text_raw": raw_title_text,
        "content_container_tag": content_node.tag,
        "content_container_class": (content_node.attrs.get("class") or "").strip(),
        "content_container_data_series": (content_node.attrs.get("data-series") or "").strip(),
        "content_container_data_position": (content_node.attrs.get("data-position") or "").strip(),
        "paragraphs": blocks,
        "images_widget": images_widget,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(Path(__file__).resolve().parent / "raw_html" / "autosport"))
    ap.add_argument("--file", default="")
    ap.add_argument("--limit-files", type=int, default=3)
    ap.add_argument("--limit-paragraphs", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if str(args.file or "").strip():
        files = [Path(str(args.file)).resolve()]
    else:
        d = Path(str(args.dir)).resolve()
        files = sorted([p for p in d.glob("*.html") if not p.name.endswith(".raw.html")], reverse=True)
        if int(args.limit_files or 0) > 0:
            files = files[: int(args.limit_files)]

    out = [_inspect_one(p, int(args.limit_paragraphs or 0)) for p in files if p.exists()]
    if args.json:
        sys.stdout.buffer.write((json.dumps(out, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        return 0

    for it in out:
        print("=" * 80)
        print(Path(it["file"]).name)
        t_html = str(it.get("title_from_html") or "")
        t_json = str(it.get("title_from_json") or "")
        t_raw = str(it.get("title_text_raw") or "")
        if t_json:
            print("title(json):", t_json)
        if t_raw:
            print(
                "title(raw):",
                t_raw,
                f'(tag={it.get("title_tag_raw")}, class="{it.get("title_class_raw")}")',
            )
        if t_html:
            print("title(extracted_html):", t_html)
        print("content container:", f'{it.get("content_container_tag")} class="{it.get("content_container_class")}"')
        ds = str(it.get("content_container_data_series") or "")
        dp = str(it.get("content_container_data_position") or "")
        if ds or dp:
            print("content attrs:", f"data-series={ds or '-'} data-position={dp or '-'}")
        pi = 0
        ii = 0
        for b in it.get("paragraphs") or []:
            if b.get("type") == "p":
                pi += 1
                print(f"[p{pi}]", b.get("text") or "")
            elif b.get("type") == "img":
                ii += 1
                print(f"[img{ii}]", b.get("src") or "", (b.get("alt") or ""))
        wi = it.get("images_widget") or []
        if wi:
            print("section[data-widget=image] count:", len(wi))
            for i, u in enumerate(wi, start=1):
                print(f"[w{i}]", u)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
