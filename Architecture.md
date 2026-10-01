# System Architecture Specification

## 1. System Overview

The Synchronized Streaming Room is a distributed, low-latency collaboration platform that enables multiple participants to watch streaming media together, communicate via real-time text chat, and converse over low-latency voice channels. 

A core architectural principle of this system is separation of media transport: the backend server never proxies, decodes, or relays the high-bandwidth video stream. The video stream is fetched directly by each client browser from third-party media endpoints, Content Delivery Networks (CDNs), HTTP Live Streaming (HLS) manifests (.m3u8), or Dynamic Adaptive Streaming over HTTP (MPEG-DASH) manifests (.mpd). The backend server is solely responsible for orchestrating room lifecycle, enforcing access policies, routing real-time WebSockets messages, clock synchronization, WebRTC voice signaling, and telemetry aggregation.

### Architectural Principles

1. Zero-Relay Video Architecture: All video frames travel directly between the client browser and the media origin server. Backend resources are preserved for event routing and signaling.
2. Centralized State Machine with Virtual Master Clock: The backend maintains the authoritative virtual playback timeline. All client players continuously synchronize against this timeline using monotonic timestamps.
3. Direct Peer-to-Peer Voice Mesh: Audio streams are negotiated using WebRTC via WebSocket signaling, eliminating audio transcoding and relay costs on the primary API server.
4. Resilient Browser Fingerprinting: Client machines are identified across sessions and operating systems using an adaptive browser wrapper that computes a stable device hash without relying solely on volatile cookies.

---

## 2. Component Architecture

The platform consists of two primary subsystems: the FastAPI Backend Application and the React Single Page Application (SPA).

### 2.1 Backend Subsystem (FastAPI)

The backend runs as an asynchronous ASGI application powered by Uvicorn.

Components:
- Room Lifecycle Manager: Generates 12-character cryptographically random room identifiers, maintains room settings, and handles room destruction upon abandonment.
- Authentication & Gatekeeper Service: Implements three gatekeeping strategies: open access, PIN challenge (argon2id hash comparison), and host approval queue (knocking protocol).
- WebSocket Multiplexer: Manages client connection pools mapped by room ID. Handles client keep-alives, connection drops, and selective message multicasting.
- Playback Synchronization Engine: Maintains the room playback state (target URL, playback state, seek offset, reference timestamp, active tracks). Resolves playback drift using monotonic reference clocks.
- WebRTC Signaling Hub: Relays Session Description Protocol (SDP) offers, answers, and Interactive Connectivity Establishment (ICE) candidate exchange between peers in a room.
- Telemetry & Diagnostics Aggregator: Ingests telemetry metrics (Round Trip Time, packet loss, player buffer length, segment download speed, playback drift), computes aggregate room health, and streams metrics to authorized participants.

### 2.2 Frontend Subsystem (React SPA)

The frontend is a modular, high-performance web application constructed with React and TypeScript.

Components:
- Universal Video Player Shell: An extensible player layer built on top of Video.js, Hls.js, and Dash.js engines capable of handling MP4, WebM, HLS, and DASH streams with multi-audio and WebVTT subtitle switching.
- Adaptive Identity Provider: A client fingerprinting service that evaluates browser platform metrics, canvas rendering traits, WebGL hardware parameters, and hardware concurrency, persisting a seed inside persistent storage to maintain an unalterable client ID.
- Synchronization Controller: Observes local video player events (play, pause, seek, ratechange) and translates them into network messages, while applying authoritative server updates with drift-smoothing algorithms to eliminate visible stuttering.
- Reactive Chat Overlay System: A dual-mode chat component that functions as a right-hand 15% sidebar in standard desktop view, and transforms into a transparent, hardware-accelerated floating text overlay during full-screen playback.
- WebRTC Voice Chat Engine: Manages browser audio capture, echo cancellation, peer-to-peer connection pooling, active speaker detection using Web Audio API AnalyserNodes, and gain control.
- System Diagnostics HUD: A collapsible diagnostics overlay displaying network latency, video download throughput, client buffer health, and synchronization delta in real time.
- Web Share Integration: Native system integration utilizing the Web Share API with clipboard fallback for instantaneous room distribution across messaging and social platforms.

---

## 3. Room Lifecycle and Access Control

### 3.1 Room ID Construction

Room identifiers are generated using a cryptographically secure pseudo-random number generator (CSPRNG). The ID is exactly 12 characters long and uses the URL-safe base62 character set:
`[a-zA-Z0-9]`

Total combinations: 62^12 = 3,226,266,762,397,899,821,056 (3.22 x 10^21). This space guarantees collision resistance without sequential enumeration vulnerabilities.

### 3.2 Security and Gatekeeping Strategies

Rooms support three independent access configurations selected at creation and modifiable at any time by the host:

1. Public Open Access: Any visitor possessing the 12-character URL enters the room immediately after submitting a display name.
2. PIN-Protected Access: The room creation payload includes a numeric or alphanumeric secret. The backend stores the hashed secret using argon2id. Visitors must provide the matching PIN before the WebSocket session token is granted.
3. Host Approval (Knocking Queue):
   - Visitors submit their display name and unique client identifier to request entry.
   - The backend holds the request in a pending state and sends a notification event to the host client.
   - The host interface displays a prompt allowing the host to accept or reject the user.
   - Upon acceptance, the visitor client receives an authorized session ticket and connects to the room WebSocket.

### 3.3 Dynamic Room Configuration

The room host maintains privileged control. The host can adjust any of the following parameters at runtime without destroying the room or disconnecting active viewers:
- Change video stream URL.
- Toggle control authority: Host-Only Controls versus Collaborative Controls (where any participant can play, pause, or seek).
- Toggle room privacy and update the access PIN.
- Enable or disable the participant network diagnostics panel.
- Mute or kick disruptive participants.

---

## 4. Playback Synchronization Protocol

Synchronizing video playback across diverse internet connections requires compensating for network latency and browser rendering jitter without triggering infinite feedback loops.

### 4.1 Master Timeline Mechanics

The server tracks playback state with five core variables:
- `stream_url`: The URI of the media source.
- `playback_state`: Enumerated value (`PLAYING`, `PAUSED`, `BUFFERING`).
- `reference_position`: Playback position in seconds relative to the start of the media.
- `reference_timestamp`: High-precision monotonic UTC timestamp recorded when `reference_position` was captured.
- `playback_rate`: Speed multiplier (e.g., 1.0, 1.25, 1.5).

When the state is `PLAYING`, the authoritative current playback time `T_current` at any instant `T_now` is calculated as:
`T_current = reference_position + ((T_now - reference_timestamp) * playback_rate)`

When the state is `PAUSED`, the playback time is constant:
`T_current = reference_position`

### 4.2 Network Time Synchronization (NTP-lite)

To enable clients to evaluate `T_now` accurately relative to the server clock, the client periodically performs a clock offset calculation:
1. Client transmits a ping packet with client timestamp `t0`.
2. Server immediately responds with server timestamp `t_server` and echoes `t0`.
3. Client receives the response at client timestamp `t1`.
4. Round Trip Time (RTT) is calculated: `RTT = t1 - t0`.
5. One-way latency estimate: `L = RTT / 2`.
6. Clock Offset: `Offset = t_server - (t0 + L)`.

The client maintains an Exponentially Weighted Moving Average (EWMA) of `Offset` to align its local clock with the server timeline.

### 4.3 Drift Detection and Correction Engine

Every local player regularly compares its actual `currentTime` against `T_current`.
- Drift Threshold 1 (0 to 250 milliseconds): Considered natural network jitter. No adjustment applied to prevent audio stutter.
- Drift Threshold 2 (250 to 1500 milliseconds): Soft correction. The local video playback rate is adjusted by +/- 5% to 10% until the local player smoothly catches up or drops back into the acceptable margin.
- Drift Threshold 3 (Greater than 1500 milliseconds): Hard correction. The player executes a hard `seek` directly to `T_current`.

### 4.4 Co-Browsing and Synchronized Web View Architecture

In addition to video streaming, the platform supports synchronized website viewing (co-browsing) within the primary media container:
1. Reverse Proxy Ingestion: The backend reverse proxy exposes `/api/v1/proxy?url={target_url}`. It strips `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` headers from the remote server response, rewrites relative stylesheet/script/image paths, and injects a client-side synchronization agent (`streamroom-cobrowse-agent`).
2. DOM Event Multiplexing: The injected agent intercepts scroll events (normalized to top/left percentage offsets), mouse navigation link clicks, normalized click coordinates, and cursor movements. These events communicate with the parent React window via `window.parent.postMessage()`.
3. WebSocket Relay: The React host client dispatches these events across the room WebSocket channel (`sync:web_scroll`, `sync:web_navigate`, `sync:web_click`, `sync:web_cursor`).
4. Replay and Pointer Rendering: Peer clients receive the event stream and programmatically replay scroll movements inside their respective sandboxed iframes while rendering an animated, labeled cursor overlay for the host pointer.

---

## 5. WebRTC Voice Mesh Protocol

Voice communication is realized through a client-side mesh topology suitable for interactive small-to-medium room gatherings (up to 12 concurrent voice streams).

### 5.1 Signaling Flow

1. When a user toggles voice chat on, the client sends a `webrtc:join_voice` signal to the backend.
2. The backend sends the list of active audio peers in the room back to the joining client.
3. The joining client creates an `RTCPeerConnection` for each active peer and generates an SDP Offer.
4. The SDP Offer is dispatched to the backend via WebSocket, and forwarded to the target peer.
5. The receiving peer sets the remote description, generates an SDP Answer, and routes it back through the backend to the initiator.
6. ICE candidates are gathered by both peers and exchanged via the WebSocket connection.
7. Media streams are established directly between client browsers using Opus audio encoding with built-in noise suppression, auto-gain, and echo cancellation.

### 5.2 Speaking Activity Detection

Each client processes incoming remote audio streams and local microphone input through the Web Audio API:
- An `AudioContext` creates a `MediaStreamAudioSourceNode` connected to an `AnalyserNode`.
- Root Mean Square (RMS) decibel values are calculated at 60 Hz.
- If the RMS exceeds the silence threshold (-50 dBFS) for more than 100 milliseconds, an active-speaking state is triggered, rendering a glowing halo around that user in the UI.

---

## 6. Real-Time Telemetry and Network Health

To provide transparency into stream health and connection stability, the system incorporates an integrated diagnostic telemetry pipeline.

### 6.1 Telemetry Metrics Pipeline

Each client collects three categories of metrics at 3-second intervals:
1. Network Layer:
   - WebSocket RTT (measured via periodic ping-pong cycles).
   - WebRTC voice connection RTT and packet loss (retrieved from `RTCPeerConnection.getStats()`).
2. Video Player Layer:
   - Video Segment Download Speed: Measured directly from HLS.js (`fragLoaded` event statistics) or Dash.js fragment metrics.
   - Buffer Health: Total buffered time ahead of current playhead (`TimeRanges` analysis).
   - Dropped Video Frames: Calculated using `HTMLVideoElement.getVideoPlaybackQuality().droppedVideoFrames`.
3. Synchronization Layer:
   - Current calculated drift relative to server master timeline in milliseconds.
   - Number of hard seeks triggered in the last 60 seconds.

### 6.2 Host Controls and Distribution

- Host Configuration: The host can toggle room-wide diagnostics visibility on or off.
- Distribution: When enabled, clients upload their metrics payload to the backend via WebSocket. The backend broadcasts a sanitized summary table to all participants.
- Visual Presentation: A HUD widget presents connection statuses with color-coded health indicators (green for healthy, amber for degraded, red for critical).

---

## 7. Persistent Browser Fingerprinting Engine

Users are identified across sessions, browser reloads, and system restarts using a deterministic, multi-factor browser fingerprinting strategy.

### 7.1 Identification Strategy

The fingerprinting engine executes upon application initialization:
1. Hardware Signatures:
   - CPU logical core count (`navigator.hardwareConcurrency`).
   - Device physical memory estimate (`navigator.deviceMemory`).
   - Screen color depth and primary aspect metrics.
2. Rendering Signatures:
   - Off-screen HTML5 Canvas drawing test: Renders complex geometric shapes, alpha masks, and text with custom font fallbacks to capture GPU rasterization variance.
   - WebGL Context inspection: Extracts `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL` strings directly from graphics hardware drivers.
3. Audio Architecture Signature:
   - Synthesizes an off-line `AudioContext` rendering an oscillator through a dynamics compressor node, computing the checksum of the resulting float buffer.
4. Persistent Storage Seed:
   - Generates a UUID v4 upon initial launch and stores it redundantly across `localStorage` and `IndexedDB`.
   - If storage is cleared, the hardware, rendering, and audio signatures recreate the persistent hash, ensuring continuity.
