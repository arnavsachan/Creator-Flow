from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.competitors import router as competitors_router
from app.api.routes.content_plan import router as content_plan_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router
from app.api.routes.youtube import router as youtube_router
from app.core.config import get_settings


def create_application() -> FastAPI:
    settings = get_settings()

    # Docs enabled in development/test, disabled in production unless specified
    docs_url = settings.DOCS_URL if settings.ENVIRONMENT != "production" else None
    redoc_url = "/redoc" if settings.ENVIRONMENT != "production" else None

    app = FastAPI(
        title=settings.APP_NAME,
        docs_url=docs_url,
        redoc_url=redoc_url,
    )

    # Explicit CORS configuration with strict methods and headers
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    )

    # Mount health router at root: /health and /health/ready
    app.include_router(health_router)

    # Mount API v1 routers
    app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
    app.include_router(competitors_router, prefix=settings.API_V1_PREFIX)
    app.include_router(content_plan_router, prefix=settings.API_V1_PREFIX)
    app.include_router(dashboard_router, prefix=settings.API_V1_PREFIX)
    app.include_router(youtube_router, prefix=settings.API_V1_PREFIX)

    return app



app = create_application()
