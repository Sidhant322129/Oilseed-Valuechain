import os
from pathlib import Path
from dotenv import load_dotenv

# Search and load .env files hierarchically
current_dir = Path(__file__).resolve().parent
load_dotenv(current_dir / ".env")
load_dotenv(current_dir.parent / "backend" / ".env")
load_dotenv(current_dir.parent / ".env.local")
load_dotenv(current_dir.parent / ".env")

class Config:
    PORT = int(os.getenv("AI_SERVICE_PORT", 8000))
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"
    
    SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    ML_BUCKET_NAME = os.getenv("SUPABASE_ML_BUCKET", "ml-models")
    
    BASE_DIR = current_dir
    MODELS_DIR = current_dir / "weights"
    
    ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if origin.strip()
    ]

# Ensure local weights directory exists
Config.MODELS_DIR.mkdir(parents=True, exist_ok=True)
