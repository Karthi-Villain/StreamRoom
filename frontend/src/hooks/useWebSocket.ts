import { useEffect, useRef, useState, useCallback } from "react";
import { WSMessage } from "../types/websocket";

interface UseWebSocketProps {
  roomId: string | null;
  clientId: string | null;
  token: string | null;
  onMessage: (message: WSMessage) => void;
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

    const connect = () => {
      if (isDisposed) return;

      let wsBase = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000/ws/rooms";
      
      // Enforce wss:// if application is loaded over HTTPS or configured with wss
      if (window.location.protocol === "https:" && wsBase.startsWith("ws://")) {
        wsBase = wsBase.replace("ws://", "wss://");
      }

      const wsUrl = `${wsBase}/${roomId}?token=${encodeURIComponent(token)}&client_id=${encodeURIComponent(clientId)}`;
      const ws = new WebSocket(wsUrl);
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

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential backoff reconnect if not unmounted
        if (!isDisposed && retryCountRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 5000);
          retryCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket connection attempt encountered error, attempting recovery:", err);
        setIsConnected(false);
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
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
