import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables from .env file
load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Synchronized Streaming Room Backend")
    API_V1_STR: str = os.getenv("API_V1_STR", "/api/v1")
    CORS_ORIGINS: List[str] = ["*"]
    SECRET_KEY: str = os.getenv("SECRET_KEY", "default-insecure-secret-key-change-in-prod")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Database connection string: defaults to local SQLite, or any SQL database if configured
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./streamroom.db")
    
    TELEMETRY_INTERVAL_SECONDS: int = int(os.getenv("TELEMETRY_INTERVAL_SECONDS", "5"))
    MAX_VOICE_PEERS_DEFAULT: int = int(os.getenv("MAX_VOICE_PEERS_DEFAULT", "12"))
    PROXY_TIMEOUT_SECONDS: float = float(os.getenv("PROXY_TIMEOUT_SECONDS", "12.0"))

settings = Settings()
