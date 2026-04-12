import os
from functools import lru_cache

import httpx
from fastapi import Header, HTTPException
from jose import JWTError, jwt

CLERK_ISSUER = os.getenv("CLERK_ISSUER_URL", "")


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """Fetch and cache Clerk's public JWKS for JWT verification."""
    resp = httpx.get(f"{CLERK_ISSUER}/.well-known/jwks.json", timeout=10)
    resp.raise_for_status()
    return resp.json()


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
        raise HTTPException(status_code=401, detail="Invalid or expired token")
