import asyncio
import io
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import UploadFile, WebSocket
from PIL import Image


@dataclass(frozen=True)
class NewsRelayConfig:
    enabled: bool
    ingest_token: str | None
    max_queue: int
    max_image_bytes: int
    max_audio_bytes: int

    @staticmethod
    def from_env() -> "NewsRelayConfig":
        enabled = os.getenv("NEWS_WS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
        ingest_token = os.getenv("NEWS_INGEST_TOKEN")
        if not enabled:
            enabled = bool(ingest_token)
        max_queue = int(os.getenv("NEWS_WS_MAX_QUEUE", "256"))
        max_image_bytes = int(os.getenv("NEWS_WS_MAX_IMAGE_BYTES", str(128 * 1024)))
        max_audio_bytes = int(os.getenv("NEWS_WS_MAX_AUDIO_BYTES", str(256 * 1024)))
        return NewsRelayConfig(
            enabled=enabled,
            ingest_token=ingest_token,
            max_queue=max_queue,
            max_image_bytes=max_image_bytes,
            max_audio_bytes=max_audio_bytes,
        )


class NewsRelay:
    def __init__(self, cfg: NewsRelayConfig, *, static_dir: Path, static_url_prefix: str = "/static"):
        self._cfg = cfg
        self._static_dir = static_dir
        self._static_url_prefix = static_url_prefix.rstrip("/")
        self._ws_clients: set[WebSocket] = set()
        self._ws_lock = asyncio.Lock()
        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._broadcast_task: asyncio.Task | None = None

        self._enabled_runtime = False
        self._last_error: str | None = None
        self._last_message_at_utc: str | None = None

    def _store_bytes(self, *, subdir: str, stem: str, ext: str, data: bytes) -> str:
        subdir = subdir.strip("/").replace("\\", "/")
        ext = ext if ext.startswith(".") else f".{ext}"
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        token = secrets.token_hex(4)
        name = f"{stem}_{ts}_{token}{ext}"
        p = (self._static_dir / subdir / name).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        rel = f"{subdir}/{name}"
        return f"{self._static_url_prefix}/{rel}"

    def _try_convert_image_to_png(self, data: bytes, *, dither: bool) -> bytes | None:
        try:
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGBA")
            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
            img = Image.alpha_composite(bg, img).convert("RGB")
            if dither:
                g = img.convert("L")
                w, h = g.size
                src = g.load()
                out = Image.new("1", (w, h), 1)
                dst = out.load()
                b4 = (
                    (0, 8, 2, 10),
                    (12, 4, 14, 6),
                    (3, 11, 1, 9),
                    (15, 7, 13, 5),
                )
                for y in range(h):
                    row = b4[y & 3]
                    for x in range(w):
                        v = int(src[x, y])
                        t = (row[x & 3] + 0.5) * (255.0 / 16.0)
                        dst[x, y] = 1 if v >= t else 0
                img = out
            out = io.BytesIO()
            img.save(out, format="PNG", optimize=False)
            return out.getvalue()
        except Exception:
            return None

    @property
    def enabled(self) -> bool:
        return self._cfg.enabled

    def verify_ingest_token(self, token: str | None) -> bool:
        if not self._cfg.ingest_token:
            return True
        return bool(token) and token == self._cfg.ingest_token

    def status(self) -> dict:
        return {
            "enabled": self._cfg.enabled,
            "running": self._enabled_runtime,
            "clients": {"ws": len(self._ws_clients)},
            "limits": {"max_image_bytes": self._cfg.max_image_bytes, "max_audio_bytes": self._cfg.max_audio_bytes},
            "last_message_at_utc": self._last_message_at_utc,
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        if not self._cfg.enabled:
            return
        if self._enabled_runtime:
            return
        self._queue = asyncio.Queue(maxsize=max(8, self._cfg.max_queue))
        self._enabled_runtime = True
        self._broadcast_task = asyncio.create_task(self._broadcast_loop())

    async def stop(self) -> None:
        self._enabled_runtime = False
        if self._broadcast_task:
            self._broadcast_task.cancel()
            self._broadcast_task = None

    async def register_ws(self, ws: WebSocket) -> None:
        async with self._ws_lock:
            self._ws_clients.add(ws)

    async def unregister_ws(self, ws: WebSocket) -> None:
        async with self._ws_lock:
            self._ws_clients.discard(ws)

    async def publish_breaking(
        self,
        date_utc: str,
        title: str,
        image_bytes: bytes | None,
        image_mime: str | None,
        image_url: str | None = None,
    ) -> bool:
        if not self._enabled_runtime:
            return False
        q = self._queue
        if q is None:
            return False

        image: dict[str, Any] | None = None
        if isinstance(image_url, str) and image_url.strip():
            image = {"url": image_url.strip()}
            if isinstance(image_mime, str) and image_mime.strip():
                image["mime"] = image_mime.strip()
        elif image_bytes is not None:
            if len(image_bytes) > self._cfg.max_image_bytes:
                self._last_error = "image too large"
                return False
            png = self._try_convert_image_to_png(image_bytes, dither=False)
            if png is None:
                self._last_error = "unsupported image format"
                return False
            url = self._store_bytes(subdir="news", stem="breaking", ext=".png", data=png)
            image = {"url": url, "mime": "image/png", "bytes": len(png)}

        now = datetime.now(timezone.utc).isoformat()
        event = {
            "topic": "v1/breaking",
            "payload": {
                "date": date_utc,
                "title": title,
                "image": image,
            },
            "source": "mock",
            "received_at_utc": now,
        }
        self._last_message_at_utc = now
        self._last_error = None

        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except Exception:
                pass
            try:
                q.put_nowait(event)
            except Exception:
                return False
        return True

    async def publish_meme(
        self,
        date_utc: str,
        title: str,
        image_bytes: bytes | None,
        image_mime: str | None,
        audio_bytes: bytes | None,
        audio_mime: str | None,
        image_url: str | None = None,
        audio_url: str | None = None,
    ) -> bool:
        if not self._enabled_runtime:
            return False
        q = self._queue
        if q is None:
            return False

        image: dict[str, Any] | None = None
        if isinstance(image_url, str) and image_url.strip():
            image = {"url": image_url.strip()}
            if isinstance(image_mime, str) and image_mime.strip():
                image["mime"] = image_mime.strip()
        elif image_bytes is not None:
            if len(image_bytes) > self._cfg.max_image_bytes:
                self._last_error = "image too large"
                return False
            png = self._try_convert_image_to_png(image_bytes, dither=True)
            if png is None:
                self._last_error = "unsupported image format"
                return False
            url = self._store_bytes(subdir="news", stem="meme", ext=".png", data=png)
            image = {"url": url, "mime": "image/png", "bytes": len(png)}

        audio: dict[str, Any] | None = None
        if isinstance(audio_url, str) and audio_url.strip():
            audio = {"url": audio_url.strip()}
            if isinstance(audio_mime, str) and audio_mime.strip():
                audio["mime"] = audio_mime.strip()
        elif audio_bytes is not None:
            if len(audio_bytes) > self._cfg.max_audio_bytes:
                self._last_error = "audio too large"
                return False
            mime = audio_mime.strip() if isinstance(audio_mime, str) and audio_mime.strip() else "application/octet-stream"
            ext = ".wav" if "wav" in mime.lower() else ".bin"
            url = self._store_bytes(subdir="news", stem="meme_audio", ext=ext, data=audio_bytes)
            audio = {"url": url, "mime": mime, "bytes": len(audio_bytes)}

        now = datetime.now(timezone.utc).isoformat()
        event = {
            "topic": "v1/meme",
            "payload": {
                "date": date_utc,
                "title": title,
                "image": image,
                "audio": audio,
            },
            "source": "mock",
            "received_at_utc": now,
        }
        self._last_message_at_utc = now
        self._last_error = None

        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except Exception:
                pass
            try:
                q.put_nowait(event)
            except Exception:
                return False
        return True

    async def publish_breaking_from_upload(self, title: str, image: UploadFile | None) -> bool:
        date_utc = datetime.now(timezone.utc).isoformat()
        image_bytes = None
        image_mime = None
        if image is not None:
            image_bytes = await image.read()
            image_mime = image.content_type
        return await self.publish_breaking(date_utc=date_utc, title=title, image_bytes=image_bytes, image_mime=image_mime)

    async def publish_meme_from_upload(
        self, title: str, image: UploadFile | None, audio: UploadFile | None
    ) -> bool:
        date_utc = datetime.now(timezone.utc).isoformat()
        image_bytes = None
        image_mime = None
        if image is not None:
            image_bytes = await image.read()
            image_mime = image.content_type
        audio_bytes = None
        audio_mime = None
        if audio is not None:
            audio_bytes = await audio.read()
            audio_mime = audio.content_type
        return await self.publish_meme(
            date_utc=date_utc,
            title=title,
            image_bytes=image_bytes,
            image_mime=image_mime,
            audio_bytes=audio_bytes,
            audio_mime=audio_mime,
        )

    async def _broadcast_loop(self) -> None:
        while self._enabled_runtime:
            q = self._queue
            if q is None:
                await asyncio.sleep(0.05)
                continue
            event = await q.get()
            async with self._ws_lock:
                clients = list(self._ws_clients)
            if not clients:
                continue
            import json

            msg = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
            for c in clients:
                try:
                    await c.send_text(msg)
                except Exception:
                    async with self._ws_lock:
                        self._ws_clients.discard(c)

