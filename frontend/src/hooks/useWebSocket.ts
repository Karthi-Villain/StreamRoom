import { useEffect, useRef, useState, useCallback } from "react";
import { WSMessage } from "../types/websocket";

interface UseWebSocketProps {
  roomId: string | null;
  clientId: string | null;
  token: string | null;
  onMessage: (message: WSMessage) => void;
}

const MAX_RETRIES = 10;

/**
 * Resolve the WebSocket base URL.
 *
 * Never falls back to localhost in a deployed build: when VITE_WS_BASE_URL is
 * missing, the URL is derived from the page origin (which is also where the
 * .htaccess WebSocket reverse proxy lives).
 */
function resolveWsBase(): string {
  const configured = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim();

  let base: string;
  if (configured) {
    base = configured;
  } else {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${window.location.host}/ws/rooms`;
  }

  // Never downgrade to ws:// on an HTTPS page (browsers block mixed content)
  if (window.location.protocol === "https:" && base.startsWith("ws://")) {
    base = base.replace(/^ws:\/\//, "wss://");
  }
  // A trailing slash would produce "//rooms"
  return base.replace(/\/+$/, "");
}

export function useWebSocket({ roomId, clientId, token, onMessage }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roomId || !clientId || !token) return;

    let isDisposed = false;
    retryCountRef.current = 0;

    const connect = () => {
      if (isDisposed) return;

      const wsUrl =
        `${resolveWsBase()}/${encodeURIComponent(roomId)}` +
        `?token=${encodeURIComponent(token)}&client_id=${encodeURIComponent(clientId)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.error("WebSocket URL rejected by the browser:", wsUrl, err);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          if (onMessageRef.current) {
            onMessageRef.current(msg);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message", err);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (wsRef.current === ws) wsRef.current = null;

        // 1008 = policy violation (unknown room / expired token)
        // 1006 = abnormal closure (handshake rejected / proxy not configured)
        const reason = event.reason ? ` reason="${event.reason}"` : "";
        console.warn(
          `WebSocket closed (code=${event.code}${reason} wasClean=${event.wasClean}) from ${wsUrl}`
        );

        if (isDisposed) return;

        if (retryCountRef.current >= MAX_RETRIES) {
          console.error(
            "WebSocket reconnect attempts exhausted. Verify that /ws/ is proxied to the ASGI server."
          );
          return;
        }

        // 1008 = stale credentials: back off harder instead of hammering the
        // server with a token that is being rejected.
        const backoff =
          event.code === 1008
            ? 10000
            : Math.min(800 * Math.pow(1.6, retryCountRef.current), 8000);

        retryCountRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, backoff + Math.random() * 400);
      };

      ws.onerror = () => {
        // Browsers hide error details; onclose carries the close code.
        console.warn(`WebSocket transport error for ${wsUrl}`);
        setIsConnected(false);
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, clientId, token]);

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { isConnected, sendMessage };
}
