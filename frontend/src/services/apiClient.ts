import { RoomSettings, RoomMetadata, RoomJoinResponse } from "../types/room";

/**
 * Resolve the REST base URL.
 *
 * In a deployed build VITE_API_BASE_URL is baked in; if it is missing we use
 * the current origin (same host the SPA is served from) instead of localhost,
 * which would otherwise be impossible to reach from a visitor's browser.
 */
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  return isLocalDev
    ? "http://localhost:8000/api/v1"
    : `${window.location.origin}/api/v1`;
}

export const API_BASE = resolveApiBase();

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
