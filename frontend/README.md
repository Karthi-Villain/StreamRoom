# 🖥️ StreamRoom — Frontend Client

[![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg?style=flat-square&logo=React&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg?style=flat-square&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg?style=flat-square&logo=Vite&logoColor=white)](https://vitejs.dev)
[![HLS.js](https://img.shields.io/badge/HLS.js-1.5.8-E50914.svg?style=flat-square)](https://github.com/video-dev/hls.js)
[![Dash.js](https://img.shields.io/badge/Dash.js-4.7.4-0071EB.svg?style=flat-square)](https://github.com/Dash-Industry-Forum/dash.js)

The **StreamRoom Frontend** is a high-performance web client built with React 18, TypeScript, and Vite. It implements studio-grade synchronized video playback, decentralized WebRTC voice mesh channels, and a responsive Netflix Obsidian & Apple TV frosted-glass interface.

---

## 🎨 Design System & Aesthetics

The UI implements a curated design system defined in `src/styles/tokens.css` and `src/styles/global.css`:

- **Color Palette:**
  - Base Obsidian: `#141414` (Netflix background standard)
  - Elevated Surface: `#181818` with subtle 1px white borders (`rgba(255, 255, 255, 0.08)`)
  - Accent Crimson: `#E50914` with radiant box-shadow glows
  - Status Emerald: `#46d369` (Voice activity & live connection indicators)
- **Glassmorphism:** Apple TV-inspired frosted overlays (`rgba(16, 16, 16, 0.72)`) utilizing hardware-accelerated `backdrop-filter: blur(20px) saturate(180%)`.
- **Inactivity Fade:** Automatic 7-second user inactivity detection in fullscreen mode fades video controls, voice pills, and chat overlays into the background, waking immediately on mouse movement or screen touch.

---

## ⚛️ Component Hierarchy

```text
src/
├── components/
│   ├── chat/
│   │   ├── ChatContainer.tsx     # YouTube Live-style chat with deterministic avatars
│   │   └── Chat.module.css       # Mobile portrait docking & fullscreen overlay styles
│   ├── diagnostics/
│   │   ├── DiagnosticsHUD.tsx    # Live telemetry HUD (Mbps, RTT, buffer health, drift)
│   │   └── Diagnostics.module.css
│   ├── landing/
│   │   ├── LandingPage.tsx       # Comprehensive overview, features, FAQ, and CTAs
│   │   ├── LandingPage.module.css
│   │   ├── TextParticleCanvas.tsx# 2D canvas with mouse-repulsion vector physics
│   │   └── PreviewShowcase.tsx   # Interactive live demo preview
│   ├── modals/
│   │   ├── RoomEntryModal.tsx    # Public / PIN / Knock entry flow
│   │   ├── HostSettingsModal.tsx # Host authority and media mode selector
│   │   ├── KnockApprovalModal.tsx# Floating host approval dialog over player
│   │   ├── ShareModal.tsx        # 1-click room link and code sharing
│   │   └── Modal.module.css      # Responsive modal styling with scroll containment
│   ├── notifications/
│   │   └── TopNotificationBanner.tsx # Top pill toast when users join the room
│   ├── player/
│   │   ├── UniversalMediaPlayer.tsx  # HLS.js, Dash.js, and HTML5 video engine
│   │   ├── SynchronizedWebBrowser.tsx# Co-browsing with live cursor broadcasting
│   │   └── Player.module.css         # Netflix audio track panel & seekbar
│   └── voice/
│       ├── VoiceController.tsx   # WebRTC audio mesh bar & fullscreen avatar dock
│       └── Voice.module.css
├── hooks/
│   ├── useClockSync.ts           # NTP-style clock offset calculation
│   ├── useVideoSync.ts           # Leader-follower synchronization engine
│   ├── useVoiceMesh.ts           # WebRTC RTCPeerConnection audio mesh manager
│   ├── useWebSocket.ts           # WebSocket connection & auto-reconnect
│   └── useShare.ts               # Clipboard & native Web Share API
├── services/
│   ├── apiClient.ts              # REST client for room management
│   ├── sessionStore.ts           # Persistent session recovery in localStorage
│   └── fingerprintEngine.ts      # Hardware-agnostic stable client GUID generator
└── types/
    ├── room.ts                   # Room metadata, playback state, and settings
    ├── websocket.ts              # WebSocket event payloads
    └── diagnostics.ts            # Network diagnostics metrics
```

---

## ⚡ Video Engine & Audio Track Switching

The `UniversalMediaPlayer` component dynamically binds to the media source based on URL extension:

1. **HLS (`.m3u8`):** Instantiates `Hls.js` with ultra-tight low-latency buffers (`maxBufferLength: 4`, `liveSyncDurationCount: 1`) to eliminate standard 15-20s synchronization latency.
2. **MPEG-DASH (`.mpd`):** Initializes `dashjs.MediaPlayer` with Media Source Extensions.
3. **Netflix Track Selection Menu:**
   - Tracks are dynamically enumerated via `hls.audioTracks` and `dash.getTracksFor("audio")`.
   - Users can select alternative audio streams (e.g. Spanish, 5.1 Surround) without interrupting video playback.
   - Subtitle tracks are parsed from WebVTT/CEA-608 embedded streams and selectable on the fly.
4. **HTML5 Fallback:** For browsers supporting `video.audioTracks`, native track enabling is handled automatically.

---

## 💫 Interactive Text Particle Physics Engine

The `TextParticleCanvas` renders the **"STREAM ROOM"** banner using an interactive HTML5 2D Canvas:

- **Particle Sampling:** Renders the text to an offscreen buffer, rasterizes pixels, and spawns particles on an adaptive grid step (`step = 3 * dpr` on mobile, `4 * dpr` on desktop).
- **Repulsion Physics:**
  $$\vec{F} = \frac{R_{\text{mouse}} - d}{R_{\text{mouse}}} \cdot \text{magnitude}$$
  When the user's cursor or finger approaches a particle, an angular repulsion vector accelerates the particle away.
- **Spring Restoration:** Elastic damping forces ($\text{friction} = 0.88, \text{ease} = 0.09$) smoothly pull particles back to their exact typographical coordinates.
- **Retina Crispness:** Automatically scales by `window.devicePixelRatio` for 4K and mobile displays.

---

## 📱 Mobile Responsiveness

The interface adapts across all viewport form factors:

- **Desktop (>= 900px):** Two-column layout with 16:9 video player on the left, voice dock below the player, and YouTube Live-style chat pinned to the right.
- **Mobile Portrait (<= 900px):** Single-column layout matching the YouTube Mobile app experience:
  - Video player is fixed at the top (16:9 ratio).
  - Compact voice channel bar sits directly below.
  - Live chat fills the entire lower viewport with the message input field anchored cleanly at the bottom.
- **Small Screens (<= 600px):** Modals enable internal scroll containment (`max-height: calc(100dvh - 20px)`), navbar buttons switch to icon-only pills, and fullscreen voice docks condense to circular avatar bubbles.

---

## 🛠️ Scripts & Commands

```bash
# Install dependencies
npm install

# Start Vite local development server
npm run dev

# Run TypeScript typecheck and build production bundle
npm run build

# Preview production build locally
npm run preview
```
