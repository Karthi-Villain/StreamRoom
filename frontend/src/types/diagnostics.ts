export interface ParticipantMetrics {
  client_id: string;
  display_name: string;
  is_host: boolean;
  latency_ms: number;
  bandwidth_mbps: number;
  buffer_sec: number;
  drift_ms: number;
  dropped_frames: number;
  health_grade: "optimal" | "fair" | "degraded";
}

export interface RoomDiagnosticsPayload {
  room_id: string;
  timestamp: number;
  participants_metrics: ParticipantMetrics[];
}
