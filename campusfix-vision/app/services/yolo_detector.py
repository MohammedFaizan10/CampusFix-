"""
yolo_detector.py - Unified Computer Vision Pipeline for CampusFix+.

Integrates:
1. Image Quality Analyzer (blur, brightness, contrast, resolution)
2. YOLOv8 Object Localization (singleton cached in memory)
3. OpenCV Conservative Damage Heuristics (fissures, moisture discoloration)
4. Triage Decision & Category/Priority Recommendation
5. OpenCV Visual Annotation
"""

import base64
import logging
import time
import cv2
import numpy as np
import torch
from ultralytics import YOLO

from app.config import settings
from app.services.cv_analyzer import (
    analyze_image_quality,
    detect_surface_cracks,
    detect_water_seepage,
)
from app.services.mapper import build_recommendation

logger = logging.getLogger("campusfix.vision.detector")

class YOLODetector:
    _instance = None
    _model = None
    device: str = "cpu"

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Initializing YOLO model: '{settings.YOLO_MODEL_NAME}' on device: {self.device}")
        try:
            self._model = YOLO(settings.YOLO_MODEL_NAME)
            logger.info(f"YOLO model '{settings.YOLO_MODEL_NAME}' successfully loaded into memory ({self.device}).")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}", exc_info=True)
            self._model = None

    def is_loaded(self) -> bool:
        return self._model is not None

    def get_device(self) -> str:
        return self.device

    def analyze_image(self, image_bytes: bytes) -> dict:
        start_time = time.time()

        # 1. Decode image via OpenCV
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            logger.warning("Rejected upload: OpenCV could not decode image buffer.")
            raise ValueError("Invalid or corrupted image format. OpenCV failed to decode.")

        h, w = image.shape[:2]

        # 2. Image Quality Analysis
        quality_info = analyze_image_quality(image)
        logger.debug(
            f"Image {w}x{h}: Quality={quality_info['quality_status']} "
            f"(Score={quality_info['quality_score']}, Blur={quality_info['blur_detected']})"
        )

        # 3. YOLO Object Localization
        yolo_detections = []
        if self._model is not None:
            results = self._model.predict(
                source=image,
                conf=settings.CONFIDENCE_THRESHOLD,
                device=self.device,
                verbose=False
            )

            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        coords = box.xyxy[0].cpu().numpy()
                        conf = float(box.conf[0].cpu().numpy())
                        cls_id = int(box.cls[0].cpu().numpy())
                        class_name = self._model.names.get(cls_id, f"class_{cls_id}")

                        # Clamped integer coordinates
                        x1 = max(0, min(w - 1, int(coords[0])))
                        y1 = max(0, min(h - 1, int(coords[1])))
                        x2 = max(x1 + 1, min(w, int(coords[2])))
                        y2 = max(y1 + 1, min(h, int(coords[3])))

                        yolo_detections.append({
                            "class_id": cls_id,
                            "label": class_name,
                            "confidence": round(conf, 3),
                            "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
                        })

        # 4. Conservative OpenCV Damage Heuristics
        crack_candidates = detect_surface_cracks(image, quality_info)
        seepage_candidates = detect_water_seepage(image, quality_info)
        damage_indicators = crack_candidates + seepage_candidates

        # 5. Recommendation Synthesis
        recommendation = build_recommendation(yolo_detections, damage_indicators, quality_info)

        # 6. OpenCV Visual Annotation
        annotated = image.copy()

        # A) Draw YOLO localized objects in Cyan (BGR: 255, 180, 0)
        for obj in yolo_detections:
            b = obj["box"]
            x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
            lbl = f"[Object] {obj['label']} {int(obj['confidence'] * 100)}%"
            color = (255, 180, 0)

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 5)), (x1 + tw + 4, max(0, y1)), color, -1)
            cv2.putText(annotated, lbl, (x1 + 2, max(th + 2, y1 - 2)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

        # B) Draw Heuristic Damage Indicators in Orange (BGR: 0, 140, 255)
        for ind in damage_indicators:
            b = ind["box"]
            x1, y1, x2, y2 = b["x1"], b["y1"], b["x2"], b["y2"]
            lbl = f"[Indicator] {ind['label']} {int(ind['confidence'] * 100)}%"
            color = (0, 140, 255)

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, max(0, y1 - th - 5)), (x1 + tw + 4, max(0, y1)), color, -1)
            cv2.putText(annotated, lbl, (x1 + 2, max(th + 2, y1 - 2)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # C) Quality Banner overlay if blur or poor exposure detected
        if quality_info["quality_status"] == "POOR":
            warning_text = f"Notice: Image Quality {quality_info['quality_status']} ({quality_info['brightness_status']})"
            cv2.putText(annotated, warning_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2, cv2.LINE_AA)

        # 7. Base64 Encode Annotated Image
        _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        base64_annotated = base64.b64encode(buffer).decode("utf-8")

        proc_ms = round((time.time() - start_time) * 1000, 1)

        # 8. Prepare Legacy-compatible list
        legacy_items = []
        for obj in yolo_detections:
            legacy_items.append({
                "label": obj["label"],
                "confidence": obj["confidence"],
                "box": obj["box"],
                "source": "yolo"
            })
        for ind in damage_indicators:
            legacy_items.append({
                "label": ind["label"],
                "confidence": ind["confidence"],
                "box": ind["box"],
                "source": "cv_heuristic"
            })

        logger.info(
            f"Processed in {proc_ms}ms: Quality={quality_info['quality_status']}, "
            f"Objects={len(yolo_detections)}, Indicators={len(damage_indicators)} -> "
            f"Category={recommendation['suggested_category']} ({recommendation['suggested_priority']})"
        )

        return {
            "success": True,
            "image_quality": quality_info,
            "object_detection": {
                "model": settings.YOLO_MODEL_NAME.replace(".pt", ""),
                "detected_count": len(yolo_detections),
                "detections": yolo_detections
            },
            "damage_analysis": {
                "method": "OPENCV_HEURISTICS",
                "status": "PRELIMINARY",
                "indicators": damage_indicators,
                "heuristic_notes": (
                    "Preliminary indicator derived from image processing heuristics. "
                    "Requires human visual verification before physical dispatch."
                )
            },
            "recommendation": recommendation,
            "annotated_image": f"data:image/jpeg;base64,{base64_annotated}",
            "processing_time_ms": proc_ms,

            # Legacy compatibility fields
            "suggested_category": recommendation["suggested_category"],
            "suggested_priority": recommendation["suggested_priority"],
            "damage_severity": recommendation["damage_severity"],
            "confidence": recommendation["confidence"],
            "summary": recommendation["reasoning"],
            "detected_items": legacy_items
        }
