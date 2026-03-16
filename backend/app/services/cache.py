import time
from typing import Any, Optional

_cache: dict[str, tuple[Any, float]] = {}
TTL_SECONDS = 600  # 10 minutes


def get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry:
        value, expires_at = entry
        if time.time() < expires_at:
            return value
        del _cache[key]
    return None


def set(key: str, value: Any) -> None:
    _cache[key] = (value, time.time() + TTL_SECONDS)


def invalidate(key: str) -> None:
    _cache.pop(key, None)
