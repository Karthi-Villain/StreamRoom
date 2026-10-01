import time
from app.models.room import ActiveRoom
from app.models.events import WSMessage, WSEventType

class WebRTCSignalingService:
    @classmethod
    async def handle_join_voice(cls, room: ActiveRoom, client_id: str):
        """Securely register client as active in voice mesh and dispatch peer list."""
        if client_id not in room.participants:
            return

        room.voice_peers.add(client_id)
        room.participants[client_id].is_voice_active = True

        # Send list of existing authenticated voice peers to joining client
        existing_peers = [p for p in room.voice_peers if p != client_id and p in room.participants]
        await room.send_to(client_id, WSMessage(
            event=WSEventType.WEBRTC_ACTIVE_VOICE_PEERS,
            payload={"peers": existing_peers},
            timestamp=time.time()
        ))

        # Securely notify others that this authenticated user joined voice
        await room.broadcast(
            WSMessage(
                event=WSEventType.WEBRTC_JOIN_VOICE,
                payload={"client_id": client_id},
                timestamp=time.time()
            ),
            exclude_client_id=client_id
        )

    @classmethod
    async def handle_leave_voice(cls, room: ActiveRoom, client_id: str):
        if client_id in room.voice_peers:
            room.voice_peers.remove(client_id)
        if client_id in room.participants:
            room.participants[client_id].is_voice_active = False

        await room.broadcast(WSMessage(
            event=WSEventType.WEBRTC_LEAVE_VOICE,
            payload={"client_id": client_id},
            timestamp=time.time()
        ))

    @classmethod
    async def handle_offer(cls, room: ActiveRoom, client_id: str, payload: dict):
        """Securely route SDP offer only between verified room peers."""
        if client_id not in room.voice_peers:
            return

        target_peer_id = payload.get("target_peer_id")
        if not target_peer_id or target_peer_id not in room.participants or target_peer_id not in room.voice_peers:
            return

        # Enforce authenticated client_id as the source peer (prevent spoofing)
        payload["source_peer_id"] = client_id
        await room.send_to(target_peer_id, WSMessage(
            event=WSEventType.WEBRTC_OFFER,
            payload=payload,
            timestamp=time.time()
        ))

    @classmethod
    async def handle_answer(cls, room: ActiveRoom, client_id: str, payload: dict):
        """Securely route SDP answer only between verified room peers."""
        if client_id not in room.voice_peers:
            return

        target_peer_id = payload.get("target_peer_id")
        if not target_peer_id or target_peer_id not in room.participants or target_peer_id not in room.voice_peers:
            return

        payload["source_peer_id"] = client_id
        await room.send_to(target_peer_id, WSMessage(
            event=WSEventType.WEBRTC_ANSWER,
            payload=payload,
            timestamp=time.time()
        ))

    @classmethod
    async def handle_ice_candidate(cls, room: ActiveRoom, client_id: str, payload: dict):
        """Securely route ICE candidate only to verified target peers."""
        if client_id not in room.voice_peers:
            return

        target_peer_id = payload.get("target_peer_id")
        if not target_peer_id or target_peer_id not in room.participants:
            return

        payload["source_peer_id"] = client_id
        await room.send_to(target_peer_id, WSMessage(
            event=WSEventType.WEBRTC_ICE_CANDIDATE,
            payload=payload,
            timestamp=time.time()
        ))
