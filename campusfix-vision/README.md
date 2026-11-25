# CampusFix+ Computer Vision Microservice 🔍

> **Local, AI-driven visual damage detection and SLA priority triage service for the CampusFix+ digital ecosystem.**

Built with **FastAPI**, **OpenCV**, and **Ultralytics YOLO (YOLOv8)**. Operates completely locally on-device without external cloud AI dependencies or API keys.

---

## 🌟 Key Capabilities

### 1. Image Quality Analysis (OpenCV)
- **Blur Detection:** Laplacian variance sharpness scoring with automatic blur flagging.
- **Exposure / Brightness Analysis:** Mean luminance evaluation (`UNDEREXPOSED`, `NORMAL`, `OVEREXPOSED`).
- **Contrast Analysis:** Root-Mean-Square (RMS) luminance standard deviation (`LOW_CONTRAST`, `NORMAL`).
- **Resolution Validation:** Pixel width, height, and megapixel measurements.
- **Composite Quality Score:** Overall evaluation (`EXCELLENT`, `ACCEPTABLE`, `POOR`).

### 2. Trained Object Localization (Ultralytics YOLOv8)
- Localizes campus assets and fixtures (chairs, tables, screens, laptops, sanitization fixtures).
- Reports integer COCO `class_id`, string `label`, confidence score, and integer pixel bounding boxes `[x1, y1, x2, y2]`.
- Distinct Cyan annotation bounding boxes with labels.

### 3. Conservative Damage Heuristics (OpenCV)
- **Surface Fissures & Cracks:** Morphological edge gradient analysis with straight-line Hough rejection to prevent false positives on tile grout, door frames, and furniture edges.
- **Moisture & Seepage Discoloration:** Multi-channel HSV saturation variance with shadow suppression on underexposed images.
- **Result Transparency:** Explicitly flagged as `OPENCV_HEURISTICS` with `PRELIMINARY_HEURISTIC` reliability (never overstated as an ML guarantee).
- **Conservative Prioritization:** Single-image appearance heuristics **never assign CRITICAL** priority automatically; priority is capped at `HIGH` with `requires_human_review = True`.

---

## 📐 Architecture Overview

```
                      +-----------------------------+
                      |   CampusFix+ Frontend       |
                      |   (React 19 + Vite + Tailwind)
                      +--------------+--------------+
                                     |
                       multipart/form-data POST
                       /api/v1/vision/analyze
                                     v
+------------------------------------+-------------------------------------+
|                  campusfix-vision (FastAPI Service)                     |
|                                                                          |
|  +--------------------+   +-----------------------+   +---------------+  |
|  |   app/main.py      |-->|  app/routers/vision.py|-->|  Schemas      |  |
|  |   - CORS           |   |  - /analyze           |   |  - Pydantic v2|  |
|  |   - Health check   |   |  - /categories        |   +---------------+  |
|  |   - Exception Hndlr|   +-----------+-----------+                      |
|  +--------------------+               |                                  |
|                                       v                                  |
|                      +----------------+---------------+                  |
|                      |   app/services/yolo_detector   |                  |
|                      |   - Singleton Model Cache      |                  |
|                      +-------+----------------+-------+                  |
|                              |                |                          |
|                              v                v                          |
|             +----------------+--+   +---------+------------------+       |
|             | Ultralytics YOLOv8|   | app/services/cv_analyzer   |       |
|             | (yolov8n.pt)      |   | (Blur, Exposure, Cracks)   |       |
|             +----------------+--+   +---------+------------------+       |
|                              \                /                          |
|                               v              v                           |
|                      +----------------+---------------+                  |
|                      |      app/services/mapper       |                  |
|                      |  - Category Recommendation     |                  |
|                      |  - Conservative Priority SLA   |                  |
|                      +--------------------------------+                  |
+--------------------------------------------------------------------------+
```

---

## 📡 API Reference

### 1. Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "healthy",
  "service": "campusfix-vision",
  "version": "1.0.0",
  "model_loaded": true,
  "device": "cpu"
}
```

### 2. Comprehensive Image Analysis
```http
POST /api/v1/vision/analyze
Content-Type: multipart/form-data
```
**Form Parameter:**
- `file`: Image file (JPG, PNG, or WebP up to 10MB)

**Response:**
```json
{
  "success": true,
  "image_quality": {
    "blur_detected": false,
    "blur_score": 118.4,
    "brightness": 0.72,
    "brightness_status": "NORMAL",
    "contrast": 0.58,
    "contrast_status": "NORMAL",
    "resolution": {
      "width": 600,
      "height": 600,
      "megapixels": 0.36
    },
    "quality_status": "EXCELLENT",
    "quality_score": 0.8
  },
  "object_detection": {
    "model": "yolov8n",
    "detected_count": 0,
    "detections": []
  },
  "damage_analysis": {
    "method": "OPENCV_HEURISTICS",
    "status": "PRELIMINARY",
    "indicators": [
      {
        "indicator_type": "SURFACE_CRACK_CANDIDATE",
        "label": "wall_crack",
        "confidence": 0.68,
        "reliability": "PRELIMINARY_HEURISTIC",
        "box": {
          "x1": 118,
          "y1": 79,
          "x2": 212,
          "y2": 542
        },
        "description": "Algorithmic fissure pattern detected via contour tortuosity."
      }
    ],
    "heuristic_notes": "Preliminary indicator derived from image processing heuristics. Requires human visual verification before physical dispatch."
  },
  "recommendation": {
    "suggested_category": "CIVIL",
    "suggested_priority": "HIGH",
    "damage_severity": "HIGH",
    "requires_human_review": true,
    "confidence": 0.68,
    "reasoning": "Preliminary visual damage indicator (wall_crack) identified with heuristic confidence 68%. Recommending 'CIVIL' with HIGH SLA priority pending physical verification."
  },
  "annotated_image": "data:image/jpeg;base64,...",
  "processing_time_ms": 62.5,
  "suggested_category": "CIVIL",
  "suggested_priority": "HIGH",
  "damage_severity": "HIGH",
  "confidence": 0.68,
  "summary": "Preliminary visual damage indicator (wall_crack) identified with heuristic confidence 68%...",
  "detected_items": [
    {
      "label": "wall_crack",
      "confidence": 0.68,
      "box": { "x1": 118, "y1": 79, "x2": 212, "y2": 542 },
      "source": "cv_heuristic"
    }
  ]
}
```

---

## ⚡ Performance Measurements

Benchmarked on local machine across synthetic and realistic test cases:

| Scenario | Resolution | Blur / Exposure | Damage Indicators | Triage Category | SLA Priority | Latency |
|---|---|---|---|---|---|---|
| **Normal Campus View** | 640x640 | Normal / Clean | 0 | `OTHER` | `MEDIUM` | ~55 ms |
| **Blurry Evidence** | 480x480 | Blurry (`blur=True`) | 0 | `OTHER` | `MEDIUM` | ~80 ms |
| **Dark / Underexposed** | 480x480 | Underexposed | 0 (Suppressed) | `OTHER` | `MEDIUM` | ~45 ms |
| **Wall Crack Candidate** | 600x600 | Clean / Normal | 1 (`wall_crack`) | `CIVIL` | `HIGH` | ~62 ms |
| **Water Seepage Candidate** | 500x500 | Normal | 0 | `OTHER` | `MEDIUM` | ~51 ms |

*Note: Initial cold-start inference incurs ~2.0s for one-time PyTorch graph compilation; steady-state inference averages **45–80 milliseconds** per image on CPU.*

---

## 🧪 Automated Test Suite

Run unit and integration tests with pytest:
```bash
pytest tests/ -v
```
All 22 tests validate:
- Root & health check endpoints
- Schema structure compliance
- Blur and underexposure detection
- Crack candidate tortuosity validation
- False-positive shadow suppression
- Strict non-critical priority safety bounds
- File type validation and corrupted image rejection
- Dataset directory structure and YOLO annotation formats
- Normalization bounds, duplicate detection, and split distribution statistics

---

## 📦 Custom Dataset Infrastructure & Training Pipeline

CampusFix+ includes a dataset management and validation pipeline for training custom YOLO models on campus infrastructure defects:

### 1. Dataset Directory Architecture
```
datasets/campus_damage/
├── data.yaml            # Ultralytics dataset specification (5 classes)
├── images/
│   ├── train/           # 70% training split
│   ├── val/             # 20% validation split
│   └── test/            # 10% spatial test split
└── labels/
    ├── train/
    ├── val/
    └── test/
```

### 2. Classes Defined (`data.yaml`)
- `0: structural_damage`
- `1: water_damage`
- `2: electrical_damage`
- `3: furniture_damage`
- `4: ceiling_damage`

### 3. Dataset Validation Utility
Verify dataset integrity before model training:
```bash
python dataset_tools/validator.py --dataset-dir datasets/campus_damage
```
Checks:
- Image/annotation correspondence (no orphan or missing labels).
- YOLO format compliance (`<cls> <x> <y> <w> <h>`).
- Normalized coordinate bounds ($[0.0, 1.0]$).
- Valid class IDs ($0 \le id < nc$).
- Duplicate image detection (SHA-256 hash).
- Corrupted or unreadable image files.

### 4. Dataset Statistics & Balance Reporter
Generate statistical distribution reports and export Markdown/JSON summaries:
```bash
python dataset_tools/stats.py --dataset-dir datasets/campus_damage --export-md datasets/campus_damage/DATASET_REPORT.md
```
Calculates:
- Total images and bounding box annotations.
- Split distribution percentages ($70/20/10$).
- Annotations and image occurrences per damage class.
- Background/negative sample counts.
- Class imbalance ratio and normalized Shannon diversity index ($H$).

### 5. Dataset Importer & Spatial Clustering Utility
Import YOLO annotations from CVAT, Roboflow, or local photo batches with spatial leakage prevention and collision detection:
```bash
# Dry-run simulation into Wall Crack Pilot dataset (single-class):
python dataset_tools/importer.py \
  --source-dir incoming/cvat_cracks \
  --target-dir datasets/wall_crack_pilot \
  --dry-run

# Execute import with spatial room grouping:
python dataset_tools/importer.py \
  --source-dir incoming/cvat_cracks \
  --target-dir datasets/wall_crack_pilot \
  --conflict-strategy rename \
  --export-summary datasets/wall_crack_pilot/IMPORT_SUMMARY.md
```
Guarantees:
- **No Overwrites:** Filename collisions with different content are safely renamed (`<stem>_imp_<hash>.jpg`).
- **Duplicate Prevention:** Incoming photos matching existing SHA-256 hashes are automatically skipped.
- **Data Leakage Prevention:** Room grouping ensures photos of the same physical wall remain within the same split.
- **Single-Class & Multi-Class Support:** Supports both `wall_crack_pilot` (1 class) and `campus_damage` (5 classes) with flexible remapping.

### 6. Training Configuration & Guidelines
- Detailed field collection rules and target checklists are documented in [`docs/DATASET_COLLECTION_GUIDE.md`](docs/DATASET_COLLECTION_GUIDE.md).
- Detailed annotation standards (Label Studio / CVAT, negative samples, data leakage prevention) are documented in [`docs/ANNOTATION_GUIDE.md`](docs/ANNOTATION_GUIDE.md).
- Transfer learning hyperparameters:
  - 5-Class Infrastructure: [`configs/train_config.yaml`](configs/train_config.yaml)
  - 1-Class Wall Crack Pilot: [`configs/train_wall_crack_pilot.yaml`](configs/train_wall_crack_pilot.yaml)
- *Training must only be initiated after real campus photos are collected and validated.*


