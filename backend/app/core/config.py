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
    ]
    DOCS_URL: str | None = "/docs"
    FFMPEG_BIN: str = "ffmpeg"
    FFPROBE_BIN: str = "ffprobe"
    SHORTS_STORAGE_DIR: Path = BACKEND_DIR / "storage" / "shorts"
    SHORTS_MAX_UPLOAD_MB: int = 500
    SHORTS_MAX_DURATION_SECONDS: int = 3600
    SHORTS_MAX_CLIP_SECONDS: int = 180
    SHORTS_ENABLED_ENVIRONMENTS: list[str] | str = [
        "development",
        "test",
    ]
    WHISPER_MODEL_SIZE: str = "medium"
    WHISPER_DEVICE: str = "auto"
    WHISPER_COMPUTE_TYPE: str = "auto"
    WHISPER_CPU_THREADS: int = 4
    WHISPER_LANGUAGE: str = ""
    WHISPER_INITIAL_PROMPT: str = (
        "Yeh ek Hinglish video hai, jisme Hindi aur English dono mix hain. "
        "Bhai, aaj hum ek important topic ke baare me baat karenge."
    )
    TRANSCRIBE_MAX_SECONDS: int = 600
    WHISPER_MODEL_DIR: Path = BACKEND_DIR / "storage" / "models"

    @field_validator("SHORTS_STORAGE_DIR", mode="before")
    @classmethod
    def parse_shorts_storage_dir(cls, v: Any) -> Path:
        if v is None:
            return (BACKEND_DIR / "storage" / "shorts").resolve()
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped:
                return (BACKEND_DIR / "storage" / "shorts").resolve()
            p = Path(v_stripped)
            if not p.is_absolute():
                return (BACKEND_DIR / p).resolve()
            return p.resolve()
        if isinstance(v, Path):
            if not v.is_absolute():
                return (BACKEND_DIR / v).resolve()
            return v.resolve()
        return (BACKEND_DIR / "storage" / "shorts").resolve()

    @field_validator("WHISPER_MODEL_DIR", mode="before")
    @classmethod
    def parse_whisper_model_dir(cls, v: Any) -> Path:
        default_dir = (BACKEND_DIR / "storage" / "models").resolve()
        if v is None:
            return default_dir
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped:
                return default_dir
            p = Path(v_stripped)
            if not p.is_absolute():
                return (BACKEND_DIR / p).resolve()
            return p.resolve()
        if isinstance(v, Path):
            if not v.is_absolute():
                return (BACKEND_DIR / v).resolve()
            return v.resolve()
        return default_dir

    @field_validator("WHISPER_MODEL_SIZE", mode="before")
    @classmethod
    def parse_whisper_model_size(cls, v: Any) -> str:
        if v is None:
            return "medium"
        v_str = str(v).strip().lower()
        if not v_str:
            return "medium"
        allowed = {"tiny", "base", "small", "medium", "large-v3"}
        if v_str not in allowed:
            raise ValueError(f"Invalid WHISPER_MODEL_SIZE: '{v}'. Allowed: {', '.join(sorted(allowed))}")
        return v_str

    @field_validator("WHISPER_DEVICE", mode="before")
    @classmethod
    def parse_whisper_device(cls, v: Any) -> str:
        if v is None:
            return "auto"
        v_str = str(v).strip().lower()
        if not v_str:
            return "auto"
        allowed = {"auto", "cuda", "cpu"}
        if v_str not in allowed:
            raise ValueError(f"Invalid WHISPER_DEVICE: '{v}'. Allowed: {', '.join(sorted(allowed))}")
        return v_str

    @field_validator("WHISPER_COMPUTE_TYPE", mode="before")
    @classmethod
    def parse_whisper_compute_type(cls, v: Any) -> str:
        if v is None:
            return "auto"
        v_str = str(v).strip().lower()
        return v_str if v_str else "auto"

    @field_validator("WHISPER_CPU_THREADS", mode="before")
    @classmethod
    def parse_whisper_cpu_threads(cls, v: Any) -> int:
        if v is None:
            return 4
        if isinstance(v, str) and not v.strip():
            return 4
        try:
            val = int(v)
            return val if val >= 1 else 4
        except (ValueError, TypeError):
            return 4

    @field_validator("WHISPER_LANGUAGE", mode="before")
    @classmethod
    def parse_whisper_language(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("WHISPER_INITIAL_PROMPT", mode="before")
    @classmethod
    def parse_whisper_initial_prompt(cls, v: Any) -> str:
        default_prompt = (
            "Yeh ek Hinglish video hai, jisme Hindi aur English dono mix hain. "
            "Bhai, aaj hum ek important topic ke baare me baat karenge."
        )
        if v is None:
            return default_prompt
        v_str = str(v).strip()
        if not v_str:
            return default_prompt
        return v_str

    @field_validator("TRANSCRIBE_MAX_SECONDS", mode="before")
    @classmethod
    def parse_transcribe_max_seconds(cls, v: Any) -> int:
        if v is None:
            return 600
        if isinstance(v, str) and not v.strip():
            return 600
        try:
            val = int(v)
            return val if val > 0 else 600
        except (ValueError, TypeError):
            return 600

    @field_validator("SHORTS_ENABLED_ENVIRONMENTS", mode="before")
    @classmethod
    def parse_shorts_enabled_environments(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [part.strip() for part in v.split(",") if part.strip()]
        if isinstance(v, (list, tuple, set)):
            return [str(part).strip() for part in v if str(part).strip()]
        return ["development", "test"]

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
