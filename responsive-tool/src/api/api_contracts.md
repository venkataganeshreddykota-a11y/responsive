# API Contracts

## Authentication
- `POST /api/auth/token/` — obtain JWT access + refresh tokens
- `POST /api/auth/token/refresh/` — refresh access token

## Users
- `POST /api/users/register/` — create account `{ username, email, password }`
- `GET  /api/users/me/` — get current user (auth required)

## Scanner
- `GET  /api/scanner/urls/` — list scanned URLs for current user
- `POST /api/scanner/scan/` — trigger scan `{ url }` → `{ report_id, status }`
- `GET  /api/scanner/scan/<report_id>/status/` — poll scan result
