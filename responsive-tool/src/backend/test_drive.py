import os
import django
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()

def test_connection():
    json_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    
    print(f"--- Google Drive Diagnostic ---")
    print(f"Credentials Path: {json_path}")
    print(f"Target Folder ID: {folder_id}")
    
    if not json_path or not os.path.exists(json_path):
        print("ERROR: Credentials file not found!")
        return

    try:
        creds = service_account.Credentials.from_service_account_file(
            json_path, 
            scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        service = build("drive", "v3", credentials=creds)
        
        print("\nChecking folder access...")
        folder = service.files().get(fileId=folder_id, fields="name, owners").execute()
        print(f"SUCCESS! Found folder: '{folder.get('name')}'")
        print(f"Owner: {folder.get('owners')[0].get('displayName')}")
        
    except Exception as e:
        print(f"\nFAILED! Error: {e}")
        print("\nPossible reasons:")
        print("1. The Folder ID is wrong.")
        print("2. You haven't shared the folder with the service account email.")
        print("3. Your organization is blocking external accounts.")

if __name__ == "__main__":
    test_connection()
