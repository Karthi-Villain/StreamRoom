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

## ⚡ WebSocket Notes on cPanel / Apache

- StreamRoom uses WebSockets at `/ws/{room_id}` for millisecond video synchronization, live chat, and WebRTC signaling.
- The included `.htaccess` file contains rewrite rules that upgrade `ws://` and `wss://` headers.
- If your shared host blocks persistent WebSocket connections through Passenger, you can also run Uvicorn as a background daemon process (via Cron or Supervisor/PM2) on a local port (e.g. `8000`) and reverse-proxy to it via `.htaccess`.
