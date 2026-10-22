from pathlib import Path
from typing import Any, Literal, Optional
import json

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend directory and .env absolute path
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Innotech API"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/innotech"
    CORS_ORIGINS: list[str] | str = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ]
    DOCS_URL: str | None = "/docs"
    FRONTEND_URL: str = "http://localhost:5173"

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/youtube/oauth/callback"

    # Security & Encryption
    TOKEN_ENCRYPTION_KEY: str = "creatorflow-default-encryption-key-for-development"
    JWT_SECRET_KEY: str = "creatorflow-default-jwt-secret-key-for-development"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Google Gemini AI Configuration
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_FALLBACK_MODEL: str | None = "gemini-flash-lite-latest"
    # Coordinated timeout budget:
    # - Multimodal Thumbnail Vision SDK: 25.0s (Backend limit; Frontend client timeout: 30.0s)
    # - Title Text Optimization SDK: 20.0s (Backend limit; Frontend client timeout: 25.0s)
    GEMINI_TIMEOUT_SECONDS: float = 25.0
    GEMINI_TITLE_TIMEOUT_SECONDS: float = 20.0

    @property
    def is_google_oauth_configured(self) -> bool:
        """
        Validates that Google OAuth Client ID and Secret are configured with non-empty,
        non-placeholder values following the official Google Web client format.
        """
        cid = (self.GOOGLE_CLIENT_ID or "").strip()
        sec = (self.GOOGLE_CLIENT_SECRET or "").strip()
        if not cid or not sec:
            return False
        if any(ph in cid.lower() for ph in ["your-google-client-id", "placeholder", "replace-with", "example"]):
            return False
        if not cid.endswith(".apps.googleusercontent.com") or "-" not in cid:
            return False
        if any(ph in sec.lower() for ph in ["your-google-client-secret", "placeholder", "replace-with", "example"]):
            return False
        if len(sec) < 10:
            return False
        return True

    @property
    def google_cloud_project_number(self) -> Optional[str]:
        """
        Extracts the numeric Google Cloud project number from GOOGLE_CLIENT_ID if present.
        Example: '737022823471-xxx.apps.googleusercontent.com' -> '737022823471'
        """
        cid = (self.GOOGLE_CLIENT_ID or "").strip()
        if "-" in cid:
            prefix = cid.split("-")[0]
            if prefix.isdigit():
                return prefix
        return None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip().rstrip("/") for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [part.strip().rstrip("/") for part in v.split(",") if part.strip()]
        if isinstance(v, (list, tuple, set)):
            return [str(part).strip().rstrip("/") for part in v if str(part).strip()]
        return []

    @model_validator(mode="after")
    def validate_production_cors(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if not self.CORS_ORIGINS:
                raise ValueError("In production, CORS_ORIGINS must not be empty.")
            if any(origin == "*" for origin in self.CORS_ORIGINS):
                raise ValueError("In production, CORS_ORIGINS must not contain wildcard '*'.")
        return self


_settings: Optional[Settings] = None
_settings_env_mtime: float = -1.0


def get_settings() -> Settings:
    """
    Returns application settings, automatically invalidating the cached instance
    if the underlying .env file is modified on disk.
    """
    global _settings, _settings_env_mtime
    current_mtime = -1.0
    if ENV_FILE.exists():
        try:
            current_mtime = ENV_FILE.stat().st_mtime
        except OSError:
            pass
    if _settings is None or current_mtime != _settings_env_mtime:
        _settings = Settings()
        _settings_env_mtime = current_mtime
    return _settings


def _clear_settings_cache() -> None:
    global _settings, _settings_env_mtime
    _settings = None
    _settings_env_mtime = -1.0


get_settings.cache_clear = _clear_settings_cache
