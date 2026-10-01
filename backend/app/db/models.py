import time
from sqlalchemy import Column, String, Boolean, Float, Text, Integer
from app.db.database import Base

class RoomDB(Base):
    __tablename__ = "rooms"

    room_id = Column(String(12), primary_key=True, index=True)
    host_client_id = Column(String(64), nullable=False, index=True)
    host_token = Column(String(64), nullable=False)
    host_display_name = Column(String(64), nullable=False, default="Host")
    access_mode = Column(String(16), default="public", nullable=False)
    hashed_pin = Column(String(256), nullable=True)
    control_policy = Column(String(16), default="host_only", nullable=False)
    media_mode = Column(String(16), default="video_stream", nullable=False)
    stream_url = Column(Text, nullable=True)
    web_url = Column(Text, nullable=True, default="https://en.wikipedia.org/wiki/Streaming_media")
    diagnostics_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)

class SessionTokenDB(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    room_id = Column(String(12), index=True, nullable=False)
    client_id = Column(String(64), index=True, nullable=False)
    display_name = Column(String(64), nullable=False)
    is_host = Column(Boolean, default=False, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)
