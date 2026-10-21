import sys
import os

# Add backend directory to sys.path so 'app' can be imported cleanly on Vercel
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

# Vercel detects and exports the ASGI FastAPI 'app' instance
