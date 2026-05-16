from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _slugify(text: str) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    s = ascii_text.lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"\bgrand prix\b", "", s)
    s = re.sub(r"\bgp\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def _to_png_url(src: str) -> str:
    return re.sub(r"\.(webp|jpg|jpeg|svg)(\?.*)?$", ".png", src, flags=re.IGNORECASE)


def _extract_card_images(html: str, year: int) -> Dict[str, str]:
    patt = re.compile(
        rf"https://media\.formula1\.com/image/upload/[^\s\"'<>]*?/fom-website/static-assets/{year}/races/card/([a-z0-9-]+)\.(?:webp|jpg|jpeg|png)",
        re.IGNORECASE,
    )
    by_slug: Dict[str, str] = {}
    for m in patt.finditer(html):
        slug = (m.group(1) or "").lower()
        url = m.group(0)
        by_slug[slug] = url
    return by_slug


def _extract_track_outline_images(html: str, year: int) -> Dict[str, str]:
    patt = re.compile(
        rf"https://media\.formula1\.com/image/upload/[^\s\"'<>]*?/common/f1/{year}/track/2026track([a-z0-9]+)blackoutline\.svg",
        re.IGNORECASE,
    )
    by_key: Dict[str, str] = {}
    for m in patt.finditer(html):
        key = (m.group(1) or "").lower()
        url = m.group(0).rstrip(")\\")
        by_key[key] = url
    return by_key


def _build_detailed_track_png_url(year: int, key: str) -> str:
    return (
        f"https://media.formula1.com/image/upload/c_fit,h_704/q_auto/v1740000001/"
        f"common/f1/{year}/track/2026track{key}detailed.png"
    )


def _slug_to_track_keys(slug: str) -> List[str]:
    s = (slug or "").lower().strip()
    no_dash = s.replace("-", "")
    out = [no_dash]
    aliases: Dict[str, List[str]] = {
        "monaco": ["montecarlo"],
        "canada": ["montreal"],
        "united-states": ["austin", "unitedstates"],
        "mexico-city": ["mexicocity"],
        "abu-dhabi": ["yasmarinacircuit", "yasmarina", "abudhabi"],
        "saudi-arabia": ["jeddah", "saudiarabia"],
        "brazil": ["interlagos", "saopaulo", "sao-paulo"],
        "austria": ["spielberg"],
        "spain": ["catalunya", "barcelona", "madring"],
        "azerbaijan": ["baku"],
        "great-britain": ["silverstone"],
        "italy": ["monza"],
        "belgium": ["spafrancorchamps", "spa"],
    }
    out.extend(aliases.get(s, []))
    return list(dict.fromkeys([x for x in out if x]))


def _guess_race_slug(race_name: str) -> List[str]:
    base = _slugify(race_name)
    out = [base] if base else []
    demonym = {
        "australian": "australia",
        "chinese": "china",
        "japanese": "japan",
        "canadian": "canada",
        "british": "great-britain",
        "hungarian": "hungary",
        "dutch": "netherlands",
        "italian": "italy",
        "spanish": "spain",
        "belgian": "belgium",
        "azerbaijani": "azerbaijan",
        "singapore": "singapore",
        "mexican": "mexico",
        "brazilian": "brazil",
        "qatari": "qatar",
        "emirati": "united-arab-emirates",
        "saudi": "saudi-arabia",
        "united-arab-emirates": "united-arab-emirates",
    }
    if base in demonym:
        out.append(demonym[base])
    aliases = {
        "united-states": ["usa", "us"],
        "mexico-city": ["mexico"],
        "abu-dhabi": ["abudhabi"],
        "sao-paulo": ["brazil"],
        "spanish": ["spain"],
    }
    for k, vals in aliases.items():
        if base == k or base in vals:
            out.extend([k] + vals)
    return list(dict.fromkeys([x for x in out if x]))


def _pick_formula1_slug(race: Dict[str, Any], season_slugs_set: set[str]) -> Optional[str]:
    race_name = race.get("raceName")
    circuit = race.get("Circuit") or {}
    circuit_id = circuit.get("circuitId")
    loc = circuit.get("Location") or {}
    country = loc.get("country")
    locality = loc.get("locality")

    direct_map = {
        "albert_park": "australia",
        "shanghai": "china",
        "hungaroring": "hungary",
        "monza": "italy",
        "silverstone": "great-britain",
        "rodriguez": "mexico",
        "yas_marina": "united-arab-emirates",
        "villeneuve": "canada",
        "suzuka": "japan",
        "zandvoort": "netherlands",
        "spa": "belgium",
        "baku": "azerbaijan",
        "marina_bay": "singapore",
        "losail": "qatar",
        "jeddah": "saudi-arabia",
    }
    if circuit_id and direct_map.get(circuit_id) in season_slugs_set:
        return direct_map[circuit_id]

    candidates: List[str] = []
    if race_name:
        candidates.extend(_guess_race_slug(race_name))
    if country:
        candidates.append(_slugify(country))
    if locality:
        candidates.append(_slugify(locality))
    if circuit_id:
        candidates.append(_slugify(str(circuit_id).replace("_", " ")))

    for c in candidates:
        if c in season_slugs_set:
            return c
    return None


def _extract_race_slugs(season_html: str, year: int) -> List[str]:
    patt = re.compile(rf"/en/racing/{year}/([a-z0-9-]+)", re.IGNORECASE)
    slugs: List[str] = []
    for m in patt.finditer(season_html):
        s = (m.group(1) or "").lower()
        if not s:
            continue
        if s not in slugs:
            slugs.append(s)
    return slugs


def _extract_track_image_from_html(html: str, year: int) -> Dict[str, Optional[str]]:
    detailed = re.search(
        rf"https://media\.formula1\.com/image/upload/[^\s\"'<>]*/common/f1/{year}/track/2026track([a-z0-9]+)detailed\.(webp|png|jpg|jpeg)",
        html,
        re.IGNORECASE,
    )
    if detailed:
        key = (detailed.group(1) or "").lower()
        url = _to_png_url(detailed.group(0))
        return {"image_kind": "track_detailed", "track_key": key, "map_image_url": url}

    outline = re.search(
        rf"https://media\.formula1\.com/image/upload/[^\s\"'<>]*/common/f1/{year}/track/2026track([a-z0-9]+)blackoutline\.svg",
        html,
        re.IGNORECASE,
    )
    if outline:
        key = (outline.group(1) or "").lower()
        url = _to_png_url(outline.group(0).replace("/c_lfill,w_3392/", "/c_fit,h_704/q_auto/"))
        return {"image_kind": "track_outline", "track_key": key, "map_image_url": url}

    return {"image_kind": None, "track_key": None, "map_image_url": None}


async def _ergast_schedule_for_year(client: Any, year: int) -> Dict[str, Any]:
    r = await client.get(f"https://api.jolpi.ca/ergast/f1/{year}.json", timeout=20)
    r.raise_for_status()
    return r.json()


async def _download_bytes(client: Any, url: str, timeout_s: float = 30) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    try:
        res = await client.get(url, timeout=timeout_s, follow_redirects=True)
        res.raise_for_status()
        ctype = (res.headers.get("content-type") or "").lower()
        return res.content, ctype, None
    except Exception as ex:
        return None, None, str(ex)


def _cloudinary_resize(url: str, w: int, h: int) -> str:
    key = "/image/upload/"
    i = url.find(key)
    if i < 0:
        return url
    start = i + len(key)
    vpos = url.find("/v", start)
    if vpos < 0:
        return url
    tail = url[vpos:]
    return url[:start] + f"c_fit,w_{w},h_{h}/q_auto,f_png" + tail


def _to_epd_png(png_bytes: bytes, w: int, h: int) -> bytes:
    try:
        from PIL import Image, ImageEnhance, ImageOps
    except Exception as ex:
        raise RuntimeError(f"pillow_not_available: {ex}") from ex

    import io

    im = Image.open(io.BytesIO(png_bytes))
    im.load()
    if im.mode in ("RGBA", "LA") or ("transparency" in im.info):
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im.convert("RGBA")).convert("RGB")
    else:
        im = im.convert("RGB")

    im = im.convert("L")
    im = ImageOps.autocontrast(im, cutoff=2)
    im = im.resize((w, h), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.8)
    im = ImageOps.autocontrast(im, cutoff=1)
    im = im.convert("1")

    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _ext_from_content_type(ctype: Optional[str]) -> str:
    if not ctype:
        return "bin"
    if "image/svg" in ctype:
        return "svg"
    if "image/png" in ctype:
        return "png"
    if "image/jpeg" in ctype:
        return "jpg"
    if "image/webp" in ctype:
        return "webp"
    return "bin"


async def fetch_f1_circuit_assets(
    client: Any,
    year: int,
    static_root: Path,
    force_download: bool = False,
    limit: Optional[int] = None,
    target_width: int = 200,
    target_height: int = 130,
    detail_width: int = 400,
    detail_height: int = 300,
    save_raw: bool = True,
) -> Dict[str, Any]:
    season_url = f"https://www.formula1.com/en/racing/{year}"
    res = await client.get(
        season_url,
        timeout=20,
        follow_redirects=True,
        headers={"User-Agent": "toinc_F1-backend/0.1 (+circuit-fetcher)"},
    )
    res.raise_for_status()
    html = res.text

    track_outline_by_key = _extract_track_outline_images(html, year)
    season_slugs = _extract_race_slugs(html, year)
    season_slugs_set = set(season_slugs)
    slug_to_card_src = _extract_card_images(html, year)

    schedule_json = await _ergast_schedule_for_year(client, year)
    races: List[Dict[str, Any]] = schedule_json.get("MRData", {}).get("RaceTable", {}).get("Races", [])

    out_dir = static_root / "circuits" / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = out_dir / "raw"
    if save_raw:
        raw_dir.mkdir(parents=True, exist_ok=True)

    items: List[Dict[str, Any]] = []
    for r in races[: (limit or len(races))]:
        circuit = r.get("Circuit") or {}
        circuit_id = circuit.get("circuitId")
        race_name = r.get("raceName")
        race_round = r.get("round")
        if not circuit_id or not race_name:
            continue

        f1_slug = _pick_formula1_slug(r, season_slugs_set)
        f1_url = f"https://www.formula1.com/en/racing/{year}/{f1_slug}" if f1_slug else None

        page_html: Optional[str] = None
        if f1_url:
            try:
                rp = await client.get(
                    f1_url,
                    timeout=20,
                    follow_redirects=True,
                    headers={"User-Agent": "toinc_F1-backend/0.1 (+circuit-fetcher)"},
                )
                if rp.status_code == 200 and rp.text:
                    page_html = rp.text
            except Exception:
                page_html = None

        image_kind: Optional[str] = None
        track_key: Optional[str] = None
        source_map_image_url: Optional[str] = None

        if page_html:
            hit = _extract_track_image_from_html(page_html, year)
            image_kind = hit.get("image_kind")
            track_key = hit.get("track_key")
            source_map_image_url = hit.get("map_image_url")

        if not source_map_image_url and f1_slug:
            for key in _slug_to_track_keys(f1_slug):
                detailed = _build_detailed_track_png_url(year, key)
                try:
                    probe = await client.get(detailed, timeout=10, follow_redirects=True)
                    if probe.status_code == 200 and "image/" in (probe.headers.get("content-type") or "").lower():
                        image_kind = "track_detailed"
                        track_key = key
                        source_map_image_url = detailed
                        break
                except Exception:
                    pass

        if not source_map_image_url and track_key:
            outline_src = track_outline_by_key.get(track_key)
            if outline_src:
                image_kind = "track_outline"
                source_map_image_url = _to_png_url(outline_src.replace("/c_lfill,w_3392/", "/c_fit,h_704/q_auto/"))

        card_src = None
        if f1_slug:
            card_src = slug_to_card_src.get(f1_slug)
        if not source_map_image_url and card_src:
            image_kind = "race_card"
            source_map_image_url = _to_png_url(card_src)

        file_name = f"{circuit_id}.png"
        local_path = out_dir / file_name
        rel_path = f"circuits/{year}/{file_name}"
        public_url = f"/static/{rel_path}"

        detail_file_name = f"{circuit_id}_detail.png"
        detail_local_path = out_dir / detail_file_name
        detail_rel_path = f"circuits/{year}/{detail_file_name}"
        detail_public_url = f"/static/{detail_rel_path}"

        downloaded = bool(local_path.exists() and local_path.stat().st_size > 0)
        detail_downloaded = bool(detail_local_path.exists() and detail_local_path.stat().st_size > 0)

        error: Optional[str] = None
        detail_error: Optional[str] = None

        raw_map_path: Optional[str] = None
        raw_card_path: Optional[str] = None
        raw_map_error: Optional[str] = None
        raw_card_error: Optional[str] = None

        if source_map_image_url:
            if force_download or not downloaded:
                b, _, err = await _download_bytes(client, _cloudinary_resize(source_map_image_url, target_width, target_height), timeout_s=30)
                if b is not None:
                    try:
                        out_bytes = _to_epd_png(b, target_width, target_height)
                        local_path.write_bytes(out_bytes)
                        downloaded = True
                    except Exception as ex:
                        error = str(ex)
                else:
                    error = err

            if force_download or not detail_downloaded:
                b, _, err = await _download_bytes(client, _cloudinary_resize(source_map_image_url, detail_width, detail_height), timeout_s=30)
                if b is not None:
                    try:
                        out_bytes = _to_epd_png(b, detail_width, detail_height)
                        detail_local_path.write_bytes(out_bytes)
                        detail_downloaded = True
                    except Exception as ex:
                        detail_error = str(ex)
                else:
                    detail_error = err

            if save_raw:
                b0, ctype0, err0 = await _download_bytes(client, source_map_image_url, timeout_s=30)
                if b0 is not None and ctype0 is not None:
                    ext = _ext_from_content_type(ctype0)
                    fn = f"{circuit_id}_map.{ext}"
                    p = raw_dir / fn
                    if force_download or not p.exists() or p.stat().st_size == 0:
                        p.write_bytes(b0)
                    raw_map_path = f"circuits/{year}/raw/{fn}"
                else:
                    raw_map_error = err0

        if save_raw and card_src:
            b1, ctype1, err1 = await _download_bytes(client, card_src, timeout_s=30)
            if b1 is not None and ctype1 is not None:
                ext = _ext_from_content_type(ctype1)
                fn = f"{circuit_id}_card.{ext}"
                p = raw_dir / fn
                if force_download or not p.exists() or p.stat().st_size == 0:
                    p.write_bytes(b1)
                raw_card_path = f"circuits/{year}/raw/{fn}"
            else:
                raw_card_error = err1

        items.append(
            {
                "season": year,
                "round": int(race_round) if str(race_round).isdigit() else race_round,
                "race_name": race_name,
                "date": r.get("date"),
                "time": r.get("time"),
                "circuit_id": circuit_id,
                "circuit_name": circuit.get("circuitName"),
                "country": (circuit.get("Location") or {}).get("country"),
                "locality": (circuit.get("Location") or {}).get("locality"),
                "lat": (circuit.get("Location") or {}).get("lat"),
                "long": (circuit.get("Location") or {}).get("long"),
                "ergast_url": r.get("url"),
                "formula1_slug": f1_slug,
                "formula1_url": f1_url,
                "track_key": track_key,
                "image_kind": image_kind,
                "source_card_image_url": card_src,
                "source_map_image_url": source_map_image_url,
                "public_map_image_url": public_url if downloaded else None,
                "relative_path": rel_path if downloaded else None,
                "downloaded": downloaded,
                "error": error,
                "target_width": target_width,
                "target_height": target_height,
                "public_map_image_url_detail": detail_public_url if detail_downloaded else None,
                "relative_path_detail": detail_rel_path if detail_downloaded else None,
                "downloaded_detail": detail_downloaded,
                "error_detail": detail_error,
                "detail_width": detail_width,
                "detail_height": detail_height,
                "raw_map_relative_path": raw_map_path,
                "raw_card_relative_path": raw_card_path,
                "raw_map_error": raw_map_error,
                "raw_card_error": raw_card_error,
            }
        )

    payload: Dict[str, Any] = {
        "season": year,
        "source_url": season_url,
        "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        "ergast_schedule_url": f"https://api.jolpi.ca/ergast/f1/{year}.json",
        "race_slugs": season_slugs,
        "items": items,
    }
    (out_dir / "circuits.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
