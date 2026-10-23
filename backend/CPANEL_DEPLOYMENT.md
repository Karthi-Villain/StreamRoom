# 🚀 Deploying StreamRoom Backend on cPanel (Phusion Passenger)

This guide provides step-by-step instructions for deploying the FastAPI backend on **cPanel / CloudLinux** using **Phusion Passenger** (via the *"Setup Python App"* interface).

---

## 📋 Prerequisites
- A cPanel hosting account with **Setup Python App** enabled (CloudLinux Python Selector).
- Python **3.10+** (recommended: Python 3.11 or 3.12).
- SSH terminal access (or cPanel File Manager + Terminal tool).

---

## 🛠️ Step 1: Upload Backend Files to cPanel

1. In cPanel **File Manager**, create an application folder, e.g., `/home/username/streamroom-backend`.
2. Upload the contents of the `backend/` directory into that folder:
   ```text
   /home/username/streamroom-backend/
   ├── app/
   │   ├── core/
   │   ├── db/
   │   ├── models/
   │   ├── routers/
   │   └── main.py
   ├── .htaccess
   ├── passenger_wsgi.py
   ├── requirements.txt
   └── .env.example
   ```

---

## 🐍 Step 2: Configure "Setup Python App" in cPanel

1. Log in to cPanel and open **Setup Python App**.
2. Click **Create Application**.
3. Fill in the fields:
   - **Python version**: Select **3.10**, **3.11**, or **3.12**.
   - **Application root**: `streamroom-backend` (path relative to your home directory).
   - **Application URL**: `api.yourdomain.com` or `yourdomain.com/api`.
   - **Application startup file**: `passenger_wsgi.py`.
   - **Application Entry point**: `application`.
4. Click **Create**.
5. Note the virtual environment activation command provided at the top (e.g., `source /home/username/virtualenv/streamroom-backend/3.11/bin/activate`).

---

## 📦 Step 3: Install Dependencies

1. Open the cPanel **Terminal** (or connect via SSH).
2. Activate your virtual environment using the command copied in Step 2:
   ```bash
   source /home/username/virtualenv/streamroom-backend/3.11/bin/activate
   ```
3. Navigate to your application directory:
   ```bash
   cd /home/username/streamroom-backend
   ```
4. Upgrade `pip` and install all required packages:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
   > **Note:** `a2wsgi` is included in `requirements.txt` to bridge FastAPI's ASGI interface to Phusion Passenger's WSGI server.

---

## ⚙️ Step 4: Configure Environment Variables (`.env`)

1. Inside your application directory, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with your production settings:
   ```env
   PROJECT_NAME="StreamRoom Signaling Engine"
   API_V1_STR="/api/v1"
   SECRET_KEY="generate-a-strong-random-secret-here"
   DATABASE_URL="sqlite:///./streamroom.db"
   ALLOWED_ORIGINS="https://yourfrontenddomain.com"
   ```
   *(For high concurrency, you can replace SQLite with MySQL/PostgreSQL: `DATABASE_URL="mysql+pymysql://user:pass@localhost/streamroom"`)*.

---

## 🔄 Step 5: Restart the Application

1. In cPanel **Setup Python App**, click the **Restart** button for your application.
2. Alternatively, touch the `restart.txt` file in your application folder:
   ```bash
   mkdir -p tmp
   touch tmp/restart.txt
   ```

---

## 🩺 Step 6: Verify Deployment

Visit your backend health check endpoint in your browser:
```text
https://api.yourdomain.com/health
```
You should see:
```json
{
  "status": "healthy",
  "service": "StreamRoom Signaling Engine",
  "database": "sqlite"
}
```
Access interactive OpenAPI documentation at:
```text
https://api.yourdomain.com/docs
```

---

## ⚡ WebSockets on cPanel — **must read**

### Why WebSockets fail on plain cPanel Python apps
cPanel's *Setup Python App* runs Python through a **WSGI** adapter (Phusion
Passenger or LiteSpeed's `lswsgi`). WSGI has **no WebSocket support** — the
`Upgrade: websocket` handshake is rejected by the web server before FastAPI
runs (you get `HTTP 403` with an empty body, and the browser reports
`WebSocket connection ... error` / close code `1006`).

Wrapping FastAPI with `a2wsgi.ASGIMiddleware` does **not** fix this: that
bridge only converts HTTP requests.

**Symptoms you will see if this is not set up:**

```text
WebSocket connection attempt encountered error, attempting recovery: Event {...}
```
…repeating every few seconds, while the REST API (`/api/v1/...`) works fine.

### The fix: run uvicorn on a loopback port and proxy to it
1. `realtime_server.py` starts the **real ASGI server** (uvicorn) on
   `127.0.0.1:8001`.
2. `.htaccess` reverse-proxies `/ws/*` **and** `/api/*`, `/health`, `/docs`,
   `/redoc`, `/openapi.json` to that process.
3. All dynamic traffic therefore hits **one** process, so the in-memory
   `room_manager` state (rooms, tokens, playback state) is shared between REST
   calls and WebSocket connections.

> ⚠️ Proxying only `/ws/` while leaving `/api/` on Passenger is **not** a valid
> setup: rooms would be created in one process and the WebSocket would be
> rejected in another (`Room not found or expired`).

> 📁 The proxy rules live in the `.htaccess` of the **document root** of
> `room.sparkxapps.in` (the folder that also contains `index.html` / `public/`).
> In the current setup that is `/home/plutbfwl/StreamRoom/.htaccess`. If the
> domain points somewhere else (`~/public_html`, `~/room.sparkxapps.in`, ...),
> copy the same `.htaccess` there as well.

### Start / manage the realtime server

```bash
cd /home/plutbfwl/StreamRoom
./realtime.sh start      # start (idempotent)
./realtime.sh status     # health check
./realtime.sh restart    # after code changes
./realtime.sh logs       # tail -f logs/realtime.log
```

Verify locally on the server:

```bash
curl -i http://127.0.0.1:8001/health
```

Keep it alive after reboots / crashes with a cron job (cPanel → **Cron Jobs**):

```cron
@reboot /home/plutbfwl/StreamRoom/realtime.sh start >/dev/null 2>&1
*/5 * * * * /home/plutbfwl/StreamRoom/realtime.sh start >/dev/null 2>&1
```

(`start` is a no-op when the process is already running.)

### Verify the public WebSocket endpoint

```bash
curl -i --max-time 10 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://room.sparkxapps.in/ws/rooms/<ROOM_ID>?token=<SESSION_TOKEN>&client_id=<CLIENT_ID>"
```

* `HTTP/1.1 101 Switching Protocols` → working. ✅
* `403` with an **empty** body and no `x-turbo-charged-by` header → the request
  never reached uvicorn. On LiteSpeed this happens when the proxy target uses
  the `ws://` scheme (it is not supported in rewrite rules). Use the `http://`
  target instead — the web server tunnels the upgrade automatically:
  ```apache
  RewriteRule ^ws/(.*)$ http://127.0.0.1:8001/ws/$1 [P,L]
  ```
* `403` with a JSON body / `1008` close → the app rejected the credentials
  (unknown room or expired `session_token`).
* `404 {"detail":"Not Found"}` on a plain (non-upgrade) `/ws/...` request is
  **normal** and proves the proxy is reaching uvicorn.

### If `[P]` (proxy) is blocked by the host
Some shared hosts disable `mod_proxy` / `ProxyPass` in `.htaccess` (you will
see `500 Internal Server Error` or `403` on `/ws/`). If so, either:

1. Ask support to enable `mod_proxy`, `mod_proxy_http` and `mod_proxy_wstunnel`,
   or to add this to the vhost:
   ```apache
   ProxyPreserveHost On
   ProxyPass        /ws/  ws://127.0.0.1:8001/ws/
   ProxyPassReverse /ws/  ws://127.0.0.1:8001/ws/
   ```
2. Or host the signaling server where WebSockets are supported (small VPS /
   Render / Railway / Fly.io) and point the frontend at it:
   ```env
   VITE_WS_BASE_URL="wss://signaling.example.com/ws/rooms"
   VITE_API_BASE_URL="https://signaling.example.com/api/v1"
   ```
   then rebuild the frontend.

### Cloudflare
Cloudflare proxies WebSockets on all plans, so nothing to change there. Idle
connections are dropped after ~100 s — the client already sends a `time:ping`
every 4 s, which keeps the socket open.

