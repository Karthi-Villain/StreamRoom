# ⚙️ StreamRoom — Backend Signaling Engine

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg?style=flat-square&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB.svg?style=flat-square&logo=Python&logoColor=white)](https://www.python.org)
[![Uvicorn](https://img.shields.io/badge/ASGI-Uvicorn-2C5BB4.svg?style=flat-square)](https://www.uvicorn.org)
[![Phusion Passenger](https://img.shields.io/badge/cPanel-Passenger_Ready-00A4E4.svg?style=flat-square)](https://www.phusionpassenger.com)
[![SQLAlchemy](https://img.shields.io/badge/ORM-SQLAlchemy_2.0-D71F00.svg?style=flat-square)](https://www.sqlalchemy.org)

The **StreamRoom Backend** is an asynchronous, high-throughput signaling engine built with **FastAPI**, **WebSockets**, and **SQLAlchemy**. It powers real-time clock synchronization, video state propagation, WebRTC peer connection exchange, access protection verification, and session state persistence.

---

## 🏛️ Architecture & Directory Layout

```text
backend/
├── app/
│   ├── core/
│   │   ├── config.py           # Pydantic v2 application settings (.env parsing)
│   │   ├── security.py         # Argon2id password/PIN hashing & token generation
│   │   └── fingerprint.py      # Client fingerprinting & GUID validation
│   ├── db/
│   │   ├── database.py         # SQLAlchemy engine & session factory
│   │   └── models.py           # DB models: Room, Participant, SessionToken
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response validation schemas
│   ├── routers/
│   │   ├── api_v1.py           # REST endpoints: create, join, resume, settings
│   │   ├── proxy_router.py     # CORS proxy for external web scraping/co-browsing
│   │   └── websocket_gateway.py# Real-time WebSocket connection hub & state manager
│   └── main.py                 # FastAPI application lifecycle & router registration
├── passenger_wsgi.py           # cPanel Phusion Passenger WSGI/ASGI entrypoint
├── realtime_server.py          # Standalone uvicorn ASGI server (WebSocket capable)
├── realtime.sh                 # Start/stop/status manager for the realtime server
├── .htaccess                   # Apache/LiteSpeed rules: proxy /ws/ + /api/ to uvicorn
├── CPANEL_DEPLOYMENT.md        # Detailed cPanel hosting deployment guide
├── requirements.txt            # Production dependencies (including a2wsgi & gunicorn)
└── run.py                      # Local development runner
```

---

## 📡 WebSocket Event Lifecycle (`/ws/{room_id}`)

Clients establish a persistent WebSocket connection to `/ws/{room_id}?client_id=...&session_token=...`. The gateway handles the following events:

| Event Type | Direction | Payload Description |
| :--- | :--- | :--- |
| `time:ping` | Client → Server | Client timestamp for latency measurement |
| `time:pong` | Server → Client | Echoes client timestamp + high-res server timestamp |
| `sync:state` | Server → Client | Current room playback state (`playing`/`paused`, ref position, ref time) |
| `sync:play` | Client → Server | Play command (broadcasts new reference timestamp) |
| `sync:pause` | Client → Server | Pause command with exact position |
| `sync:seek` | Client → Server | Seek command with target timestamp |
| `sync:track` | Client ↔ Server | Broadcasts audio or subtitle track selection to all clients |
| `chat:message` | Client ↔ Server | Chat message content, sender details, and timestamps |
| `webrtc:offer` | Client ↔ Server | Relays WebRTC SDP offer to target peer client |
| `webrtc:answer` | Client ↔ Server | Relays WebRTC SDP answer to calling peer |
| `webrtc:ice_candidate` | Client ↔ Server | Relays ICE candidates for NAT traversal |
| `room:knock_request` | Client → Server | Notifies host that a viewer is requesting admission |
| `room:knock_decision`| Host → Server | Host decision (`admit` or `reject`) for knocking viewer |

---

## ⏱️ NTP Clock Synchronization Mechanism

To ensure sub-25ms synchronization across distributed network conditions:
1. Every 5 seconds, each client emits a `time:ping` containing client timestamp $T_1$.
2. The server receives the ping at $T_2$ and responds immediately with `time:pong` containing $T_1$, $T_2$, and exit timestamp $T_3$.
3. The client receives the response at $T_4$.
4. The client computes:
   $$\text{Round-Trip Time (RTT)} = (T_4 - T_1) - (T_3 - T_2)$$
   $$\text{Clock Offset} = \frac{(T_2 - T_1) + (T_3 - T_4)}{2}$$
5. The calculated offset is factored into all video reference timestamps, ensuring identical playback position regardless of geographic timezone or system clock disparity.

---

## 🔒 Security & Access Protection

- **Argon2id PIN Verification:** Room PINs are never stored in plaintext. Passwords are hash-verified using `argon2-cffi` with tuned memory and parallelism factors.
- **Cryptographic Session Tokens:** Each approved room participant is issued a 256-bit URL-safe session token verified on WebSocket handshake.
- **Host Token Privilege Separation:** Destructive administrative actions (changing control policies, kicking participants, terminating rooms) require a separate `host_token`.
- **Session Auto-Resume:** The server maintains cryptographic persistent fingerprints in SQLite/MySQL, enabling users to refresh their browser or reconnect without losing their seat or host privileges.

---

## 🚀 Deployment

### Option A: Local Development
```bash
# 1. Create and activate virtualenv
python -m venv venv
source venv/bin/activate  # Or .\venv\Scripts\activate on Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start local development server
python run.py
```
The server will start at `http://localhost:8000`. OpenAPI documentation is available at `http://localhost:8000/docs`.

### Option B: cPanel / Phusion Passenger
The backend includes ready-to-use cPanel files:
- **`passenger_wsgi.py`:** Bridges FastAPI ASGI to Passenger WSGI via `a2wsgi` (HTTP only).
- **`realtime_server.py` + `realtime.sh`:** uvicorn ASGI daemon on `127.0.0.1:8001`.
  **Required for WebSockets** — WSGI (Passenger/LiteSpeed) cannot carry the
  WebSocket protocol, so `/ws/` (and `/api/`) are reverse-proxied to it.
- **`.htaccess`:** Proxy rules for `/ws/`, `/api/`, `/health`, `/docs`.
- **`cloudflared.sh`:** Cloudflare Tunnel that terminates WebSockets directly on
  uvicorn (`wss://ws.sparkxapps.in`), because LiteSpeed cannot tunnel the
  WebSocket upgrade.
- Start with `./realtime.sh start`, check with `./realtime.sh status`.
- For complete step-by-step instructions, see the [cPanel Deployment Guide](CPANEL_DEPLOYMENT.md).

### Option C: Production Docker / Gunicorn
```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## 🧪 Testing

Run automated tests using `pytest`:
```bash
pytest
```
