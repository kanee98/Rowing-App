import logging
import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, run_additive_migrations

# Routers
from app.api.auth import router as auth_router
from app.api.clubs import router as clubs_router
from app.api.competitions import router as competitions_router
from app.api.equipment import router as equipment_router
from app.api.exercises import router as exercises_router
from app.api.schedules import router as schedules_router
from app.api.performance import router as performance_router
from app.api.analytics import router as analytics_router
from app.api.onboarding import router as onboarding_router
from app.api.notifications import router as notifications_router
from app.api.weather import router as weather_router
from app.api.taxonomy import router as taxonomy_router
from app.api.availability import router as availability_router
from app.api.membership import router as membership_router
from app.api.operations import router as operations_router
from app.api.account import router as account_router
from app.core.migrations import run_migrations
from app.services.delivery import delivery_loop
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if not exist
    logger.info("Initializing database tables...")
    run_migrations()
    delivery_task = asyncio.create_task(delivery_loop()) if settings.EMAIL_WORKER_ENABLED else None

    yield
    if delivery_task:
        delivery_task.cancel()
        with suppress(asyncio.CancelledError):
            await delivery_task
    logger.info("Shutting down application...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(clubs_router, prefix=settings.API_V1_STR)
app.include_router(competitions_router, prefix=settings.API_V1_STR)
app.include_router(equipment_router, prefix=settings.API_V1_STR)
app.include_router(exercises_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(performance_router, prefix=settings.API_V1_STR)
app.include_router(analytics_router, prefix=settings.API_V1_STR)
app.include_router(onboarding_router, prefix=settings.API_V1_STR)
app.include_router(notifications_router, prefix=settings.API_V1_STR)
app.include_router(weather_router, prefix=settings.API_V1_STR)
app.include_router(taxonomy_router, prefix=settings.API_V1_STR)
app.include_router(availability_router, prefix=settings.API_V1_STR)
app.include_router(membership_router, prefix=settings.API_V1_STR)
app.include_router(operations_router, prefix=settings.API_V1_STR)
app.include_router(account_router, prefix=settings.API_V1_STR)

@app.get("/health/ready")
def ready():
    from fastapi import HTTPException
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database is not ready")

@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }
