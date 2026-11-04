import base64
import hashlib
import hmac
import logging
import secrets
import threading
import time

from fastapi import Header, HTTPException, Request

from .config import LOGIN_LOCK_SECONDS, LOGIN_MAX_FAILURES, SECRET_KEY, TOKEN_TTL_SECONDS


log = logging.getLogger("pantau.auth")


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def check_password(password: str, expected: str) -> bool:
    return hmac.compare_digest(password.encode(), expected.encode())


# shortcut: hitungan gagal login dan token yang dicabut disimpan di memori satu proses, jadi multi-worker butuh penyimpanan
# bersama. IP asli dibaca uvicorn dari X-Forwarded-For yang dikirim nginx.
_failed_logins: dict[tuple[str, str], list[float]] = {}
# Endpoint sync berjalan paralel di threadpool: tanpa kunci, percobaan serentak saling menimpa hitungan.
_login_lock = threading.Lock()


def check_login(request: Request, scope: str, password: str, expected: str) -> None:
    """Salah kata sandi LOGIN_MAX_FAILURES kali dari satu IP mengunci login scope itu selama LOGIN_LOCK_SECONDS."""
    # Tanpa ini, kata sandi kosong cocok dengan variabel yang belum di-set.
    if not expected:
        raise HTTPException(status_code=503, detail="Kata sandi menu ini belum diatur di server.")
    key = (scope, request.client.host if request.client else "")
    now = time.time()
    with _login_lock:
        failures = [t for t in _failed_logins.get(key, []) if now - t < LOGIN_LOCK_SECONDS]
        if len(failures) >= LOGIN_MAX_FAILURES:
            log.warning("login ditolak (terkunci) scope=%s ip=%s", scope, key[1])
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        if not check_password(password, expected):
            _failed_logins[key] = [*failures, now]
            log.warning("login gagal scope=%s ip=%s", scope, key[1])
            raise HTTPException(status_code=401, detail="Kata sandi tidak sesuai.")
        _failed_logins.pop(key, None)
    log.info("login berhasil scope=%s ip=%s", scope, key[1])


# Tanda tangan token yang sudah keluar -> waktu kedaluwarsanya.
_revoked: dict[str, int] = {}


def revoke_token(authorization: str) -> None:
    """Token yang sudah ditandai keluar ditolak _verify walau belum kedaluwarsa. Pemanggil sudah memverifikasi tokennya."""
    _, expires, _, signature = base64.urlsafe_b64decode(authorization.removeprefix("Bearer ").strip().encode()).decode().split(":")
    now = time.time()
    with _login_lock:
        for old in [sig for sig, until in _revoked.items() if until < now]:
            del _revoked[old]
        _revoked[signature] = int(expires)


def issue_token(role: str = "admin", ttl: int = TOKEN_TTL_SECONDS) -> str:
    expires = str(int(time.time()) + ttl)
    # Nonce: dua login di detik yang sama mendapat token berbeda, jadi mencabut yang satu tidak mengeluarkan yang lain.
    raw = f"{role}:{expires}:{secrets.token_hex(8)}"
    return base64.urlsafe_b64encode(f"{raw}:{_sign(raw)}".encode()).decode()


def _verify(authorization: str, role: str, label: str) -> None:
    """Token hanya berlaku untuk perannya: token karyawan tidak bisa membuka API admin, dan sebaliknya."""
    token = authorization.removeprefix("Bearer ").strip()
    try:
        token_role, expires, nonce, signature = base64.urlsafe_b64decode(token.encode()).decode().split(":")
    except Exception:
        raise HTTPException(status_code=401, detail=f"Sesi {label} tidak valid. Silakan masuk kembali.")
    raw = f"{token_role}:{expires}:{nonce}"
    # Bandingkan bytes: compare_digest menolak str non-ASCII dengan TypeError (jadi 500, bukan 401).
    if token_role != role or not hmac.compare_digest(signature.encode(), _sign(raw).encode()) or int(expires) < time.time() or signature in _revoked:
        raise HTTPException(status_code=401, detail=f"Sesi {label} berakhir. Silakan masuk kembali.")


def require_admin(authorization: str = Header(default="")) -> None:
    _verify(authorization, "admin", "admin")


def require_karyawan(authorization: str = Header(default="")) -> None:
    _verify(authorization, "karyawan", "data karyawan")


def require_ppu_pn(authorization: str = Header(default="")) -> None:
    _verify(authorization, "ppu_pn", "data karyawan PPU PN")
