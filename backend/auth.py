import base64
import hashlib
import hmac
import threading
import time

from fastapi import Header, HTTPException, Request

from .config import ADMIN_PASSWORD, LOGIN_LOCK_SECONDS, LOGIN_MAX_FAILURES, SECRET_KEY, TOKEN_TTL_SECONDS


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def check_password(password: str, expected: str = ADMIN_PASSWORD) -> bool:
    return hmac.compare_digest(password.encode(), expected.encode())


# shortcut: hitungan gagal login disimpan di memori satu proses dan per IP; di balik reverse proxy semua
# pengguna terlihat satu IP (pakai header X-Forwarded-For tepercaya) dan multi-worker butuh penyimpanan bersama.
_failed_logins: dict[tuple[str, str], list[float]] = {}
# Endpoint sync berjalan paralel di threadpool: tanpa kunci, percobaan serentak saling menimpa hitungan.
_login_lock = threading.Lock()


def check_login(request: Request, scope: str, password: str, expected: str) -> None:
    """Salah kata sandi LOGIN_MAX_FAILURES kali dari satu IP mengunci login scope itu selama LOGIN_LOCK_SECONDS."""
    key = (scope, request.client.host if request.client else "")
    now = time.time()
    with _login_lock:
        failures = [t for t in _failed_logins.get(key, []) if now - t < LOGIN_LOCK_SECONDS]
        if len(failures) >= LOGIN_MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        if not check_password(password, expected):
            _failed_logins[key] = [*failures, now]
            raise HTTPException(status_code=401, detail="Kata sandi tidak sesuai.")
        _failed_logins.pop(key, None)


def issue_token(role: str = "admin", ttl: int = TOKEN_TTL_SECONDS) -> str:
    expires = str(int(time.time()) + ttl)
    raw = f"{role}:{expires}"
    return base64.urlsafe_b64encode(f"{raw}:{_sign(raw)}".encode()).decode()


def _verify(authorization: str, role: str, label: str) -> None:
    """Token hanya berlaku untuk perannya: token karyawan tidak bisa membuka API admin, dan sebaliknya."""
    token = authorization.removeprefix("Bearer ").strip()
    try:
        token_role, expires, signature = base64.urlsafe_b64decode(token.encode()).decode().split(":")
    except Exception:
        raise HTTPException(status_code=401, detail=f"Sesi {label} tidak valid. Silakan masuk kembali.")
    raw = f"{token_role}:{expires}"
    if token_role != role or not hmac.compare_digest(signature, _sign(raw)) or int(expires) < time.time():
        raise HTTPException(status_code=401, detail=f"Sesi {label} berakhir. Silakan masuk kembali.")


def require_admin(authorization: str = Header(default="")) -> None:
    _verify(authorization, "admin", "admin")


def require_karyawan(authorization: str = Header(default="")) -> None:
    _verify(authorization, "karyawan", "data karyawan")
