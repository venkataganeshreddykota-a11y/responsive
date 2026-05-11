# Responsive Tool — Frontend

React-based frontend for the Responsive Tool. Captures live device previews, detects layout issues, and provides AI-powered CSS fixes across mobile, tablet, laptop, and desktop breakpoints.

---

## Tech Stack

- React 18
- React Router v6
- Axios
- Tailwind CSS
- Bootstrap 5
- React Icons
- CRA (Create React App)

---

## Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- Backend server running on `http://localhost:8000`

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm start
```

App runs on `http://localhost:3000`.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start dev server with hot reload |
| `npm run build` | Build for production into `build/` |

---

## Folder Structure

```
frontend/
├── public/
│   ├── favicon.svg
│   └── index.html
│
├── src/
│   ├── app/                    # App.jsx, routes.jsx, providers.jsx, store.js
│   ├── assets/                 # Icons, images, animations
│   ├── services/               # axios.js, scanService, screenshotService, aiFixService, websocket
│   ├── hooks/                  # useDeviceStream, useLivePreview, useResponsiveScan, useDebounce
│   ├── layouts/                # MainLayout, DashboardLayout
│   ├── features/
│   │   ├── dashboard/          # Dashboard page, Navbar, StatusBanner
│   │   ├── scanner/            # Scanner page, IssuePanel, DeviceReport, ResolutionAdvisor
│   │   ├── liveview/           # DeviceFrame, LiveViewPanel
│   │   ├── codefix/            # AICodeEditor, CodeFixPanel, DeviceIssueViewer, FixPreview
│   │   ├── screenshots/        # ScreenshotViewer
│   │   └── history/            # History page
│   ├── shared/                 # Button, Modal, Loader, EmptyState, ErrorBoundary
│   ├── utils/                  # storage.js, xlsxReport.js
│   ├── styles/                 # globals.css, tailwind.css, animations.css
│   └── dev/                    # devErrorFilter.js, setupProxy.js
│
├── .env                        # Environment variables
├── .gitignore
├── package.json
├── requirements.txt            # Human-readable dependency reference
├── tailwind.config.js
└── postcss.config.js
```

---

## Environment Variables

Create a `.env` file in the `frontend/` root:

```env
REACT_APP_API_URL=http://localhost:8000
```

---

## Proxy Configuration

In development, API and WebSocket requests are proxied to the backend via `src/setupProxy.js`:

| Path | Target |
|---|---|
| `/api/*` | `http://localhost:8000` |
| `/rt-ws/*` | `ws://localhost:8000` |

---

## Building for Production

```bash
npm run build
```

Output goes to `frontend/build/`. Serve it with any static file server or configure Django to serve it.
