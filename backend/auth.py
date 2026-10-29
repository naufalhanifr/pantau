import base64
import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from .config import ADMIN_PASSWORD, SECRET_KEY, TOKEN_TTL_SECONDS


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def check_password(password: str) -> bool:
    return hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode())


def issue_token() -> str:
    expires = str(int(time.time()) + TOKEN_TTL_SECONDS)
    raw = f"admin:{expires}"
    return base64.urlsafe_b64encode(f"{raw}:{_sign(raw)}".encode()).decode()


def require_admin(authorization: str = Header(default="")) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    try:
        role, expires, signature = base64.urlsafe_b64decode(token.encode()).decode().split(":")
    except Exception:
        raise HTTPException(status_code=401, detail="Sesi admin tidak valid. Silakan masuk kembali.")
    raw = f"{role}:{expires}"
    if not hmac.compare_digest(signature, _sign(raw)) or int(expires) < time.time():
        raise HTTPException(status_code=401, detail="Sesi admin berakhir. Silakan masuk kembali.")
