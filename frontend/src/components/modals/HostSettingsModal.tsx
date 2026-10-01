import React, { useState } from "react";
import { X } from "lucide-react";
import { RoomSettings, MediaMode, ControlPolicy, AccessMode } from "../../types/room";
import styles from "./Modal.module.css";

interface HostSettingsModalProps {
  settings: RoomSettings;
  onUpdate: (updated: Partial<RoomSettings>) => Promise<void>;
  onClose: () => void;
}

export const HostSettingsModal: React.FC<HostSettingsModalProps> = ({
  settings,
  onUpdate,
  onClose,
}) => {
  const [mediaMode, setMediaMode] = useState<MediaMode>(settings.media_mode);
  const [streamUrl, setStreamUrl] = useState(settings.stream_url || "");
  const [webUrl, setWebUrl] = useState(settings.web_url || "");
  const [controlPolicy, setControlPolicy] = useState<ControlPolicy>(settings.control_policy);
  const [accessMode, setAccessMode] = useState<AccessMode>(settings.access_mode);
  const [pin, setPin] = useState("");
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(settings.diagnostics_enabled);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdate({
        media_mode: mediaMode,
        stream_url: streamUrl.trim() || undefined,
        web_url: webUrl.trim() || undefined,
        control_policy: controlPolicy,
        access_mode: accessMode,
        pin: pin.trim() || undefined,
        diagnostics_enabled: diagnosticsEnabled,
      });
      onClose();
    } catch (err) {
      console.error("Failed to update settings", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <div className={styles.title}>Room Host Settings</div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Active Media Mode</label>
            <select
              className={styles.select}
              value={mediaMode}
              onChange={(e) => setMediaMode(e.target.value as any)}
            >
              <option value="video_stream">Video Player (Stream / MP4 / HLS / DASH)</option>
              <option value="web_page">Synchronized Web Page (Co-browsing)</option>
            </select>
          </div>

          {mediaMode === "video_stream" ? (
            <div className={styles.formGroup}>
              <label className={styles.label}>Stream URL</label>
              <input
                type="text"
                className={styles.input}
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://cdn.example.com/playlist.m3u8"
              />
            </div>
          ) : (
            <div className={styles.formGroup}>
              <label className={styles.label}>Target Website URL</label>
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
            <label className={styles.label}>Control Authority</label>
            <select
              className={styles.select}
              value={controlPolicy}
              onChange={(e) => setControlPolicy(e.target.value as any)}
            >
              <option value="host_only">Host Only Controls</option>
              <option value="collaborative">Collaborative (All Viewers)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Access Mode</label>
            <select
              className={styles.select}
              value={accessMode}
              onChange={(e) => setAccessMode(e.target.value as any)}
            >
              <option value="public">Public</option>
              <option value="pin">PIN Protected</option>
              <option value="approval">Host Approval Required</option>
            </select>
          </div>

          {accessMode === "pin" && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Update PIN (leave blank to keep current)</label>
              <input
                type="password"
                className={styles.input}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter new PIN..."
              />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="settingsDiagToggle"
              checked={diagnosticsEnabled}
              onChange={(e) => setDiagnosticsEnabled(e.target.checked)}
            />
            <label htmlFor="settingsDiagToggle" className={styles.label}>
              Enable Network & Stream Diagnostics for Everyone
            </label>
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={`${styles.actionButton} ${styles.secondary}`} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.actionButton} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
