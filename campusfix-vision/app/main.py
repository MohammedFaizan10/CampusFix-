"""
main.py - CampusFix+ Computer Vision Microservice Application Entry Point.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import torch

from app.config import settings
from app.models.schemas import HealthResponse
from app.routers.vision import router as vision_router
from app.services.yolo_detector import YOLODetector

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("campusfix.vision")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing CampusFix+ Computer Vision Engine...")
    detector = YOLODetector.get_instance()
    logger.info(
        f"Computer Vision Engine loaded (model_ready={detector.is_loaded()}, device={detector.get_device()})."
    )
    yield
    logger.info("Shutting down CampusFix+ Computer Vision Microservice...")

app = FastAPI(
    title="CampusFix+ Computer Vision Microservice",
    description="Local AI-powered visual triage, damage detection, and SLA priority recommendation using OpenCV and YOLO.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Global exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.warning(f"Validation error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "error": "Validation Error", "detail": str(exc)}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "error": "Internal Server Error", "detail": str(exc)}
    )

# Enable CORS for the CampusFix+ frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Vision endpoints
app.include_router(vision_router)

@app.get("/", tags=["Root"])
def root():
    return {
        "service": "CampusFix+ Computer Vision Microservice",
        "version": "1.0.0",
        "status": "online",
        "docs_url": "/docs",
        "health_url": "/health"
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    detector = YOLODetector.get_instance()
    return {
        "status": "healthy",
        "service": "campusfix-vision",
        "version": "1.0.0",
        "model_loaded": detector.is_loaded(),
        "device": detector.get_device()
    }
