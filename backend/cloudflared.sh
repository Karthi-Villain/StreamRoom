#!/bin/bash
# ==============================================================================
# Cloudflare Tunnel manager for the StreamRoom realtime (ASGI) server
# ------------------------------------------------------------------------------
# Why: LiteSpeed/Apache rewrite proxying (`RewriteRule ... [P]`) forwards the
# WebSocket handshake but does NOT tunnel the upgraded connection, so browsers
# hang and close with code 1006. A Cloudflare Tunnel connects straight to the
# uvicorn process on 127.0.0.1:8001 over an outbound connection - no inbound
# port, no web-server proxy required.
#
# Prerequisites (once):
#   ~/bin/cloudflared tunnel login
#   ~/bin/cloudflared tunnel create streamroom
#   ~/bin/cloudflared tunnel route dns streamroom ws.sparkxapps.in
#
# Usage:
#   ./cloudflared.sh start|stop|restart|status|logs
#
# Env overrides:
#   CFD_BIN      path to the cloudflared binary   (default ~/bin/cloudflared)
#   TUNNEL_NAME  tunnel name                      (default streamroom)
#   TARGET_URL   local service to expose          (default http://127.0.0.1:8001)
# ==============================================================================

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
CFD_BIN="${CFD_BIN:-$HOME/bin/cloudflared}"
TUNNEL_NAME="${TUNNEL_NAME:-streamroom}"
TARGET_URL="${TARGET_URL:-http://127.0.0.1:8001}"

mkdir -p "${APP_DIR}/logs"
PID_FILE="${APP_DIR}/tmp/cloudflared.pid"
LOG_FILE="${APP_DIR}/logs/cloudflared.log"
mkdir -p "${APP_DIR}/tmp"

is_running() {
    [ -f "${PID_FILE}" ] || return 1
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null)"
    [ -n "${pid}" ] || return 1
    kill -0 "${pid}" 2>/dev/null
}

start() {
    if [ ! -x "${CFD_BIN}" ]; then
        echo "  ✗ cloudflared not found at ${CFD_BIN}"
        echo "    install: mkdir -p ~/bin && curl -L -o ~/bin/cloudflared \\"
        echo "      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        echo "      chmod +x ~/bin/cloudflared"
        return 1
    fi
    if is_running; then
        echo "  → tunnel already running (pid $(cat "${PID_FILE}"))"
        return 0
    fi

    if [ -f "${LOG_FILE}" ] && [ "$(wc -c < "${LOG_FILE}")" -gt 10485760 ]; then
        mv -f "${LOG_FILE}" "${LOG_FILE}.1"
    fi

    echo "  → starting tunnel '${TUNNEL_NAME}' → ${TARGET_URL}"
    nohup "${CFD_BIN}" tunnel run --url "${TARGET_URL}" "${TUNNEL_NAME}" \
        >> "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"
    sleep 4

    if is_running; then
        echo "  ✓ tunnel process up (pid $(cat "${PID_FILE}"), log: ${LOG_FILE})"
        grep -i -m3 -E 'Registered tunnel connection|Connection registered' "${LOG_FILE}" || true
    else
        echo "  ✗ tunnel exited immediately. Last log lines:"
        tail -n 25 "${LOG_FILE}"
        return 1
    fi
}

stop() {
    if is_running; then
        kill "$(cat "${PID_FILE}")" 2>/dev/null
        sleep 2
        kill -9 "$(cat "${PID_FILE}")" 2>/dev/null
    fi
    pkill -f "cloudflared tunnel run --url ${TARGET_URL} ${TUNNEL_NAME}" 2>/dev/null
    rm -f "${PID_FILE}"
    echo "  ✓ tunnel stopped"
}

status() {
    if is_running; then
        echo "  ✓ tunnel running (pid $(cat "${PID_FILE}"))"
        grep -i -E 'Registered tunnel connection|Connection registered' "${LOG_FILE}" | tail -n 2
    else
        echo "  ✗ tunnel not running"
        return 1
    fi
}

case "${1:-start}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    logs)    tail -n 100 -f "${LOG_FILE}" ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
