from enum import Enum
from typing import Any, Dict
from pydantic import BaseModel, Field

class WSEventType(str, Enum):
    # Lifecycle & Authorization
    ROOM_KNOCK = "room:knock"
    ROOM_KNOCK_DECISION = "room:knock_decision"
    ROOM_JOINED = "room:joined"
    ROOM_SETTINGS_UPDATED = "room:settings_updated"
    ROOM_USER_JOINED = "room:user_joined"
    ROOM_USER_LEFT = "room:user_left"
    ROOM_KICK = "room:kick"
    ROOM_ERROR = "room:error"

    # Video Playback Synchronization
    SYNC_REQUEST = "sync:request"
    SYNC_STATE = "sync:state"
    SYNC_PLAY = "sync:play"
    SYNC_PAUSE = "sync:pause"
    SYNC_SEEK = "sync:seek"
    SYNC_TRACK_CHANGE = "sync:track_change"
    SYNC_URL_CHANGE = "sync:url_change"

    # Co-browsing Web Page Synchronization
    SYNC_MEDIA_MODE_CHANGE = "sync:media_mode_change"
    SYNC_WEB_NAVIGATE = "sync:web_navigate"
    SYNC_WEB_SCROLL = "sync:web_scroll"
    SYNC_WEB_CLICK = "sync:web_click"
    SYNC_WEB_CURSOR = "sync:web_cursor"

    # Live Chat
    CHAT_MESSAGE = "chat:message"

    # WebRTC Voice Mesh Signaling
    WEBRTC_JOIN_VOICE = "webrtc:join_voice"
    WEBRTC_LEAVE_VOICE = "webrtc:leave_voice"
    WEBRTC_ACTIVE_VOICE_PEERS = "webrtc:active_voice_peers"
    WEBRTC_OFFER = "webrtc:offer"
    WEBRTC_ANSWER = "webrtc:answer"
    WEBRTC_ICE_CANDIDATE = "webrtc:ice_candidate"

    # Telemetry & Time Sync
    TIME_PING = "time:ping"
    TIME_PONG = "time:pong"
    TELEMETRY_SUBMIT = "telemetry:submit"
    TELEMETRY_BROADCAST = "telemetry:broadcast"

class WSMessage(BaseModel):
    event: WSEventType
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: float
