import time
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.models.room import RoomSettings, AccessMode, ControlPolicy, MediaMode, TelemetryReport
from app.models.events import WSEventType, WSMessage
from app.services.room_manager import room_manager
from app.services.sync_engine import SyncEngine
from app.services.webrtc_signaling import WebRTCSignalingService
from app.services.telemetry import telemetry_service
from app.services.pusher_service import pusher_service
from app.core.security import hash_pin

router = APIRouter(prefix="/rooms", tags=["Rooms"])

class CreateRoomRequest(BaseModel):
    host_client_id: str
    host_display_name: str
    access_mode: AccessMode = AccessMode.PUBLIC
    pin: Optional[str] = None
    control_policy: ControlPolicy = ControlPolicy.HOST_ONLY
    media_mode: MediaMode = MediaMode.VIDEO_STREAM
    stream_url: Optional[str] = None
    web_url: Optional[str] = None
    diagnostics_enabled: bool = False

class JoinRoomRequest(BaseModel):
    client_id: str
    display_name: str
    pin: Optional[str] = None

class ResumeSessionRequest(BaseModel):
    client_id: str
    session_token: Optional[str] = None
    host_token: Optional[str] = None

class UpdateSettingsRequest(BaseModel):
    access_mode: Optional[AccessMode] = None
    pin: Optional[str] = None
    control_policy: Optional[ControlPolicy] = None
    media_mode: Optional[MediaMode] = None
    stream_url: Optional[str] = None
    web_url: Optional[str] = None
    diagnostics_enabled: Optional[bool] = None

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room(req: CreateRoomRequest):
    """Create a new room with a 12-character ID and return host credentials."""
    hashed = hash_pin(req.pin) if (req.access_mode == AccessMode.PIN and req.pin) else None

    settings = RoomSettings(
        access_mode=req.access_mode,
        hashed_pin=hashed,
        control_policy=req.control_policy,
        media_mode=req.media_mode,
        stream_url=req.stream_url,
        web_url=req.web_url,
        diagnostics_enabled=req.diagnostics_enabled
    )

    room, host_token, session_token = await room_manager.create_room(
        host_client_id=req.host_client_id,
        host_display_name=req.host_display_name,
        settings=settings
    )

    return {
        "room_id": room.room_id,
        "host_token": host_token,
        "session_token": session_token,
        "settings": {
            "access_mode": room.settings.access_mode,
            "control_policy": room.settings.control_policy,
            "media_mode": room.settings.media_mode,
            "stream_url": room.settings.stream_url,
            "web_url": room.settings.web_url,
            "diagnostics_enabled": room.settings.diagnostics_enabled
        },
        "created_at": room.created_at
    }

@router.get("/{room_id}")
async def get_room_status(room_id: str):
    """Retrieve public metadata and security requirements for a room."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found or expired")

    return {
        "room_id": room.room_id,
        "exists": True,
        "access_mode": room.settings.access_mode,
        "requires_pin": room.settings.access_mode == AccessMode.PIN,
        "requires_approval": room.settings.access_mode == AccessMode.APPROVAL,
        "media_mode": room.settings.media_mode,
        "stream_configured": bool(room.settings.stream_url or room.settings.web_url),
        "stream_url": room.settings.stream_url,
        "web_url": room.settings.web_url,
        "participants_count": len(room.participants)
    }

@router.post("/{room_id}/resume-session")
async def resume_session_endpoint(room_id: str, req: ResumeSessionRequest):
    """Resume an existing host or participant session across page reloads."""
    res = await room_manager.resume_session(
        room_id=room_id,
        client_id=req.client_id,
        session_token=req.session_token,
        host_token=req.host_token
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=404, detail="Room not found")
    return res

@router.post("/{room_id}/join-request")
async def join_room_request(room_id: str, req: JoinRoomRequest):
    """Authenticate and join a room, verify PIN, or submit a knock request."""
    result = await room_manager.request_join(
        room_id=room_id,
        client_id=req.client_id,
        display_name=req.display_name,
        pin=req.pin
    )

    if result.get("status") == "error":
        err = result.get("error")
        if err == "ROOM_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Room not found")
        elif err == "INVALID_PIN":
            raise HTTPException(status_code=401, detail="Incorrect room PIN")
        elif err == "PIN_REQUIRED":
            raise HTTPException(status_code=400, detail="PIN is required for this room")
        else:
            raise HTTPException(status_code=400, detail=err)

    return result

@router.get("/{room_id}/knock-status/{client_id}")
async def check_knock_status(room_id: str, client_id: str):
    """Poll entry approval state for visitors in the knocking queue."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    knock_req = room.pending_knocks.get(client_id)
    if not knock_req:
        # Check if already authenticated
        if client_id in room.session_tokens:
            return {"status": "approved", "session_token": room.session_tokens[client_id]}
        return {"status": "unknown"}

    if knock_req.approved is True:
        return {"status": "approved", "session_token": knock_req.session_token}
    elif knock_req.approved is False:
        return {"status": "rejected"}
    return {"status": "pending"}

@router.patch("/{room_id}/settings")
async def update_room_settings(
    room_id: str,
    req: UpdateSettingsRequest,
    authorization: Optional[str] = Header(None)
):
    """Update room configuration during runtime (Host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    token = authorization.replace("Bearer ", "") if authorization else ""
    if token != room.host_token:
        raise HTTPException(status_code=403, detail="Only the host can modify room settings")

    if req.access_mode is not None:
        room.settings.access_mode = req.access_mode
    if req.pin is not None:
        room.settings.hashed_pin = hash_pin(req.pin) if req.pin else None
    if req.control_policy is not None:
        room.settings.control_policy = req.control_policy
    if req.media_mode is not None:
        room.settings.media_mode = req.media_mode
    if req.stream_url is not None:
        room.settings.stream_url = req.stream_url
    if req.web_url is not None:
        room.settings.web_url = req.web_url
    if req.diagnostics_enabled is not None:
        room.settings.diagnostics_enabled = req.diagnostics_enabled

    room_manager.update_room_db_settings(room)

    return {
        "status": "updated",
        "settings": {
            "access_mode": room.settings.access_mode,
            "control_policy": room.settings.control_policy,
            "media_mode": room.settings.media_mode,
            "stream_url": room.settings.stream_url,
            "web_url": room.settings.web_url,
            "diagnostics_enabled": room.settings.diagnostics_enabled
        }
    }

class RoomEventRequest(BaseModel):
    event: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    client_id: str
    token: str
    socket_id: Optional[str] = None

@router.post("/{room_id}/events")
async def send_room_event(room_id: str, req: RoomEventRequest):
    """
    Handle incoming room action from client and broadcast to Pusher channel.
    Works seamlessly across all browsers over standard HTTPS without WebSockets.
    """
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not room_manager.validate_session(room_id, req.client_id, req.token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    event_type = req.event
    payload = req.payload
    client_id = req.client_id
    participant = room.participants.get(client_id)
    is_host = participant.is_host if participant else False

    # Clock sync ping-pong
    if event_type == "time:ping":
        return {
            "event": "time:pong",
            "payload": {"t0": payload.get("t0"), "t_server": time.time()},
            "timestamp": time.time()
        }

    # Video playback synchronization
    elif event_type == "sync:play":
        await SyncEngine.handle_video_play(room, client_id, payload)
    elif event_type == "sync:pause":
        await SyncEngine.handle_video_pause(room, client_id, payload)
    elif event_type == "sync:seek":
        await SyncEngine.handle_video_seek(room, client_id, payload)
    elif event_type == "sync:track_change":
        await SyncEngine.handle_track_change(room, client_id, payload)
    elif event_type == "sync:url_change":
        await SyncEngine.handle_url_change(room, client_id, payload)

    # Web co-browsing synchronization
    elif event_type == "sync:media_mode_change":
        await SyncEngine.handle_media_mode_change(room, client_id, payload)
    elif event_type == "sync:web_navigate":
        await SyncEngine.handle_web_navigate(room, client_id, payload)
    elif event_type == "sync:web_scroll":
        await SyncEngine.handle_web_scroll(room, client_id, payload)
    elif event_type == "sync:web_click":
        await SyncEngine.handle_web_click(room, client_id, payload)
    elif event_type == "sync:web_cursor":
        await SyncEngine.handle_web_cursor(room, client_id, payload)

    # Live text chat
    elif event_type == "chat:message":
        sender_name = participant.display_name if participant else "Anonymous"
        chat_msg = {
            "id": payload.get("id", f"msg_{int(time.time()*1000)}"),
            "sender_client_id": client_id,
            "sender_name": sender_name,
            "is_host": is_host,
            "content": payload.get("content", ""),
            "sent_at": time.time()
        }
        await pusher_service.trigger(
            f"room-{room_id}",
            "chat:message",
            {"event": "chat:message", "payload": chat_msg, "timestamp": time.time()},
            socket_id=req.socket_id
        )
        return {"status": "ok"}

    # WebRTC voice mesh signaling
    elif event_type == "webrtc:join_voice":
        await WebRTCSignalingService.handle_join_voice(room, client_id)
    elif event_type == "webrtc:leave_voice":
        await WebRTCSignalingService.handle_leave_voice(room, client_id)
    elif event_type == "webrtc:offer":
        await WebRTCSignalingService.handle_offer(room, client_id, payload)
    elif event_type == "webrtc:answer":
        await WebRTCSignalingService.handle_answer(room, client_id, payload)
    elif event_type == "webrtc:ice_candidate":
        await WebRTCSignalingService.handle_ice_candidate(room, client_id, payload)

    # Knock decision
    elif event_type == "room:knock_decision":
        if is_host:
            target_cid = payload.get("client_id")
            decision = payload.get("decision")
            await room_manager.decide_knock(room, target_cid, decision)

    # Telemetry report
    elif event_type == "telemetry:submit":
        report = TelemetryReport(
            client_id=client_id,
            websocket_rtt_ms=float(payload.get("websocket_rtt_ms", 0.0)),
            webrtc_audio_rtt_ms=float(payload.get("webrtc_audio_rtt_ms", 0.0)),
            segment_download_mbps=float(payload.get("segment_download_mbps", 0.0)),
            buffer_health_sec=float(payload.get("buffer_health_sec", 0.0)),
            dropped_frames=int(payload.get("dropped_frames", 0)),
            sync_drift_ms=float(payload.get("sync_drift_ms", 0.0))
        )
        telemetry_service.record_report(room.room_id, report)
        await telemetry_service.broadcast_diagnostics(room)

    return {"status": "ok"}

@router.get("/{room_id}/sync-snapshot")
async def get_room_sync_snapshot(room_id: str, client_id: str, token: str):
    """
    Retrieve full initial room state snapshot upon subscribing to Pusher.
    """
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not room_manager.validate_session(room_id, client_id, token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    participant = room.participants.get(client_id)
    is_host = participant.is_host if participant else False
    current_video_pos = room.calculate_current_video_position()

    snapshot = {
        "room_id": room.room_id,
        "is_host": is_host,
        "settings": {
            "access_mode": room.settings.access_mode,
            "control_policy": room.settings.control_policy,
            "media_mode": room.settings.media_mode,
            "stream_url": room.settings.stream_url,
            "web_url": room.settings.web_url,
            "diagnostics_enabled": room.settings.diagnostics_enabled
        },
        "video_state": {
            "status": room.video_state.status,
            "reference_position": current_video_pos,
            "reference_timestamp": room.video_state.reference_timestamp,
            "playback_rate": room.video_state.playback_rate,
            "active_subtitle_track": room.video_state.active_subtitle_track,
            "active_audio_track": room.video_state.active_audio_track
        },
        "web_state": {
            "current_url": room.web_state.current_url,
            "scroll_top_pct": room.web_state.scroll_top_pct,
            "scroll_left_pct": room.web_state.scroll_left_pct
        },
        "participants": [p.model_dump() for p in room.participants.values()]
    }

    # Notify others via Pusher that user joined
    if participant:
        await pusher_service.trigger(f"room-{room_id}", "room:user_joined", {
            "event": "room:user_joined",
            "payload": participant.model_dump(),
            "timestamp": time.time()
        })

    return {
        "event": "room:joined",
        "payload": snapshot,
        "timestamp": time.time()
    }
