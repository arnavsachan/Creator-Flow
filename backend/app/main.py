import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.competitors import router as competitors_router
from app.api.routes.content_plan import router as content_plan_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router
from app.api.routes.ideas import router as ideas_router
from app.api.routes.scripts import router as scripts_router
from app.api.routes.shorts import router as shorts_router
from app.api.routes.thumbnails import router as thumbnails_router
from app.api.routes.youtube import router as youtube_router
from app.core.config import get_settings

logger = logging.getLogger(__name__)


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
    app.include_router(ideas_router, prefix=settings.API_V1_PREFIX)
    app.include_router(scripts_router, prefix=settings.API_V1_PREFIX)
    app.include_router(shorts_router, prefix=settings.API_V1_PREFIX)
    app.include_router(thumbnails_router, prefix=settings.API_V1_PREFIX)
    app.include_router(youtube_router, prefix=settings.API_V1_PREFIX)

    @app.exception_handler(Exception)
    async def global_unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """
        Catches unhandled exceptions inside route handlers to ensure CORS headers
        are always attached to 500 responses rather than causing browser Network Errors.
        """
        origin = request.headers.get("origin")
        response_headers: dict[str, str] = {}
        if origin:
            normalized_origin = origin.rstrip("/")
            if normalized_origin in settings.CORS_ORIGINS:
                response_headers["Access-Control-Allow-Origin"] = origin
                response_headers["Vary"] = "Origin"

        if isinstance(exc, HTTPException):
            if exc.headers:
                response_headers.update(exc.headers)
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=response_headers,
            )
        logger.exception(
            "Unhandled server exception on %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred. Please try again later."},
            headers=response_headers,
        )

    return app


app = create_application()
