import os
import time

import httpx
from fastapi import Header, HTTPException
from jose import JWTError, jwt

CLERK_ISSUER = os.getenv("CLERK_ISSUER_URL", "")

_JWKS_TTL_SECONDS = 6 * 3600  # 6 hours
_jwks_cache: dict = {"data": None, "expires_at": 0.0}


def _get_jwks() -> dict:
    """Fetch Clerk's public JWKS for JWT verification, cached with a 6-hour TTL."""
    now = time.monotonic()
    if _jwks_cache["data"] is not None and now < _jwks_cache["expires_at"]:
        return _jwks_cache["data"]
    resp = httpx.get(f"{CLERK_ISSUER}/.well-known/jwks.json", timeout=10)
    resp.raise_for_status()
    data = resp.json()
    _jwks_cache["data"] = data
    _jwks_cache["expires_at"] = now + _JWKS_TTL_SECONDS
    return data


def get_current_user(authorization: str = Header(None)) -> str:
    """
    FastAPI dependency that extracts and verifies the Clerk JWT.

    Dev mode: if CLERK_ISSUER_URL is not set, returns 'dev_user' so the
    app works locally without Clerk configured.
    """
    if not CLERK_ISSUER:
        return "dev_user"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.split(" ", 1)[1]
    try:
        jwks = _get_jwks()
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        return payload["sub"]
    except JWTError:
        # Key may have rotated — invalidate cache and retry once with fresh JWKS
        _jwks_cache["expires_at"] = 0.0
        try:
            jwks = _get_jwks()
            payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
            return payload["sub"]
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
