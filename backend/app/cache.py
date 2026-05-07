import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple


@dataclass
class _Entry:
    expires_at: float
    value: Any


class TtlCache:
    def __init__(self, default_ttl_s: int = 60):
        self._default_ttl_s = int(default_ttl_s)
        self._data: Dict[str, _Entry] = {}

    def get(self, key: str) -> Optional[Any]:
        e = self._data.get(key)
        if e is None:
            return None
        if time.time() >= e.expires_at:
            self._data.pop(key, None)
            return None
        return e.value

    def set(self, key: str, value: Any, ttl_s: Optional[int] = None) -> None:
        ttl = self._default_ttl_s if ttl_s is None else int(ttl_s)
        self._data[key] = _Entry(expires_at=time.time() + max(ttl, 0), value=value)

    async def get_or_set(self, key: str, fn: Callable[[], Any], ttl_s: Optional[int] = None) -> Any:
        v = self.get(key)
        if v is not None:
            return v
        v = fn()
        if hasattr(v, "__await__"):
            v = await v
        self.set(key, v, ttl_s=ttl_s)
        return v

