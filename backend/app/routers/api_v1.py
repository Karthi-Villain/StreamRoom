from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.models.room import RoomSettings, AccessMode, ControlPolicy, MediaMode
from app.services.room_manager import room_manager
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
