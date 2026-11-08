import logging
import sqlite3
from contextlib import asynccontextmanager
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import ADMIN_PASSWORD, KARYAWAN_PASSWORD, PPU_PN_PASSWORD, WEB_DIR
from .db import init_db
from .routers import admin, karyawan, monitoring, ppu_pn
from .templating import render_error


# Jejak login (pantau.auth) masuk ke log service; uvicorn tidak mengatur logger selain miliknya.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pantau")

# Skrip inline (atribut onclick) masih dipakai halaman, jadi 'unsafe-inline' tetap perlu. Kebijakan ini membatasi ke mana
# data bisa dikirim dan dari mana skrip dimuat: semua pustaka di-host sendiri di /shared/vendor.
CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    for name, value in (("ADMIN", ADMIN_PASSWORD), ("KARYAWAN", KARYAWAN_PASSWORD), ("PPU_PN", PPU_PN_PASSWORD)):
        if value and len(value) < 12:
            log.warning("PANTAU_%s_PASSWORD kurang dari 12 karakter; pakai kata sandi yang lebih panjang.", name)
    yield


app = FastAPI(
    title="PANTAU API",
    description="PANTAU - monitoring pembayaran iuran",
    version="3.0.0",
    lifespan=lifespan,
    # Dokumentasi otomatis memetakan semua endpoint admin; situs publik tidak memerlukannya.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = CSP
    # Respons API berisi data pribadi: jangan disimpan di cache browser/proxy. /api/data (ber-ETag) mengatur sendiri.
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        # Halaman & aset statis: browser wajib cek ulang (304 jika tidak berubah) agar versi baru langsung terpakai.
        response.headers["Cache-Control"] = "no-cache"
    return response

# Pesan bila route tidak memberi pesan sendiri (pesan bawaan FastAPI berbahasa Inggris dan tidak menjelaskan langkah berikutnya).
# Daftar yang sama untuk error dari nginx ada di web/shared/common.js (PANTAU_ERROR_MESSAGES).
ERROR_MESSAGES = {
    400: "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.",
    401: "Sesi berakhir atau belum masuk. Silakan masuk kembali.",
    403: "Anda tidak punya akses ke halaman ini.",
    404: "Alamat atau data yang dicari tidak ada di PANTAU. Periksa alamatnya, atau kembali ke halaman utama.",
    405: "Halaman ini sudah berubah. Muat ulang halaman; bila tetap muncul, hubungi admin PANTAU.",
    422: "Data yang dikirim tidak lengkap atau formatnya salah. Muat ulang halaman, lalu coba lagi.",
    429: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.",
    500: "Terjadi kesalahan di server. Coba lagi; bila tetap muncul, hubungi admin PANTAU.",
    503: "Database sedang dipakai proses lain, misalnya upload data. Coba lagi dalam beberapa detik.",
}
PAGE_TITLES = {404: "Halaman tidak ditemukan", 405: "Halaman tidak ditemukan", 500: "Terjadi kesalahan di server", 503: "Server sedang sibuk"}


def error_response(request: Request, status: int, detail=None, headers=None):
    """API: JSON {"detail": pesan}. Halaman yang dibuka browser: halaman error PANTAU, bukan teks JSON."""
    if not detail or detail == HTTPStatus(status).phrase:
        detail = ERROR_MESSAGES.get(status, ERROR_MESSAGES[500 if status >= 500 else 400])
    headers = {**(headers or {}), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if request.method == "GET" and not request.url.path.startswith("/api/"):
        title = PAGE_TITLES.get(status, "Terjadi kesalahan")
        return HTMLResponse(render_error(WEB_DIR, status, title, detail if isinstance(detail, str) else ERROR_MESSAGES[422]), status, headers)
    return JSONResponse({"detail": detail}, status, headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return error_response(request, exc.status_code, exc.detail, exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    log.info("Permintaan tidak valid %s: %s", request.url.path, exc.errors())
    return error_response(request, 422)


@app.exception_handler(sqlite3.OperationalError)
async def database_error(request: Request, exc: sqlite3.OperationalError):
    if "locked" in str(exc):   # penulis lain (upload/simpan) memegang database lebih dari batas tunggu 5 detik
        return error_response(request, 503, headers={"Retry-After": "5"})
    log.exception("Kesalahan database di %s", request.url.path)
    return error_response(request, 500)


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    # Traceback tetap tercatat oleh uvicorn; pengguna hanya melihat pesan yang bisa ditindaklanjuti.
    return error_response(request, 500)


for route in (monitoring.router, admin.router, admin.session, admin.api, karyawan.session, karyawan.api, ppu_pn.session, ppu_pn.api):
    app.include_router(route)

app.mount("/assets", StaticFiles(directory=WEB_DIR / "monitoring" / "assets"), name="monitoring-assets")
app.mount("/admin/assets", StaticFiles(directory=WEB_DIR / "admin" / "assets"), name="admin-assets")
app.mount("/shared", StaticFiles(directory=WEB_DIR / "shared"), name="shared")
