export type AccessMode = "public" | "pin" | "approval";
export type ControlPolicy = "host_only" | "collaborative";
export type MediaMode = "video_stream" | "web_page";
export type PlaybackStatus = "playing" | "paused" | "buffering";

export interface RoomSettings {
  access_mode: AccessMode;
  control_policy: ControlPolicy;
  media_mode: MediaMode;
  pin?: string;
  stream_url?: string;
  web_url?: string;
  diagnostics_enabled: boolean;
  max_voice_peers?: number;
}

export interface MediaTrackOption {
  id: string | number;
  label: string;
  language?: string;
  isDefault?: boolean;
}

export interface VideoPlaybackState {
  status: PlaybackStatus;
  reference_position: number;
  reference_timestamp: number;
  playback_rate: number;
  active_subtitle_track?: string | number | null;
  active_audio_track?: string | number | null;
}

export interface WebPageState {
  current_url: string;
  scroll_top_pct: number;
  scroll_left_pct: number;
}

export interface Participant {
  client_id: string;
  display_name: string;
  is_host: boolean;
  joined_at?: number;
  is_voice_active: boolean;
  is_speaking?: boolean;
}

export interface RoomJoinResponse {
  status: "approved" | "pending_approval" | "rejected" | "error";
  session_token?: string;
  host_token?: string;
  is_host?: boolean;
  room_id?: string;
  message?: string;
  error?: string;
}

export interface RoomMetadata {
  room_id: string;
  exists: boolean;
  access_mode: AccessMode;
  requires_pin: boolean;
  requires_approval: boolean;
  media_mode: MediaMode;
  stream_configured: boolean;
  stream_url?: string;
  web_url?: string;
  participants_count: number;
}
