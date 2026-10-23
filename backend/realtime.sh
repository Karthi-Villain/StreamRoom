#!/bin/bash
# ==============================================================================
# StreamRoom realtime (ASGI/uvicorn) process manager
# ------------------------------------------------------------------------------
# Passenger / LiteSpeed cannot carry WebSockets for Python apps, so the whole
# FastAPI app is served by uvicorn on 127.0.0.1:8001 and reverse-proxied by
# .htaccess.
#
# Usage:
#   ./realtime.sh start     # start (idempotent)
#   ./realtime.sh stop
#   ./realtime.sh restart
#   ./realtime.sh status
#   ./realtime.sh logs      # tail -f the log
#
# Override defaults with env vars:
#   VENV_PYTHON   python interpreter inside the virtualenv
#   REALTIME_PORT loopback port (must match .htaccess)
# ==============================================================================

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="${VENV_PYTHON:-/home/plutbfwl/virtualenv/StreamRoom/3.11/bin/python3}"
REALTIME_PORT="${REALTIME_PORT:-8001}"

if [ ! -x "${VENV_PYTHON}" ]; then
    # Fall back to the interpreter currently on PATH (e.g. activated venv)
    VENV_PYTHON="$(command -v python3 || command -v python)"
fi

mkdir -p "${APP_DIR}/tmp" "${APP_DIR}/logs"
PID_FILE="${APP_DIR}/tmp/realtime.pid"
LOG_FILE="${APP_DIR}/logs/realtime.log"

is_running() {
    [ -f "${PID_FILE}" ] || return 1
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null)"
    [ -n "${pid}" ] || return 1
    kill -0 "${pid}" 2>/dev/null
}

start() {
    if is_running; then
        echo "  → realtime server already running (pid $(cat "${PID_FILE}"))"
        return 0
    fi

    echo "  → starting realtime server on 127.0.0.1:${REALTIME_PORT}"
    # Keep the log from growing without bound on constrained hosting
    if [ -f "${LOG_FILE}" ] && [ "$(wc -c < "${LOG_FILE}")" -gt 10485760 ]; then
        mv -f "${LOG_FILE}" "${LOG_FILE}.1"
    fi
    cd "${APP_DIR}" || exit 1
    REALTIME_PORT="${REALTIME_PORT}" nohup "${VENV_PYTHON}" "${APP_DIR}/realtime_server.py" \
        >> "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"

    # Wait for the port to answer
    for _ in $(seq 1 25); do
        if curl -fsS --max-time 2 "http://127.0.0.1:${REALTIME_PORT}/health" > /dev/null 2>&1; then
            echo "  ✓ realtime server is up (pid $(cat "${PID_FILE}"), log: ${LOG_FILE})"
            return 0
        fi
        sleep 1
    done

    echo "  ✗ realtime server did NOT answer on port ${REALTIME_PORT}"
    echo "    Last log lines:"
    tail -n 30 "${LOG_FILE}" 2>/dev/null
    return 1
}

stop() {
    if is_running; then
        local pid
        pid="$(cat "${PID_FILE}")"
        echo "  → stopping realtime server (pid ${pid})"
        kill "${pid}" 2>/dev/null
        for _ in $(seq 1 10); do
            kill -0 "${pid}" 2>/dev/null || break
            sleep 1
        done
        kill -9 "${pid}" 2>/dev/null
    else
        # Clean up strays started outside of this script
        pkill -f "realtime_server.py" 2>/dev/null
    fi
    rm -f "${PID_FILE}"
    echo "  ✓ stopped"
}

status() {
    if is_running; then
        echo "  ✓ running (pid $(cat "${PID_FILE}")) on 127.0.0.1:${REALTIME_PORT}"
        curl -fsS --max-time 3 "http://127.0.0.1:${REALTIME_PORT}/health" && echo
    else
        echo "  ✗ not running"
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
