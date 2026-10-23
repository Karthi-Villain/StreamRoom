"""
Standalone ASGI (uvicorn) entrypoint for cPanel / LiteSpeed / Passenger hosts.

WHY THIS EXISTS
---------------
cPanel's "Setup Python App" runs Python through a *WSGI* adapter
(Phusion Passenger or LiteSpeed's lswsgi). WSGI has no concept of the
WebSocket protocol, so every `Upgrade: websocket` request is rejected
(observed: HTTP 403 with an empty body) before it can ever reach FastAPI.
Wrapping FastAPI with `a2wsgi.ASGIMiddleware` does not help either - that
bridge only converts HTTP.

The fix: run the real ASGI server (uvicorn) as a small background daemon on a
loopback port, and let Apache/LiteSpeed reverse-proxy `/ws/` (and `/api/`,
`/health`, `/docs`, ...) to it via `.htaccess`. Keeping *all* dynamic routes on
this single process also guarantees that the in-memory `room_manager` state is
shared between REST calls and WebSocket connections.

Run it manually (development / debugging):
    python realtime_server.py

Production: use `realtime.sh start` (see CPANEL_DEPLOYMENT.md).
"""

import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Load .env before importing the app (settings read env at import time)
env_path = os.path.join(CURRENT_DIR, ".env")
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
    except ImportError:
        pass

import uvicorn  # noqa: E402


def main() -> None:
    host = os.getenv("REALTIME_HOST", "127.0.0.1")
    port = int(os.getenv("REALTIME_PORT", "8001"))
    log_level = os.getenv("REALTIME_LOG_LEVEL", "info")
    # Loopback only: the daemon must never be reachable from the internet
    # directly, otherwise it bypasses the web server / TLS termination.
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(
            f"[realtime] WARNING: REALTIME_HOST={host} is not a loopback address. "
            "The proxy expects 127.0.0.1.",
            file=sys.stderr,
        )

    print(f"[realtime] Starting uvicorn ASGI server on http://{host}:{port}", file=sys.stderr)
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level=log_level,
        # "auto" lets uvicorn pick the best installed WebSocket implementation
        # (avoids the deprecation of the explicit "websockets" alias).
        ws="auto",
        # The web server terminates TLS and forwards the client address.
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
        # Keep client sockets alive a little longer than typical proxies.
        timeout_keep_alive=75,
        access_log=False,
    )


if __name__ == "__main__":
    main()
