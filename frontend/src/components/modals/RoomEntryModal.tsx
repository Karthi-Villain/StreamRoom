import React, { useState } from "react";
import { X, Play, Users } from "lucide-react";
import { RoomMetadata } from "../../types/room";
import styles from "./Modal.module.css";

interface RoomEntryModalProps {
  roomId?: string;
  metadata?: RoomMetadata | null;
  initialMode?: "create" | "join";
  onJoin: (displayName: string, pin?: string, targetRoomId?: string) => Promise<void>;
  onCreate: (params: {
    displayName: string;
    accessMode: "public" | "pin" | "approval";
    pin?: string;
    controlPolicy: "host_only" | "collaborative";
    mediaMode: "video_stream" | "web_page";
    streamUrl?: string;
    webUrl?: string;
    diagnosticsEnabled: boolean;
  }) => Promise<void>;
  onClose?: () => void;
  isPendingApproval?: boolean;
}

export const RoomEntryModal: React.FC<RoomEntryModalProps> = ({
  roomId,
  metadata,
  initialMode = "create",
  onJoin,
  onCreate,
  onClose,
  isPendingApproval,
}) => {
  const [activeTab, setActiveTab] = useState<"create" | "join">(
    roomId ? "join" : initialMode
  );

  // Join form state
  const [customRoomId, setCustomRoomId] = useState(roomId || "");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [accessMode, setAccessMode] = useState<"public" | "pin" | "approval">("public");
  const [controlPolicy, setControlPolicy] = useState<"host_only" | "collaborative">("host_only");
  const [mediaMode, setMediaMode] = useState<"video_stream" | "web_page">("video_stream");
  const [streamUrl, setStreamUrl] = useState("");
  const [webUrl, setWebUrl] = useState("https://en.wikipedia.org/wiki/Streaming_media");
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(true);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalRoomId = (roomId || customRoomId).trim();
    if (!finalRoomId) {
      setError("Please enter a valid 12-character Room ID");
      return;
    }
    if (!displayName.trim()) {
      setError("Please enter your display name");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onJoin(displayName.trim(), pin.trim() || undefined, finalRoomId);
    } catch (err: any) {
      setError(err.message || "Failed to join room");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Please enter your display name");
      return;
    }
    if (accessMode === "pin" && !pin.trim()) {
      setError("PIN is required for PIN protected rooms");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onCreate({
        displayName: displayName.trim(),
        accessMode,
        pin: pin.trim() || undefined,
        controlPolicy,
        mediaMode,
        streamUrl: streamUrl.trim() || undefined,
        webUrl: webUrl.trim() || undefined,
        diagnosticsEnabled,
      });
    } catch (err: any) {
      setError(err.message || "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  if (isPendingApproval) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modalContent}>
          <div className={styles.title}>Waiting for Host Approval</div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
            This room requires host approval. Your entry request has been sent to the room host. Please wait...
          </p>
          {onClose && (
            <button className={`${styles.actionButton} ${styles.secondary}`} onClick={onClose}>
              Cancel Request
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <div className={styles.title}>
            {activeTab === "join"
              ? roomId
                ? `Join Room (${roomId})`
                : "Join Existing Room"
              : "Create Streaming Room"}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                color: "#a3a3a3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Switch tab if not locked to specific room */}
        {!roomId && (
          <div style={{ display: "flex", gap: "8px", background: "rgba(255, 255, 255, 0.05)", padding: "4px", borderRadius: "var(--radius-full)" }}>
            <button
              type="button"
              onClick={() => { setActiveTab("create"); setError(null); }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "var(--radius-full)",
                border: "none",
                background: activeTab === "create" ? "var(--color-accent-netflix)" : "transparent",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Play size={13} fill={activeTab === "create" ? "#ffffff" : "none"} />
              <span>Create Room</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("join"); setError(null); }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "var(--radius-full)",
                border: "none",
                background: activeTab === "join" ? "var(--color-accent-netflix)" : "transparent",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Users size={13} />
              <span>Join Room</span>
            </button>
          </div>
        )}

        {error && (
          <div style={{ color: "#ff5555", fontSize: "13px", background: "rgba(229, 9, 20, 0.1)", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(229, 9, 20, 0.3)" }}>
            {error}
          </div>
        )}

        {activeTab === "join" ? (
          <form onSubmit={handleJoinSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {!roomId && (
              <div className={styles.formGroup}>
                <label className={styles.label}>12-Character Room ID</label>
                <input
                  type="text"
                  className={styles.input}
                  value={customRoomId}
                  onChange={(e) => setCustomRoomId(e.target.value.toUpperCase())}
                  placeholder="e.g. QT8z5ZFCeBi7"
                  maxLength={12}
                  required
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Your Display Name</label>
              <input
                type="text"
                className={styles.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name..."
                required
              />
            </div>

            {metadata?.requires_pin && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Room Access PIN</label>
                <input
                  type="password"
                  className={styles.input}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN..."
                  required
                />
              </div>
            )}

            <button type="submit" className={styles.actionButton} disabled={loading}>
              {loading ? "Joining..." : "Enter Room"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Host Display Name</label>
              <input
                type="text"
                className={styles.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter host name..."
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Media Type</label>
              <select
                className={styles.select}
                value={mediaMode}
                onChange={(e) => setMediaMode(e.target.value as any)}
              >
                <option value="video_stream">Video Stream (HLS, DASH, MP4)</option>
                <option value="web_page">Synchronized Web Page (Co-browsing)</option>
              </select>
            </div>

            {mediaMode === "video_stream" ? (
              <div className={styles.formGroup}>
                <label className={styles.label}>Stream URL (Direct MP4, .m3u8, or .mpd)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://cdn.example.com/live/playlist.m3u8"
                />
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.label}>Website URL</label>
                <input
                  type="text"
                  className={styles.input}
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Streaming_media"
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Access Protection</label>
              <select
                className={styles.select}
                value={accessMode}
                onChange={(e) => setAccessMode(e.target.value as any)}
              >
                <option value="public">Public (Open Link)</option>
                <option value="pin">PIN Protected</option>
                <option value="approval">Host Approval Required (Knock Queue)</option>
              </select>
            </div>

            {accessMode === "pin" && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Set Room PIN</label>
                <input
                  type="password"
                  className={styles.input}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Create numeric PIN..."
                  required
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Video Control Policy</label>
              <select
                className={styles.select}
                value={controlPolicy}
                onChange={(e) => setControlPolicy(e.target.value as any)}
              >
                <option value="host_only">Host Only (Audience cannot pause/seek)</option>
                <option value="collaborative">Collaborative (Anyone can control)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="diagToggle"
                checked={diagnosticsEnabled}
                onChange={(e) => setDiagnosticsEnabled(e.target.checked)}
              />
              <label htmlFor="diagToggle" className={styles.label}>
                Enable Stream & Network Diagnostics HUD
              </label>
            </div>

            <button type="submit" className={styles.actionButton} disabled={loading}>
              {loading ? "Creating Room..." : "Create Room & Launch"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
