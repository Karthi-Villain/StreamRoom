import { useState, useEffect, useRef } from "react";
import { WSMessage } from "../types/websocket";

export function useClockSync(sendMessage: (msg: WSMessage) => void) {
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [rtt, setRtt] = useState<number>(0);
  const pingStartRef = useRef<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      pingStartRef.current = performance.now();
      sendMessage({
        event: "time:ping",
        payload: { t0: Date.now() / 1000 },
        timestamp: Date.now() / 1000,
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [sendMessage]);

  const handleTimePong = (payload: { t0: number; t_server: number }) => {
    const now = Date.now() / 1000;
    const measuredRtt = now - payload.t0;
    const latency = measuredRtt / 2;
    const calculatedOffset = payload.t_server - (payload.t0 + latency);

    setRtt(measuredRtt * 1000);
    // Smooth offset with EWMA
    setClockOffset((prev) => (prev === 0 ? calculatedOffset : prev * 0.8 + calculatedOffset * 0.2));
  };

  return { clockOffset, rtt, handleTimePong };
}
