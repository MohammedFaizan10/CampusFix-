"""
schemas.py - Comprehensive Pydantic models for CampusFix+ Computer Vision.
Separates object detection (YOLO) from damage heuristics (OpenCV) and image quality.
"""

from typing import List, Optional
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    x1: int = Field(..., description="Top-left X coordinate in pixels")
    y1: int = Field(..., description="Top-left Y coordinate in pixels")
    x2: int = Field(..., description="Bottom-right X coordinate in pixels")
    y2: int = Field(..., description="Bottom-right Y coordinate in pixels")

# 1. Image Quality Sub-Models
class ResolutionInfo(BaseModel):
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    megapixels: float = Field(..., description="Image resolution in Megapixels")

class ImageQualitySection(BaseModel):
    blur_detected: bool = Field(..., description="True if blur exceeds detection threshold")
    blur_score: float = Field(..., description="Laplacian variance sharpness metric")
    brightness: float = Field(..., description="Mean normalized luminance [0.0 - 1.0]")
    brightness_status: str = Field(..., description="'UNDEREXPOSED', 'NORMAL', or 'OVEREXPOSED'")
    contrast: float = Field(..., description="RMS normalized contrast [0.0 - 1.0]")
    contrast_status: str = Field(..., description="'LOW_CONTRAST' or 'NORMAL'")
    resolution: ResolutionInfo = Field(..., description="Spatial resolution details")
    quality_status: str = Field(..., description="'EXCELLENT', 'ACCEPTABLE', or 'POOR'")
    quality_score: float = Field(..., description="Overall composite quality score [0.0 - 1.0]")

# 2. Object Detection (YOLO) Sub-Models
class ObjectDetectionItem(BaseModel):
    class_id: int = Field(..., description="COCO class identifier integer")
    label: str = Field(..., description="Class name from YOLO taxonomy")
    confidence: float = Field(..., description="Model prediction probability [0.0 - 1.0]")
    box: BoundingBox = Field(..., description="Bounding box pixel coordinates")

class ObjectDetectionSection(BaseModel):
    model: str = Field(default="yolov8n", description="Underlying model identifier")
    detected_count: int = Field(default=0, description="Number of localized objects")
    detections: List[ObjectDetectionItem] = Field(default_factory=list)

# 3. Damage Analysis (OpenCV Heuristics) Sub-Models
class DamageIndicatorItem(BaseModel):
    indicator_type: str = Field(..., description="'SURFACE_CRACK_CANDIDATE' or 'MOISTURE_STAIN_CANDIDATE'")
    label: str = Field(..., description="Preliminary indicator label ('wall_crack', 'seepage')")
    confidence: float = Field(..., description="Heuristic indicator score (bounded)")
    reliability: str = Field(default="PRELIMINARY_HEURISTIC", description="Reliability level")
    box: BoundingBox = Field(..., description="Candidate bounding coordinates")
    description: str = Field(..., description="Observation description")

class DamageAnalysisSection(BaseModel):
    method: str = Field(default="OPENCV_HEURISTICS", description="Analysis methodology")
    status: str = Field(default="PRELIMINARY", description="Indicator validation status")
    indicators: List[DamageIndicatorItem] = Field(default_factory=list)
    heuristic_notes: str = Field(
        default="Preliminary indicator derived from image processing heuristics. Requires human visual verification before physical dispatch."
    )

# 4. Recommendation Section
class RecommendationSection(BaseModel):
    suggested_category: str = Field(..., description="Recommended CampusFix+ Category")
    suggested_priority: str = Field(..., description="Recommended SLA Priority")
    damage_severity: str = Field(..., description="Assessed damage severity ('LOW', 'MEDIUM', 'HIGH')")
    requires_human_review: bool = Field(default=True, description="Always true for heuristic and preliminary triage")
    confidence: float = Field(..., description="Composite decision confidence score")
    reasoning: str = Field(..., description="Plain-language triage rationale")

# 5. Legacy Flat Item (for backward compatibility)
class LegacyDetectionItem(BaseModel):
    label: str
    confidence: float
    box: BoundingBox
    source: str

# 6. Unified Root Analysis Result
class AnalysisResult(BaseModel):
    success: bool = True
    image_quality: ImageQualitySection
    object_detection: ObjectDetectionSection
    damage_analysis: DamageAnalysisSection
    recommendation: RecommendationSection
    annotated_image: Optional[str] = Field(None, description="Base64 encoded JPEG overlay")
    processing_time_ms: float = Field(..., description="Total analysis duration in ms")

    # Legacy compatibility fields (mirrors recommendation & legacy structure)
    suggested_category: str
    suggested_priority: str
    damage_severity: str
    confidence: float
    summary: str
    detected_items: List[LegacyDetectionItem] = Field(default_factory=list)

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    model_loaded: bool
    device: str
