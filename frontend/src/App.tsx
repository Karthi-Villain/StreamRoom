import React, { useState, useEffect, useRef, useCallback } from "react";
import { Share2, Settings, Maximize, Minimize, Activity, Copy, Users, Check } from "lucide-react";

import { RoomSettings, VideoPlaybackState, WebPageState, Participant, RoomMetadata } from "./types/room";
import { WSMessage, ChatMessage, KnockRequestPayload } from "./types/websocket";
import { RoomDiagnosticsPayload } from "./types/diagnostics";

import { getPersistentBrowserId } from "./services/fingerprintEngine";
import { createRoom, getRoomMetadata, submitJoinRequest, checkKnockStatus, updateRoomSettings, resumeSession } from "./services/apiClient";
import { saveRoomSession, getRoomSession } from "./services/sessionStore";

import { useWebSocket } from "./hooks/useWebSocket";
import { useClockSync } from "./hooks/useClockSync";
import { useVoiceMesh } from "./hooks/useVoiceMesh";

import { UniversalMediaPlayer } from "./components/player/UniversalMediaPlayer";
import { SynchronizedWebBrowser } from "./components/player/SynchronizedWebBrowser";
import { ChatContainer } from "./components/chat/ChatContainer";
import { VoiceController } from "./components/voice/VoiceController";
import { DiagnosticsHUD } from "./components/diagnostics/DiagnosticsHUD";

import { RoomEntryModal } from "./components/modals/RoomEntryModal";
import { HostSettingsModal } from "./components/modals/HostSettingsModal";
import { KnockApprovalModal } from "./components/modals/KnockApprovalModal";
import { ShareModal } from "./components/modals/ShareModal";
import { TopNotificationBanner, UserJoinNotification } from "./components/notifications/TopNotificationBanner";
import { LandingPage } from "./components/landing/LandingPage";

import styles from "./App.module.css";

export const App: React.FC = () => {
  // Device & Room State
  const [clientId, setClientId] = useState<string>("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [metadata, setMetadata] = useState<RoomMetadata | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState<boolean>(false);

  // Synchronized Room State
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    access_mode: "public",
    control_policy: "host_only",
    media_mode: "video_stream",
    stream_url: "",
    web_url: "https://en.wikipedia.org/wiki/Streaming_media",
    diagnostics_enabled: false,
  });

  const [videoState, setVideoState] = useState<VideoPlaybackState>({
    status: "paused",
    reference_position: 0,
    reference_timestamp: Date.now() / 1000,
    playback_rate: 1.0,
  });

  const [webState, setWebState] = useState<WebPageState>({
    current_url: "https://en.wikipedia.org/wiki/Streaming_media",
    scroll_top_pct: 0,
    scroll_left_pct: 0,
  });

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingKnock, setPendingKnock] = useState<KnockRequestPayload | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<{ xPct: number; yPct: number; clientId: string } | null>(null);

  // Diagnostics State
  const [showDiagnosticsHUD, setShowDiagnosticsHUD] = useState<boolean>(false);
  const [roomDiagnostics, setRoomDiagnostics] = useState<RoomDiagnosticsPayload | null>(null);
  const [localMetrics, setLocalMetrics] = useState({
    downloadSpeedMbps: 0,
    bufferSec: 0,
    droppedFrames: 0,
    rttMs: 0,
    driftMs: 0,
  });

  // Modals & Fullscreen State
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showEntryModal, setShowEntryModal] = useState<boolean>(false);
  const [entryModalMode, setEntryModalMode] = useState<"create" | "join">("create");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [latestJoinNotification, setLatestJoinNotification] = useState<UserJoinNotification | null>(null);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-dismiss top join notification
  useEffect(() => {
    if (!latestJoinNotification) return;
    const timer = setTimeout(() => {
      setLatestJoinNotification(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [latestJoinNotification]);

  // Fullscreen user activity / inactivity timer (7 seconds fade down)
  const [isUserActive, setIsUserActive] = useState<boolean>(true);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetUserActivity = useCallback(() => {
    setIsUserActive(true);
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
    if (isFullscreen) {
      activityTimeoutRef.current = setTimeout(() => {
        setIsUserActive(false);
      }, 7000); // 7 seconds inactivity fade down
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      setIsUserActive(true);
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      return;
    }

    resetUserActivity();

    const handleUserTouchOrMove = () => {
      resetUserActivity();
    };

    window.addEventListener("mousemove", handleUserTouchOrMove);
    window.addEventListener("mousedown", handleUserTouchOrMove);
    window.addEventListener("touchstart", handleUserTouchOrMove, { passive: true });
    window.addEventListener("touchmove", handleUserTouchOrMove, { passive: true });
    window.addEventListener("keydown", handleUserTouchOrMove);

    return () => {
      window.removeEventListener("mousemove", handleUserTouchOrMove);
      window.removeEventListener("mousedown", handleUserTouchOrMove);
      window.removeEventListener("touchstart", handleUserTouchOrMove);
      window.removeEventListener("touchmove", handleUserTouchOrMove);
      window.removeEventListener("keydown", handleUserTouchOrMove);
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [isFullscreen, resetUserActivity]);

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Initialize client GUID
  useEffect(() => {
    getPersistentBrowserId().then(setClientId);
  }, []);

  // Check URL query parameter for room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rId = params.get("room");
    if (rId && rId.length === 12) {
      setRoomId(rId);
      getRoomMetadata(rId)
        .then((meta) => {
          setMetadata(meta);
          if (meta && (meta.stream_url || meta.web_url)) {
            setRoomSettings((prev) => ({
              ...prev,
              stream_url: meta.stream_url || prev.stream_url,
              web_url: meta.web_url || prev.web_url,
              media_mode: meta.media_mode || prev.media_mode,
            }));
          }
        })
        .catch(() => setMetadata(null));
    }
  }, []);

  // Restore existing session across page reloads using persistent fingerprint and store
  useEffect(() => {
    if (!roomId || !clientId) return;

    let isCancelled = false;

    getRoomSession(roomId).then(async (savedSession) => {
      if (isCancelled) return;
      try {
        const res = await resumeSession(
          roomId,
          clientId,
          savedSession?.sessionToken,
          savedSession?.hostToken
        );

        if (!isCancelled && res && res.status === "approved" && res.session_token) {
          setSessionToken(res.session_token);
          setIsHost(Boolean(res.is_host));
          if (res.host_token) setHostToken(res.host_token);
          setIsPendingApproval(false);

          if (res.settings) {
            setRoomSettings((prev) => ({
              ...prev,
              ...res.settings,
              stream_url: res.settings.stream_url ?? prev.stream_url,
              web_url: res.settings.web_url ?? prev.web_url,
            }));
          }

          // Update persistent store
          saveRoomSession({
            roomId,
            clientId,
            sessionToken: res.session_token,
            hostToken: res.host_token || savedSession?.hostToken,
            isHost: Boolean(res.is_host),
            displayName: res.display_name || savedSession?.displayName || (res.is_host ? "Host" : "Participant"),
            savedAt: Date.now(),
          });
        }
      } catch (err) {
        console.warn("Session auto-resume failed, prompt needed", err);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [roomId, clientId]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // WebSocket message dispatcher
  const handleIncomingMessage = (msg: WSMessage) => {
    const { event, payload } = msg;

    if (event === "time:pong") {
      handleTimePong(payload);
    } else if (event === "room:joined") {
      setIsHost(payload.is_host);
      setRoomSettings(payload.settings);
      setVideoState(payload.video_state);
      setWebState(payload.web_state);
      setParticipants(payload.participants);
    } else if (event === "room:user_joined") {
      setParticipants((prev) => [...prev.filter((p) => p.client_id !== payload.client_id), payload]);
      setLatestJoinNotification({
        id: `${payload.client_id}-${Date.now()}`,
        displayName: payload.display_name,
      });
    } else if (event === "room:user_left") {
      setParticipants((prev) => prev.filter((p) => p.client_id !== payload.client_id));
      handlePeerLeft(payload.client_id);
    } else if (event === "sync:state") {
      setVideoState((prev) => ({
        ...prev,
        status: payload.status,
        reference_position: payload.reference_position,
        reference_timestamp: payload.reference_timestamp,
        playback_rate: payload.playback_rate,
      }));
    } else if (event === "sync:seek") {
      setVideoState((prev) => ({
        ...prev,
        reference_position: payload.target_position,
        reference_timestamp: Date.now() / 1000,
      }));
    } else if (event === "sync:track_change") {
      setVideoState((prev) => ({
        ...prev,
        active_audio_track: payload.track_type === "audio" ? payload.track_id : prev.active_audio_track,
        active_subtitle_track: payload.track_type === "subtitle" ? payload.track_id : prev.active_subtitle_track,
      }));
    } else if (event === "sync:url_change") {
      setRoomSettings((prev) => ({ ...prev, stream_url: payload.stream_url }));
    } else if (event === "sync:media_mode_change") {
      setRoomSettings((prev) => ({
        ...prev,
        media_mode: payload.media_mode,
        web_url: payload.url || prev.web_url,
      }));
    } else if (event === "sync:web_navigate") {
      setWebState((prev) => ({ ...prev, current_url: payload.url }));
    } else if (event === "sync:web_scroll") {
      setWebState((prev) => ({
        ...prev,
        scroll_top_pct: payload.topPct,
        scroll_left_pct: payload.leftPct,
      }));
    } else if (event === "sync:web_cursor") {
      setRemoteCursor({ xPct: payload.xPct, yPct: payload.yPct, clientId: payload.client_id });
    } else if (event === "chat:message") {
      setChatMessages((prev) => [...prev, payload]);
    } else if (event === "room:knock") {
      setPendingKnock(payload);
    } else if (event === "webrtc:active_voice_peers") {
      handleActiveVoicePeers(payload.peers);
    } else if (event === "webrtc:offer") {
      handleOffer(payload);
    } else if (event === "webrtc:answer") {
      handleAnswer(payload);
    } else if (event === "webrtc:ice_candidate") {
      handleIceCandidate(payload);
    } else if (event === "telemetry:broadcast") {
      setRoomDiagnostics(payload);
    }
  };

  const { isConnected, sendMessage } = useWebSocket({
    roomId,
    clientId,
    token: sessionToken,
    onMessage: handleIncomingMessage,
  });

  const { clockOffset, rtt, handleTimePong } = useClockSync(sendMessage);

  const {
    isVoiceActive,
    isMuted,
    isSpeaking,
    joinVoice,
    leaveVoice,
    toggleMute,
    handleActiveVoicePeers,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerLeft,
  } = useVoiceMesh({
    clientId,
    sendMessage,
    onSpeakingChange: (speaking) => {
      setParticipants((prev) =>
        prev.map((p) => (p.client_id === clientId ? { ...p, is_speaking: speaking } : p))
      );
    },
  });

  // Submit telemetry pings
  useEffect(() => {
    if (!isConnected || !roomSettings.diagnostics_enabled) return;

    const interval = setInterval(() => {
      sendMessage({
        event: "telemetry:submit",
        payload: {
          websocket_rtt_ms: rtt,
          segment_download_mbps: localMetrics.downloadSpeedMbps,
          buffer_health_sec: localMetrics.bufferSec,
          dropped_frames: localMetrics.droppedFrames,
          sync_drift_ms: localMetrics.driftMs,
        },
        timestamp: Date.now() / 1000,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected, roomSettings.diagnostics_enabled, rtt, localMetrics, sendMessage]);

  // Update RTT in local metrics
  useEffect(() => {
    setLocalMetrics((prev) => ({ ...prev, rttMs: rtt }));
  }, [rtt]);

  // Room Join Action
  const handleJoin = async (displayName: string, pin?: string, targetRoomId?: string) => {
    const activeRoomId = targetRoomId || roomId;
    if (!activeRoomId || !clientId) return;

    if (activeRoomId !== roomId) {
      setRoomId(activeRoomId);
      window.history.pushState({}, "", `?room=${activeRoomId}`);
    }

    const res = await submitJoinRequest(activeRoomId, clientId, displayName, pin);

    if (res.status === "approved" && res.session_token) {
      setSessionToken(res.session_token);
      setIsHost(Boolean(res.is_host));
      if (res.host_token) setHostToken(res.host_token);
      setIsPendingApproval(false);
      setShowEntryModal(false);

      saveRoomSession({
        roomId: activeRoomId,
        clientId,
        sessionToken: res.session_token,
        hostToken: res.host_token,
        isHost: Boolean(res.is_host),
        displayName,
        savedAt: Date.now(),
      });
    } else if (res.status === "pending_approval") {
      setIsPendingApproval(true);
      // Poll knocking status as backup
      const pollInterval = setInterval(async () => {
        const check = await checkKnockStatus(activeRoomId, clientId);
        if (check.status === "approved") {
          clearInterval(pollInterval);
          setSessionToken(check.session_token);
          setIsPendingApproval(false);
          setShowEntryModal(false);
          saveRoomSession({
            roomId: activeRoomId,
            clientId,
            sessionToken: check.session_token,
            isHost: false,
            displayName,
            savedAt: Date.now(),
          });
        } else if (check.status === "rejected") {
          clearInterval(pollInterval);
          setIsPendingApproval(false);
          alert("The room host denied your entry request.");
        }
      }, 2500);
    }
  };

  // Room Create Action
  const handleCreate = async (params: {
    displayName: string;
    accessMode: "public" | "pin" | "approval";
    pin?: string;
    controlPolicy: "host_only" | "collaborative";
    mediaMode: "video_stream" | "web_page";
    streamUrl?: string;
    webUrl?: string;
    diagnosticsEnabled: boolean;
  }) => {
    const res = await createRoom({
      host_client_id: clientId,
      host_display_name: params.displayName,
      access_mode: params.accessMode,
      pin: params.pin,
      control_policy: params.controlPolicy,
      media_mode: params.mediaMode,
      stream_url: params.streamUrl,
      web_url: params.webUrl,
      diagnostics_enabled: params.diagnosticsEnabled,
    });

    setRoomId(res.room_id);
    setHostToken(res.host_token);
    setSessionToken(res.session_token);
    setIsHost(true);
    setRoomSettings(res.settings);
    setShowEntryModal(false);

    saveRoomSession({
      roomId: res.room_id,
      clientId,
      sessionToken: res.session_token,
      hostToken: res.host_token,
      isHost: true,
      displayName: params.displayName,
      savedAt: Date.now(),
    });

    // Update URL query string
    window.history.pushState({}, "", `?room=${res.room_id}`);
  };

  const handleSendChatMessage = (content: string) => {
    sendMessage({
      event: "chat:message",
      payload: { content },
      timestamp: Date.now() / 1000,
    });
  };

  const handleSendAction = (event: string, payload: any) => {
    sendMessage({
      event: event as any,
      payload,
      timestamp: Date.now() / 1000,
    });
  };

  const handleUpdateSettings = async (updated: Partial<RoomSettings>) => {
    if (!roomId || !hostToken) return;
    const res = await updateRoomSettings(roomId, hostToken, updated);
    setRoomSettings(res.settings);

    if (updated.stream_url !== undefined) {
      sendMessage({
        event: "sync:url_change",
        payload: { stream_url: updated.stream_url },
        timestamp: Date.now() / 1000,
      });
    }
    if (updated.media_mode !== undefined) {
      sendMessage({
        event: "sync:media_mode_change",
        payload: { media_mode: updated.media_mode, url: updated.web_url },
        timestamp: Date.now() / 1000,
      });
    }
  };

  const toggleFullscreen = () => {
    const container = mediaContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // If user is not yet connected to a session, show Landing Page or Room Entry
  if (!sessionToken) {
    return (
      <>
        {isPendingApproval ? (
          <RoomEntryModal
            roomId={roomId || undefined}
            metadata={metadata}
            onJoin={handleJoin}
            onCreate={handleCreate}
            isPendingApproval={true}
            onClose={() => {
              setIsPendingApproval(false);
              setRoomId(null);
              window.history.pushState({}, "", "/");
            }}
          />
        ) : roomId ? (
          <RoomEntryModal
            roomId={roomId}
            metadata={metadata}
            initialMode="join"
            onJoin={handleJoin}
            onCreate={handleCreate}
            onClose={() => {
              setRoomId(null);
              window.history.pushState({}, "", "/");
            }}
          />
        ) : (
          <>
            <LandingPage
              onOpenCreate={() => {
                setEntryModalMode("create");
                setShowEntryModal(true);
              }}
              onOpenJoin={(code) => {
                if (code) {
                  setRoomId(code);
                  window.history.pushState({}, "", `?room=${code}`);
                } else {
                  setEntryModalMode("join");
                  setShowEntryModal(true);
                }
              }}
            />

            {showEntryModal && (
              <RoomEntryModal
                initialMode={entryModalMode}
                onJoin={handleJoin}
                onCreate={handleCreate}
                onClose={() => setShowEntryModal(false)}
              />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className={styles.appContainer}>
      {/* Top Header - Netflix & Apple TV Design */}
      <header className={styles.topNav}>
        <div className={styles.brandGroup}>
          <div
            className={styles.brandLogo}
            onClick={() => {
              if (window.confirm("Leave current room and return to home page?")) {
                setSessionToken(null);
                setRoomId(null);
                window.history.pushState({}, "", "/");
              }
            }}
            title="Leave room and return to home page"
          >
            <div className={styles.brandIcon}>N</div>
            <span className={styles.brandTitle}>
              STREAM<span className={styles.brandTitleHighlight}>ROOM</span>
            </span>
          </div>

          {roomId && (
            <button
              className={styles.roomIdBadge}
              onClick={handleCopyRoomId}
              title="Click to copy Room Code"
            >
              {copiedId ? <Check size={12} color="#46d369" /> : <Copy size={12} />}
              <span>{copiedId ? "Copied!" : `ID: ${roomId}`}</span>
            </button>
          )}

          <div
            className={styles.roomIdBadge}
            style={{ cursor: "default", opacity: 0.9 }}
          >
            <Users size={12} color="#46d369" />
            <span>{participants.length} Active</span>
          </div>
        </div>

        <div className={styles.navControls}>
          {roomSettings.diagnostics_enabled && (
            <button
              className={`${styles.navButton} ${showDiagnosticsHUD ? styles.active : ""}`}
              onClick={() => setShowDiagnosticsHUD(!showDiagnosticsHUD)}
              title="Toggle Diagnostics HUD"
            >
              <Activity size={15} />
              <span>Diagnostics</span>
            </button>
          )}

          {roomId && (
            <button
              className={styles.navButton}
              onClick={() => setShowShareModal(true)}
              title="Share Room Link"
            >
              <Share2 size={15} />
              <span>Share</span>
            </button>
          )}

          {isHost && (
            <button
              className={styles.navButton}
              onClick={() => setShowSettingsModal(true)}
              title="Host Settings"
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          )}

          <button
            className={styles.navButton}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className={styles.mainLayout}>
        <div ref={mediaContainerRef} className={styles.mediaSection}>
          <div className={styles.playerArea}>
            {roomSettings.media_mode === "video_stream" ? (
              <UniversalMediaPlayer
                streamUrl={roomSettings.stream_url}
                playbackState={videoState}
                clockOffset={clockOffset}
                isHost={isHost}
                controlPolicy={roomSettings.control_policy}
                onSendAction={handleSendAction}
                onMetricsUpdate={(m) => setLocalMetrics((prev) => ({ ...prev, ...m }))}
                onOpenSettings={() => setShowSettingsModal(true)}
                isFullscreen={isFullscreen}
                isUserActive={isUserActive}
              />
            ) : (
              <SynchronizedWebBrowser
                webState={webState}
                isHost={isHost}
                controlPolicy={roomSettings.control_policy}
                onSendAction={handleSendAction}
                remoteCursor={remoteCursor}
              />
            )}

            {/* Diagnostics HUD Overlay */}
            {showDiagnosticsHUD && roomSettings.diagnostics_enabled && (
              <DiagnosticsHUD
                localMetrics={localMetrics}
                roomDiagnostics={roomDiagnostics}
                onClose={() => setShowDiagnosticsHUD(false)}
              />
            )}

            {/* Top Notification Banner (Visible to all, in normal & fullscreen) */}
            <TopNotificationBanner notification={latestJoinNotification} />

            {/* Host Knocking Notification (Mounted inside player area, visible in fullscreen!) */}
            {pendingKnock && isHost && (
              <KnockApprovalModal
                knock={pendingKnock}
                onDecide={(targetId, decision) => {
                  sendMessage({
                    event: "room:knock_decision",
                    payload: { client_id: targetId, decision },
                    timestamp: Date.now() / 1000,
                  });
                  setPendingKnock(null);
                }}
              />
            )}

            {/* Fullscreen Floating Voice Dock Over the Player */}
            {isFullscreen && (
              <VoiceController
                isVoiceActive={isVoiceActive}
                isMuted={isMuted}
                isSpeaking={isSpeaking}
                participants={participants}
                currentClientId={clientId}
                onJoinVoice={joinVoice}
                onLeaveVoice={leaveVoice}
                onToggleMute={toggleMute}
                isFullscreen={true}
                isUserActive={isUserActive}
              />
            )}

            {/* YouTube Live Overlay Chat in Fullscreen Mode */}
            {isFullscreen && (
              <ChatContainer
                messages={chatMessages}
                onSendMessage={handleSendChatMessage}
                isFullscreen={true}
                currentClientId={clientId}
                isUserActive={isUserActive}
              />
            )}
          </div>

          {/* Docked Voice Mesh Controller Bar in Windowed Mode */}
          {!isFullscreen && (
            <VoiceController
              isVoiceActive={isVoiceActive}
              isMuted={isMuted}
              isSpeaking={isSpeaking}
              participants={participants}
              currentClientId={clientId}
              onJoinVoice={joinVoice}
              onLeaveVoice={leaveVoice}
              onToggleMute={toggleMute}
              isFullscreen={false}
              isUserActive={true}
            />
          )}
        </div>

        {/* Docked Right Chat in Windowed Mode */}
        {!isFullscreen && (
          <ChatContainer
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            isFullscreen={false}
            currentClientId={clientId}
          />
        )}
      </div>

      {/* Host Settings Modal */}
      {showSettingsModal && (
        <HostSettingsModal
          settings={roomSettings}
          onUpdate={handleUpdateSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && roomId && (
        <ShareModal roomId={roomId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
};

export default App;
