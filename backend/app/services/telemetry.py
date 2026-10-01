import time
from typing import Dict, List
from app.models.room import ActiveRoom, TelemetryReport, ParticipantMetrics
from app.models.events import WSMessage, WSEventType

class TelemetryService:
    def __init__(self):
        # room_id -> client_id -> TelemetryReport
        self.reports: Dict[str, Dict[str, TelemetryReport]] = {}

    def record_report(self, room_id: str, report: TelemetryReport):
        if room_id not in self.reports:
            self.reports[room_id] = {}
        self.reports[room_id][report.client_id] = report

    def compute_health_grade(self, rtt: float, buffer_sec: float, drift_ms: float) -> str:
        if rtt > 300 or buffer_sec < 2.0 or abs(drift_ms) > 1500:
            return "degraded"
        elif rtt > 150 or buffer_sec < 5.0 or abs(drift_ms) > 500:
            return "fair"
        return "optimal"

    async def broadcast_diagnostics(self, room: ActiveRoom):
        """Aggregate and broadcast current room network and stream telemetry."""
        if not room.settings.diagnostics_enabled:
            return

        room_reports = self.reports.get(room.room_id, {})
        metrics_list: List[dict] = []

        for cid, participant in room.participants.items():
            rep = room_reports.get(cid)
            latency = rep.websocket_rtt_ms if rep else 0.0
            bandwidth = rep.segment_download_mbps if rep else 0.0
            buffer_sec = rep.buffer_health_sec if rep else 0.0
            drift = rep.sync_drift_ms if rep else 0.0
            dropped = rep.dropped_frames if rep else 0

            health = self.compute_health_grade(latency, buffer_sec, drift)

            metrics_list.append({
                "client_id": cid,
                "display_name": participant.display_name,
                "is_host": participant.is_host,
                "latency_ms": round(latency, 1),
                "bandwidth_mbps": round(bandwidth, 2),
                "buffer_sec": round(buffer_sec, 1),
                "drift_ms": round(drift, 1),
                "dropped_frames": dropped,
                "health_grade": health
            })

        await room.broadcast(WSMessage(
            event=WSEventType.TELEMETRY_BROADCAST,
            payload={
                "room_id": room.room_id,
                "timestamp": time.time(),
                "participants_metrics": metrics_list
            },
            timestamp=time.time()
        ))

telemetry_service = TelemetryService()
