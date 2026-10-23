import asyncio
import time
from typing import Dict, Optional, Set, List
from fastapi import WebSocket

from app.models.room import (
    RoomSettings, VideoPlaybackState, WebPageState, 
    Participant, AccessMode, ControlPolicy, MediaMode, PlaybackStatus,
    PendingKnockRequest, ActiveRoom
)
from app.models.events import WSMessage, WSEventType
from app.core.security import generate_room_id, generate_token, verify_pin
from app.db.database import SessionLocal
from app.db.models import RoomDB, SessionTokenDB

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, ActiveRoom] = {}
        self.lock = asyncio.Lock()

    def _persist_room_to_db(self, room: ActiveRoom, host_display_name: str):
        """Persist room and initial host session to database."""
        db = SessionLocal()
        try:
            db_room = RoomDB(
                room_id=room.room_id,
                host_client_id=room.host_client_id,
                host_token=room.host_token,
                host_display_name=host_display_name,
                access_mode=room.settings.access_mode.value,
                hashed_pin=room.settings.hashed_pin,
                control_policy=room.settings.control_policy.value,
                media_mode=room.settings.media_mode.value,
                stream_url=room.settings.stream_url,
                web_url=room.settings.web_url,
                diagnostics_enabled=room.settings.diagnostics_enabled,
                created_at=room.created_at,
            )
            db.merge(db_room)

            # Persist host session token
            host_session_token = room.session_tokens.get(room.host_client_id)
            if host_session_token:
                existing_st = db.query(SessionTokenDB).filter(SessionTokenDB.token == host_session_token).first()
                if existing_st:
                    existing_st.client_id = room.host_client_id
                    existing_st.display_name = host_display_name
                    existing_st.is_host = True
                else:
                    st = SessionTokenDB(
                        token=host_session_token,
                        room_id=room.room_id,
                        client_id=room.host_client_id,
                        display_name=host_display_name,
                        is_host=True,
                        created_at=time.time()
                    )
                    db.add(st)

            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error persisting room to DB: {e}")
        finally:
            db.close()

    def _persist_session_token_to_db(self, room_id: str, client_id: str, display_name: str, token: str, is_host: bool):
        db = SessionLocal()
        try:
            existing = db.query(SessionTokenDB).filter(SessionTokenDB.token == token).first()
            if existing:
                existing.client_id = client_id
                existing.display_name = display_name
                existing.is_host = is_host
            else:
                st = SessionTokenDB(
                    token=token,
                    room_id=room_id,
                    client_id=client_id,
                    display_name=display_name,
                    is_host=is_host,
                    created_at=time.time()
                )
                db.add(st)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error persisting session token to DB: {e}")
        finally:
            db.close()

    def update_room_db_settings(self, room: ActiveRoom):
        """Update existing room settings in DB."""
        db = SessionLocal()
        try:
            db_room = db.query(RoomDB).filter(RoomDB.room_id == room.room_id).first()
            if db_room:
                db_room.access_mode = room.settings.access_mode.value
                db_room.hashed_pin = room.settings.hashed_pin
                db_room.control_policy = room.settings.control_policy.value
                db_room.media_mode = room.settings.media_mode.value
                db_room.stream_url = room.settings.stream_url
                db_room.web_url = room.settings.web_url
                db_room.diagnostics_enabled = room.settings.diagnostics_enabled
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error updating room settings in DB: {e}")
        finally:
            db.close()

    async def create_room(
        self,
        host_client_id: str,
        host_display_name: str,
        settings: RoomSettings
    ) -> tuple[ActiveRoom, str, str]:
        """Create a new room with 12-char unique ID, returns (room, host_token, host_session_token)."""
        async with self.lock:
            while True:
                room_id = generate_room_id(12)
                if room_id not in self.rooms and not self._room_exists_in_db(room_id):
                    break

            host_token = generate_token("hst")
            host_session_token = generate_token("ses")

            room = ActiveRoom(room_id, host_client_id, host_token, settings)
            room.session_tokens[host_client_id] = host_session_token

            # Register host as participant
            room.participants[host_client_id] = Participant(
                client_id=host_client_id,
                display_name=host_display_name,
                is_host=True,
                joined_at=time.time(),
                is_voice_active=False
            )

            self.rooms[room_id] = room
            self._persist_room_to_db(room, host_display_name)
            return room, host_token, host_session_token

    def _room_exists_in_db(self, room_id: str) -> bool:
        db = SessionLocal()
        try:
            return db.query(RoomDB).filter(RoomDB.room_id == room_id).first() is not None
        finally:
            db.close()

    def get_room(self, room_id: str) -> Optional[ActiveRoom]:
        if room_id in self.rooms:
            return self.rooms[room_id]

        # Attempt to restore room from SQLite / DB
        db = SessionLocal()
        try:
            db_room = db.query(RoomDB).filter(RoomDB.room_id == room_id).first()
            if db_room:
                settings = RoomSettings(
                    access_mode=AccessMode(db_room.access_mode),
                    hashed_pin=db_room.hashed_pin,
                    control_policy=ControlPolicy(db_room.control_policy),
                    media_mode=MediaMode(db_room.media_mode),
                    stream_url=db_room.stream_url,
                    web_url=db_room.web_url,
                    diagnostics_enabled=db_room.diagnostics_enabled
                )
                room = ActiveRoom(db_room.room_id, db_room.host_client_id, db_room.host_token, settings)
                room.created_at = db_room.created_at

                # Restore known sessions from DB
                tokens = db.query(SessionTokenDB).filter(SessionTokenDB.room_id == room_id).all()
                for t in tokens:
                    room.session_tokens[t.client_id] = t.token
                    room.participants[t.client_id] = Participant(
                        client_id=t.client_id,
                        display_name=t.display_name,
                        is_host=t.is_host,
                        joined_at=t.created_at,
                        is_voice_active=False
                    )

                self.rooms[room_id] = room
                return room
        except Exception as e:
            print(f"Error restoring room from DB: {e}")
        finally:
            db.close()

        return None

    def validate_session(self, room_id: str, client_id: str, token: str) -> bool:
        room = self.get_room(room_id)
        if not room:
            return False

        # In-memory check
        if room.session_tokens.get(client_id) == token:
            return True

        # Database check
        db = SessionLocal()
        try:
            st = db.query(SessionTokenDB).filter(
                SessionTokenDB.room_id == room_id,
                SessionTokenDB.client_id == client_id,
                SessionTokenDB.token == token
            ).first()
            if st:
                room.session_tokens[client_id] = token
                if client_id not in room.participants:
                    room.participants[client_id] = Participant(
                        client_id=client_id,
                        display_name=st.display_name,
                        is_host=st.is_host,
                        joined_at=st.created_at
                    )
                return True
        finally:
            db.close()

        return False

    async def resume_session(
        self,
        room_id: str,
        client_id: str,
        session_token: Optional[str] = None,
        host_token: Optional[str] = None
    ) -> dict:
        """Verify and resume a user session across page reloads using persistent fingerprint."""
        room = self.get_room(room_id)
        if not room:
            return {"status": "error", "error": "ROOM_NOT_FOUND"}

        db = SessionLocal()
        try:
            db_room = db.query(RoomDB).filter(RoomDB.room_id == room_id).first()
            host_display_name = db_room.host_display_name if db_room else "Host"

            # Check 1: Is this the Host returning via persistent client ID or host token?
            is_returning_host = (client_id == room.host_client_id) or (host_token and host_token == room.host_token)
            if is_returning_host:
                # Re-issue or reuse host session token
                new_session_token = session_token or room.session_tokens.get(client_id) or generate_token("ses")
                room.session_tokens[client_id] = new_session_token
                room.participants[client_id] = Participant(
                    client_id=client_id,
                    display_name=host_display_name,
                    is_host=True,
                    joined_at=time.time(),
                    is_voice_active=False
                )
                self._persist_session_token_to_db(room_id, client_id, host_display_name, new_session_token, True)

                settings_payload = {
                    "access_mode": room.settings.access_mode,
                    "control_policy": room.settings.control_policy,
                    "media_mode": room.settings.media_mode,
                    "stream_url": room.settings.stream_url,
                    "web_url": room.settings.web_url,
                    "diagnostics_enabled": room.settings.diagnostics_enabled
                }

                return {
                    "status": "approved",
                    "is_host": True,
                    "display_name": host_display_name,
                    "session_token": new_session_token,
                    "host_token": room.host_token,
                    "room_id": room_id,
                    "settings": settings_payload
                }

            # Check 2: Returning regular participant with existing valid token in DB
            if session_token:
                st = db.query(SessionTokenDB).filter(
                    SessionTokenDB.room_id == room_id,
                    SessionTokenDB.client_id == client_id,
                    SessionTokenDB.token == session_token
                ).first()
                if st:
                    room.session_tokens[client_id] = session_token
                    room.participants[client_id] = Participant(
                        client_id=client_id,
                        display_name=st.display_name,
                        is_host=st.is_host,
                        joined_at=st.created_at
                    )
                    return {
                        "status": "approved",
                        "is_host": st.is_host,
                        "display_name": st.display_name,
                        "session_token": session_token,
                        "room_id": room_id,
                        "settings": {
                            "access_mode": room.settings.access_mode,
                            "control_policy": room.settings.control_policy,
                            "media_mode": room.settings.media_mode,
                            "stream_url": room.settings.stream_url,
                            "web_url": room.settings.web_url,
                            "diagnostics_enabled": room.settings.diagnostics_enabled
                        }
                    }

            # Check 3: Check by client ID if session exists
            st_by_client = db.query(SessionTokenDB).filter(
                SessionTokenDB.room_id == room_id,
                SessionTokenDB.client_id == client_id
            ).order_by(SessionTokenDB.created_at.desc()).first()

            if st_by_client:
                room.session_tokens[client_id] = st_by_client.token
                room.participants[client_id] = Participant(
                    client_id=client_id,
                    display_name=st_by_client.display_name,
                    is_host=st_by_client.is_host,
                    joined_at=st_by_client.created_at
                )
                return {
                    "status": "approved",
                    "is_host": st_by_client.is_host,
                    "display_name": st_by_client.display_name,
                    "session_token": st_by_client.token,
                    "room_id": room_id,
                    "settings": {
                        "access_mode": room.settings.access_mode,
                        "control_policy": room.settings.control_policy,
                        "media_mode": room.settings.media_mode,
                        "stream_url": room.settings.stream_url,
                        "web_url": room.settings.web_url,
                        "diagnostics_enabled": room.settings.diagnostics_enabled
                    }
                }

            return {"status": "needs_join"}
        finally:
            db.close()

    async def request_join(
        self,
        room_id: str,
        client_id: str,
        display_name: str,
        pin: Optional[str] = None
    ) -> dict:
        """Handle participant knocking, PIN validation, or direct entry."""
        room = self.get_room(room_id)
        if not room:
            return {"status": "error", "error": "ROOM_NOT_FOUND"}

        # Host bypass: if client is host, auto-admit as host
        if client_id == room.host_client_id:
            session_token = room.session_tokens.get(client_id) or generate_token("ses")
            room.session_tokens[client_id] = session_token
            room.participants[client_id] = Participant(
                client_id=client_id,
                display_name=display_name,
                is_host=True,
                joined_at=time.time()
            )
            self._persist_session_token_to_db(room_id, client_id, display_name, session_token, True)
            return {
                "status": "approved",
                "is_host": True,
                "session_token": session_token,
                "host_token": room.host_token,
                "room_id": room_id
            }

        # Check access modes
        if room.settings.access_mode == AccessMode.PUBLIC:
            session_token = generate_token("ses")
            room.session_tokens[client_id] = session_token
            room.participants[client_id] = Participant(
                client_id=client_id,
                display_name=display_name,
                is_host=False,
                joined_at=time.time()
            )
            self._persist_session_token_to_db(room_id, client_id, display_name, session_token, False)
            return {"status": "approved", "is_host": False, "session_token": session_token, "room_id": room_id}

        elif room.settings.access_mode == AccessMode.PIN:
            if not pin or not room.settings.hashed_pin:
                return {"status": "error", "error": "PIN_REQUIRED"}
            if not verify_pin(pin, room.settings.hashed_pin):
                return {"status": "error", "error": "INVALID_PIN"}
            
            session_token = generate_token("ses")
            room.session_tokens[client_id] = session_token
            room.participants[client_id] = Participant(
                client_id=client_id,
                display_name=display_name,
                is_host=False,
                joined_at=time.time()
            )
            self._persist_session_token_to_db(room_id, client_id, display_name, session_token, False)
            return {"status": "approved", "is_host": False, "session_token": session_token, "room_id": room_id}

        elif room.settings.access_mode == AccessMode.APPROVAL:
            event = asyncio.Event()
            knock_req = PendingKnockRequest(client_id, display_name, event)
            room.pending_knocks[client_id] = knock_req

            # Notify host via WebSocket
            knock_msg = WSMessage(
                event=WSEventType.ROOM_KNOCK,
                payload={
                    "client_id": client_id,
                    "display_name": display_name,
                    "requested_at": knock_req.requested_at
                },
                timestamp=time.time()
            )
            await room.send_to(room.host_client_id, knock_msg)

            return {
                "status": "pending_approval",
                "message": "Waiting for host to admit you into the room."
            }

        return {"status": "error", "error": "UNKNOWN_ACCESS_MODE"}

    async def decide_knock(self, room: ActiveRoom, client_id: str, decision: str) -> bool:
        """Host approves or rejects a knocking user."""
        knock_req = room.pending_knocks.get(client_id)
        if not knock_req:
            return False

        if decision == "admit":
            session_token = generate_token("ses")
            room.session_tokens[client_id] = session_token
            room.participants[client_id] = Participant(
                client_id=client_id,
                display_name=knock_req.display_name,
                is_host=False,
                joined_at=time.time()
            )
            self._persist_session_token_to_db(room.room_id, client_id, knock_req.display_name, session_token, False)
            knock_req.approved = True
            knock_req.session_token = session_token
        else:
            knock_req.approved = False

        knock_req.event.set()
        return True

room_manager = RoomManager()
