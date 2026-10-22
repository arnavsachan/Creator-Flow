# Creator-Flow

> **Enterprise-grade AI Copilot and Analytics Workspace for Modern Digital Creators**

Creator-Flow is a full-stack content creation and channel intelligence platform built for YouTube creators, editors, and digital studios. It combines live YouTube Analytics telemetry, Gemini-powered content strategy and scriptwriting, local speech-to-text Shorts clipping with Faster-Whisper, AI thumbnail visual diagnostics, competitive intelligence, and unified multi-view content scheduling.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Prerequisites](#prerequisites)
- [Installation and Local Setup](#installation-and-local-setup)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Database Migrations](#database-migrations)
- [Automated Testing & Build](#automated-testing--build)
- [Project Directory Structure](#project-directory-structure)
- [Troubleshooting & Common Pitfalls](#troubleshooting--common-pitfalls)
- [Git Collaboration Workflow](#git-collaboration-workflow)
- [Security & Contribution Guidelines](#security--contribution-guidelines)
- [License](#license)

---

## Project Overview

Creator-Flow bridges the gap between raw YouTube performance metrics and actionable creative execution. Instead of toggling between disconnected analytics dashboards, transcription tools, note apps, and script templates, Creator-Flow organizes the creator journey into an integrated loop:

1. **Understand & Diagnose:** Inspect real-time audience retention curves, subscriber velocity, and competitor momentum.
2. **Brainstorm & Strategize:** Generate high-hook video angles, titles, and search-optimized keyword packaging.
3. **Script & Refine:** Draft timecoded video scripts with 5-second hook retention analysis and pacing breakdown.
4. **Package & Score:** Test and predict thumbnail CTR using multimodal Gemini Vision alongside headline clickability metrics.
5. **Repurpose:** Transcribe long-form video audio locally with Whisper and extract viral Shorts candidates.
6. **Plan & Publish:** Schedule ideas across Month, Week, and Pipeline calendar views synchronized with published YouTube videos.

The application natively supports both **`LIVE`** (connected Google OAuth / YouTube Data & Analytics API) and **`DEMO`** (deterministic offline sandbox) telemetry states.

---

## Key Features

### 1. Executive Dashboard & Telemetry
- **Precision KPI Cards:** Real-time metrics for total views, watch hours, subscriber counts, and average view duration with period-over-period delta indicators.
- **Dynamic Growth Charts:** Recharts-powered performance graphs with configurable time horizons (`7d`, `28d`, `90d`, `365d`) stored persistently in `localStorage`.
- **Dual Telemetry Modes:** Seamlessly toggles between mock `DEMO` telemetry and real `LIVE` channel data without synthetic metric leakage.

### 2. YouTube OAuth 2.0 & Channel Management
- **Secure OAuth Handshake:** Standard Google Cloud Web Client OAuth flow (`/api/v1/youtube/oauth/url` and callback).
- **Token Security at Rest:** Cryptographic Fernet encryption of OAuth access and refresh tokens via `TOKEN_ENCRYPTION_KEY`.
- **Channel Hub:** Multi-channel discovery, channel metadata synchronization, and live connection health diagnostics.

### 3. Shorts Clipper & Local Speech Transcription
- **Fast Media Validation:** Server-side FFprobe inspection for container, codec, resolution, and duration constraints.
- **Local Faster-Whisper Pipeline:** On-premise speech transcription powered by `faster-whisper` and CTranslate2 with CPU fallback and Windows CUDA DLL auto-discovery.
- **Hinglish Guidance:** Domain-adapted phonetic initial prompting for seamless code-switching video transcripts.
- **Gemini AI Highlights:** Automatic identification of high-engagement clip boundaries (15s–60s) with hook titles and reasoning.
- **Interactive Clipper Studio:** Visual timeline wave scrubber, in/out trim handles, aspect ratio selection (`9:16`, `1:1`, `16:9`), and sidecar job queue management.

### 4. Script Studio & Retention Audit
- **5-Second Hook Engine:** Generates high-impact negative-angle, curiosity-gap, and narrative story hooks.
- **Timecoded Script Generation:** Complete scripts structured with section markers, camera/b-roll pacing cues, and engagement locks.
- **Retention Drop-off Audit:** Heuristic and AI structural analysis predicting early abandonment points and pacing density.
- **Script Persistence:** Full tenant-isolated database storage with channel linking and instant retrieval.

### 5. Video Ideas & SEO Optimizer
- **Viral Angle Ideation:** Generates niche-targeted concepts with specific hooks, audience personas, and content goal flags.
- **Complete SEO Metadata Kit:** Generates high-CTR title variations, keyword-dense descriptions, comma-separated tags, and hashtags.
- **Idea Library:** Save, search, filter, and mark favorite video concepts with dedicated channel-level isolation.

### 6. Thumbnail Lab & Title Scoring
- **Multimodal Visual Diagnostics:** Uses Google Gemini Vision to evaluate thumbnail contrast, face framing, focal clarity, text readability, and visual curiosity.
- **Title Engagement Scorer:** Analyzes headlines for mobile glanceability, word count balance, specificity anchors, and psychological intrigue.
- **Formula Suggestions:** Generates curiosity hook, numbered listicle, outcome/how-to, and contrarian alternatives.

### 7. Competitor Intelligence
- **Rival Channel Monitoring:** Track competitor subscriber growth, total view counts, video frequencies, and publishing velocity.
- **Channel Sync:** Pulls competitor public statistics and avatars directly via YouTube Data API v3.

### 8. Content Calendar & Planning
- **Unified Schedule:** Interactive Month, Week, and Kanban-style Pipeline views.
- **Published Video Sync:** Distinguishes planned drafts from confirmed published YouTube uploads.
- **Workflow Stages:** Drag-and-drop or modal status progression: `Idea` &rarr; `Scripting` &rarr; `Recording` &rarr; `Editing` &rarr; `Published`.

---

## Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript 6, Vite 8 | High-performance Single Page Application (SPA) |
| **Styling & Icons** | Tailwind CSS v4, Lucide React, clsx | Precision carbon UI design system (`#09090B`) |
| **Data Visualization** | Recharts 3 | Responsive metric and audience velocity graphs |
| **Routing & HTTP** | React Router DOM 7, Axios 1.20 | Client-side routing, request interceptors, and token injection |
| **Frontend Testing** | Vitest 5, Testing Library React, JSDOM, MSW | Component unit, integration, and mock service testing |
| **Backend Framework** | Python 3.12+, FastAPI 0.144, Uvicorn | Asynchronous REST API with auto-generated OpenAPI documentation |
| **ORM & Database** | SQLAlchemy 2.1, Psycopg 3, PostgreSQL 15+ | Relational data modeling, pooling, and schema persistence |
| **Schema Migrations** | Alembic 1.20 | Version-controlled, reproducible database schema migrations |
| **AI Integration** | Google GenAI SDK (`google-genai` &ge; 1.0.0) | Multimodal visual evaluation and LLM generation |
| **Speech-to-Text** | Faster-Whisper 1.2, CTranslate2, FFmpeg | Local, zero-cloud audio transcription and video clipping |
| **Security & Cryptography**| Cryptography (Fernet), PyJWT, Bcrypt | Token encryption at rest and JWT session management |
| **Backend Testing** | Pytest 9, AnyIO, HTTPX | Synchronous and asynchronous backend test suites |

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React + Vite SPA)"]
        UI["Web Browser :5173"]
        State["AppModeContext (DEMO vs LIVE)"]
        Axios["apiClient (Bearer Token Interceptor)"]
        UI --> State --> Axios
    end

    subgraph Server["Backend API (FastAPI + Uvicorn)"]
        Proxy["Uvicorn Server :8000"]
        CORS["CORSMiddleware (Origin Verification)"]
        AuthMid["Bearer Token / Demo Session Auth"]
        Routers["API v1 Routers (/api/v1)"]

        Proxy --> CORS --> AuthMid --> Routers

        Routers --> R_Dash["/dashboard"]
        Routers --> R_YT["/youtube"]
        Routers --> R_Shorts["/shorts"]
        Routers --> R_Ideas["/ideas"]
        Routers --> R_Scripts["/scripts"]
        Routers --> R_Thumbs["/thumbnails"]
        Routers --> R_Comp["/competitors"]
        Routers --> R_Plan["/content-plans"]
    end

    subgraph DB["Relational Database"]
        PG[("PostgreSQL\nDatabase")]
        Alembic["Alembic Migrations"]
        Alembic -.-> PG
        Routers -->|SQLAlchemy 2.1| PG
    end

    subgraph External["External Services & AI Pipeline"]
        GoogleOAuth["Google Cloud OAuth 2.0"]
        YTApi["YouTube Data & Analytics v3"]
        Gemini["Google Gemini AI (google-genai SDK)"]
        Whisper["Faster-Whisper + FFmpeg (Local)"]

        R_YT --> GoogleOAuth
        R_YT --> YTApi
        R_Shorts --> Whisper
        R_Shorts --> Gemini
        R_Ideas --> Gemini
        R_Scripts --> Gemini
        R_Thumbs --> Gemini
    end

    Axios -->|HTTP REST /api/v1| Proxy
```

---

## Prerequisites

Before setting up Creator-Flow locally, ensure your machine satisfies:

- **Operating System:** Windows 10/11, macOS, or Linux.
- **Python:** `3.12` or higher (verified with Python 3.12.7).
- **Node.js:** `20.x` or higher (verified with Node v24 and npm 11).
- **PostgreSQL:** `15.x` or higher running locally (default port `5432`).
- **Git:** `2.40+`.
- **FFmpeg & FFprobe:** Installed and available on system `PATH` (required for Shorts clipping and audio extraction).

Verify prerequisite versions in PowerShell:
```powershell
python --version
node --version
npm --version
git --version
ffmpeg -version
```

---

## Installation and Local Setup

### 1. Clone the Repository

```powershell
git clone https://github.com/arnavsachan/Creator-Flow.git
cd Creator-Flow
```

---

### 2. Backend Setup (Python & FastAPI)

Open a PowerShell terminal in the repository root:

```powershell
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install core dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# (Optional) Install local AI transcription dependencies (Faster-Whisper)
pip install -r requirements-ai.txt
```

#### Configure Environment File:
Copy the example environment configuration into `backend/.env`:
```powershell
Copy-Item .env.example .env
```
Open `backend/.env` in your text editor and adjust your PostgreSQL credentials and API keys (see [Environment Variables](#environment-variables)).

#### Apply Database Migrations:
Ensure your PostgreSQL server is active and the target database (e.g. `creator_flow`) exists. Then apply the complete Alembic migration sequence:
```powershell
alembic upgrade head
```

---

### 3. Frontend Setup (React & Vite)

Open a second PowerShell terminal in the repository root:

```powershell
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Configure environment file
Copy-Item .env.example .env
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `APP_NAME` | No | `"Innotech API"` | Application identifier displayed in OpenAPI docs. |
| `ENVIRONMENT` | Yes | `development` | Environment mode (`development`, `test`, `production`). |
| `API_V1_PREFIX` | Yes | `/api/v1` | Prefix prepended to all application route mounts. |
| `DATABASE_URL` | Yes | `postgresql+psycopg://user:pass@127.0.0.1:5432/dbname` | PostgreSQL connection URI. Special characters in password must be URL-encoded (e.g. `@` as `%40`). |
| `CORS_ORIGINS` | Yes | `http://localhost:5173,http://127.0.0.1:5173` | Comma-delimited list of permitted frontend origins. |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Client redirect target used by OAuth callbacks. |
| `JWT_SECRET_KEY` | Yes | Random secure string | Secret used to sign and verify application JWT session tokens. |
| `JWT_ALGORITHM` | No | `HS256` | Cryptographic algorithm for JWT generation. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `1440` | Session lifetime (in minutes; default 24h). |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte URL-safe base64 string | Fernet key used to encrypt OAuth refresh/access tokens at rest. |
| `GOOGLE_CLIENT_ID` | Optional | `*.apps.googleusercontent.com` | Google Cloud OAuth 2.0 Web Client ID. |
| `GOOGLE_CLIENT_SECRET` | Optional | Client Secret | Google Cloud OAuth 2.0 Client Secret. |
| `GOOGLE_REDIRECT_URI` | Optional | `http://localhost:8000/api/v1/youtube/oauth/callback` | Authorized redirect URI configured in Google Cloud Console. |
| `GEMINI_API_KEY` | Optional | Google AI Studio Key | API Key for Gemini models (Script Studio, Video Ideas, Thumbnail Lab). |
| `GEMINI_MODEL` | No | `gemini-3.5-flash-lite` | Primary Gemini model for visual & textual evaluation. |
| `GEMINI_FALLBACK_MODEL` | No | `gemini-flash-lite-latest` | Fallback model if primary encounters rate limits or 503. |
| `FFMPEG_BIN` | No | `ffmpeg` | Path or system command for FFmpeg executable. |
| `FFPROBE_BIN` | No | `ffprobe` | Path or system command for FFprobe executable. |
| `WHISPER_MODEL_SIZE` | No | `medium` | Whisper model tier (`tiny`, `base`, `small`, `medium`, `large-v3`). |
| `WHISPER_DEVICE` | No | `auto` | Execution compute target (`auto`, `cuda`, `cpu`). |

> [!WARNING]
> Never commit real secrets, private tokens, passwords, or `.env` files to source control. `.env` files are ignored by git.

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | `http://127.0.0.1:8000/api/v1` | Root URL for the backend API v1 endpoints. |
| `VITE_ENABLE_BACKEND_CHECK`| No | `false` | When `true`, executes a probe to `/health/ready` on frontend mount and logs status to console. |

---

## Running the Application

### 1. Start the Backend API Server

In your backend terminal (with `.venv` activated):

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- **Backend API Root:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Alternative ReDoc UI:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **Health Probes:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) & [http://127.0.0.1:8000/health/ready](http://127.0.0.1:8000/health/ready)

### 2. Start the Frontend Development Server

In your frontend terminal:

```powershell
cd frontend
npm run dev
```
- **Local Application:** [http://localhost:5173](http://localhost:5173)

To terminate either server, press `Ctrl + C` in its respective terminal window.

---

## Database Migrations

Schema management is handled by Alembic. The database migrations form a validated, unified version history:

```
3344c9c919e8 (users, channels, oauth)
  └─ 6dd95def1a4a (channel snapshots, videos)
       └─ b41f71a9e201 (video duration & description)
            └─ c5e91f0b1234 (content plans)
                 └─ d7a31e8f9b20 (competitors)
                      ├─ e8b2f91a4c30 (shorts jobs & clips)
                      └─ e8f12a3b4c5d (scripts)
                           └─ f9a23b4c5d6e (video ideas)
                                └─ ef058dfe7235 (merged heads revision)
```

### Common Migration Commands

Run all commands from the `backend/` directory with `.venv` active:

```powershell
# Inspect currently applied revision in the database
alembic current

# Show full migration revision history
alembic history --verbose

# Inspect pending SQL without executing against the database
alembic upgrade head --sql

# Apply all pending migrations to the latest head
alembic upgrade head
```

> [!CAUTION]
> Never run destructive database resets, `DROP TABLE` scripts, or `alembic downgrade base` in active development environments.

---

## Automated Testing & Build

### Running Backend Tests
Creator-Flow uses Pytest with an in-memory SQLite isolation fixture for standard unit tests, alongside mocked external integrations:

```powershell
cd backend
pytest
```
*Executes all 241 tests across auth, competitors, config, content plans, CORS, dashboard, health, highlights, scripts, security, shorts, thumbnails, transcription, video ideas, and YouTube services.*

To run a specific module or test keyword:
```powershell
pytest tests/test_video_ideas.py
pytest -k "test_transcribe"
```

### Running Frontend Tests
Frontend tests are executed via Vitest and JSDOM:

```powershell
cd frontend
npm test
```
*Executes all 188 tests across 21 test files including Dashboard, Shorts Clipper, Script Studio, Thumbnail Lab, Video Ideas, and Content Planner.*

### Frontend Production Build
To validate TypeScript types and generate the production bundle:

```powershell
cd frontend
npm run build
```

---

## Project Directory Structure

```text
Creator-Flow/
├── README.md                           # Master project documentation
├── ROADMAP.md                          # Phase-by-phase engineering delivery plan
│
├── backend/                            # FastAPI backend application
│   ├── alembic/                        # Database migrations directory
│   │   ├── versions/                   # Migration revision scripts
│   │   └── env.py                      # Dynamic database configuration & models import
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py                 # Dependency injection (db sessions, JWT user auth)
│   │   │   └── routes/                 # Modular API endpoints
│   │   │       ├── auth.py             # Session and token endpoints
│   │   │       ├── competitors.py      # Competitor tracking endpoints
│   │   │       ├── content_plan.py     # Calendar planning endpoints
│   │   │       ├── dashboard.py        # KPI and overview aggregations
│   │   │       ├── health.py           # /health and /health/ready probes
│   │   │       ├── ideas.py            # AI video ideas & SEO generation
│   │   │       ├── scripts.py          # Script generation & retention audit
│   │   │       ├── shorts.py           # Shorts upload, transcription, clip cuts
│   │   │       ├── thumbnails.py       # Thumbnail scoring & title optimization
│   │   │       └── youtube.py          # OAuth callbacks & channel analytics
│   │   ├── core/
│   │   │   ├── config.py               # Pydantic BaseSettings & env parsing
│   │   │   └── security.py             # Passwords, JWT, and Fernet encryption
│   │   ├── db/
│   │   │   ├── base.py                 # SQLAlchemy declarative base
│   │   │   └── session.py              # Engine creation & session factory
│   │   ├── models/                     # SQLAlchemy ORM database models
│   │   ├── schemas/                    # Pydantic input/output schemas
│   │   ├── services/                   # Business logic, Gemini SDK, & Whisper pipeline
│   │   └── main.py                     # FastAPI factory, CORS, & global error handler
│   ├── tests/                          # Pytest automated test suites
│   ├── .env.example                    # Template environment variables
│   ├── alembic.ini                     # Alembic configuration file
│   ├── pytest.ini                      # Pytest runner settings
│   ├── requirements.txt                # Core backend dependencies
│   └── requirements-ai.txt             # Optional speech transcription dependencies
│
└── frontend/                           # React 19 + TypeScript + Vite SPA
    ├── public/                         # Static assets and icons
    ├── src/
    │   ├── components/                 # Reusable UI widgets, modals, charts, and layout
    │   │   ├── layout/                 # Navigation sidebar, header, and frame
    │   │   └── shorts/                 # Clipper player, trimmer, dropzone, and gallery
    │   ├── context/                    # AppModeContext (DEMO vs LIVE data state)
    │   ├── pages/                      # 12 primary workspace view pages
    │   │   ├── AnalyticsPage.tsx       # Retention, traffic sources, and velocity
    │   │   ├── AudiencePage.tsx        # Demographics and geography insights
    │   │   ├── ChannelsPage.tsx        # Channel connection and management
    │   │   ├── CompetitorsPage.tsx     # Competitor tracking and comparisons
    │   │   ├── ContentLibraryPage.tsx  # Uploaded and synced video library
    │   │   ├── ContentPlannerPage.tsx  # Month, Week, and Pipeline calendar
    │   │   ├── DashboardPage.tsx       # KPI cards, velocity charts, and triage
    │   │   ├── ScriptStudioPage.tsx    # Hook generator, scriptwriter, and audit
    │   │   ├── SettingsPage.tsx        # User settings and API status
    │   │   ├── ShortsClipperPage.tsx   # Video cutter, Whisper, and highlights
    │   │   ├── ThumbnailLabPage.tsx    # Vision visual diagnostics & headline test
    │   │   └── VideoIdeasPage.tsx      # Video concepts and SEO packaging kit
    │   ├── services/                   # Axios API service clients
    │   ├── types/                      # TypeScript schemas and data interfaces
    │   ├── utils/                      # Formatting helpers and date utilities
    │   ├── App.tsx                     # Main router and provider configuration
    │   └── main.tsx                    # React DOM root entry point
    ├── .env.example                    # Template frontend environment variables
    ├── package.json                    # Node dependencies and scripts
    ├── tsconfig.json                   # TypeScript compiler configuration
    └── vite.config.ts                  # Vite bundler & plugin configuration
```

---

## Troubleshooting & Common Pitfalls

### 1. `relation "scripts"` or `relation "video_ideas" does not exist`
- **Cause:** Local PostgreSQL database has not been upgraded to the latest Alembic revision.
- **Fix:** Run `alembic upgrade head` from within `backend/` with your virtual environment active.

### 2. Browser Shows `No 'Access-Control-Allow-Origin' header` / `Network Error`
- **Cause:** The frontend origin (e.g. `http://localhost:5173` or `http://localhost:5174`) is missing from `CORS_ORIGINS` in `backend/.env`.
- **Fix:** Verify `CORS_ORIGINS` in `backend/.env`:
  ```env
  CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
  ```
  Restart Uvicorn after saving `.env`.

### 3. `ModuleNotFoundError: No module named 'google'`
- **Cause:** The official Google GenAI SDK is not installed in your active virtual environment.
- **Fix:** In your activated backend environment, install:
  ```powershell
  pip install "google-genai>=1.0.0"
  ```

### 4. `FFmpeg not found` or Audio Extraction Fails
- **Cause:** FFmpeg binaries are missing or not registered on system `PATH`.
- **Fix:** Install FFmpeg (e.g. via `winget install Gyan.FFmpeg` on Windows) and verify with `ffmpeg -version`. Alternatively, specify the absolute path in `backend/.env`:
  ```env
  FFMPEG_BIN=C:\ffmpeg\bin\ffmpeg.exe
  FFPROBE_BIN=C:\ffmpeg\bin\ffprobe.exe
  ```

### 5. PostgreSQL Special Characters in Password
- **Cause:** Password containing `@`, `:`, `#`, or `/` breaks database URI parsing.
- **Fix:** URL-encode the special characters in `DATABASE_URL` (e.g. `@` becomes `%40`).

---

## Git Collaboration Workflow

To maintain stability across branches and contributors:

1. **Feature Branching:** Always branch off the integration branch or `main`:
   ```powershell
   git checkout -b feature/your-feature-name
   ```
2. **Never Commit Secrets:** Confirm `.env`, database dumps, and virtual environments (`.venv/`, `node_modules/`, `dist/`) remain uncommitted:
   ```powershell
   git status -sb
   ```
3. **Verify Tests Before Pushing:**
   ```powershell
   # Run backend tests
   pytest
   # Run frontend tests & build
   cd ../frontend; npm test; npm run build
   ```
4. **Pull Requests:** Open PRs against the appropriate integration branch rather than pushing directly to `main`.

---

## Security & Contribution Guidelines

- **Token Protection:** OAuth access and refresh tokens must always pass through the encryption service before entering the database. Never store raw tokens in plaintext.
- **Tenant Isolation:** All database read/write queries for user-owned records (scripts, ideas, plans, channels) must filter by `user_id = current_user.id`.
- **API Contract Preservation:** Do not alter existing endpoint payload models without providing backward-compatible defaults.
- **Sanitized Uploads:** File names uploaded through the Shorts Clipper are sanitized to UUIDs internally to prevent path traversal vulnerabilities.

---

## License

*License has not yet been specified.* All rights reserved. Check repository terms or contact the project maintainers for licensing and commercial usage guidelines.