import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  Subtitles,
  Headphones,
  Mic,
  Activity,
  Globe,
  Radio,
  Sparkles,
} from "lucide-react";
import styles from "./LandingPage.module.css";

interface MockMessage {
  id: string;
  sender: string;
  isHost?: boolean;
  color: string;
  text: string;
  time: string;
}

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: "1",
    sender: "Alex",
    isHost: true,
    color: "#E50914",
    text: "Welcome to the watch party! Hit play when ready 🍿",
    time: "21:04",
  },
  {
    id: "2",
    sender: "Elena",
    color: "#0071eb",
    text: "Audio tracks and subtitles switch instantly!",
    time: "21:05",
  },
  {
    id: "3",
    sender: "Marcus",
    color: "#2ecc71",
    text: "Clock sync drift is 0.4ms across all of us. Insane!",
    time: "21:05",
  },
];

export const PreviewShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"player" | "browser" | "diagnostics">("player");
  const [isPlaying, setIsPlaying] = useState(true);
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);
  const [progress, setProgress] = useState(38);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.3));
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className={styles.showcaseCard}>
      {/* Showcase Mode Tab Selector */}
      <div className={styles.showcaseHeader}>
        <div className={styles.showcaseTabs}>
          <button
            className={`${styles.showcaseTabBtn} ${activeTab === "player" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("player")}
          >
            <Radio size={14} />
            <span>4K Synchronized Player</span>
          </button>
          <button
            className={`${styles.showcaseTabBtn} ${activeTab === "browser" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("browser")}
          >
            <Globe size={14} />
            <span>Co-Browsing View</span>
          </button>
          <button
            className={`${styles.showcaseTabBtn} ${activeTab === "diagnostics" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("diagnostics")}
          >
            <Activity size={14} />
            <span>Telemetry & Diagnostics</span>
          </button>
        </div>

        <div className={styles.liveIndicatorPill}>
          <span className={styles.liveDotAnim} />
          <span>ROOM DEMO • 4 PEERS ACTIVE</span>
        </div>
      </div>

      {/* Screen Container */}
      <div className={styles.showcaseScreen}>
        {activeTab === "player" && (
          <div className={styles.simulatedPlayer}>
            {/* Cinematic Video Background Simulation */}
            <div className={styles.simulatedVideoStage}>
              <div className={styles.cinematicGlow} />
              <div className={styles.simulatedMoviePoster}>
                <div className={styles.posterBadge}>
                  <Sparkles size={13} color="#E50914" />
                  <span>HLS / MPEG-DASH MSE PIPELINE</span>
                </div>
                <h3 className={styles.movieTitle}>COSMOS 4K: BEYOND THE HORIZON</h3>
                <p className={styles.movieMeta}>
                  Ultra-HD • 60 FPS • Dolby Atmos 5.1 • Dual Track Audio • Synchronized
                </p>
              </div>

              {/* Floating YouTube Live Chat Simulation */}
              <div className={styles.simulatedChatOverlay}>
                {messages.map((m) => (
                  <div key={m.id} className={styles.simulatedChatBubble}>
                    <div
                      className={styles.simulatedAvatar}
                      style={{ backgroundColor: m.color }}
                    >
                      {m.sender.charAt(0)}
                    </div>
                    <span className={styles.simulatedSender}>
                      {m.sender}
                      {m.isHost && <span className={styles.simulatedHostBadge}>HOST</span>}
                      :
                    </span>
                    <span className={styles.simulatedText}>{m.text}</span>
                  </div>
                ))}
              </div>

              {/* Floating Voice Mesh Dock Simulation */}
              <div className={styles.simulatedVoiceDock}>
                <div className={styles.simulatedVoiceGroup}>
                  <div className={`${styles.simulatedVoiceAvatar} ${styles.isSpeaking}`}>
                    A
                  </div>
                  <div className={styles.simulatedVoiceAvatar}>E</div>
                  <div className={styles.simulatedVoiceAvatar}>M</div>
                </div>
                <div className={styles.simulatedVoiceActions}>
                  <button className={styles.simVoiceBtnMute}>
                    <Mic size={12} />
                    <span>Active</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Netflix Video Controls Bar */}
            <div className={styles.simulatedControlsBar}>
              <div
                className={styles.simulatedProgressBar}
                onClick={() => setProgress((p) => (p + 15) % 100)}
              >
                <div
                  className={styles.simulatedProgressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className={styles.simulatedControlsRow}>
                <div className={styles.simulatedControlsLeft}>
                  <button
                    className={styles.simControlButton}
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                  <button className={styles.simControlButton}>
                    <Volume2 size={17} />
                  </button>
                  <span className={styles.simTimeDisplay}>01:14:28 / 02:26:10</span>
                </div>

                <div className={styles.simulatedControlsRight}>
                  <div className={styles.simTrackPill}>
                    <Subtitles size={14} />
                    <span>English [5.1] • Subtitles [Off]</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "browser" && (
          <div className={styles.simulatedBrowser}>
            <div className={styles.browserAddressBar}>
              <Globe size={14} color="#8c8c8c" />
              <span className={styles.browserUrl}>
                https://en.wikipedia.org/wiki/Interstellar_(film)
              </span>
              <span className={styles.syncBadge}>SYNCED WITH ROOM</span>
            </div>
            <div className={styles.browserContent}>
              <div className={styles.browserPageMock}>
                <h4>Interstellar (2014) — Synchronized Co-Browsing</h4>
                <p>
                  Experience the web together in real-time. Scroll positions, navigation clicks,
                  and live multi-user cursors are propagated instantly over low-latency WebSocket
                  channels.
                </p>
                <div className={styles.mockCursor}>
                  <div className={styles.cursorPointerMock} />
                  <span className={styles.cursorTag}>Alex (Host)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "diagnostics" && (
          <div className={styles.simulatedDiagnostics}>
            <div className={styles.diagGrid}>
              <div className={styles.diagMetricCard}>
                <span className={styles.diagLabel}>Download Throughput</span>
                <span className={styles.diagValue} style={{ color: "#46d369" }}>
                  48.6 Mbps
                </span>
                <span className={styles.diagSub}>Adaptive 4K Bitrate</span>
              </div>
              <div className={styles.diagMetricCard}>
                <span className={styles.diagLabel}>Client Time Drift</span>
                <span className={styles.diagValue} style={{ color: "#46d369" }}>
                  0.32 ms
                </span>
                <span className={styles.diagSub}>NTP Clock-Skew Corrected</span>
              </div>
              <div className={styles.diagMetricCard}>
                <span className={styles.diagLabel}>Buffer Ahead</span>
                <span className={styles.diagValue} style={{ color: "#0071eb" }}>
                  3.80 sec
                </span>
                <span className={styles.diagSub}>Tight Low-Latency Sync</span>
              </div>
              <div className={styles.diagMetricCard}>
                <span className={styles.diagLabel}>Signaling Roundtrip (RTT)</span>
                <span className={styles.diagValue} style={{ color: "#ffffff" }}>
                  18 ms
                </span>
                <span className={styles.diagSub}>WebSocket Edge Server</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
