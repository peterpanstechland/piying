import uvicorn
import os
import sys
from pathlib import Path

# Add current directory to sys.path to ensure imports work
sys.path.append(str(Path(__file__).parent))

from app.main import app

if __name__ == '__main__':
    # Ensure data directories exist
    os.makedirs("data/logs", exist_ok=True)
    
    # Run the application
    # Using workers=1 because PyInstaller doesn't support multiple workers well with uvicorn in some modes,
    # but standard threading works.
    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=None)




