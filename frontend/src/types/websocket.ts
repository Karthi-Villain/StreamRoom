import { VideoPlaybackState, WebPageState, RoomSettings, Participant } from "./room";

export type WSEventType =
  | "room:knock"
  | "room:knock_decision"
  | "room:joined"
  | "room:settings_updated"
  | "room:user_joined"
  | "room:user_left"
  | "room:kick"
  | "room:error"
  | "sync:request"
  | "sync:state"
  | "sync:play"
  | "sync:pause"
  | "sync:seek"
  | "sync:track_change"
  | "sync:url_change"
  | "sync:media_mode_change"
  | "sync:web_navigate"
  | "sync:web_scroll"
  | "sync:web_click"
  | "sync:web_cursor"
  | "chat:message"
  | "webrtc:join_voice"
  | "webrtc:leave_voice"
  | "webrtc:active_voice_peers"
  | "webrtc:offer"
  | "webrtc:answer"
  | "webrtc:ice_candidate"
  | "time:ping"
  | "time:pong"
  | "telemetry:submit"
  | "telemetry:broadcast";

export interface WSMessage<T = any> {
  event: WSEventType;
  payload: T;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender_client_id: string;
  sender_name: string;
  is_host: boolean;
  content: string;
  sent_at: number;
}

export interface RoomJoinedPayload {
  room_id: string;
  is_host: boolean;
  settings: RoomSettings;
  video_state: VideoPlaybackState;
  web_state: WebPageState;
  participants: Participant[];
}

export interface KnockRequestPayload {
  client_id: string;
  display_name: string;
  requested_at: number;
}
