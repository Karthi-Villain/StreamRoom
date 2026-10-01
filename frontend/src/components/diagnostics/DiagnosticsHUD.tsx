import React, { useState } from "react";
import { Activity, X } from "lucide-react";
import { RoomDiagnosticsPayload } from "../../types/diagnostics";
import styles from "./Diagnostics.module.css";

interface DiagnosticsHUDProps {
  localMetrics: {
    downloadSpeedMbps: number;
    bufferSec: number;
    droppedFrames: number;
    rttMs: number;
    driftMs: number;
  };
  roomDiagnostics?: RoomDiagnosticsPayload | null;
  onClose?: () => void;
}

export const DiagnosticsHUD: React.FC<DiagnosticsHUDProps> = ({
  localMetrics,
  roomDiagnostics,
  onClose,
}) => {
  const [showRoomDetails, setShowRoomDetails] = useState(false);

  const getHealthClass = (latency: number, buffer: number, drift: number) => {
    if (latency > 300 || buffer < 2.0 || Math.abs(drift) > 1500) return styles.degraded;
    if (latency > 150 || buffer < 5.0 || Math.abs(drift) > 500) return styles.fair;
    return styles.optimal;
  };

  const healthClass = getHealthClass(
    localMetrics.rttMs,
    localMetrics.bufferSec,
    localMetrics.driftMs
  );

  return (
    <div className={styles.hudContainer}>
      <div className={styles.hudHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Activity size={14} color="#3b82f6" />
          <span>Stream Diagnostics</span>
        </div>
        {onClose && (
          <button onClick={onClose}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.metricsGrid}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Speed:</span>
          <span className={styles.metricValue}>
            {localMetrics.downloadSpeedMbps > 0
              ? `${localMetrics.downloadSpeedMbps.toFixed(1)} Mbps`
              : "N/A"}
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Latency:</span>
          <span className={`${styles.metricValue} ${healthClass}`}>
            {localMetrics.rttMs.toFixed(0)} ms
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Buffer:</span>
          <span className={styles.metricValue}>
            {localMetrics.bufferSec.toFixed(1)} s
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Drift:</span>
          <span className={`${styles.metricValue} ${healthClass}`}>
            {localMetrics.driftMs.toFixed(0)} ms
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Dropped:</span>
          <span className={styles.metricValue}>{localMetrics.droppedFrames}</span>
        </div>
      </div>

      {roomDiagnostics && roomDiagnostics.participants_metrics.length > 0 && (
        <>
          <div
            className={styles.toggleDetailsButton}
            onClick={() => setShowRoomDetails(!showRoomDetails)}
          >
            {showRoomDetails ? "Hide Peer Health" : "Show Peer Health"}
          </div>

          {showRoomDetails && (
            <table className={styles.telemetryTable}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>RTT</th>
                  <th>Buffer</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {roomDiagnostics.participants_metrics.map((peer) => (
                  <tr key={peer.client_id}>
                    <td>{peer.display_name}</td>
                    <td>{peer.latency_ms}ms</td>
                    <td>{peer.buffer_sec}s</td>
                    <td>{peer.drift_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};
