"""
test_vision.py - Comprehensive Unit & Validation Tests for CampusFix+ Computer Vision.

Covers:
1. Normal campus images
2. Wall crack candidate images
3. Water seepage candidate images
4. Furniture images (YOLO localized)
5. Blurry images (blur detected)
6. Dark / underexposed images
7. Invalid files (rejection validation)
8. Response structure schema compliance (Phase 4)
"""

import io
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.mapper import build_recommendation
from app.services.cv_analyzer import analyze_image_quality, detect_surface_cracks, detect_water_seepage

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

def encode_jpeg(img_np: np.ndarray) -> bytes:
    _, buf = cv2.imencode(".jpg", img_np)
    return buf.tobytes()

@pytest.fixture
def normal_image_bytes():
    """Generates a clean, well-lit normal synthetic image."""
    img = np.full((400, 400, 3), 190, dtype=np.uint8)
    cv2.rectangle(img, (50, 50), (200, 200), (120, 120, 120), -1)
    return encode_jpeg(img)

@pytest.fixture
def blurry_image_bytes():
    """Generates an intentionally blurred image (low Laplacian variance)."""
    img = np.full((300, 300, 3), 160, dtype=np.uint8)
    cv2.circle(img, (150, 150), 60, (100, 100, 100), -1)
    # Heavy Gaussian blur to reduce high-frequency edges
    blurred = cv2.GaussianBlur(img, (45, 45), 0)
    return encode_jpeg(blurred)

@pytest.fixture
def dark_image_bytes():
    """Generates an underexposed / dark image."""
    img = np.full((300, 300, 3), 20, dtype=np.uint8)
    return encode_jpeg(img)

@pytest.fixture
def crack_image_bytes():
    """Generates a synthetic high-contrast jagged fissure on a light background."""
    img = np.full((500, 500, 3), 220, dtype=np.uint8)
    # Draw a jagged, irregular non-straight line (natural crack signature)
    points = np.array([
        [100, 60], [120, 110], [115, 160], [140, 210],
        [135, 270], [170, 330], [165, 400], [190, 450]
    ], np.int32)
    cv2.polylines(img, [points], isClosed=False, color=(15, 15, 15), thickness=3)
    return encode_jpeg(img)

@pytest.fixture
def seepage_image_bytes():
    """Generates an image with a diffuse, localized discoloration patch."""
    img = np.full((400, 400, 3), (200, 200, 200), dtype=np.uint8)
    # Draw saturated moisture patch with diffuse gradient
    for r in range(60, 10, -5):
        alpha = (65 - r) / 60.0
        color = (int(80 * alpha + 200 * (1 - alpha)), int(110 * alpha + 200 * (1 - alpha)), int(70 * alpha + 200 * (1 - alpha)))
        cv2.circle(img, (200, 200), r, color, -1)
    return encode_jpeg(img)

# --- 1. Basic Endpoint Tests ---

def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "version" in data

def test_health_check_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "campusfix-vision"
    assert data["model_loaded"] is True
    assert "device" in data

def test_categories_endpoint(client):
    response = client.get("/api/v1/vision/categories")
    assert response.status_code == 200
    data = response.json()
    assert "mappings" in data
    assert "campus_categories" in data
    assert "CIVIL" in data["campus_categories"]
    assert "ELECTRICAL" in data["campus_categories"]

# --- 2. Phase 1 & 4: Response Structure & Normal Analysis ---

def test_analyze_normal_image_schema(client, normal_image_bytes):
    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("campus_normal.jpg", normal_image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()

    # Verify structured sections exist
    assert data["success"] is True
    assert "image_quality" in data
    assert "object_detection" in data
    assert "damage_analysis" in data
    assert "recommendation" in data
    assert "annotated_image" in data

    # Verify Image Quality section
    iq = data["image_quality"]
    assert "blur_detected" in iq
    assert "brightness" in iq
    assert "contrast" in iq
    assert "quality_status" in iq
    assert iq["resolution"]["width"] == 400
    assert iq["resolution"]["height"] == 400

    # Verify Object Detection section
    od = data["object_detection"]
    assert "model" in od
    assert "detected_count" in od
    assert isinstance(od["detections"], list)

    # Verify Damage Analysis section
    da = data["damage_analysis"]
    assert da["method"] == "OPENCV_HEURISTICS"
    assert da["status"] == "PRELIMINARY"
    assert isinstance(da["indicators"], list)

    # Verify Recommendation section
    rec = data["recommendation"]
    assert rec["requires_human_review"] is True
    assert rec["suggested_priority"] in ["LOW", "MEDIUM", "HIGH"]
    assert "reasoning" in rec

    # Verify legacy backward-compatibility fields
    assert "suggested_category" in data
    assert "suggested_priority" in data
    assert "damage_severity" in data

# --- 3. Phase 2: Image Quality Analysis Tests ---

def test_blurry_image_analysis(client, blurry_image_bytes):
    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("blurry_sample.jpg", blurry_image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    iq = data["image_quality"]
    assert iq["blur_detected"] is True
    assert iq["blur_score"] < 75.0

def test_dark_image_analysis(client, dark_image_bytes):
    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("dark_sample.jpg", dark_image_bytes, "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    iq = data["image_quality"]
    assert iq["brightness_status"] == "UNDEREXPOSED"
    assert iq["brightness"] < 0.22

# --- 4. Phase 3: Damage Analysis Heuristics Tests ---

def test_crack_candidate_detection(crack_image_bytes):
    img_arr = np.frombuffer(crack_image_bytes, np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    quality = analyze_image_quality(img)

    cracks = detect_surface_cracks(img, quality)
    # Should identify the jagged fissure
    assert len(cracks) >= 1
    assert cracks[0]["indicator_type"] == "SURFACE_CRACK_CANDIDATE"
    assert cracks[0]["reliability"] == "PRELIMINARY_HEURISTIC"
    assert cracks[0]["confidence"] <= 0.75  # Capped heuristic confidence

def test_dark_image_suppresses_false_seepage(dark_image_bytes):
    img_arr = np.frombuffer(dark_image_bytes, np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    quality = analyze_image_quality(img)

    # In a dark image, dark shadows must NOT be classified as seepage
    seepage = detect_water_seepage(img, quality)
    assert len(seepage) == 0

def test_recommendation_never_assigns_critical_from_image_alone():
    damage_indicators = [{
        "label": "wall_crack",
        "confidence": 0.72,
        "indicator_type": "SURFACE_CRACK_CANDIDATE"
    }]
    quality = {"quality_status": "ACCEPTABLE"}
    rec = build_recommendation([], damage_indicators, quality)

    # Heuristic alone must never assign CRITICAL priority
    assert rec["suggested_priority"] != "CRITICAL"
    assert rec["requires_human_review"] is True

# --- 5. File Validation & Error Handling ---

def test_reject_non_image_file(client):
    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("document.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    )
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_reject_corrupted_image(client):
    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("corrupt.jpg", b"not-a-valid-image-byte-sequence", "image/jpeg")}
    )
    assert response.status_code == 422
    assert "OpenCV failed to decode" in response.json()["detail"]


# --- 6. Regression Tests ---

def test_analyze_structured_image_no_numpy_unpack_error(client):
    """Regression: images with straight edges must not crash HoughLinesP unpacking (OpenCV 5.x)."""
    img = np.ones((640, 640, 3), dtype=np.uint8) * 180
    # Furniture-like rectangles that produce strong edges -> HoughLinesP lines
    cv2.rectangle(img, (100, 200), (350, 450), (120, 80, 50), -1)
    cv2.rectangle(img, (100, 200), (350, 450), (80, 50, 30), 3)
    cv2.rectangle(img, (400, 100), (580, 500), (100, 100, 100), -1)
    cv2.rectangle(img, (400, 100), (580, 500), (60, 60, 60), 3)
    # Add noise for realism
    noise = np.random.randint(-20, 20, img.shape, dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    response = client.post(
        "/api/v1/vision/analyze",
        files={"file": ("structured.jpg", encode_jpeg(img), "image/jpeg")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "image_quality" in data
    assert "object_detection" in data
    assert "damage_analysis" in data
