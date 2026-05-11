"""
Google Drive upload utility using a Service Account.
Uploads a file, makes it publicly readable, and returns the shareable URL.
"""
import logging
import os
import uuid
from datetime import datetime

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger(__name__)

# Scopes required for Drive file management
_SCOPES = ["https://www.googleapis.com/auth/drive"]


def _get_drive_service():
    """Build and return an authenticated Drive API service client."""
    credentials_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not credentials_path:
        raise EnvironmentError(
            "GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. "
            "Point it to your service account JSON file path."
        )
    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=_SCOPES
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def upload_screenshot(
    file_path: str,
    device_name: str,
    folder_id: str | None = None,
) -> str:
    """
    Upload a PNG screenshot to Google Drive.

    Args:
        file_path:   Absolute path to the temporary PNG file.
        device_name: e.g. "mobile", "tablet" — used in the filename.
        folder_id:   Google Drive folder ID to upload into (optional).

    Returns:
        Public shareable URL string: https://drive.google.com/uc?id=<file_id>

    Raises:
        HttpError: on Drive API failures.
        EnvironmentError: if credentials env var is missing.
    """
    service = _get_drive_service()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    filename = f"screenshot_{device_name}_{timestamp}_{unique_id}.png"

    metadata = {"name": filename, "mimeType": "image/png"}
    if folder_id:
        metadata["parents"] = [folder_id]

    media = MediaFileUpload(file_path, mimetype="image/png", resumable=False)

    try:
        file_obj = (
            service.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id",
                supportsAllDrives=True,
            )
            .execute()
        )
        file_id = file_obj["id"]
        logger.info("Uploaded screenshot '%s' → Drive file ID: %s", filename, file_id)
    except HttpError as exc:
        logger.error("Drive upload failed for %s: %s", filename, exc)
        raise

    # Make the file publicly readable (anyone with the link)
    try:
        service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"},
            supportsAllDrives=True,
        ).execute()
        logger.info("Set public permission on Drive file: %s", file_id)
    except HttpError as exc:
        logger.error("Failed to set public permission on %s: %s", file_id, exc)
        raise

    return f"https://drive.google.com/uc?id={file_id}"
