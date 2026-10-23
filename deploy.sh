#!/bin/bash
# ==============================================================================
# StreamRoom Production Deployment Script
# Target: room.sparkxapps.in → /home/plutbfwl/StreamRoom
# ==============================================================================
set -e

APP_DIR="/home/plutbfwl/StreamRoom"
VENV_ACTIVATE="source /home/plutbfwl/virtualenv/StreamRoom/3.11/bin/activate"
PUBLIC_DIR="${APP_DIR}/public"

echo "=============================================="
echo "  StreamRoom Deployment Script"
echo "  Target: room.sparkxapps.in"
echo "=============================================="

# Step 1: Activate virtual environment
echo ""
echo "[1/7] Activating virtual environment..."
${VENV_ACTIVATE}
python3 --version
pip --version

# Step 2: Install/upgrade Python dependencies
echo ""
echo "[2/7] Installing Python dependencies..."
cd "${APP_DIR}"
pip install --upgrade pip
pip install -r requirements.txt

# Step 3: Set up production .env
echo ""
echo "[3/7] Configuring production environment..."
if [ -f "${APP_DIR}/.env.production" ]; then
    cp "${APP_DIR}/.env.production" "${APP_DIR}/.env"
    echo "  → Copied .env.production to .env"
else
    echo "  → .env.production not found, keeping existing .env"
fi

# Step 4: Verify the backend app imports cleanly
echo ""
echo "[4/7] Verifying backend application..."
cd "${APP_DIR}"
python3 -c "
import sys
sys.path.insert(0, '.')
from app.main import app
print('  → FastAPI app loaded successfully')
print(f'  → Title: {app.title}')
print(f'  → Routes: {len(app.routes)} registered')
"

# Step 5: Create tmp directory for Passenger restart
echo ""
echo "[5/7] Setting up Passenger restart mechanism..."
mkdir -p "${APP_DIR}/tmp"
touch "${APP_DIR}/tmp/restart.txt"
echo "  → Created tmp/restart.txt (Passenger will restart)"

# Step 6: Start the ASGI (uvicorn) realtime server used by the /ws/ proxy
echo ""
echo "[6/7] Starting realtime WebSocket/ASGI server..."
chmod +x "${APP_DIR}/realtime.sh"
VENV_PYTHON="${VENV_PYTHON:-/home/plutbfwl/virtualenv/StreamRoom/3.11/bin/python3}" \
    "${APP_DIR}/realtime.sh" restart || echo "  → WARNING: realtime server failed to start (see logs/realtime.log)"

# Step 7: Verify directory structure
echo ""
echo "[7/7] Final directory structure:"
echo "  Backend:"
ls -la "${APP_DIR}/"*.py "${APP_DIR}/"*.txt "${APP_DIR}/.htaccess" "${APP_DIR}/.env" 2>/dev/null || true
echo ""
echo "  Frontend (public/):"
ls -la "${PUBLIC_DIR}/" 2>/dev/null || echo "  → WARNING: public/ directory not found!"
ls -la "${PUBLIC_DIR}/assets/" 2>/dev/null || echo "  → WARNING: public/assets/ directory not found!"

echo ""
echo "=============================================="
echo "  Deployment complete!"
echo "  Visit: https://room.sparkxapps.in/"
echo "  Health: https://room.sparkxapps.in/health"
echo "  Docs:   https://room.sparkxapps.in/docs"
echo "=============================================="
