from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .config import WEB_DIR
from .db import init_db
from .routers import admin, karyawan, monitoring, ppu_pn


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="PANTAU API",
    description="PANTAU - monitoring pembayaran iuran",
    version="3.0.0",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Respons API berisi data pribadi: jangan disimpan di cache browser/proxy.
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
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
