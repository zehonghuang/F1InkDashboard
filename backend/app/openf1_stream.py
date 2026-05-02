import asyncio
import json
import os
import ssl
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import WebSocket


@dataclass(frozen=True)
class OpenF1RelayConfig:
    enabled: bool
    mode: str
    token_url: str
    mqtt_host: str
    mqtt_port: int
    mqtt_transport: str
    mqtt_ws_path: str
    mqtt_username: str
    username: str | None
    password: str | None
    access_token: str | None
    topics: tuple[str, ...]
    max_queue: int
    ingest_token: str | None
    push_hz: float

    @staticmethod
    def from_env() -> "OpenF1RelayConfig":
        mode = os.getenv("OPENF1_MODE", "auto").strip().lower()
        if mode not in {"auto", "openf1", "mock"}:
            mode = "auto"
        enabled = os.getenv("OPENF1_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
        username = os.getenv("OPENF1_USERNAME")
        password = os.getenv("OPENF1_PASSWORD")
        access_token = os.getenv("OPENF1_ACCESS_TOKEN")
        ingest_token = os.getenv("OPENF1_INGEST_TOKEN")
        if not enabled:
            enabled = bool(access_token or (username and password) or ingest_token or mode in {"openf1", "mock"})
        topics_raw = os.getenv("OPENF1_TOPICS", "v1/#")
        topics = tuple([t.strip() for t in topics_raw.split(",") if t.strip()])
        transport = os.getenv("OPENF1_MQTT_TRANSPORT", "websockets").strip().lower()
        mqtt_host = os.getenv("OPENF1_MQTT_HOST", "mqtt.openf1.org").strip()
        mqtt_port = int(os.getenv("OPENF1_MQTT_PORT", "8084" if transport == "websockets" else "8883"))
        mqtt_ws_path = os.getenv("OPENF1_MQTT_WS_PATH", "/mqtt").strip() or "/mqtt"
        mqtt_username = os.getenv("OPENF1_MQTT_USERNAME", "zectrix").strip() or "zectrix"
        token_url = os.getenv("OPENF1_TOKEN_URL", "https://api.openf1.org/token").strip()
        max_queue = int(os.getenv("OPENF1_MAX_QUEUE", "2048"))
        push_hz_raw = os.getenv("OPENF1_PUSH_HZ", "5").strip()
        try:
            push_hz = float(push_hz_raw)
        except Exception:
            push_hz = 5.0
        if push_hz <= 0:
            push_hz = 5.0
        return OpenF1RelayConfig(
            enabled=enabled,
            mode=mode,
            token_url=token_url,
            mqtt_host=mqtt_host,
            mqtt_port=mqtt_port,
            mqtt_transport=transport,
            mqtt_ws_path=mqtt_ws_path,
            mqtt_username=mqtt_username,
            username=username,
            password=password,
            access_token=access_token,
            topics=topics,
            max_queue=max_queue,
            ingest_token=ingest_token,
            push_hz=push_hz,
        )


class OpenF1Relay:
    def __init__(self, cfg: OpenF1RelayConfig):
        self._cfg = cfg
        self._ws_clients_fw: set[WebSocket] = set()
        self._ws_clients_raw: set[WebSocket] = set()
        self._ws_lock = asyncio.Lock()

        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[dict[str, Any]] | None = None
        self._broadcast_task: asyncio.Task | None = None
        self._token_task: asyncio.Task | None = None

        self._mqtt = None
        self._mqtt_lock = threading.Lock()
        self._mqtt_started = False

        self._enabled_runtime = False
        self._connected = False
        self._last_error: str | None = None
        self._last_message_at_utc: str | None = None

        self._access_token: str | None = cfg.access_token
        self._token_expires_at: datetime | None = None

        self._latest: dict[str, dict[str, Any]] = {}
        self._dirty: set[str] = set()

    @property
    def enabled(self) -> bool:
        return self._cfg.enabled

    def status(self) -> dict:
        return {
            "enabled": self._cfg.enabled,
            "mode": self._cfg.mode,
            "running": self._enabled_runtime,
            "connected": self._connected,
            "mqtt": {
                "host": self._cfg.mqtt_host,
                "port": self._cfg.mqtt_port,
                "transport": self._cfg.mqtt_transport,
                "topics": list(self._cfg.topics),
            },
            "token": {
                "has_token": bool(self._access_token),
                "expires_at_utc": self._token_expires_at.isoformat() if self._token_expires_at else None,
            },
            "clients": {
                "ws_fw": len(self._ws_clients_fw),
                "ws_raw": len(self._ws_clients_raw),
            },
            "last_message_at_utc": self._last_message_at_utc,
            "last_error": self._last_error,
        }

    async def start(self) -> None:
        if not self._cfg.enabled:
            return
        if self._enabled_runtime:
            return

        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=max(8, self._cfg.max_queue))
        self._enabled_runtime = True
        self._broadcast_task = asyncio.create_task(self._broadcast_loop())

        if self._cfg.mode == "mock":
            self._last_error = None
            return

        ok = await self._ensure_token(force=False)
        if ok:
            self._start_mqtt()
        if not self._cfg.access_token and (self._cfg.username and self._cfg.password):
            self._token_task = asyncio.create_task(self._token_refresh_loop())

    async def stop(self) -> None:
        self._enabled_runtime = False
        if self._token_task:
            self._token_task.cancel()
            self._token_task = None
        if self._broadcast_task:
            self._broadcast_task.cancel()
            self._broadcast_task = None

        with self._mqtt_lock:
            mqtt = self._mqtt
        if mqtt is not None:
            try:
                mqtt.disconnect()
            except Exception:
                pass
            try:
                mqtt.loop_stop()
            except Exception:
                pass

        self._mqtt_started = False
        self._connected = False

    async def register_ws(self, ws: WebSocket) -> None:
        async with self._ws_lock:
            self._ws_clients_fw.add(ws)

    async def register_ws_raw(self, ws: WebSocket) -> None:
        async with self._ws_lock:
            self._ws_clients_raw.add(ws)

    async def unregister_ws(self, ws: WebSocket) -> None:
        async with self._ws_lock:
            self._ws_clients_fw.discard(ws)
            self._ws_clients_raw.discard(ws)

    def verify_ingest_token(self, token: str | None) -> bool:
        if not self._cfg.ingest_token:
            return True
        return bool(token) and token == self._cfg.ingest_token

    async def publish(self, topic: str, payload: Any, source: str = "mock") -> bool:
        if not self._enabled_runtime:
            return False
        q = self._queue
        if q is None:
            return False
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "topic": topic,
            "payload": payload,
            "source": source,
            "received_at_utc": now,
        }
        self._last_message_at_utc = now
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

    @staticmethod
    def _cache_key(topic: str, payload: Any) -> str:
        if isinstance(payload, dict):
            dn = payload.get("driver_number")
            if isinstance(dn, int) and dn > 0:
                return f"{topic}:{dn}"
        return topic

    async def _ensure_token(self, force: bool) -> bool:
        if self._access_token and not force:
            return True
        if self._cfg.access_token and not force:
            self._access_token = self._cfg.access_token
            self._token_expires_at = None
            return True
        if not (self._cfg.username and self._cfg.password):
            self._last_error = "openf1 token missing: set OPENF1_ACCESS_TOKEN or OPENF1_USERNAME/OPENF1_PASSWORD"
            return False

        try:
            async with httpx.AsyncClient(headers={"User-Agent": "zectrix-backend/0.1"}) as client:
                r = await client.post(
                    self._cfg.token_url,
                    data={"username": self._cfg.username, "password": self._cfg.password},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10.0,
                )
            r.raise_for_status()
            data = r.json()
            token = (data or {}).get("access_token")
            expires_in_raw = (data or {}).get("expires_in")
            expires_in = int(expires_in_raw) if expires_in_raw is not None else 3600
            if not token:
                self._last_error = "openf1 token response missing access_token"
                return False
            self._access_token = token
            self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(60, expires_in))
            self._last_error = None
            return True
        except Exception as e:
            self._last_error = f"openf1 token request failed: {e}"
            return False

    def _start_mqtt(self) -> bool:
        if self._mqtt_started:
            return True

        try:
            import paho.mqtt.client as mqtt  # type: ignore
        except Exception as e:
            self._last_error = f"openf1 mqtt client unavailable: {e}"
            return False

        if not self._access_token:
            self._last_error = "openf1 mqtt start failed: missing access token"
            return False

        def _as_int(v: Any) -> int:
            try:
                return int(v)
            except Exception:
                try:
                    return int(getattr(v, "value"))
                except Exception:
                    return -1

        def on_connect(client, userdata, *args, **kwargs):
            rc = 0
            if len(args) >= 2:
                rc = _as_int(args[1])
            elif len(args) == 1:
                rc = _as_int(args[0])
            self._connected = rc == 0
            if rc != 0:
                self._last_error = f"openf1 mqtt connect failed: rc={rc}"
                return
            self._last_error = None
            for t in self._cfg.topics:
                try:
                    client.subscribe(t)
                except Exception:
                    continue

        def on_disconnect(client, userdata, *args, **kwargs):
            rc = 0
            if len(args) >= 2:
                rc = _as_int(args[1])
            elif len(args) == 1:
                rc = _as_int(args[0])
            self._connected = False
            if rc != 0:
                self._last_error = f"openf1 mqtt disconnected: rc={rc}"

        def on_message(client, userdata, msg):
            try:
                payload_raw = msg.payload.decode("utf-8", errors="replace")
                try:
                    payload = json.loads(payload_raw)
                except Exception:
                    payload = {"_raw": payload_raw}
                event = {
                    "topic": msg.topic,
                    "payload": payload,
                    "source": "openf1",
                    "received_at_utc": datetime.now(timezone.utc).isoformat(),
                }
                self._last_message_at_utc = event["received_at_utc"]
                loop = self._loop
                q = self._queue
                if loop is None or q is None:
                    return

                def _put():
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
                            pass

                loop.call_soon_threadsafe(_put)
            except Exception:
                return

        transport = self._cfg.mqtt_transport
        if transport not in {"websockets", "tls"}:
            transport = "websockets"

        if transport == "websockets":
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, transport="websockets")
            try:
                client.ws_set_options(path=self._cfg.mqtt_ws_path)
            except Exception:
                pass
        else:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

        client.username_pw_set(username=self._cfg.mqtt_username, password=self._access_token)
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message

        try:
            client.connect(self._cfg.mqtt_host, self._cfg.mqtt_port, 60)
            client.loop_start()
        except Exception as e:
            self._last_error = f"openf1 mqtt connect error: {e}"
            return False

        with self._mqtt_lock:
            self._mqtt = client
        self._mqtt_started = True
        return True

    async def _token_refresh_loop(self) -> None:
        while self._enabled_runtime:
            await asyncio.sleep(15)
            if self._cfg.access_token:
                continue
            if not (self._cfg.username and self._cfg.password):
                continue
            if not self._token_expires_at:
                continue
            if datetime.now(timezone.utc) + timedelta(minutes=5) < self._token_expires_at:
                continue

            ok = await self._ensure_token(force=True)
            if not ok:
                continue

            with self._mqtt_lock:
                mqtt = self._mqtt
                token = self._access_token
            if mqtt is None or not token:
                continue
            try:
                mqtt.username_pw_set(username=self._cfg.mqtt_username, password=token)
                mqtt.reconnect()
            except Exception:
                continue

    async def _broadcast_loop(self) -> None:
        flush_interval = 1.0 / max(0.5, float(self._cfg.push_hz))
        while self._enabled_runtime:
            q = self._queue
            if q is None:
                await asyncio.sleep(0.05)
                continue

            try:
                event = await asyncio.wait_for(q.get(), timeout=flush_interval)
                payload = event.get("payload")
                topic = str(event.get("topic") or "")
                if topic:
                    k = self._cache_key(topic, payload)
                    self._latest[k] = event
                    self._dirty.add(k)
                while True:
                    try:
                        e = q.get_nowait()
                    except Exception:
                        break
                    payload = e.get("payload")
                    topic = str(e.get("topic") or "")
                    if topic:
                        k = self._cache_key(topic, payload)
                        self._latest[k] = e
                        self._dirty.add(k)
            except asyncio.TimeoutError:
                pass

            async with self._ws_lock:
                fw_clients = list(self._ws_clients_fw)
                raw_clients = list(self._ws_clients_raw)
                dirty_keys = list(self._dirty)
                self._dirty.clear()

            if raw_clients:
                for k in dirty_keys:
                    e = self._latest.get(k)
                    if not e:
                        continue
                    msg = json.dumps(e, ensure_ascii=False, separators=(",", ":"))
                    for c in raw_clients:
                        try:
                            await c.send_text(msg)
                        except Exception:
                            async with self._ws_lock:
                                self._ws_clients_raw.discard(c)

            if not fw_clients:
                continue

            for k in dirty_keys:
                e = self._latest.get(k)
                if not e:
                    continue
                msg = json.dumps(e, ensure_ascii=False, separators=(",", ":"))
                for c in fw_clients:
                    try:
                        await c.send_text(msg)
                    except Exception:
                        async with self._ws_lock:
                            self._ws_clients_fw.discard(c)
