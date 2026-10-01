# Backend Technical Specification (Python FastAPI)

## 1. Technology Stack and Dependencies

- Language: Python 3.11+
- Framework: FastAPI 0.110+
- ASGI Web Server: Uvicorn 0.29+ with uvloop for low-latency async I/O
- WebSocket Engine: Starlette Native WebSockets
- Validation and Data Serialization: Pydantic v2
- Cryptography & Hashing: argon2-cffi (for room PIN protection) and secrets (for cryptographically secure room ID generation)
- Real-time Concurrency: Python asyncio primitives (AsyncLock, Event, Queue)
- Optional Multi-Worker Persistence: Redis with aioredis (for multi-node horizontal scaling)

---

## 2. Directory and File Layout

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── security.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── room.py
│   │   ├── events.py
│   │   └── telemetry.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── room_manager.py
│   │   ├── sync_engine.py
│   │   ├── webrtc_signaling.py
│   │   └── telemetry_service.py
│   └── routers/
│       ├── __init__.py
│       ├── rooms_api.py
│       └── websocket_gateway.py
├── requirements.txt
└── Dockerfile
```

---

## 3. Data Models and Schemas

### 3.1 Room Configuration and State Models

```python
from enum import Enum
from typing import Optional, Dict, List
from pydantic import BaseModel, Field

class AccessMode(str, Enum):
    PUBLIC = "public"
    PIN = "pin"
    APPROVAL = "approval"

class ControlPolicy(str, Enum):
    HOST_ONLY = "host_only"
    COLLABORATIVE = "collaborative"

class PlaybackStatus(str, Enum):
    PLAYING = "playing"
    PAUSED = "paused"
    BUFFERING = "buffering"

class RoomSettings(BaseModel):
    access_mode: AccessMode = AccessMode.PUBLIC
    hashed_pin: Optional[str] = None
    control_policy: ControlPolicy = ControlPolicy.HOST_ONLY
    stream_url: Optional[str] = None
    diagnostics_enabled: bool = False
    max_voice_peers: int = 12

class VideoPlaybackState(BaseModel):
    status: PlaybackStatus = PlaybackStatus.PAUSED
    reference_position: float = 0.0
    reference_timestamp: float = 0.0
    playback_rate: float = 1.0
    active_subtitle_track: Optional[str] = None
    active_audio_track: Optional[str] = None

class Participant(BaseModel):
    client_id: str
    display_name: str
    is_host: bool = False
    joined_at: float
    is_voice_active: bool = False
```

### 3.2 WebSocket Envelope and Event Models

```python
from typing import Any
from pydantic import BaseModel, Field

class WSEventType(str, Enum):
    # Lifecycle & Auth
    ROOM_KNOCK = "room:knock"
    ROOM_KNOCK_DECISION = "room:knock_decision"
    ROOM_JOINED = "room:joined"
    ROOM_SETTINGS_UPDATED = "room:settings_updated"
    ROOM_USER_JOINED = "room:user_joined"
    ROOM_USER_LEFT = "room:user_left"
    ROOM_KICK = "room:kick"

    # Playback Sync
    SYNC_REQUEST = "sync:request"
    SYNC_STATE = "sync:state"
    SYNC_PLAY = "sync:play"
    SYNC_PAUSE = "sync:pause"
    SYNC_SEEK = "sync:seek"
    SYNC_TRACK_CHANGE = "sync:track_change"
    SYNC_URL_CHANGE = "sync:url_change"

    # Chat
    CHAT_MESSAGE = "chat:message"

    # WebRTC Voice Signaling
    WEBRTC_JOIN_VOICE = "webrtc:join_voice"
    WEBRTC_LEAVE_VOICE = "webrtc:leave_voice"
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
```

---

## 4. Core Subsystem Implementation Details

### 4.1 Room Identifier Generator

The 12-character alphanumeric room ID must be generated using `secrets.choice` to ensure complete entropy and resistance to enumeration attacks:

```python
import string
import secrets

ALPHANUMERIC_CHARS = string.ascii_letters + string.digits  # 62 characters

def generate_room_id(length: int = 12) -> str:
    return "".join(secrets.choice(ALPHANUMERIC_CHARS) for _ in range(length))
```

### 4.2 Security and Access Control Service

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()

def hash_pin(pin: str) -> str:
    return ph.hash(pin)

def verify_pin(pin: str, hashed_pin: str) -> bool:
    try:
        return ph.verify(hashed_pin, pin)
    except VerifyMismatchError:
        return False
```

### 4.3 Room Manager and Knocking Queue

The room manager coordinates in-memory room instances and handles access approval for private rooms:

```python
import asyncio
import time
from typing import Dict, Optional, Set
from fastapi import WebSocket

class PendingKnock:
    def __init__(self, client_id: str, display_name: str, event: asyncio.Event):
        self.client_id = client_id
        self.display_name = display_name
        self.event = event
        self.approved: Optional[bool] = None

class ActiveRoom:
    def __init__(self, room_id: str, host_client_id: str, settings: RoomSettings):
        self.room_id = room_id
        self.host_client_id = host_client_id
        self.settings = settings
        self.playback_state = VideoPlaybackState(
            status=PlaybackStatus.PAUSED,
            reference_position=0.0,
            reference_timestamp=time.time(),
            playback_rate=1.0
        )
        self.participants: Dict[str, Participant] = {}
        self.connections: Dict[str, WebSocket] = {}
        self.pending_knocks: Dict[str, PendingKnock] = {}
        self.voice_peers: Set[str] = set()
        self.lock = asyncio.Lock()

    def calculate_current_position(self) -> float:
        if self.playback_state.status != PlaybackStatus.PLAYING:
            return self.playback_state.reference_position
        elapsed = time.time() - self.playback_state.reference_timestamp
        return self.playback_state.reference_position + (elapsed * self.playback_state.playback_rate)

    async def broadcast(self, message: WSMessage, exclude_client_id: Optional[str] = None):
        payload_text = message.model_dump_json()
        async with self.lock:
            for client_id, ws in list(self.connections.items()):
                if client_id == exclude_client_id:
                    continue
                try:
                    await ws.send_text(payload_text)
                except Exception:
                    pass
```

### 4.4 Master Playback Synchronization Engine

The synchronization engine receives play, pause, seek, and track change requests and updates the master timeline.

Validation Rule:
If `room.settings.control_policy == ControlPolicy.HOST_ONLY`, any message originating from a non-host participant must be rejected with an authorization error payload.

State Transitions:
- `SYNC_PLAY`:
  1. Calculate current playhead position.
  2. Update `playback_state.status = PlaybackStatus.PLAYING`.
  3. Set `playback_state.reference_position = incoming_position`.
  4. Set `playback_state.reference_timestamp = time.time()`.
  5. Broadcast `SYNC_STATE` with current time and rate.
- `SYNC_PAUSE`:
  1. Calculate current playhead position based on elapsed time.
  2. Update `playback_state.status = PlaybackStatus.PAUSED`.
  3. Set `playback_state.reference_position = incoming_position`.
  4. Set `playback_state.reference_timestamp = time.time()`.
  5. Broadcast `SYNC_STATE`.
- `SYNC_SEEK`:
  1. Update `playback_state.reference_position = target_position`.
  2. Set `playback_state.reference_timestamp = time.time()`.
  3. Broadcast `SYNC_STATE` containing updated position.
- `SYNC_TRACK_CHANGE`:
  1. Store the selected subtitle track or audio track identifier.
  2. Broadcast `SYNC_TRACK_CHANGE` to trigger instant audio/subtitle track alignment across all viewer engines.

### 4.5 WebRTC Voice Signaling Gateway

The backend acts as an exchange hub for peer connection handshakes:

1. When client A wants to join voice, it sends `WEBRTC_JOIN_VOICE`.
2. The server adds client A to `room.voice_peers` and returns the list of current voice members.
3. For each existing member B, client A sends a `WEBRTC_OFFER` specifying `target_peer_id: B`.
4. The server inspects `target_peer_id` and forwards the payload directly to client B's active WebSocket connection.
5. Client B generates a `WEBRTC_ANSWER` targeting client A, which the server routes back to client A.
6. As ICE candidates are generated on either side, `WEBRTC_ICE_CANDIDATE` packets are forwarded to the corresponding peer.
7. If client A drops or disconnects, the server automatically broadcasts `WEBRTC_LEAVE_VOICE` with client A's ID to clean up peer connection resources.

### 4.6 Telemetry and Diagnostics Service

When `room.settings.diagnostics_enabled` is set to `true`:
- Clients send periodic diagnostic frames containing:
  - Round Trip Time (RTT).
  - Video segment download speed in megabits per second.
  - Video player buffer length in seconds.
  - Video player dropped frame count.
  - Playback drift against server reference clock in milliseconds.
- The server collects these reports in a rolling buffer (last 5 reports per user).
- Every 5 seconds, an aggregated health matrix is assembled:
  - Average room network latency.
  - Minimum and maximum buffer health.
  - Total dropped frames across all viewers.
  - Out-of-sync participant flags (drift > 1500ms).
- This aggregated report is broadcast to all participants in the room. If diagnostics are disabled by the host, incoming telemetry reports are ignored and no broadcast is emitted.

---

## 5. WebSocket Handler Implementation Structure

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, status
import time

ws_router = APIRouter()

@ws_router.websocket("/ws/rooms/{room_id}")
async def room_websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
    client_id: str = Query(...)
):
    await websocket.accept()
    room = room_manager.get_room(room_id)
    if not room:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify session authorization token
    auth_participant = room_manager.validate_session_token(room_id, token, client_id)
    if not auth_participant:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Register active connection
    await room.add_connection(client_id, websocket, auth_participant)

    try:
        while True:
            raw_text = await websocket.receive_text()
            message = WSMessage.model_validate_json(raw_text)
            await handle_incoming_message(room, client_id, message)
    except WebSocketDisconnect:
        await room.remove_connection(client_id)
```
