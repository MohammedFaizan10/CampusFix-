"""
vision.py - FastAPI routes for the Computer Vision microservice.
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from app.models.schemas import AnalysisResult
from app.services.yolo_detector import YOLODetector
from app.services.mapper import CATEGORY_MAPPING

router = APIRouter(prefix="/api/v1/vision", tags=["Computer Vision"])

ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@router.post("/analyze", response_model=AnalysisResult)
async def analyze_evidence_image(
    file: UploadFile = File(..., description="Uploaded damage evidence image")
):
    """
    Accepts a single visual evidence photograph, executes YOLO object detection
    and OpenCV structural anomaly analysis, and returns:
    - Bounding boxes and labels
    - Suggested CampusFix+ Category
    - Predicted Priority SLA
    - Assessed damage severity
    - Annotated Base64 image
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file.content_type}'. Must be JPG, PNG, or WebP."
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds the 10 MB limit."
        )

    try:
        detector = YOLODetector.get_instance()
        result = detector.analyze_image(image_bytes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal vision processing error: {str(e)}"
        )

@router.get("/categories")
async def get_supported_categories():
    """
    Returns reference taxonomy of detected labels and their target CampusFix+ mappings.
    """
    return {
        "mappings": CATEGORY_MAPPING,
        "campus_categories": [
            "ELECTRICAL", "PLUMBING", "CIVIL", "HVAC",
            "IT_NETWORK", "FURNITURE", "CLEANLINESS", "SAFETY", "OTHER"
        ],
        "priority_levels": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    }

