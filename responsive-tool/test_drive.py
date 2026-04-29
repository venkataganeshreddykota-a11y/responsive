"""
Run this from the responsive-tool/ directory to test Drive upload:
    python test_drive.py
"""
import os, sys, tempfile

# Load .env manually
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

creds_path  = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
folder_id   = os.environ.get("GDRIVE_SCREENSHOTS_FOLDER_ID")

print(f"Credentials path : {creds_path}")
print(f"Credentials exist: {os.path.isfile(creds_path) if creds_path else False}")
print(f"Folder ID        : {folder_id}")
print()

if not creds_path or not os.path.isfile(creds_path):
    print("ERROR: credentials file not found. Check GOOGLE_SERVICE_ACCOUNT_JSON in .env")
    sys.exit(1)

# Create a tiny test PNG (1x1 white pixel)
import struct, zlib

def make_tiny_png():
    def chunk(name, data):
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw  = b"\x00\xff\xff\xff"
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend

with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
    f.write(make_tiny_png())
    tmp_path = f.name

print(f"Test PNG created : {tmp_path}")
print()

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=["https://www.googleapis.com/auth/drive"]
    )
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    print("✓ Authenticated with Google Drive")

    metadata = {"name": "test_screenshot.png", "mimeType": "image/png"}
    if folder_id:
        metadata["parents"] = [folder_id]

    media = MediaFileUpload(tmp_path, mimetype="image/png", resumable=False)
    file_obj = service.files().create(
        body=metadata, media_body=media, fields="id,name", supportsAllDrives=True
    ).execute()
    file_id = file_obj["id"]
    print(f"✓ Uploaded file ID : {file_id}")

    service.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        supportsAllDrives=True,
    ).execute()
    print(f"✓ Set public permission")
    print(f"✓ Public URL: https://drive.google.com/uc?id={file_id}")
    print()
    print("SUCCESS — Drive upload is working correctly!")

except Exception as e:
    print(f"FAILED: {e}")
    import traceback; traceback.print_exc()

finally:
    os.unlink(tmp_path)
