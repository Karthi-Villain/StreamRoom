import { RoomSettings, RoomMetadata, RoomJoinResponse } from "../types/room";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export interface CreateRoomParams {
  host_client_id: string;
  host_display_name: string;
  access_mode: "public" | "pin" | "approval";
  pin?: string;
  control_policy: "host_only" | "collaborative";
  media_mode: "video_stream" | "web_page";
  stream_url?: string;
  web_url?: string;
  diagnostics_enabled: boolean;
}

export async function createRoom(params: CreateRoomParams) {
  const resp = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to create room");
  }
  return resp.json();
}

export async function getRoomMetadata(roomId: string): Promise<RoomMetadata> {
  const resp = await fetch(`${API_BASE}/rooms/${roomId}`);
  if (!resp.ok) {
    throw new Error("Room not found");
  }
  return resp.json();
}

export async function submitJoinRequest(
  roomId: string,
  clientId: string,
  displayName: string,
  pin?: string
): Promise<RoomJoinResponse> {
  const resp = await fetch(`${API_BASE}/rooms/${roomId}/join-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      display_name: displayName,
      pin,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.detail || "Failed to join room");
  }
  return data;
}

export async function checkKnockStatus(roomId: string, clientId: string) {
  const resp = await fetch(`${API_BASE}/rooms/${roomId}/knock-status/${clientId}`);
  if (!resp.ok) return { status: "error" };
  return resp.json();
}

export async function updateRoomSettings(roomId: string, hostToken: string, settings: Partial<RoomSettings>) {
  const resp = await fetch(`${API_BASE}/rooms/${roomId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hostToken}`,
    },
    body: JSON.stringify(settings),
  });
  if (!resp.ok) {
    throw new Error("Failed to update settings");
  }
  return resp.json();
}

export async function resumeSession(
  roomId: string,
  clientId: string,
  sessionToken?: string,
  hostToken?: string
) {
  const resp = await fetch(`${API_BASE}/rooms/${roomId}/resume-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      session_token: sessionToken,
      host_token: hostToken,
    }),
  });
  if (!resp.ok) {
    return { status: "needs_join" };
  }
  return resp.json();
}
