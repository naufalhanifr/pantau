import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .config import ADMIN_PASSWORD, KARYAWAN_PASSWORD, PPU_PN_PASSWORD, WEB_DIR
from .db import init_db
from .routers import admin, karyawan, monitoring, ppu_pn


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

app.include_router(monitoring.router)
app.include_router(admin.router)
app.include_router(admin.api)
app.include_router(karyawan.router)
app.include_router(karyawan.api)
app.include_router(ppu_pn.api)

app.mount("/assets", StaticFiles(directory=WEB_DIR / "monitoring" / "assets"), name="monitoring-assets")
app.mount("/admin/assets", StaticFiles(directory=WEB_DIR / "admin" / "assets"), name="admin-assets")
app.mount("/shared", StaticFiles(directory=WEB_DIR / "shared"), name="shared")
