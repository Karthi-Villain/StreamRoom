import React from "react";
import { UserCheck, X, Check } from "lucide-react";
import { KnockRequestPayload } from "../../types/websocket";
import styles from "./Modal.module.css";

interface KnockApprovalModalProps {
  knock: KnockRequestPayload;
  onDecide: (clientId: string, decision: "admit" | "reject") => void;
}

export const KnockApprovalModal: React.FC<KnockApprovalModalProps> = ({
  knock,
  onDecide,
}) => {
  return (
    <div className={styles.toastWrapper}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(229, 9, 20, 0.2)",
            color: "#E50914",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserCheck size={16} />
        </div>
        <div>
          <div className={styles.title} style={{ fontSize: "14px" }}>
            Knock Request
          </div>
          <div style={{ fontSize: "11px", color: "#8c8c8c" }}>Approval needed for room entry</div>
        </div>
      </div>

      <p style={{ fontSize: "13px", color: "#dedede", margin: "2px 0 6px 0" }}>
        <strong style={{ color: "#ffffff" }}>{knock.display_name}</strong> is knocking to join the room.
      </p>

      <div className={styles.buttonRow}>
        <button
          className={`${styles.actionButton} ${styles.danger}`}
          style={{ padding: "8px 14px", fontSize: "13px" }}
          onClick={() => onDecide(knock.client_id, "reject")}
        >
          <X size={14} />
          <span>Deny</span>
        </button>
        <button
          className={`${styles.actionButton} ${styles.success}`}
          style={{ padding: "8px 14px", fontSize: "13px" }}
          onClick={() => onDecide(knock.client_id, "admit")}
        >
          <Check size={14} />
          <span>Admit</span>
        </button>
      </div>
    </div>
  );
};
