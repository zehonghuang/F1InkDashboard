#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen


USER_AGENT = "F1InkDashboard Motorsport Results Crawler/1.0"
DEFAULT_DELAYS = [30, 15, 10, 5, 1]
DEFAULT_TIMEOUT = 20.0
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DEFAULT_OUTPUT_ROOT = BACKEND_DIR / "static" / "assets" / "motorsport_results"
DEFAULT_STATE_FILE = DEFAULT_OUTPUT_ROOT / "_crawler_state.json"
MOTORSPORT_ROOT = "https://www.motorsport.com"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def collapse_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "unknown"


def normalize_event_name(value: str) -> str:
    text = slugify(value).replace("formula-1", "").replace("f1", "")
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def json_dump(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
            else:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_delay_chain(value: str) -> list[int]:
    parts = [int(chunk.strip()) for chunk in value.split(",") if chunk.strip()]
    if not parts:
        raise ValueError("delay chain cannot be empty")
    return parts


def cumulative_minutes(parts: list[int]) -> list[int]:
    total = 0
    values: list[int] = []
    for part in parts:
        total += part
        values.append(total)
    return values


def hash_payload(payload: Any) -> str:
    import hashlib

    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class BrowserClient:
    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout

    def fetch_text(self, url: str) -> str:
        req = Request(url, headers=BROWSER_HEADERS)
        with urlopen(req, timeout=self.timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")

    def fetch_json(self, url: str) -> Any:
        return json.loads(self.fetch_text(url))


class AnchorCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[dict[str, str]] = []
        self._current_href: str | None = None
        self._text_chunks: list[str] = []
        self._capture_h1 = False
        self.h1_text = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag == "a":
            self._current_href = attr_map.get("href")
            self._text_chunks = []
        elif tag == "img" and self._current_href:
            alt = collapse_ws(attr_map.get("alt") or "")
            if alt:
                self._text_chunks.append(alt)
        elif tag == "h1":
            self._capture_h1 = True

    def handle_data(self, data: str) -> None:
        text = collapse_ws(data)
        if not text:
            return
        if self._current_href:
            self._text_chunks.append(text)
        if self._capture_h1:
            if self.h1_text:
                self.h1_text += " "
            self.h1_text += text

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._current_href:
            text = collapse_ws(" ".join(self._text_chunks))
            self.anchors.append({"href": self._current_href, "text": text})
            self._current_href = None
            self._text_chunks = []
        elif tag == "h1":
            self._capture_h1 = False


class FirstTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_table = False
        self.table_done = False
        self.in_row = False
        self.current_cell_tag: str | None = None
        self.current_cell_chunks: list[str] = []
        self.current_row: list[str] = []
        self.headers: list[str] = []
        self.rows: list[list[str]] = []
        self._capture_heading: str | None = None
        self.heading_texts: dict[str, list[str]] = defaultdict(list)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if not self.table_done and tag == "table":
            self.in_table = True
        elif self.in_table and tag == "tr":
            self.in_row = True
            self.current_row = []
        elif self.in_table and tag in ("th", "td"):
            self.current_cell_tag = tag
            self.current_cell_chunks = []
        elif tag in ("h1", "h2", "h3"):
            self._capture_heading = tag
        elif self.current_cell_tag and tag == "img":
            alt = collapse_ws(dict(attrs).get("alt") or "")
            if alt:
                self.current_cell_chunks.append(alt)

    def handle_data(self, data: str) -> None:
        text = collapse_ws(data)
        if not text:
            return
        if self.current_cell_tag:
            self.current_cell_chunks.append(text)
        if self._capture_heading:
            self.heading_texts[self._capture_heading].append(text)

    def handle_endtag(self, tag: str) -> None:
        if self.in_table and tag in ("th", "td") and self.current_cell_tag == tag:
            value = collapse_ws(" ".join(self.current_cell_chunks))
            self.current_row.append(value)
            self.current_cell_tag = None
            self.current_cell_chunks = []
        elif self.in_table and tag == "tr" and self.in_row:
            if self.current_row:
                if not self.headers and any(value for value in self.current_row):
                    self.headers = self.current_row[:]
                else:
                    self.rows.append(self.current_row[:])
            self.in_row = False
            self.current_row = []
        elif self.in_table and tag == "table":
            self.in_table = False
            self.table_done = True
        elif tag in ("h1", "h2", "h3") and self._capture_heading == tag:
            self._capture_heading = None


def unique_headers(headers: list[str], width: int) -> list[str]:
    used: dict[str, int] = {}
    out: list[str] = []
    for index in range(width):
        raw = headers[index] if index < len(headers) else ""
        base = slugify(raw).replace("-", "_")
        if not base:
            base = f"column_{index + 1}"
        count = used.get(base, 0) + 1
        used[base] = count
        out.append(base if count == 1 else f"{base}_{count}")
    return out


def rows_to_objects(headers: list[str], rows: list[list[str]]) -> list[dict[str, str]]:
    width = max([len(headers)] + [len(row) for row in rows] + [0])
    if width == 0:
        return []
    object_headers = unique_headers(headers, width)
    out: list[dict[str, str]] = []
    for row in rows:
        item: dict[str, str] = {}
        for index, key in enumerate(object_headers):
            item[key] = row[index] if index < len(row) else ""
        out.append(item)
    return out


def code_from_url(url: str) -> str:
    params = parse_qs(urlparse(url).query)
    value = (params.get("st") or [""])[0]
    return str(value).strip().upper()


def normalize_session_code(value: str) -> str:
    text = collapse_ws(value).upper()
    if not text:
        return ""
    text = text.replace("PRACTICE ", "FP")
    text = text.replace("FREE PRACTICE ", "FP")
    aliases = {
        "QUALIFYING": "Q",
        "SPRINT QUALIFYING": "SQ",
        "SPRINT SHOOTOUT": "SQ",
    }
    return aliases.get(text, text)


def extract_season_results_links(html: str, season: int) -> list[dict[str, str]]:
    parser = AnchorCollector()
    parser.feed(html)
    links: dict[str, dict[str, str]] = {}
    pattern = re.compile(rf"/f1/results/{season}/([^/?#]+)(?:/)?$")
    for anchor in parser.anchors:
        href = anchor["href"]
        if "?st=" in href:
            continue
        match = pattern.search(href)
        if not match:
            continue
        slug = match.group(1)
        text = collapse_ws(anchor["text"])
        if not text:
            text = slug.replace("-", " ")
        current = links.get(slug)
        if current is None or len(text) > len(current["name"]):
            links[slug] = {
                "slug": slug,
                "name": text,
                "url": urljoin(MOTORSPORT_ROOT, href),
            }
    return list(links.values())


def discover_results_url(
    client: BrowserClient,
    season: int,
    event_name: str,
    event_slug: str | None = None,
    cached_url: str | None = None,
) -> str | None:
    if cached_url:
        return cached_url
    season_url = f"{MOTORSPORT_ROOT}/f1/results/{season}/"
    candidates = extract_season_results_links(client.fetch_text(season_url), season)
    if event_slug:
        for item in candidates:
            if item["slug"] == event_slug:
                return item["url"]
    target = normalize_event_name(event_name)
    best_url = None
    best_score = None
    for item in candidates:
        name_norm = normalize_event_name(item["name"])
        if not name_norm:
            continue
        score = None
        if name_norm == target:
            score = 0
        elif target in name_norm or name_norm in target:
            score = abs(len(name_norm) - len(target)) + 5
        if score is None:
            continue
        if best_score is None or score < best_score:
            best_score = score
            best_url = item["url"]
    if best_url:
        return best_url
    if event_slug:
        fallback_url = f"{MOTORSPORT_ROOT}/f1/results/{season}/{event_slug}/"
        try:
            html = client.fetch_text(fallback_url)
            _, session_links = extract_session_links(html, fallback_url)
            if session_links:
                return fallback_url
        except Exception:
            pass
    return best_url


def extract_session_links(html: str, page_url: str) -> tuple[str, dict[str, str]]:
    parser = AnchorCollector()
    parser.feed(html)
    session_links: dict[str, str] = {}
    for anchor in parser.anchors:
        href = anchor["href"]
        if "?st=" not in href:
            continue
        full_url = urljoin(page_url, href)
        code = code_from_url(full_url)
        if not code:
            code = normalize_session_code(anchor["text"])
        if code:
            session_links[code] = full_url
    return collapse_ws(parser.h1_text), session_links


def parse_session_table(html: str) -> tuple[str, list[str], list[dict[str, str]]]:
    parser = FirstTableParser()
    parser.feed(html)
    session_title = ""
    h3_values = [collapse_ws(value) for value in parser.heading_texts.get("h3", []) if collapse_ws(value)]
    if h3_values:
        session_title = h3_values[0]
    elif parser.heading_texts.get("h2"):
        session_title = collapse_ws(parser.heading_texts["h2"][0])
    elif parser.heading_texts.get("h1"):
        session_title = collapse_ws(parser.heading_texts["h1"][0])
    rows = rows_to_objects(parser.headers, parser.rows)
    return session_title, parser.headers, rows


def clean_session_title(value: str, code: str) -> str:
    title = collapse_ws(value)
    lower = title.lower()
    if not title or "sign up" in lower or "newsletter" in lower:
        return code
    return title


@dataclass
class ScheduleSession:
    season: int
    event_name: str
    event_slug: str
    session_code: str
    session_name: str
    start_time_utc: datetime
    round_number: int | None = None
    results_url: str | None = None

    @property
    def event_key(self) -> str:
        if self.round_number is not None:
            return f"r{self.round_number:02d}_{self.event_slug}"
        return self.event_slug

    @property
    def session_key(self) -> str:
        return f"{self.season}:{self.event_key}:{self.session_code}:{self.start_time_utc.isoformat()}"


def iter_dict_lists(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("sessions", "items", "data", "results", "list"):
        value = payload.get(key)
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            return value
    nested: list[dict[str, Any]] = []
    for value in payload.values():
        nested = iter_dict_lists(value)
        if nested:
            return nested
    return []


def normalize_schedule_sessions(payload: Any) -> list[ScheduleSession]:
    sessions: list[ScheduleSession] = []
    for item in iter_dict_lists(payload):
        start_time = None
        for key in (
            "session_start_time",
            "start_time",
            "date_start_utc",
            "start_at",
            "startTime",
            "time",
        ):
            start_time = parse_datetime(item.get(key))
            if start_time is not None:
                break
        if start_time is None:
            continue

        event_name = ""
        for key in ("event_name", "meeting_name", "meetingName", "race_name", "raceName", "name"):
            event_name = collapse_ws(str(item.get(key) or ""))
            if event_name:
                break
        if not event_name:
            continue

        session_name = ""
        for key in ("session_name", "sessionName", "session", "type", "session_type"):
            session_name = collapse_ws(str(item.get(key) or ""))
            if session_name:
                break
        session_code = ""
        for key in ("session_code", "code"):
            session_code = normalize_session_code(str(item.get(key) or ""))
            if session_code:
                break
        if not session_code:
            session_code = normalize_session_code(session_name)
        if not session_code:
            continue

        season_value = item.get("season")
        season = int(season_value) if str(season_value or "").strip().isdigit() else start_time.year

        round_number = None
        for key in ("round", "round_number"):
            value = item.get(key)
            if str(value or "").strip().isdigit():
                round_number = int(value)
                break

        event_slug = collapse_ws(str(item.get("event_slug") or item.get("slug") or ""))
        if not event_slug:
            event_slug = slugify(event_name)

        results_url = None
        for key in ("results_url", "motorsport_results_url", "event_url", "motorsport_event_url"):
            value = collapse_ws(str(item.get(key) or ""))
            if value:
                results_url = value
                break

        sessions.append(
            ScheduleSession(
                season=season,
                round_number=round_number,
                event_name=event_name,
                event_slug=event_slug,
                session_code=session_code,
                session_name=session_name or session_code,
                start_time_utc=start_time,
                results_url=results_url,
            )
        )
    return sessions


def load_schedule_payload(args: argparse.Namespace, client: BrowserClient) -> Any:
    if args.schedule_file:
        return load_json_file(Path(args.schedule_file))
    if args.schedule_url:
        return client.fetch_json(args.schedule_url)
    raise ValueError("either --schedule-url or --schedule-file is required in scheduled mode")


def read_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"executed_jobs": {}, "results_url_cache": {}}
    try:
        data = load_json_file(path)
    except Exception:
        return {"executed_jobs": {}, "results_url_cache": {}}
    if not isinstance(data, dict):
        return {"executed_jobs": {}, "results_url_cache": {}}
    data.setdefault("executed_jobs", {})
    data.setdefault("results_url_cache", {})
    return data


def write_state(path: Path, state: dict[str, Any]) -> None:
    json_dump(path, state)


def due_offsets_for_session(
    session: ScheduleSession,
    cumulative_delays: list[int],
    reference_time: datetime,
    max_age_hours: int,
    executed_jobs: dict[str, Any],
) -> list[int]:
    due: list[int] = []
    max_age = timedelta(hours=max_age_hours)
    for minute in cumulative_delays:
        run_at = session.start_time_utc + timedelta(minutes=minute)
        if reference_time < run_at:
            continue
        if reference_time - run_at > max_age:
            continue
        job_key = f"{session.session_key}:{minute}"
        if job_key in executed_jobs:
            continue
        due.append(minute)
    return due


def crawl_event_sessions(
    client: BrowserClient,
    output_root: Path,
    season: int,
    event_name: str,
    event_slug: str,
    event_key: str,
    event_url: str,
) -> list[str]:
    page_title, session_links = extract_session_links(client.fetch_text(event_url), event_url)
    if not session_links:
        # Some URLs can be a direct ?st= page.
        direct_code = code_from_url(event_url)
        if direct_code:
            session_links = {direct_code: event_url}
    if not session_links:
        raise RuntimeError(f"no session links found on {event_url}")

    out_dir = output_root / str(season) / event_key
    ensure_dir(out_dir)

    written_codes: list[str] = []
    session_index: list[dict[str, Any]] = []
    for code, session_url in sorted(session_links.items()):
        session_title, headers, rows = parse_session_table(client.fetch_text(session_url))
        session_title = clean_session_title(session_title, code)
        payload = {
            "ok": True,
            "season": season,
            "event_name": event_name,
            "event_slug": event_slug,
            "event_key": event_key,
            "page_title": page_title or event_name,
            "results_url": event_url,
            "session_code": code,
            "session_title": session_title,
            "session_url": session_url,
            "crawled_at": now_utc().isoformat(),
            "row_count": len(rows),
            "headers": headers,
            "rows": rows,
        }
        payload["content_hash"] = hash_payload({"headers": headers, "rows": rows})
        file_name = f"{event_slug}_{code.lower()}.json"
        json_dump(out_dir / file_name, payload)
        written_codes.append(code)
        session_index.append(
            {
                "session_code": code,
                "session_title": payload["session_title"],
                "session_url": session_url,
                "file": file_name,
                "row_count": len(rows),
                "content_hash": payload["content_hash"],
            }
        )

    json_dump(
        out_dir / "index.json",
        {
            "ok": True,
            "season": season,
            "event_name": event_name,
            "event_slug": event_slug,
            "event_key": event_key,
            "results_url": event_url,
            "page_title": page_title or event_name,
            "crawled_at": now_utc().isoformat(),
            "sessions": session_index,
        },
    )
    return written_codes


def run_direct_mode(args: argparse.Namespace) -> int:
    event_url = args.event_url
    season = int(args.season)
    if event_url:
        fallback_name = slugify(urlparse(event_url).path.split("/")[-2]).replace("-", " ")
    else:
        fallback_name = ""
    event_name = args.event_name or fallback_name
    if not event_name:
        raise ValueError("--event-name is required when --event-url is not provided")
    event_slug = args.event_slug or slugify(event_name)
    event_key = args.event_key or event_slug
    output_root = Path(args.output_root).resolve()
    client = BrowserClient(timeout=DEFAULT_TIMEOUT)
    if not event_url:
        event_url = discover_results_url(
            client=client,
            season=season,
            event_name=event_name,
            event_slug=event_slug,
        )
        if not event_url:
            raise ValueError(f"results url not found for season={season} event={event_name}")
    written = crawl_event_sessions(client, output_root, season, event_name, event_slug, event_key, event_url)
    print(json.dumps({"ok": True, "mode": "direct", "written_sessions": written, "output_root": str(output_root)}, ensure_ascii=False))
    return 0


def run_scheduled_mode(args: argparse.Namespace) -> int:
    output_root = Path(args.output_root).resolve()
    state_file = Path(args.state_file).resolve()
    ensure_dir(output_root)
    state = read_state(state_file)
    cumulative_delays = cumulative_minutes(parse_delay_chain(args.delay_chain))
    reference_time = parse_datetime(args.now) or now_utc()

    client = BrowserClient(timeout=DEFAULT_TIMEOUT)
    payload = load_schedule_payload(args, client)
    sessions = normalize_schedule_sessions(payload)
    grouped_due: dict[tuple[int, str, str], dict[str, Any]] = {}
    for session in sessions:
        due = due_offsets_for_session(
            session=session,
            cumulative_delays=cumulative_delays,
            reference_time=reference_time,
            max_age_hours=args.max_age_hours,
            executed_jobs=state["executed_jobs"],
        )
        if not due:
            continue
        key = (session.season, session.event_key, session.event_slug)
        bucket = grouped_due.setdefault(
            key,
            {
                "season": session.season,
                "event_key": session.event_key,
                "event_slug": session.event_slug,
                "event_name": session.event_name,
                "sessions": [],
            },
        )
        bucket["sessions"].append((session, due))

    processed: list[dict[str, Any]] = []
    for item in grouped_due.values():
        session_items: list[tuple[ScheduleSession, list[int]]] = item["sessions"]
        first_session = session_items[0][0]
        cache_key = f"{first_session.season}:{first_session.event_key}"
        cached_url = state["results_url_cache"].get(cache_key)
        event_url = first_session.results_url or discover_results_url(
            client=client,
            season=first_session.season,
            event_name=first_session.event_name,
            event_slug=first_session.event_slug,
            cached_url=cached_url,
        )
        if not event_url:
            processed.append(
                {
                    "event_key": first_session.event_key,
                    "event_name": first_session.event_name,
                    "status": "results_url_missing",
                }
            )
            continue

        written = crawl_event_sessions(
            client=client,
            output_root=output_root,
            season=first_session.season,
            event_name=first_session.event_name,
            event_slug=first_session.event_slug,
            event_key=first_session.event_key,
            event_url=event_url,
        )
        state["results_url_cache"][cache_key] = event_url

        for session, due_offsets in session_items:
            for minute in due_offsets:
                state["executed_jobs"][f"{session.session_key}:{minute}"] = {
                    "executed_at": now_utc().isoformat(),
                    "event_url": event_url,
                    "written_sessions": written,
                }
        processed.append(
            {
                "event_key": first_session.event_key,
                "event_name": first_session.event_name,
                "status": "ok",
                "event_url": event_url,
                "written_sessions": written,
                "matched_schedule_sessions": [session.session_code for session, _ in session_items],
            }
        )

    write_state(state_file, state)
    print(json.dumps({"ok": True, "mode": "scheduled", "processed": processed, "output_root": str(output_root)}, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Crawl Motorsport results pages and write JSON snapshots into backend static assets.")
    parser.add_argument(
        "--mode",
        choices=("scheduled", "direct"),
        default="scheduled",
        help="scheduled: use backend schedule payload; direct: crawl a single event url now",
    )
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="output directory for generated JSON files")

    parser.add_argument("--schedule-url", help="backend schedule API url returning session records")
    parser.add_argument("--schedule-file", help="local JSON file with session records")
    parser.add_argument(
        "--delay-chain",
        default="30,15,10,5,1",
        help="sequential minute offsets after session start; 30,15,10,5,1 becomes T+30/T+45/T+55/T+60/T+61",
    )
    parser.add_argument("--state-file", default=str(DEFAULT_STATE_FILE), help="JSON state file used to deduplicate scheduled runs")
    parser.add_argument("--max-age-hours", type=int, default=8, help="ignore checkpoints older than this many hours")
    parser.add_argument("--now", help="override current time in ISO8601, mainly for testing")

    parser.add_argument("--event-url", help="motorsport event results url, used in direct mode")
    parser.add_argument("--event-name", help="display name for the event, used in direct mode")
    parser.add_argument("--event-slug", help="slug for the event directory, used in direct mode")
    parser.add_argument("--event-key", help="directory key for the event, used in direct mode")
    parser.add_argument("--season", default=str(now_utc().year), help="season year, used in direct mode")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.mode == "direct":
            return run_direct_mode(args)
        return run_scheduled_mode(args)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
