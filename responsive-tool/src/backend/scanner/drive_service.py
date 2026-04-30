import base64
import io
import logging
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# No top-level environment reading to avoid stale values

def get_drive_service():
    json_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not json_path:
        logger.warning("GOOGLE_SERVICE_ACCOUNT_JSON not set.")
        return None
    
    try:
        if os.path.exists(json_path):
            creds = service_account.Credentials.from_service_account_file(
                json_path, 
                scopes=["https://www.googleapis.com/auth/drive.file"]
            )
        else:
            # Assume it's the JSON content itself
            import json
            info = json.loads(json_path)
            creds = service_account.Credentials.from_service_account_info(
                info, 
                scopes=["https://www.googleapis.com/auth/drive.file"]
            )
        return build("drive", "v3", credentials=creds)
    except Exception as e:
        logger.error("Failed to initialize Google Drive service: %s", e)
        return None

def upload_screenshot(filename: str, b64_data: str, folder_id: str = None):
    try:
        load_dotenv()
        service = get_drive_service()
        if not service:
            return {"error": "Drive service not configured."}

        # Strip the data:image/png;base64, prefix if present
        if b64_data.startswith("data:"):
            b64_data = b64_data.split(",")[1]
        
        image_data = base64.b64decode(b64_data)
        fh = io.BytesIO(image_data)

        file_metadata = {"name": filename}
        target_folder = folder_id or os.environ.get("GDRIVE_FOLDER_ID")
        
        logger.info("Uploading to folder: %s", target_folder)
        
        if target_folder:
            file_metadata["parents"] = [target_folder]
        else:
            logger.warning("No GDRIVE_FOLDER_ID found! Upload might fail due to quota.")

        # TEST: Try to upload a tiny text file first
        try:
            test_fh = io.BytesIO(b"test")
            test_media = MediaIoBaseUpload(test_fh, mimetype="text/plain", resumable=False)
            service.files().create(body={"name": "test.txt", "parents": [target_folder]}, media_body=test_media).execute()
            logger.info("Test upload successful! Service account has quota.")
        except Exception as test_e:
            logger.error("Test upload failed: %s", test_e)

        media = MediaIoBaseUpload(fh, mimetype="image/png", resumable=False)
        file = service.files().create(
            body=file_metadata, 
            media_body=media, 
            fields="id, webViewLink",
            supportsAllDrives=True
        ).execute()
        
        return {"success": True, "file_id": file.get("id"), "link": file.get("webViewLink")}
    except Exception as e:
        logger.error("Error uploading to Google Drive: %s", e)
        return {"error": str(e)}
