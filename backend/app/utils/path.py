import sys
from pathlib import Path

def get_project_root() -> Path:
    """
    Get the project root directory.
    Handles both development (script) and frozen (PyInstaller) modes.
    
    In frozen mode (PyInstaller), the executable is in resources/backend/backend.exe
    So the root (resources/) is sys.executable.parent.parent
    
    In dev mode, the file is in backend/app/utils/path.py
    So the root is 4 levels up.
    """
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        # sys.executable is .../resources/backend/backend.exe
        # We want .../resources/
        return Path(sys.executable).parent.parent
    else:
        # Running as script
        # backend/app/utils/path.py -> ... -> PROJECT_ROOT
        return Path(__file__).parent.parent.parent.parent
