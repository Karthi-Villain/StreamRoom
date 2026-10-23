import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings
from app.db.database import init_db
from app.routers.api_v1 import router as api_v1_router
from app.routers.proxy_router import router as proxy_router
from app.routers.websocket_gateway import ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on application start
    init_db()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers first
app.include_router(api_v1_router, prefix=settings.API_V1_STR)
app.include_router(proxy_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": settings.DATABASE_URL.split("://")[0]
    }

# -----------------------------------------------------------------------------
# Static Frontend & Single Page Application (SPA) Serving
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_CANDIDATES = [
    os.getenv("STATIC_DIR", ""),
    os.path.join(BASE_DIR, "public"),
    os.path.join(os.getcwd(), "public"),
]

STATIC_DIR = next(
    (
        d
        for d in STATIC_CANDIDATES
        if d and os.path.isdir(d) and os.path.exists(os.path.join(d, "index.html"))
    ),
    None
)

if STATIC_DIR:
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Skip special API prefixes so 404s in API routes are handled properly
        if full_path.startswith(("api/", "health", "docs", "redoc", "openapi.json", "ws/")):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # Serve static file directly if requested
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Fallback to SPA index.html
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)

        return JSONResponse({"detail": "Not Found"}, status_code=404)
