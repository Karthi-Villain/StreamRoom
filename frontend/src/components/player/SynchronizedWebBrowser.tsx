import React, { useEffect, useRef, useState } from "react";
import { WebPageState, ControlPolicy } from "../../types/room";
import { API_BASE } from "../../services/apiClient";
import styles from "./Player.module.css";

interface SynchronizedWebBrowserProps {
  webState: WebPageState;
  isHost: boolean;
  controlPolicy: ControlPolicy;
  onSendAction: (event: string, payload: any) => void;
  remoteCursor?: { xPct: number; yPct: number; clientId: string } | null;
}

export const SynchronizedWebBrowser: React.FC<SynchronizedWebBrowserProps> = ({
  webState,
  isHost,
  controlPolicy,
  onSendAction,
  remoteCursor,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [urlInput, setUrlInput] = useState(webState.current_url);
  const canControl = isHost || controlPolicy === "collaborative";

  const apiBase = API_BASE;
  const proxyUrl = `${apiBase}/proxy?url=${encodeURIComponent(webState.current_url)}`;

  // Handle messages received from injected iframe agent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.source !== "streamroom-cobrowse") return;
      if (!canControl) return;

      const { type, topPct, leftPct, url, xPct, yPct } = event.data;

      if (type === "scroll") {
        onSendAction("sync:web_scroll", { topPct, leftPct });
      } else if (type === "navigate") {
        onSendAction("sync:web_navigate", { url });
      } else if (type === "click") {
        onSendAction("sync:web_click", { xPct, yPct });
      } else if (type === "cursor") {
        onSendAction("sync:web_cursor", { xPct, yPct });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [canControl, onSendAction]);

  // Synchronize remote scroll down to the iframe
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          target: "streamroom-cobrowse-child",
          type: "remote_scroll",
          topPct: webState.scroll_top_pct,
          leftPct: webState.scroll_left_pct,
        },
        "*"
      );
    }
  }, [webState.scroll_top_pct, webState.scroll_left_pct]);

  const handleNavigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl) return;
    let finalUrl = urlInput.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }
    onSendAction("sync:web_navigate", { url: finalUrl });
  };

  return (
    <div className={styles.webContainer}>
      {canControl && (
        <form onSubmit={handleNavigateSubmit} className={styles.webTopBar}>
          <input
            type="text"
            className={styles.webUrlInput}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter website URL..."
          />
          <button type="submit" className={styles.configureButton}>
            Navigate
          </button>
        </form>
      )}

      {/* Render remote cursor pointer when host moves mouse */}
      {remoteCursor && !isHost && (
        <div
          className={styles.remoteCursor}
          style={{
            left: `${remoteCursor.xPct * 100}%`,
            top: `${remoteCursor.yPct * 100}%`,
          }}
        >
          <div className={styles.cursorPointer} />
          <div className={styles.cursorLabel}>Host</div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        key={webState.current_url}
        src={proxyUrl}
        className={styles.webFrame}
        title="Synchronized Browser View"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
};
