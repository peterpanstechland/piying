import sys
import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

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

def get_user_data_dir() -> Path:
    """
    Get the user data directory in %APPDATA% (or platform equivalent).
    This is where mutable user data (database, uploads, logs) should be stored.
    """
    app_name = "RobomonPiying"
    
    if sys.platform == "win32":
        base_path = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base_path = Path.home() / "Library" / "Application Support"
    else:
        # Linux/Unix
        base_path = Path.home() / ".config"
    
    return base_path / app_name / "data"

def ensure_user_data() -> Path:
    """
    Ensure user data directory exists and is populated with initial data if needed.
    Copies initial data from application bundle to user data directory on first run.
    """
    user_data_dir = get_user_data_dir()
    project_root = get_project_root()
    
    # Source data directory (bundled with app)
    if getattr(sys, 'frozen', False):
        source_data_dir = project_root / "data"
    else:
        source_data_dir = project_root / "data"
        
    # Create main user data directory
    if not user_data_dir.exists():
        logger.info(f"Creating user data directory at {user_data_dir}")
        user_data_dir.mkdir(parents=True, exist_ok=True)
    
    # List of subdirectories to ensure exist
    subdirs = ["characters", "storylines", "sessions", "outputs", "logs", "exports"]
    for subdir in subdirs:
        (user_data_dir / subdir).mkdir(exist_ok=True)

    # Copy initial config if it doesn't exist in user data
    # We might want to store config in user_data_dir/config
    user_config_dir = user_data_dir.parent / "config"
    if not user_config_dir.exists():
        user_config_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy default settings if available
        source_config_dir = project_root / "config"
        if source_config_dir.exists():
            for config_file in ["settings.json", "scenes.json"]:
                src = source_config_dir / config_file
                dst = user_config_dir / config_file
                if src.exists() and not dst.exists():
                    try:
                        shutil.copy2(src, dst)
                        logger.info(f"Copied initial config {config_file} to {dst}")
                    except Exception as e:
                        logger.error(f"Failed to copy initial config {config_file}: {e}")

    return user_data_dir
