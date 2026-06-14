# TickrProwl Security Remediation Plan

Findings from security audit on 2026-06-13. Ordered by priority — fix top items first.

---

## 1. Rename `proxy.ts` → `middleware.ts` [CRITICAL]

**File:** `frontend/proxy.ts`  
**Issue:** Next.js only runs `middleware.ts` as middleware. The Clerk `auth.protect()` call in `proxy.ts` is never invoked, so all protected frontend routes (watchlist, alerts, portfolio, scanner) are accessible without a session at the UI layer.  
**Fix:**
```bash
mv frontend/proxy.ts frontend/middleware.ts
```

---

## 2. Add file upload size limit [HIGH]

**File:** `backend/app/routers/portfolio.py:179`  
**Issue:** `await file.read()` has no size cap — a multi-GB upload exhausts server memory.  
**Fix:** Replace the `file.read()` call in `import_portfolio`:
```python
MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB
content_bytes = await file.read(MAX_CSV_BYTES + 1)
if len(content_bytes) > MAX_CSV_BYTES:
    raise HTTPException(status_code=413, detail="File too large — 5 MB limit")
content = content_bytes.decode("utf-8-sig")
```

---

## 3. Fix docker-compose to set `CLERK_ISSUER_URL` [HIGH]

**File:** `docker-compose.yml`  
**Issue:** `CLERK_ISSUER_URL` is not set in docker-compose. When unset, `auth.py` silently falls back to `return "dev_user"`, meaning anyone who hits the deployed backend is authenticated as the same user and can read/write all data.  
**Fix:** Add to `docker-compose.yml` backend environment:
```yaml
environment:
  - DATABASE_URL=sqlite:////data/tickrprowl.db
  - CLERK_ISSUER_URL=${CLERK_ISSUER_URL}
  - FRONTEND_URL=${FRONTEND_URL}
```
And consider making the bypass fail loudly in `auth.py`:
```python
if not CLERK_ISSUER:
    raise RuntimeError("CLERK_ISSUER_URL must be set — refusing to run unauthenticated")
```

---

## 4. Add auth to `/api/portfolio/detect` [HIGH]

**File:** `backend/app/routers/portfolio.py:162`  
**Issue:** The `/detect` endpoint accepts file uploads from anyone without authentication.  
**Fix:** Add `user_id` dependency:
```python
@router.post("/detect")
async def detect_broker(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
```

---

## 5. Cap the `days` query parameter [MEDIUM]

**File:** `backend/app/routers/stocks.py:87`  
**Issue:** No upper bound on `days` — `?days=9999999` issues a massive unbounded DB query.  
**Fix:**
```python
from fastapi import Query

def score_history(ticker: str, days: int = Query(default=30, ge=1, le=365), db: Session = Depends(get_db)):
```

---

## 6. Verify JWT audience [HIGH]

**File:** `backend/app/dependencies/auth.py:43`  
**Issue:** `options={"verify_aud": False}` means any JWT signed by this Clerk instance's key is accepted, even if minted for a different app.  
**Fix:** Decode with audience verification:
```python
payload = jwt.decode(
    token,
    jwks,
    algorithms=["RS256"],
    audience=CLERK_ISSUER,   # or the specific client ID from Clerk dashboard
)
```
Remove the `options={"verify_aud": False}` override (both occurrences in the retry block too).

---

## 7. Add rate limiting [MEDIUM]

**Issue:** No rate limiting anywhere — `/api/stocks/batch/scan` (public, 50 tickers, 5 concurrent yfinance fetches) can be spammed to DoS the server or get the IP banned by Yahoo Finance.  
**Fix:** Install `slowapi` and apply limits to the expensive endpoints:
```bash
pip install slowapi
```
```python
# main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```
```python
# stocks.py — on scan_stocks and scan_preset
@router.get("/batch/scan")
@limiter.limit("10/minute")
def scan_stocks(request: Request, tickers: str): ...
```

---

## 8. Fix JWKS cache race condition [LOW]

**File:** `backend/app/dependencies/auth.py`  
**Issue:** Module-level mutable dict cache with no lock — two threads can simultaneously see an expired cache and both fetch JWKS from Clerk.  
**Fix:**
```python
import threading
_jwks_lock = threading.Lock()

def _get_jwks() -> dict:
    now = time.monotonic()
    with _jwks_lock:
        if _jwks_cache["data"] is not None and now < _jwks_cache["expires_at"]:
            return _jwks_cache["data"]
        resp = httpx.get(f"{CLERK_ISSUER}/.well-known/jwks.json", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        _jwks_cache["data"] = data
        _jwks_cache["expires_at"] = now + _JWKS_TTL_SECONDS
        return data
```

---

## Status

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Rename `proxy.ts` → `middleware.ts` | Critical | [x] |
| 2 | File upload size limit | High | [x] |
| 3 | docker-compose `CLERK_ISSUER_URL` | High | [x] |
| 4 | Auth on `/detect` endpoint | High | [x] |
| 5 | Cap `days` query param | Medium | [x] |
| 6 | JWT audience verification | High | [x] |
| 7 | Rate limiting with slowapi | Medium | [x] |
| 8 | JWKS cache lock | Low | [x] |
