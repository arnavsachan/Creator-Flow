from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import check_database

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


class ReadinessResponse(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def health_check() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
    )


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    responses={
        200: {"description": "Service is ready and database is connected", "model": ReadinessResponse},
        503: {"description": "Service is not ready or database is unreachable", "model": ReadinessResponse},
    },
)
def readiness_check(response: Response) -> ReadinessResponse:
    is_db_up = check_database()
    if is_db_up:
        return ReadinessResponse(status="ready", database="up")

    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(status="not_ready", database="down")
