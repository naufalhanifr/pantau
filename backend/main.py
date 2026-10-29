from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .config import WEB_DIR
from .db import init_db
from .routers import admin, monitoring


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

app.include_router(monitoring.router)
app.include_router(admin.router)
app.include_router(admin.api)

app.mount("/assets", StaticFiles(directory=WEB_DIR / "monitoring" / "assets"), name="monitoring-assets")
app.mount("/admin/assets", StaticFiles(directory=WEB_DIR / "admin" / "assets"), name="admin-assets")
app.mount("/shared", StaticFiles(directory=WEB_DIR / "shared"), name="shared")
