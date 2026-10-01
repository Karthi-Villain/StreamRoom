import os
import sys

# -----------------------------------------------------------------------------
# cPanel Phusion Passenger WSGI / ASGI Bridge
# -----------------------------------------------------------------------------
# This script serves as the primary entry point for CloudLinux / cPanel Python
# Selector running on Phusion Passenger.
# -----------------------------------------------------------------------------

# 1. Force the current application directory into sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# 2. Automatically load environment variables from .env
env_path = os.path.join(CURRENT_DIR, ".env")
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

# 3. Import the FastAPI ASGI application
from app.main import app as asgi_app

# 4. Bridge ASGI to WSGI for cPanel Phusion Passenger
# Most cPanel Passenger installations run in WSGI mode. `a2wsgi` provides a
# high-performance, robust bridge converting WSGI requests to ASGI coroutines.
try:
    from a2wsgi import ASGIMiddleware
    application = ASGIMiddleware(asgi_app)
except ImportError:
    # If a2wsgi is not yet installed in virtualenv, expose ASGI app directly
    application = asgi_app
