import os
import logging
from pathlib import Path
from config import Config

logger = logging.getLogger("ai_service.supabase")

_supabase_client = None

def get_supabase_client():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    
    url = Config.SUPABASE_URL
    key = Config.SUPABASE_SERVICE_ROLE_KEY or Config.SUPABASE_ANON_KEY
    
    if not url or not key:
        logger.warning("Supabase URL or Key missing. Database/storage operations will operate in offline/fallback mode.")
        return None
        
    try:
        from supabase import create_client, Client
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialized successfully.")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return None

def fetch_price_history(crop_type=None, state=None, district=None, limit=2000):
    client = get_supabase_client()
    if not client:
        return []
    
    try:
        query = client.table("price_history").select("*")
        if crop_type:
            query = query.eq("crop_type", crop_type.lower())
        if state:
            query = query.ilike("state", f"%{state}%")
        if district:
            query = query.ilike("district", f"%{district}%")
            
        # Chronological order for lag and time-series computations
        response = query.order("price_date", desc=False).limit(limit).execute()
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching price history from Supabase: {e}")
        return []

def upload_model_to_bucket(local_path: Path, remote_filename: str) -> bool:
    client = get_supabase_client()
    if not client:
        return False
    
    try:
        bucket_name = Config.ML_BUCKET_NAME
        with open(local_path, "rb") as f:
            file_bytes = f.read()
        
        # Check if bucket exists, or try direct upsert
        try:
            # upsert if file already exists
            client.storage.from_(bucket_name).upload(
                path=remote_filename,
                file=file_bytes,
                file_options={"upsert": "true", "content-type": "application/octet-stream"}
            )
            logger.info(f"Successfully uploaded {remote_filename} to Supabase bucket '{bucket_name}'.")
            return True
        except Exception as upload_err:
            logger.warning(f"Failed to upload model {remote_filename} to bucket '{bucket_name}': {upload_err}")
            return False
    except Exception as e:
        logger.error(f"Storage upload error: {e}")
        return False

def download_model_from_bucket(remote_filename: str, target_local_path: Path) -> bool:
    client = get_supabase_client()
    if not client:
        return False
        
    try:
        bucket_name = Config.ML_BUCKET_NAME
        data = client.storage.from_(bucket_name).download(remote_filename)
        if data:
            target_local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(target_local_path, "wb") as f:
                f.write(data)
            logger.info(f"Downloaded model artifact {remote_filename} to {target_local_path}")
            return True
        return False
    except Exception as e:
        logger.info(f"Could not download model {remote_filename} from Supabase bucket (will use local/new model): {e}")
        return False
