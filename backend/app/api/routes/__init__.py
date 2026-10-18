from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router

__all__ = ["health_router", "dashboard_router"]
