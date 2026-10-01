import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, MessageSquare } from "lucide-react";
import { ChatMessage } from "../../types/websocket";
import styles from "./Chat.module.css";

interface ChatContainerProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isFullscreen: boolean;
  currentClientId?: string;
  isUserActive?: boolean;
}

const AVATAR_COLORS = [
  "#E50914", // Netflix Red
  "#0071eb", // Blue
  "#2ecc71", // Emerald
  "#f1c40f", // Gold
  "#9b59b6", // Purple
  "#1abc9c", // Teal
  "#e67e22", // Orange
  "#e91e63", // Pink
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function formatChatTime(timestamp?: number): string {
  if (!timestamp) return "";
  // Check if timestamp is in seconds or milliseconds
  const date = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  onSendMessage,
  isFullscreen,
  currentClientId,
  isUserActive = true,
}) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  const messageCountLabel = useMemo(() => {
    if (messages.length === 0) return "0";
    if (messages.length > 99) return "99+";
    return String(messages.length);
  }, [messages.length]);

  if (isFullscreen) {
    return (
      <div className={`${styles.overlayContainer} ${!isUserActive ? styles.fadedOut : ""}`}>
        <div className={styles.overlayMessagesList}>
          {messages.slice(-7).map((msg) => {
            const isSelf = currentClientId && msg.sender_client_id === currentClientId;
            const avatarColor = getAvatarColor(msg.sender_name);
            return (
              <div key={msg.id} className={styles.overlayBubble}>
                <div
                  className={styles.avatarCircle}
                  style={{ backgroundColor: avatarColor, width: 22, height: 22, fontSize: 10 }}
                >
                  {msg.sender_name.charAt(0).toUpperCase()}
                </div>
                <span
                  className={styles.senderName}
                  style={{
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <span>{msg.sender_name}</span>
                  {msg.is_host && <span className={styles.hostBadge}>HOST</span>}
                  {isSelf && <span className={styles.youBadge}>YOU</span>}
                  <span>:</span>
                </span>
                <span className={styles.messageText}>{msg.content}</span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.overlayInputWrapper}>
          <form onSubmit={handleSubmit} className={styles.chatForm}>
            <input
              type="text"
              className={styles.chatInput}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send live chat message..."
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!inputText.trim()}
              title="Send Message"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dockedContainer}>
      <div className={styles.dockedHeader}>
        <div className={styles.headerTitleGroup}>
          <span className={styles.liveBadge}>
            <span className={styles.livePulseDot} />
            LIVE
          </span>
          <span className={styles.headerTitle}>Live Chat</span>
        </div>
        <span className={styles.msgCountBadge}>{messageCountLabel}</span>
      </div>

      <div className={styles.messagesList}>
        {messages.length === 0 ? (
          <div className={styles.emptyChatState}>
            <MessageSquare size={28} color="#444444" />
            <span>No messages yet. Say hello to everyone!</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = Boolean(currentClientId && msg.sender_client_id === currentClientId);
            const avatarColor = getAvatarColor(msg.sender_name);
            return (
              <div
                key={msg.id}
                className={`${styles.chatRow} ${isSelf ? styles.isSelf : ""}`}
              >
                <div
                  className={styles.avatarCircle}
                  style={{ backgroundColor: avatarColor }}
                >
                  {msg.sender_name.charAt(0).toUpperCase()}
                </div>

                <div className={styles.messageBody}>
                  <div className={styles.messageHeader}>
                    <span className={styles.senderName}>{msg.sender_name}</span>
                    {msg.is_host && <span className={styles.hostBadge}>HOST</span>}
                    {isSelf && <span className={styles.youBadge}>YOU</span>}
                    <span className={styles.timestamp}>{formatChatTime(msg.sent_at)}</span>
                  </div>
                  <div className={styles.messageText}>{msg.content}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.dockedInputWrapper}>
        <form onSubmit={handleSubmit} className={styles.chatForm}>
          <input
            type="text"
            className={styles.chatInput}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message to the room..."
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!inputText.trim()}
            title="Send Message"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
};
