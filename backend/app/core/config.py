from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
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
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    # Coordinated timeout budget:
    # - Multimodal Thumbnail Vision SDK: 25.0s (Backend limit; Frontend client timeout: 30.0s)
    # - Title Text Optimization SDK: 15.0s (Backend limit; Frontend client timeout: 20.0s)
    GEMINI_TIMEOUT_SECONDS: float = 25.0
    GEMINI_TITLE_TIMEOUT_SECONDS: float = 15.0

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
