import asyncio
import base64
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import UploadFile, WebSocket


@dataclass(frozen=True)
class NewsRelayConfig:
    enabled: bool
    ingest_token: str | None
    max_queue: int
    max_image_bytes: int

    @staticmethod
    def from_env() -> "NewsRelayConfig":
        enabled = os.getenv("NEWS_WS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
        ingest_token = os.getenv("NEWS_INGEST_TOKEN")
        if not enabled:
            enabled = bool(ingest_token)
        max_queue = int(os.getenv("NEWS_WS_MAX_QUEUE", "256"))
        max_image_bytes = int(os.getenv("NEWS_WS_MAX_IMAGE_BYTES", str(128 * 1024)))
        return NewsRelayConfig(
            enabled=enabled,
            ingest_token=ingest_token,
            max_queue=max_queue,
            max_image_bytes=max_image_bytes,
        )


class NewsRelay:
    def __init__(self, cfg: NewsRelayConfig):
        self._cfg = cfg
        self._ws_clients: set[WebSocket] = set()
        self._ws_lock = asyncio.Lock()
        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._broadcast_task: asyncio.Task | None = None

        self._enabled_runtime = False
        self._last_error: str | None = None
        self._last_message_at_utc: str | None = None

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
            "limits": {"max_image_bytes": self._cfg.max_image_bytes},
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
    ) -> bool:
        if not self._enabled_runtime:
            return False
        q = self._queue
        if q is None:
            return False

        image: dict[str, Any] | None = None
        if image_bytes is not None:
            if len(image_bytes) > self._cfg.max_image_bytes:
                self._last_error = "image too large"
                return False
            image = {
                "mime": image_mime or "application/octet-stream",
                "encoding": "base64",
                "data": base64.b64encode(image_bytes).decode("ascii"),
                "bytes": len(image_bytes),
            }

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

    async def publish_breaking_from_upload(self, title: str, image: UploadFile | None) -> bool:
        date_utc = datetime.now(timezone.utc).isoformat()
        image_bytes = None
        image_mime = None
        if image is not None:
            image_bytes = await image.read()
            image_mime = image.content_type
        return await self.publish_breaking(date_utc=date_utc, title=title, image_bytes=image_bytes, image_mime=image_mime)

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

