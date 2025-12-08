import uvicorn
import os
import sys
import socket
from pathlib import Path

# Add current directory to sys.path to ensure imports work
sys.path.append(str(Path(__file__).parent))

from app.main import app

def find_free_port(start_port=8000, max_attempts=10):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('0.0.0.0', port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"Could not find a free port in range {start_port}-{start_port + max_attempts - 1}")

if __name__ == '__main__':
    # Ensure data directories exist
    os.makedirs("data/logs", exist_ok=True)
    
    # Find a free port
    port = find_free_port(8000)
    if port != 8000:
        print(f"Port 8000 is in use, using port {port} instead", file=sys.stderr)
    
    # Run the application
    # Using workers=1 because PyInstaller doesn't support multiple workers well with uvicorn in some modes,
    # but standard threading works.
    uvicorn.run(app, host="0.0.0.0", port=port, log_config=None)

















