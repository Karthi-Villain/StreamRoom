import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.services.room_manager import room_manager
from app.services.sync_engine import SyncEngine
from app.services.webrtc_signaling import WebRTCSignalingService
from app.services.telemetry import telemetry_service
from app.models.room import TelemetryReport, PlaybackStatus, MediaMode
from app.models.events import WSMessage, WSEventType

ws_router = APIRouter(tags=["WebSocket Gateway"])

@ws_router.websocket("/ws/rooms/{room_id}")
async def room_websocket_endpoint(websocket: WebSocket, room_id: str):
    """
    Room signaling socket.

    Credentials are read straight from the query string instead of using
    `token: str = Query(...)`: a missing/invalid query parameter makes FastAPI
    reject the *handshake* with a bare HTTP 403 (uvicorn logs
    `connection rejected (403 Forbidden)`), which browsers surface as an opaque
    error + close code 1006. We always accept() first so every failure is
    reported as a close code + `room:error` message instead.
    """
    token = websocket.query_params.get("token")
    client_id = websocket.query_params.get("client_id")

    await websocket.accept(headers=[
        (b"x-accel-buffering", b"no"),
        (b"cache-control", b"no-cache")
    ])

    async def reject(code: str, message: str) -> None:
        await websocket.send_text(WSMessage(
            event=WSEventType.ROOM_ERROR,
            payload={"code": code, "message": message},
            timestamp=time.time()
        ).model_dump_json())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=code.lower())

    if not token or not client_id:
        await reject(
            "MISSING_CREDENTIALS",
            "WebSocket URL must include the token and client_id query parameters",
        )
        return

    room = room_manager.get_room(room_id)
    if not room:
        await reject("ROOM_NOT_FOUND", "Room not found or expired")
        return

    if not room_manager.validate_session(room_id, client_id, token):
        await reject("INVALID_SESSION", "Session token is invalid or expired")
        return

    # Register connection
    async with room.lock:
        room.connections[client_id] = websocket

    participant = room.participants.get(client_id)
    is_host = participant.is_host if participant else False

    # Send initial state snapshot to newly connected client
    current_video_pos = room.calculate_current_video_position()
    joined_payload = {
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

    await websocket.send_text(WSMessage(
        event=WSEventType.ROOM_JOINED,
        payload=joined_payload,
        timestamp=time.time()
    ).model_dump_json())

    # Broadcast to other participants that this user joined
    if participant:
        await room.broadcast(
            WSMessage(
                event=WSEventType.ROOM_USER_JOINED,
                payload=participant.model_dump(),
                timestamp=time.time()
            ),
            exclude_client_id=client_id
        )

    try:
        while True:
            try:
                raw_text = await websocket.receive_text()
                data = json.loads(raw_text)
                event_type = data.get("event")
                payload = data.get("payload", {})

                # Clock sync ping-pong
                if event_type == WSEventType.TIME_PING:
                    await websocket.send_text(WSMessage(
                        event=WSEventType.TIME_PONG,
                        payload={"t0": payload.get("t0"), "t_server": time.time()},
                        timestamp=time.time()
                    ).model_dump_json())

                # Video playback synchronization
                elif event_type == WSEventType.SYNC_PLAY:
                    await SyncEngine.handle_video_play(room, client_id, payload)
                elif event_type == WSEventType.SYNC_PAUSE:
                    await SyncEngine.handle_video_pause(room, client_id, payload)
                elif event_type == WSEventType.SYNC_SEEK:
                    await SyncEngine.handle_video_seek(room, client_id, payload)
                elif event_type == WSEventType.SYNC_TRACK_CHANGE:
                    await SyncEngine.handle_track_change(room, client_id, payload)
                elif event_type == WSEventType.SYNC_URL_CHANGE:
                    await SyncEngine.handle_url_change(room, client_id, payload)

                # Web co-browsing synchronization
                elif event_type == WSEventType.SYNC_MEDIA_MODE_CHANGE:
                    await SyncEngine.handle_media_mode_change(room, client_id, payload)
                elif event_type == WSEventType.SYNC_WEB_NAVIGATE:
                    await SyncEngine.handle_web_navigate(room, client_id, payload)
                elif event_type == WSEventType.SYNC_WEB_SCROLL:
                    await SyncEngine.handle_web_scroll(room, client_id, payload)
                elif event_type == WSEventType.SYNC_WEB_CLICK:
                    await SyncEngine.handle_web_click(room, client_id, payload)
                elif event_type == WSEventType.SYNC_WEB_CURSOR:
                    await SyncEngine.handle_web_cursor(room, client_id, payload)

                # Live text chat
                elif event_type == WSEventType.CHAT_MESSAGE:
                    sender_name = participant.display_name if participant else "Anonymous"
                    chat_msg = WSMessage(
                        event=WSEventType.CHAT_MESSAGE,
                        payload={
                            "id": payload.get("id", f"msg_{int(time.time()*1000)}"),
                            "sender_client_id": client_id,
                            "sender_name": sender_name,
                            "is_host": is_host,
                            "content": payload.get("content", ""),
                            "sent_at": time.time()
                        },
                        timestamp=time.time()
                    )
                    await room.broadcast(chat_msg)

                # Knock decision (host approves/rejects user)
                elif event_type == WSEventType.ROOM_KNOCK_DECISION:
                    if is_host:
                        target_cid = payload.get("client_id")
                        decision = payload.get("decision") # "admit" or "reject"
                        await room_manager.decide_knock(room, target_cid, decision)

                # WebRTC voice mesh signaling
                elif event_type == WSEventType.WEBRTC_JOIN_VOICE:
                    await WebRTCSignalingService.handle_join_voice(room, client_id)
                elif event_type == WSEventType.WEBRTC_LEAVE_VOICE:
                    await WebRTCSignalingService.handle_leave_voice(room, client_id)
                elif event_type == WSEventType.WEBRTC_OFFER:
                    await WebRTCSignalingService.handle_offer(room, client_id, payload)
                elif event_type == WSEventType.WEBRTC_ANSWER:
                    await WebRTCSignalingService.handle_answer(room, client_id, payload)
                elif event_type == WSEventType.WEBRTC_ICE_CANDIDATE:
                    await WebRTCSignalingService.handle_ice_candidate(room, client_id, payload)

                # Telemetry diagnostics submit
                elif event_type == WSEventType.TELEMETRY_SUBMIT:
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

            except WebSocketDisconnect:
                raise
            except Exception as loop_err:
                print(f"Error handling message for {client_id}: {loop_err}")

    except WebSocketDisconnect:
        async with room.lock:
            if client_id in room.connections:
                del room.connections[client_id]
            if client_id in room.participants:
                del room.participants[client_id]

        await WebRTCSignalingService.handle_leave_voice(room, client_id)
        await room.broadcast(WSMessage(
            event=WSEventType.ROOM_USER_LEFT,
            payload={"client_id": client_id},
            timestamp=time.time()
        ))
