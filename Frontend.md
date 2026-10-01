# Frontend Technical Specification (React SPA)

## 1. Technology Stack and Architecture

- Core Framework: React 18.3+ with TypeScript 5.4+
- Build Tool: Vite 5.2+
- Styling: Pure CSS Modules with Custom Properties (Design Tokens), zero external CSS utility frameworks to guarantee maximum rendering control
- Video Player Engine: Video.js 8.10+ coupled with `@videojs/http-streaming` (VHS), `dashjs`, and custom React controller wrapper
- Real-Time Communication: Native browser `WebSocket` API and `RTCPeerConnection` for WebRTC mesh voice
- Audio Analysis: Web Audio API (`AudioContext`, `AnalyserNode`) for real-time speech energy detection
- Device Fingerprinting: Custom Adaptive Browser Fingerprint Provider using Canvas 2D, WebGL vendor extraction, and AudioContext frequency response with IndexedDB and LocalStorage fallback persistence

---

## 2. Directory and Component Structure

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles/
    │   ├── tokens.css
    │   ├── reset.css
    │   └── global.css
    ├── components/
    │   ├── player/
    │   │   ├── VideoPlayerWrapper.tsx
    │   │   ├── VideoControls.tsx
    │   │   ├── VideoPlayer.module.css
    │   │   └── useVideoSync.ts
    │   ├── chat/
    │   │   ├── ChatContainer.tsx
    │   │   ├── ChatOverlay.tsx
    │   │   ├── ChatMessageItem.tsx
    │   │   ├── ChatInput.tsx
    │   │   └── Chat.module.css
    │   ├── voice/
    │   │   ├── VoiceController.tsx
    │   │   ├── VoiceParticipantBadge.tsx
    │   │   ├── Voice.module.css
    │   │   └── useVoiceMesh.ts
    │   ├── diagnostics/
    │   │   ├── DiagnosticsHUD.tsx
    │   │   ├── DiagnosticsGauge.tsx
    │   │   └── Diagnostics.module.css
    │   ├── modals/
    │   │   ├── RoomEntryModal.tsx
    │   │   ├── HostSettingsModal.tsx
    │   │   ├── KnockApprovalModal.tsx
    │   │   └── ShareModal.tsx
    │   └── common/
    │       ├── Button.tsx
    │       └── Input.tsx
    ├── hooks/
    │   ├── useWebSocket.ts
    │   ├── useClockSync.ts
    │   ├── useShare.ts
    │   └── useAdaptiveFingerprint.ts
    ├── services/
    │   ├── apiClient.ts
    │   ├── fingerprintEngine.ts
    │   └── mediaFormatDetector.ts
    └── types/
        ├── room.ts
        ├── websocket.ts
        └── diagnostics.ts
```

---

## 3. Persistent Adaptive Browser Fingerprinting Engine

To identify users consistently without requiring login accounts or third-party tracking cookies, the frontend uses an adaptive fingerprinting module that samples hardware and rendering pipeline properties.

Implementation: `src/services/fingerprintEngine.ts`

```typescript
export async function getPersistentBrowserId(): Promise<string> {
  const STORAGE_KEY = "streamroom_client_guid";

  // Check LocalStorage and IndexedDB first
  const existingLocal = localStorage.getItem(STORAGE_KEY);
  if (existingLocal) {
    return existingLocal;
  }

  // Generate hardware and rendering entropy
  const canvasHash = getCanvasFingerprint();
  const webglHash = getWebGLFingerprint();
  const audioHash = await getAudioFingerprint();
  const screenMetrics = `${screen.colorDepth}_${screen.width}x${screen.height}`;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;

  const rawEntropy = `${canvasHash}::${webglHash}::${audioHash}::${screenMetrics}::${hardwareConcurrency}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawEntropy));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const deterministicGuid = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32);

  localStorage.setItem(STORAGE_KEY, deterministicGuid);
  return deterministicGuid;
}

function getCanvasFingerprint(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 50;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "nocanvas";

  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial', sans-serif";
  ctx.fillStyle = "#f60";
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("StreamSyncRoom, id=102!", 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText("StreamSyncRoom, id=102!", 4, 17);

  return canvas.toDataURL().slice(-50);
}

function getWebGLFingerprint(): string {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) return "nowebgl";
  const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) return "nodebug";
  const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
  const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return `${vendor}~${renderer}`;
}

async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const compressor = audioCtx.createDynamicsCompressor();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);

    compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.reduction.setValueAtTime(-20, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    oscillator.connect(compressor);
    compressor.connect(audioCtx.destination);
    oscillator.start(0);

    const fingerprint = `${compressor.reduction.value.toFixed(4)}`;
    oscillator.stop(0.1);
    await audioCtx.close();
    return fingerprint;
  } catch {
    return "noaudio";
  }
}
```

---

## 4. Universal Video Player Wrapper and Synchronization

### 4.1 Player Shell Architecture

The player supports direct MP4/WebM files, HLS manifests (`.m3u8`), and DASH manifests (`.mpd`). It integrates Hls.js directly when supported natively or through MSE, falling back to Video.js VHS.

Features:
- Track Management: Enumerates text tracks (`kind="subtitles"` or `kind="captions"`) and audio tracks (`videoElement.audioTracks`).
- Codec Compatibility: Supports HEVC, AV1, VP9, and H.264 formats natively provided by host browsers.
- Control Authority Filter: If `control_policy === 'host_only'` and the user is not the host, native control interactions (click to pause, progress bar click, keyboard shortcuts) are intercepted and prevented, rendering a small notification badge stating "Controls locked by host".

### 4.2 Smooth Drift Synchronization Hook (`useVideoSync`)

```typescript
import { useEffect, useRef } from "react";
import { VideoPlaybackState, ControlPolicy } from "../types/room";

interface VideoSyncProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  playbackState: VideoPlaybackState;
  clockOffset: number; // Server time minus client time
  isHost: boolean;
  controlPolicy: ControlPolicy;
  onSendAction: (action: string, payload: any) => void;
}

export function useVideoSync({
  videoRef,
  playbackState,
  clockOffset,
  isHost,
  controlPolicy,
  onSendAction,
}: VideoSyncProps) {
  const isInternalUpdate = useRef(false);

  // Apply authoritative server state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const nowServerTime = (Date.now() / 1000) + clockOffset;
    let targetPosition = playbackState.reference_position;

    if (playbackState.status === "playing") {
      const elapsed = nowServerTime - playbackState.reference_timestamp;
      targetPosition += elapsed * playbackState.playback_rate;
    }

    const currentPosition = video.currentTime;
    const drift = Math.abs(currentPosition - targetPosition);

    isInternalUpdate.current = true;

    // Track status adjustment
    if (playbackState.status === "playing" && video.paused) {
      video.play().catch(() => {});
    } else if (playbackState.status === "paused" && !video.paused) {
      video.pause();
    }

    // Drift correction
    if (drift > 1.5) {
      // Hard seek for large drift
      video.currentTime = targetPosition;
    } else if (drift > 0.25) {
      // Soft drift compensation: nudge playback rate
      if (currentPosition < targetPosition) {
        video.playbackRate = 1.05;
      } else {
        video.playbackRate = 0.95;
      }
    } else {
      video.playbackRate = playbackState.playback_rate;
    }

    setTimeout(() => {
      isInternalUpdate.current = false;
    }, 200);
  }, [playbackState, clockOffset]);

  // Intercept user-initiated player actions
  const handleUserPlay = () => {
    if (isInternalUpdate.current) return;
    if (controlPolicy === "host_only" && !isHost) return;
    onSendAction("sync:play", {
      position: videoRef.current?.currentTime || 0,
      playback_rate: 1.0,
    });
  };

  const handleUserPause = () => {
    if (isInternalUpdate.current) return;
    if (controlPolicy === "host_only" && !isHost) return;
    onSendAction("sync:pause", {
      position: videoRef.current?.currentTime || 0,
    });
  };

  const handleUserSeek = (time: number) => {
    if (isInternalUpdate.current) return;
    if (controlPolicy === "host_only" && !isHost) return;
    onSendAction("sync:seek", {
      target_position: time,
    });
  };

  return { handleUserPlay, handleUserPause, handleUserSeek };
}
```

---

## 5. Dual-Mode Chat System

The chat system renders dynamically based on the current window and full-screen state.

### 5.1 Standard Mode (Windowed View)

- Layout: Side-by-side flexbox or CSS Grid.
- Video Container: Width: 85% (responsive down to 80% or mobile stacked view).
- Chat Container: Width: 15% (min-width: 280px on desktop), docked to the right edge.
- Background: Opaque dark slate (`#0d1117`), scrollable message list with autoscroll pinning to bottom.

### 5.2 Full-Screen Mode (Floating Overlay)

- Layout: Absolute positioned overlay on top of the `<video>` element inside the full-screen container (`:fullscreen` CSS pseudo-class).
- Visual Aesthetics: YouTube Live comments style.
  - Zero opaque background on the container (`background: transparent`).
  - Messages hover gracefully over the bottom-left or bottom-right quadrant of the streaming video.
  - Message bubble background: `rgba(0, 0, 0, 0.45)` with `backdrop-filter: blur(8px)`, rounded corners, and crisp white typography with subtle drop shadow for maximum readability over varied video content.
  - Maximum height: 40% of the screen height, scrolling smoothly.
  - Message fade: Messages smoothly fade out after 10 seconds unless the user hovers over the chat area.
  - Floating minimal input bar that appears on mouse move or keypress (`Enter`), disappearing when idle.

CSS Module Implementation (`src/components/chat/Chat.module.css`):

```css
/* Standard Desktop Docked Chat */
.standardChat {
  width: 15%;
  min-width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface-base);
  border-left: 1px solid var(--color-border-subtle);
}

/* Fullscreen YouTube Live Overlay Style */
.overlayChat {
  position: absolute;
  bottom: 80px;
  left: 24px;
  width: 380px;
  max-height: 45vh;
  display: flex;
  flex-direction: column;
  background: transparent !important;
  pointer-events: none;
  z-index: 100;
  overflow: hidden;
}

.overlayMessageList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  pointer-events: auto;
  scrollbar-width: none;
}

.overlayMessageItem {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 16px;
  background: rgba(13, 17, 23, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #ffffff;
  font-size: 13.5px;
  line-height: 1.4;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  animation: fadeInMessage 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInMessage {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 6. WebRTC Voice Mesh Engine

`useVoiceMesh` hook:
- Manages an array of `RTCPeerConnection` objects keyed by participant `client_id`.
- Automatically configures Google STUN servers (`stun:stun.l.google.com:19302`).
- Captures microphone input with echo cancellation and auto-gain:
  `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
- Analyzes speech volume using an `AudioContext` and `AnalyserNode`:
  Computes the volume energy metric. When the volume exceeds the active speech threshold, broadcasts a speaking flag or renders an animated halo ring around the user avatar.

---

## 7. Diagnostics and Stream Telemetry HUD

When `roomSettings.diagnostics_enabled` is true:
- A collapsible Diagnostics HUD can be toggled via a dedicated top-bar control.
- Displays the following metrics in real time:
  1. Stream Network Speed: Measured in Mbps from HLS chunk download duration and byte size.
  2. WebSocket RTT: Round trip ping in milliseconds.
  3. WebRTC Audio RTT & Packet Loss: Sourced from `peerConnection.getStats()`.
  4. Video Buffer Health: Forward buffered timeline length in seconds.
  5. Playback Drift: Local video playhead deviation from server master clock in milliseconds.
  6. Dropped Frames: Calculated via `video.getVideoPlaybackQuality().droppedVideoFrames`.
- Displays room-wide telemetry table for all connected participants, allowing the host to diagnose playback issues experienced by specific viewers.

---

## 8. Web Share and Native Interoperability

The Share Component enables one-touch distribution of the 12-character room link directly into system applications:

```typescript
export async function shareRoom(roomId: string, roomTitle: string): Promise<boolean> {
  const shareUrl = `${window.location.origin}/watch/${roomId}`;
  const shareData = {
    title: roomTitle || "Watch Stream Together",
    text: `Join my live streaming room with synchronized playback and voice chat! Room ID: ${roomId}`,
    url: shareUrl,
  };

  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      return true;
    } catch {
      // User cancelled or share dismissed
      return false;
    }
  } else {
    // Fallback to clipboard copy
    await navigator.clipboard.writeText(shareUrl);
    return false;
  }
}
```
