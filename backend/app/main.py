from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# Register routers
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
