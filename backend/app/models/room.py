import asyncio
import time
from enum import Enum
from typing import Optional, Dict, List, Set, Any
from pydantic import BaseModel, Field
from fastapi import WebSocket

from app.models.events import WSMessage

class AccessMode(str, Enum):
    PUBLIC = "public"
    PIN = "pin"
    APPROVAL = "approval"

class ControlPolicy(str, Enum):
    HOST_ONLY = "host_only"
    COLLABORATIVE = "collaborative"

class MediaMode(str, Enum):
    VIDEO_STREAM = "video_stream"
    WEB_PAGE = "web_page"

class PlaybackStatus(str, Enum):
    PLAYING = "playing"
    PAUSED = "paused"
    BUFFERING = "buffering"

class RoomSettings(BaseModel):
    access_mode: AccessMode = AccessMode.PUBLIC
    hashed_pin: Optional[str] = None
    control_policy: ControlPolicy = ControlPolicy.HOST_ONLY
    media_mode: MediaMode = MediaMode.VIDEO_STREAM
    stream_url: Optional[str] = None
    web_url: Optional[str] = "https://en.wikipedia.org/wiki/Streaming_media"
    diagnostics_enabled: bool = False
    max_voice_peers: int = 12

class VideoPlaybackState(BaseModel):
    status: PlaybackStatus = PlaybackStatus.PAUSED
    reference_position: float = 0.0
    reference_timestamp: float = 0.0
    playback_rate: float = 1.0
    active_subtitle_track: Optional[str] = None
    active_audio_track: Optional[str] = None

class WebPageState(BaseModel):
    current_url: str = "https://en.wikipedia.org/wiki/Streaming_media"
    scroll_top_pct: float = 0.0
    scroll_left_pct: float = 0.0
    last_interaction_timestamp: float = 0.0

class Participant(BaseModel):
    client_id: str
    display_name: str
    is_host: bool = False
    joined_at: float
    is_voice_active: bool = False

class TelemetryReport(BaseModel):
    client_id: str
    websocket_rtt_ms: float = 0.0
    webrtc_audio_rtt_ms: float = 0.0
    segment_download_mbps: float = 0.0
    buffer_health_sec: float = 0.0
    dropped_frames: int = 0
    sync_drift_ms: float = 0.0

class ParticipantMetrics(BaseModel):
    client_id: str
    display_name: str
    is_host: bool
    latency_ms: float
    bandwidth_mbps: float
    buffer_sec: float
    drift_ms: float
    dropped_frames: int
    health_grade: str

class PendingKnockRequest:
    def __init__(self, client_id: str, display_name: str, event: asyncio.Event):
        self.client_id = client_id
        self.display_name = display_name
        self.event = event
        self.approved: Optional[bool] = None
        self.session_token: Optional[str] = None
        self.requested_at = time.time()

class ActiveRoom:
    def __init__(self, room_id: str, host_client_id: str, host_token: str, settings: RoomSettings):
        self.room_id = room_id
        self.host_client_id = host_client_id
        self.host_token = host_token
        self.settings = settings
        self.created_at = time.time()

        self.video_state = VideoPlaybackState(
            status=PlaybackStatus.PAUSED,
            reference_position=0.0,
            reference_timestamp=time.time(),
            playback_rate=1.0
        )
        self.web_state = WebPageState(
            current_url=settings.web_url or "https://en.wikipedia.org/wiki/Streaming_media",
            scroll_top_pct=0.0,
            scroll_left_pct=0.0,
            last_interaction_timestamp=time.time()
        )

        self.participants: Dict[str, Participant] = {}
        self.connections: Dict[str, WebSocket] = {}
        self.session_tokens: Dict[str, str] = {}
        self.pending_knocks: Dict[str, PendingKnockRequest] = {}
        self.voice_peers: Set[str] = set()
        self.lock = asyncio.Lock()

    def calculate_current_video_position(self) -> float:
        if self.video_state.status != PlaybackStatus.PLAYING:
            return self.video_state.reference_position
        elapsed = time.time() - self.video_state.reference_timestamp
        return self.video_state.reference_position + (elapsed * self.video_state.playback_rate)

    async def broadcast(self, message: WSMessage, exclude_client_id: Optional[str] = None):
        raw = message.model_dump_json()
        async with self.lock:
            for cid, ws in list(self.connections.items()):
                if cid == exclude_client_id:
                    continue
                try:
                    await ws.send_text(raw)
                except Exception:
                    pass

    async def send_to(self, client_id: str, message: WSMessage):
        ws = self.connections.get(client_id)
        if ws:
            try:
                await ws.send_text(message.model_dump_json())
            except Exception:
                pass
