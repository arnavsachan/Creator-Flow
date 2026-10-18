import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.db.session import check_database, get_engine, reset_engine
from app.main import create_application


def test_cors_origins_comma_separated_parsing():
    """
    Comma-separated string is parsed, whitespace and trailing slashes stripped, empty entries removed.
    """
    settings = Settings(
        CORS_ORIGINS="http://localhost:5173, http://127.0.0.1:5173/, , https://app.innotech.dev/ "
    )
    assert settings.CORS_ORIGINS == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://app.innotech.dev",
    ]


def test_cors_origins_production_rejects_wildcard():
    """
    In production mode, wildcard '*' is rejected with a clean validation error.
    """
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", CORS_ORIGINS="*")
    assert "wildcard '*'" in str(exc_info.value)


def test_cors_origins_production_rejects_empty():
    """
    In production mode, empty origins list is rejected.
    """
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", CORS_ORIGINS="")
    assert "must not be empty" in str(exc_info.value)


def test_lazy_engine_creation_with_unreachable_db(monkeypatch: pytest.MonkeyPatch):
    """
    Proves that an unreachable DATABASE_URL does not prevent app creation or import.
    """
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://dummy_user:dummy_pass@127.0.0.1:65534/dummy_db",
    )
    from app.core.config import get_settings

    get_settings.cache_clear()
    reset_engine()

    # Application creates without error despite unreachable DB URL
    app = create_application()
    assert app is not None

    # check_database returns False gracefully without throwing an unhandled exception
    assert check_database() is False
