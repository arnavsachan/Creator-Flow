import logging
from collections.abc import Generator
from typing import Optional

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_engine: Optional[Engine] = None
_session_factory: Optional[sessionmaker[Session]] = None


def get_engine() -> Engine:
    """
    Lazily creates and returns the SQLAlchemy Engine.
    Ensures that importing the app never fails or blocks when PostgreSQL is down.
    """
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {}
        if "postgresql" in settings.DATABASE_URL:
            connect_args = {"connect_timeout": 3}
        elif "sqlite" in settings.DATABASE_URL:
            connect_args = {"check_same_thread": False}

        _engine = create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
    return _engine



def get_session_factory() -> sessionmaker[Session]:
    """
    Lazily creates and returns the sessionmaker factory bound to the current engine.
    """
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return _session_factory


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session and guarantees closure.
    """
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def check_database() -> bool:
    """
    Non-destructive check that runs SELECT 1.
    Returns True if reachable, False otherwise.
    Never logs credentials or connection strings; logs only the exception class name.
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.warning("Database connectivity check failed: %s", type(e).__name__)
        return False


def reset_engine() -> None:
    """
    Disposes and resets the cached engine and session factory.
    Useful for test suites and dynamic environment reconfiguration.
    """
    global _engine, _session_factory
    if _engine is not None:
        try:
            _engine.dispose()
        except Exception:
            pass
    _engine = None
    _session_factory = None
