import sys
from pathlib import Path

def get_project_root() -> Path:
    """
    Get the project root directory.
    Handles both development (script) and frozen (PyInstaller) modes.
    """
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        # sys.executable is the path to the .exe
        return Path(sys.executable).parent
    else:
        # Running as script
        # This file is at backend/app/utils/path.py
        # Root is 3 levels up: backend/
        # But wait, the project structure implies "project root" contains backend/, frontend/, config/
        # So backend/app/utils/path.py -> backend/app/utils -> backend/app -> backend -> PROJECT_ROOT
        return Path(__file__).parent.parent.parent.parent

