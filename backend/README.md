# Innotech Backend — Phase 1 (Foundation)

Backend foundation built with FastAPI, SQLAlchemy 2.x, psycopg v3, Alembic, and Pydantic Settings.

## Project Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── session.py
│   └── api/
│       ├── __init__.py
│       └── routes/
│           ├── __init__.py
│           └── health.py
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── alembic.ini
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_config.py
│   ├── test_cors.py
│   └── test_health.py
├── .env.example
├── .gitignore
├── pytest.ini
├── requirements.txt
└── README.md
```

## Quick Start (PowerShell)

### 1. Environment Setup

Create `.env` inside `backend/` using `.env.example`:

```powershell
Copy-Item .env.example .env
```

Configure `DATABASE_URL` with your local PostgreSQL user and credentials:

```ini
DATABASE_URL=postgresql+psycopg://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>
```

> **Note**: If your password contains special characters (e.g. `@`, `:`, `/`, `#`), they must be URL-encoded (e.g., `@` becomes `%40`).

### 2. Run Backend Server

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Or invoke the venv Python directly:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Endpoints

- Health: `http://127.0.0.1:8000/health`
- Readiness: `http://127.0.0.1:8000/health/ready`
- Interactive API Docs: `http://127.0.0.1:8000/docs`

### 4. Run Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -v
```

### 5. Alembic Tooling

Check migration status:

```powershell
.\.venv\Scripts\python.exe -m alembic heads
```
