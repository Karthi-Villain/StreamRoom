import hmac
import hashlib
import time
import json
import httpx
from typing import Any, Dict, Optional
from app.core.config import settings

class PusherService:
    def __init__(self):
        self.app_id = settings.PUSHER_APP_ID
        self.key = settings.PUSHER_KEY
        self.secret = settings.PUSHER_SECRET
        self.cluster = settings.PUSHER_CLUSTER

    async def trigger(self, channel: str, event: str, data: Any, socket_id: Optional[str] = None) -> bool:
        """
        Broadcast an event to a Pusher channel using HTTP REST API with HMAC-SHA256 signing.
        Zero external dependencies required (uses httpx).
        """
        if not self.app_id or not self.key or not self.secret:
            return False

        payload_data = json.dumps(data) if not isinstance(data, str) else data
        body_dict = {
            "name": event,
            "channels": [channel],
            "data": payload_data
        }
        if socket_id:
            body_dict["socket_id"] = socket_id

        body = json.dumps(body_dict)
        body_md5 = hashlib.md5(body.encode()).hexdigest()
        timestamp = str(int(time.time()))

        path = f"/apps/{self.app_id}/events"
        query = f"auth_key={self.key}&auth_timestamp={timestamp}&auth_version=1.0&body_md5={body_md5}"
        to_sign = f"POST\n{path}\n{query}"
        signature = hmac.new(self.secret.encode(), to_sign.encode(), hashlib.sha256).hexdigest()

        url = f"https://api-{self.cluster}.pusher.com{path}?{query}&auth_signature={signature}"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    content=body
                )
                return res.status_code == 200
        except Exception as e:
            print(f"Error publishing to Pusher: {e}")
            return False

pusher_service = PusherService()
