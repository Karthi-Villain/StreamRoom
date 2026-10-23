import { useEffect, useRef, useState, useCallback } from "react";
import Pusher from "pusher-js";
import { WSMessage } from "../types/websocket";
import { sendRoomEvent, getRoomSyncSnapshot } from "../services/apiClient";

interface UseWebSocketProps {
  roomId: string | null;
  clientId: string | null;
  token: string | null;
  onMessage: (message: WSMessage) => void;
}

const PUSHER_KEY =
  (import.meta.env.VITE_PUSHER_KEY as string | undefined)?.trim() || "c9dab135f75f180bf373";
const PUSHER_CLUSTER =
  (import.meta.env.VITE_PUSHER_CLUSTER as string | undefined)?.trim() || "ap2";

export function useWebSocket({ roomId, clientId, token, onMessage }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const pusherRef = useRef<Pusher | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roomId || !clientId || !token) return;

    let isDisposed = false;

    // Initialize Pusher Client for real-time messaging
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
    pusherRef.current = pusher;

    const channelName = `room-${roomId}`;
    const channel = pusher.subscribe(channelName);

    // Global listener for all room events broadcasted on this channel
    channel.bind_global((eventName: string, data: any) => {
      if (isDisposed) return;
      if (eventName.startsWith("pusher:") || eventName.startsWith("pusher_internal:")) {
        return;
      }

      let msg = data;
      if (typeof msg === "string") {
        try {
          msg = JSON.parse(msg);
        } catch {
          // not json
        }
      }

      if (!msg || typeof msg !== "object") return;

      // Filter out if this broadcast excluded our clientId
      if (msg._exclude_client_id && msg._exclude_client_id === clientId) {
        return;
      }

      // Filter out if targeted specifically to another client
      if (msg._target_client_id && msg._target_client_id !== clientId) {
        return;
      }

      // Ensure proper WSMessage shape
      const formattedMsg: WSMessage = {
        event: (msg.event as any) || eventName,
        payload: msg.payload !== undefined ? msg.payload : msg,
        timestamp: msg.timestamp || Date.now() / 1000,
      };

      if (onMessageRef.current) {
        onMessageRef.current(formattedMsg);
      }
    });

    channel.bind("pusher:subscription_succeeded", async () => {
      if (isDisposed) return;
      setIsConnected(true);

      // Fetch snapshot to get initial room state, host status, and existing participants
      try {
        const snapshot = await getRoomSyncSnapshot(roomId, clientId, token);
        if (snapshot && !isDisposed && onMessageRef.current) {
          onMessageRef.current(snapshot);
        }
      } catch (err) {
        console.error("Failed to fetch initial sync snapshot:", err);
      }
    });

    channel.bind("pusher:subscription_error", (status: any) => {
      console.warn("Pusher subscription error:", status);
    });

    pusher.connection.bind("connected", () => {
      if (!isDisposed) setIsConnected(true);
    });

    pusher.connection.bind("disconnected", () => {
      if (!isDisposed) setIsConnected(false);
    });

    pusher.connection.bind("unavailable", () => {
      if (!isDisposed) setIsConnected(false);
    });

    pusher.connection.bind("failed", () => {
      if (!isDisposed) setIsConnected(false);
    });

    return () => {
      isDisposed = true;
      try {
        channel.unbind_all();
        pusher.unsubscribe(channelName);
        pusher.disconnect();
      } catch {
        // ignore
      }
      pusherRef.current = null;
      setIsConnected(false);
    };
  }, [roomId, clientId, token]);

  const sendMessage = useCallback(
    (msg: WSMessage) => {
      if (!roomId || !clientId || !token) return;

      const socketId = pusherRef.current?.connection?.socket_id;
      sendRoomEvent(roomId, clientId, token, msg.event, msg.payload, socketId)
        .then((resp) => {
          // If server returned an immediate synchronous response (e.g. time:pong), dispatch it
          if (resp && resp.event && onMessageRef.current) {
            onMessageRef.current(resp);
          }
        })
        .catch((err) => {
          console.warn("Error sending room event:", err);
        });
    },
    [roomId, clientId, token]
  );

  return { isConnected, sendMessage };
}

