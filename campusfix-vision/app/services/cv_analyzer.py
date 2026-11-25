"""
cv_analyzer.py - Image Quality Analysis & Conservative Damage Indicators (OpenCV).

Features:
1. Image Quality Analysis:
   - Blur detection (Laplacian variance)
   - Brightness analysis (mean luminance & exposure status)
   - Contrast analysis (RMS luminance standard deviation)
   - Resolution validation (width, height, megapixel count)
   - Overall image quality scoring ('EXCELLENT', 'ACCEPTABLE', 'POOR')

2. Conservative Damage Heuristics:
   - Surface crack candidates: uses CLAHE, adaptive thresholding, tortuosity & Hough line filtering to avoid false positives on straight edges (tile grout, door frames, table legs).
   - Moisture/seepage candidates: uses HSV saturation/value analysis with shadow suppression in underexposed images.
   - Explicitly marked as PRELIMINARY_HEURISTIC (never confused with a trained deep-learning classifier).
"""

import cv2
import numpy as np

def analyze_image_quality(image_np: np.ndarray) -> dict:
    """
    Performs comprehensive image quality evaluation.
    Returns metrics for blur, brightness, contrast, and resolution.
    """
    h, w = image_np.shape[:2]
    gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
    mp = round((h * w) / 1_000_000.0, 2)

    # 1. Blur Detection (Laplacian variance)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur_detected = blur_score < 75.0

    # 2. Brightness Analysis (0.0 to 1.0)
    mean_val = float(np.mean(gray))
    brightness = round(mean_val / 255.0, 3)
    if brightness < 0.22:
        brightness_status = "UNDEREXPOSED"
    elif brightness > 0.85:
        brightness_status = "OVEREXPOSED"
    else:
        brightness_status = "NORMAL"

    # 3. Contrast Analysis (RMS contrast)
    std_val = float(np.std(gray))
    contrast = round(min(1.0, std_val / 128.0), 3)
    contrast_status = "LOW_CONTRAST" if contrast < 0.20 else "NORMAL"

    # 4. Overall Quality Scoring (0.0 to 1.0)
    score = 1.0
    if blur_detected:
        score -= min(0.35, (75.0 - blur_score) / 75.0 * 0.35)
    if brightness_status != "NORMAL":
        score -= 0.25
    if contrast_status == "LOW_CONTRAST":
        score -= 0.20
    if w < 300 or h < 300:
        score -= 0.20

    score = round(max(0.05, min(1.0, score)), 2)

    if score >= 0.75:
        quality_status = "EXCELLENT"
    elif score >= 0.45:
        quality_status = "ACCEPTABLE"
    else:
        quality_status = "POOR"

    return {
        "blur_detected": blur_detected,
        "blur_score": round(blur_score, 1),
        "brightness": brightness,
        "brightness_status": brightness_status,
        "contrast": contrast,
        "contrast_status": contrast_status,
        "resolution": {
            "width": int(w),
            "height": int(h),
            "megapixels": mp
        },
        "quality_status": quality_status,
        "quality_score": score
    }

def detect_surface_cracks(image_np: np.ndarray, quality_info: dict = None) -> list[dict]:
    """
    Detects irregular high-contrast fissures on walls, floors, or tiles.
    Uses tortuosity and straight-line rejection to avoid flagging regular architectural lines.
    """
    if quality_info and (quality_info["blur_detected"] or quality_info["brightness_status"] == "UNDEREXPOSED"):
        # Suppress crack heuristics on degraded/dark images to avoid false positives
        return []

    h, w = image_np.shape[:2]
    gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)

    # 1. CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 2. Edge detection
    filtered = cv2.bilateralFilter(enhanced, 7, 50, 50)
    thresh = cv2.adaptiveThreshold(
        filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # 3. Reject straight architectural lines using Probabilistic Hough Transform
    edges = cv2.Canny(filtered, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=60, maxLineGap=10)
    straight_mask = np.zeros((h, w), dtype=np.uint8)
    if lines is not None:
        for line in lines:
            # OpenCV 5.x returns shape (N, 4); OpenCV 4.x returns (N, 1, 4)
            pts = line.ravel()
            x1, y1, x2, y2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
            # Dilate straight line zones to mask out grout lines, door frames, desk edges
            cv2.line(straight_mask, (x1, y1), (x2, y2), 255, 12)

    # Remove straight structural lines from crack candidate mask
    closed_cleaned = cv2.bitwise_and(closed, cv2.bitwise_not(straight_mask))

    contours, _ = cv2.findContours(closed_cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    detections = []
    min_area = (h * w) * 0.003
    max_area = (h * w) * 0.30

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if min_area < area < max_area:
            x, y, cw, ch = cv2.boundingRect(cnt)
            perimeter = cv2.arcLength(cnt, True)
            diagonal = np.sqrt(cw**2 + ch**2)

            # Tortuosity ratio: perimeter vs bounding diagonal
            # Straight rectangles have perimeter ~ 2*(cw+ch), jagged cracks have high perimeter
            tortuosity = float(perimeter) / max(diagonal, 1.0)

            hull = cv2.convexHull(cnt)
            hull_area = cv2.contourArea(hull)
            solidity = float(area) / max(hull_area, 1.0)

            # A real crack is jagged (low solidity < 0.60) and elongated or tortuous
            if solidity < 0.60 and tortuosity > 1.8:
                # Cap heuristic confidence at 0.72 - this is an algorithmic indicator, not an ML guarantee
                confidence = round(min(0.72, 0.50 + (1.0 - solidity) * 0.22), 2)
                detections.append({
                    "indicator_type": "SURFACE_CRACK_CANDIDATE",
                    "label": "wall_crack",
                    "confidence": confidence,
                    "reliability": "PRELIMINARY_HEURISTIC",
                    "box": {"x1": int(x), "y1": int(y), "x2": int(x + cw), "y2": int(y + ch)},
                    "description": "Algorithmic fissure pattern detected via contour tortuosity."
                })

    return detections[:2]

def detect_water_seepage(image_np: np.ndarray, quality_info: dict = None) -> list[dict]:
    """
    Detects moisture patches and water stains.
    Includes shadow suppression to avoid treating normal dark regions as water seepage.
    """
    # If the overall image is underexposed, do not flag dark patches as seepage
    if quality_info and quality_info["brightness_status"] == "UNDEREXPOSED":
        return []

    h, w = image_np.shape[:2]
    hsv = cv2.cvtColor(image_np, cv2.COLOR_BGR2HSV)
    h_chan, s_chan, v_chan = cv2.split(hsv)

    # Water stains have both localized dampness saturation AND lower luminance
    # Shadows typically have low saturation; stains have localized tinting/saturation
    _, dark_patches = cv2.threshold(v_chan, 100, 255, cv2.THRESH_BINARY_INV)
    _, saturated_patches = cv2.threshold(s_chan, 55, 255, cv2.THRESH_BINARY)

    combined = cv2.bitwise_and(dark_patches, saturated_patches)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    cleaned = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    detections = []
    min_area = (h * w) * 0.02

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > min_area:
            x, y, cw, ch = cv2.boundingRect(cnt)

            # Analyze patch gradient: moisture has diffuse edges rather than sharp cut-off
            roi_v = v_chan[y:y+ch, x:x+cw]
            std_grad = float(np.std(roi_v))

            # Non-trivial standard deviation means a diffuse gradient (stain) rather than a flat black object
            if std_grad > 15.0:
                confidence = round(min(0.70, 0.48 + (std_grad / 100.0) * 0.22), 2)
                detections.append({
                    "indicator_type": "MOISTURE_STAIN_CANDIDATE",
                    "label": "seepage",
                    "confidence": confidence,
                    "reliability": "PRELIMINARY_HEURISTIC",
                    "box": {"x1": int(x), "y1": int(y), "x2": int(x + cw), "y2": int(y + ch)},
                    "description": "Localized discoloration gradient consistent with moisture/seepage pattern."
                })

    return detections[:2]
