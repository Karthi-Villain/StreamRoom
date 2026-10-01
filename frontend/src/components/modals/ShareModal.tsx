import React from "react";
import { X, Share2, Check } from "lucide-react";
import { useShare } from "../../hooks/useShare";
import styles from "./Modal.module.css";

interface ShareModalProps {
  roomId: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ roomId, onClose }) => {
  const { shareRoom, copied } = useShare();
  const roomUrl = `${window.location.origin}?room=${roomId}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <div className={styles.title}>Share Streaming Room</div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>12-Character Room Code</label>
          <input type="text" className={styles.input} value={roomId} readOnly />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Room Link</label>
          <input type="text" className={styles.input} value={roomUrl} readOnly />
        </div>

        <button
          className={styles.actionButton}
          onClick={() => shareRoom(roomId)}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            <span>{copied ? "Link Copied to Clipboard!" : "Share Room to Apps"}</span>
          </div>
        </button>
      </div>
    </div>
  );
};
