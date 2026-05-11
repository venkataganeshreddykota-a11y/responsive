"""
Run this once to get a refresh token for the new OAuth client.
Usage:
    python get_refresh_token.py
"""
import os
from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

CLIENT_ID     = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()

if not CLIENT_ID or not CLIENT_SECRET or "YOUR_NEW" in CLIENT_SECRET:
    print("\nERROR: Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first.\n")
    raise SystemExit(1)

client_config = {
    "installed": {
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
        "token_uri":     "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(
    client_config,
    scopes=["https://www.googleapis.com/auth/drive"],
)

creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")

print("\n" + "="*60)
print("SUCCESS! Add this to your .env file:")
print("="*60)
print(f"GOOGLE_OAUTH_REFRESH_TOKEN={creds.refresh_token}")
print("="*60 + "\n")
