import os
import sys

# -----------------------------------------------------------------------------
# cPanel Phusion Passenger WSGI / ASGI Bridge (Fork-Safe Lazy Initialization)
# -----------------------------------------------------------------------------
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Automatically load environment variables from .env
env_path = os.path.join(CURRENT_DIR, ".env")
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

_wsgi_app = None

def application(environ, start_response):
    """
    WSGI entry point for Phusion Passenger / LiteSpeed.
    
    IMPORTANT: We lazily instantiate ASGIMiddleware on the first request inside
    the worker process. In Phusion Passenger/CloudLinux, master processes are
    forked. If ASGIMiddleware's background asyncio thread is started before fork,
    POSIX fork() drops the background thread in the child worker, causing it to
    hang forever on the queue (Error 524). Lazy initialization ensures the event
    loop thread is born inside the active worker process.
    """
    global _wsgi_app
    if _wsgi_app is None:
        from app.main import app as asgi_app
        try:
            from a2wsgi import ASGIMiddleware
            _wsgi_app = ASGIMiddleware(asgi_app)
        except ImportError:
            _wsgi_app = asgi_app
            
    return _wsgi_app(environ, start_response)
