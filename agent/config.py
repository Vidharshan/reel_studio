import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env.local from project root
ROOT_DIR = Path(__file__).parent.parent
env_path = ROOT_DIR / ".env.local"
load_dotenv(dotenv_path=env_path)

# API Keys
FAL_KEY = os.getenv("FAL_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")

# Local Workdirectories
TEMP_DIR = ROOT_DIR / "agent_temp"
TEMP_DIR.mkdir(exist_ok=True)

# Resolve default paths for scripting hook
RESOLVE_PATHS = {
    "windows": {
        "api": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Developer\\Scripting",
        "lib": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll",
        "modules": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Developer\\Scripting\\Modules"
    },
    "mac": {
        "api": "/Applications/DaVinci Resolve/Developer/Scripting",
        "lib": "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/libfusionscript.dylib",
        "modules": "/Applications/DaVinci Resolve/Developer/Scripting/Modules"
    }
}
