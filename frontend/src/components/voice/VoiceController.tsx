import React, { useMemo } from "react";
import { Mic, MicOff, Headphones, PhoneOff } from "lucide-react";
import { Participant } from "../../types/room";
import styles from "./Voice.module.css";

interface VoiceControllerProps {
  isVoiceActive: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  participants: Participant[];
  currentClientId: string;
  onJoinVoice: (startMuted?: boolean) => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  isFullscreen?: boolean;
  isUserActive?: boolean;
}

const AVATAR_COLORS = [
  "#E50914",
  "#0071eb",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#e91e63",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export const VoiceController: React.FC<VoiceControllerProps> = ({
  isVoiceActive,
  isMuted,
  isSpeaking,
  participants,
  currentClientId,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  isFullscreen = false,
  isUserActive = true,
}) => {
  const voiceParticipants = useMemo(
    () => participants.filter((p) => p.is_voice_active),
    [participants]
  );

  const countText = useMemo(() => {
    if (voiceParticipants.length === 0) return "0 Connected";
    if (voiceParticipants.length === 1) return "1 Connected";
    return `${voiceParticipants.length} Connected`;
  }, [voiceParticipants.length]);

  const containerClass = isFullscreen
    ? `${styles.fullscreenVoiceBar} ${!isUserActive ? styles.fadedOut : ""}`
    : styles.voiceBar;

  // In Fullscreen Mode: Only show avatar bubbles and action buttons (no long dialogue box)
  if (isFullscreen) {
    return (
      <div className={containerClass}>
        {voiceParticipants.length > 0 && (
          <div className={styles.participantsList}>
            {voiceParticipants.map((p) => {
              const speaking =
                p.client_id === currentClientId ? isSpeaking : p.is_speaking;
              const isSelf = p.client_id === currentClientId;
              const avatarBg = getAvatarColor(p.display_name);

              return (
                <div
                  key={p.client_id}
                  className={`${styles.avatarBubble} ${speaking ? styles.speaking : ""}`}
                  title={`${p.display_name}${isSelf ? " (You)" : ""}${speaking ? " • Speaking" : ""}`}
                >
                  <div
                    className={styles.avatarCircle}
                    style={{ backgroundColor: avatarBg }}
                  >
                    {p.display_name.charAt(0).toUpperCase()}
                    {isSelf && isMuted && (
                      <div className={styles.muteMiniBadge}>
                        <MicOff size={8} color="#ffffff" />
                      </div>
                    )}
                  </div>
                  <span>{p.display_name}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.controlsGroup}>
          {isVoiceActive ? (
            <>
              <button
                className={`${styles.actionBtn} ${styles.muteBtn} ${isMuted ? styles.muted : ""}`}
                onClick={onToggleMute}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone (Listen Only)"}
              >
                {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                <span>{isMuted ? "Muted" : "Active"}</span>
              </button>

              <button
                className={`${styles.actionBtn} ${styles.leaveBtn}`}
                onClick={onLeaveVoice}
                title="Disconnect"
              >
                <PhoneOff size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                className={`${styles.actionBtn} ${styles.listenBtn}`}
                onClick={() => onJoinVoice(true)}
                title="Listen to others without microphone"
              >
                <Headphones size={13} />
                <span>Listen</span>
              </button>

              <button
                className={`${styles.actionBtn} ${styles.joinBtn}`}
                onClick={() => onJoinVoice(false)}
                title="Join Voice with Microphone"
              >
                <Mic size={13} />
                <span>Join</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Standard Docked Mode (Windowed Desktop & Mobile Portrait)
  return (
    <div className={containerClass}>
      <div className={styles.voiceInfoGroup}>
        <div className={styles.voiceChannelTitle}>
          <div
            className={`${styles.channelIconWrap} ${
              voiceParticipants.length > 0 ? styles.hasActivePeers : ""
            }`}
          >
            <Headphones size={15} />
          </div>
          <div className={styles.channelTextGroup}>
            <span className={styles.channelHeading}>Voice Room</span>
            <span className={styles.channelCountBadge}>{countText}</span>
          </div>
        </div>

        <div className={styles.participantsList}>
          {voiceParticipants.length === 0 ? (
            <span className={styles.emptyVoiceText}>
              Voice channel is quiet. Join to chat with room members.
            </span>
          ) : (
            voiceParticipants.map((p) => {
              const speaking =
                p.client_id === currentClientId ? isSpeaking : p.is_speaking;
              const isSelf = p.client_id === currentClientId;
              const avatarBg = getAvatarColor(p.display_name);

              return (
                <div
                  key={p.client_id}
                  className={`${styles.avatarBubble} ${speaking ? styles.speaking : ""}`}
                  title={`${p.display_name}${isSelf ? " (You)" : ""}${speaking ? " • Speaking" : ""}`}
                >
                  <div
                    className={styles.avatarCircle}
                    style={{ backgroundColor: avatarBg }}
                  >
                    {p.display_name.charAt(0).toUpperCase()}
                    {isSelf && isMuted && (
                      <div className={styles.muteMiniBadge}>
                        <MicOff size={8} color="#ffffff" />
                      </div>
                    )}
                  </div>
                  <span>
                    {p.display_name}
                    {isSelf && " (You)"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.controlsGroup}>
        {isVoiceActive ? (
          <>
            <button
              className={`${styles.actionBtn} ${styles.muteBtn} ${isMuted ? styles.muted : ""}`}
              onClick={onToggleMute}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone (Listen Only)"}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isMuted ? "Muted (Listening)" : "Mic Active"}</span>
            </button>

            <button
              className={`${styles.actionBtn} ${styles.leaveBtn}`}
              onClick={onLeaveVoice}
              title="Disconnect from Voice"
            >
              <PhoneOff size={14} />
              <span>Leave</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`${styles.actionBtn} ${styles.listenBtn}`}
              onClick={() => onJoinVoice(true)}
              title="Join with microphone muted to listen to others"
            >
              <Headphones size={14} />
              <span>Listen Only</span>
            </button>

            <button
              className={`${styles.actionBtn} ${styles.joinBtn}`}
              onClick={() => onJoinVoice(false)}
              title="Join Voice with Microphone"
            >
              <Mic size={14} />
              <span>Join Voice</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
