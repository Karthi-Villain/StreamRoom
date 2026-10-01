from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Configure SQLite-specific parameters if using sqlite
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    """Create all database tables based on defined models."""
    from app.db import models
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency helper to acquire a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
