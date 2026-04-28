# Responsive Tool

Full-stack web app — Django REST Framework + React + MySQL + Playwright.

## Prerequisites

- Python 3.11+
- Node.js 18+
- MySQL 8+

## Backend Setup

```bash
cd backend

# 1. Virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Install Playwright browser
playwright install chromium

# 4. Configure environment
cp .env.example .env           # then fill in your DB credentials

# 5. Create MySQL database
# mysql -u root -p
# CREATE DATABASE responsive_tool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 6. Run migrations
python manage.py migrate

# 7. Create admin user
python manage.py createsuperuser

# 8. Start server
python manage.py runserver
```

## Frontend Setup

```bash
cd frontend
npm install
npm start          # runs on http://localhost:3000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/token/ | Login — returns JWT access + refresh tokens |
| POST | /api/auth/token/refresh/ | Refresh access token |
| POST | /api/users/register/ | Register new user |
| GET/PUT | /api/users/me/ | Current user profile |
| GET/POST | /api/scanner/urls/ | List scanned URLs / add URL |
| GET | /api/scanner/reports/ | List all scan reports |
| POST | /api/scanner/scan/ | Trigger a new scan — returns report_id |
| GET | /api/scanner/scan/\<id\>/status/ | Poll scan status + results |

## Scan Response Fields

When a scan completes, the status endpoint returns:

- `verdict` — `"good"` / `"needs_fix"` / `"broken"`
- `score` — 0–100 responsiveness score
- `screenshots` — `{ mobile, tablet, laptop, desktop }` base64 PNGs
- `issue_groups` — issues grouped by category with severity
- `device_status` — per-device status and probe counts
- `resolution_advice` — ordered breakpoint fixes and suggestions
