import time
from typing import Optional
from app.models.room import ActiveRoom, ControlPolicy, PlaybackStatus, MediaMode
from app.models.events import WSMessage, WSEventType

class SyncEngine:
    @staticmethod
    def is_action_allowed(room: ActiveRoom, client_id: str) -> bool:
        """Verify if client has authority to trigger playback or browser interactions."""
        if room.settings.control_policy == ControlPolicy.COLLABORATIVE:
            return True
        return client_id == room.host_client_id

    @classmethod
    async def handle_video_play(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        pos = float(payload.get("position", room.calculate_current_video_position()))
        rate = float(payload.get("playback_rate", 1.0))

        room.video_state.status = PlaybackStatus.PLAYING
        room.video_state.reference_position = pos
        room.video_state.reference_timestamp = time.time()
        room.video_state.playback_rate = rate

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_STATE,
            payload={
                "media_mode": MediaMode.VIDEO_STREAM,
                "status": PlaybackStatus.PLAYING,
                "reference_position": pos,
                "reference_timestamp": room.video_state.reference_timestamp,
                "playback_rate": rate,
                "initiated_by": client_id
            },
            timestamp=time.time()
        ))

    @classmethod
    async def handle_video_pause(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        pos = float(payload.get("position", room.calculate_current_video_position()))

        room.video_state.status = PlaybackStatus.PAUSED
        room.video_state.reference_position = pos
        room.video_state.reference_timestamp = time.time()

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_STATE,
            payload={
                "media_mode": MediaMode.VIDEO_STREAM,
                "status": PlaybackStatus.PAUSED,
                "reference_position": pos,
                "reference_timestamp": room.video_state.reference_timestamp,
                "playback_rate": room.video_state.playback_rate,
                "initiated_by": client_id
            },
            timestamp=time.time()
        ))

    @classmethod
    async def handle_video_seek(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        target_pos = float(payload.get("target_position", 0.0))
        room.video_state.reference_position = target_pos
        room.video_state.reference_timestamp = time.time()

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_SEEK,
            payload={
                "target_position": target_pos,
                "status": room.video_state.status,
                "initiated_by": client_id
            },
            timestamp=time.time()
        ))

    @classmethod
    async def handle_track_change(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        track_type = payload.get("track_type") # "subtitle" or "audio"
        track_id = payload.get("track_id")

        if track_type == "subtitle":
            room.video_state.active_subtitle_track = track_id
        elif track_type == "audio":
            room.video_state.active_audio_track = track_id

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_TRACK_CHANGE,
            payload=payload,
            timestamp=time.time()
        ))

    @classmethod
    async def handle_url_change(cls, room: ActiveRoom, client_id: str, payload: dict):
        # Only host can change the base streaming URL
        if client_id != room.host_client_id:
            return

        stream_url = payload.get("stream_url")
        room.settings.stream_url = stream_url
        room.video_state.reference_position = 0.0
        room.video_state.reference_timestamp = time.time()
        room.video_state.status = PlaybackStatus.PAUSED

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_URL_CHANGE,
            payload={"stream_url": stream_url},
            timestamp=time.time()
        ))

    @classmethod
    async def handle_media_mode_change(cls, room: ActiveRoom, client_id: str, payload: dict):
        if client_id != room.host_client_id:
            return

        new_mode = payload.get("media_mode", MediaMode.VIDEO_STREAM)
        room.settings.media_mode = new_mode

        await room.broadcast(WSMessage(
            event=WSEventType.SYNC_MEDIA_MODE_CHANGE,
            payload={"media_mode": new_mode, "url": payload.get("url")},
            timestamp=time.time()
        ))

    @classmethod
    async def handle_web_scroll(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        room.web_state.scroll_top_pct = float(payload.get("topPct", 0.0))
        room.web_state.scroll_left_pct = float(payload.get("leftPct", 0.0))
        room.web_state.last_interaction_timestamp = time.time()

        await room.broadcast(
            WSMessage(
                event=WSEventType.SYNC_WEB_SCROLL,
                payload=payload,
                timestamp=time.time()
            ),
            exclude_client_id=client_id
        )

    @classmethod
    async def handle_web_navigate(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        new_url = payload.get("url")
        if new_url:
            room.web_state.current_url = new_url
            room.web_state.scroll_top_pct = 0.0
            room.web_state.scroll_left_pct = 0.0
            room.web_state.last_interaction_timestamp = time.time()

            await room.broadcast(WSMessage(
                event=WSEventType.SYNC_WEB_NAVIGATE,
                payload={"url": new_url, "initiated_by": client_id},
                timestamp=time.time()
            ))

    @classmethod
    async def handle_web_click(cls, room: ActiveRoom, client_id: str, payload: dict):
        if not cls.is_action_allowed(room, client_id):
            return

        await room.broadcast(
            WSMessage(
                event=WSEventType.SYNC_WEB_CLICK,
                payload=payload,
                timestamp=time.time()
            ),
            exclude_client_id=client_id
        )

    @classmethod
    async def handle_web_cursor(cls, room: ActiveRoom, client_id: str, payload: dict):
        # Broadcast host pointer coordinates to viewers
        payload["client_id"] = client_id
        await room.broadcast(
            WSMessage(
                event=WSEventType.SYNC_WEB_CURSOR,
                payload=payload,
                timestamp=time.time()
            ),
            exclude_client_id=client_id
        )
