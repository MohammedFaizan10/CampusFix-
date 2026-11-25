"""
benchmark.py - Validation & Performance Benchmark across image categories.
"""

import time
import cv2
import numpy as np
from app.services.yolo_detector import YOLODetector

def run_benchmark():
    detector = YOLODetector.get_instance()
    print("=" * 70)
    print("CAMPUSFIX+ COMPUTER VISION BENCHMARK & PIPELINE VALIDATION")
    print("=" * 70)

    test_cases = []

    # 1. Normal Image
    img_normal = np.full((640, 640, 3), 195, dtype=np.uint8)
    cv2.rectangle(img_normal, (80, 80), (320, 320), (130, 130, 130), -1)
    test_cases.append(("Normal Campus Image", img_normal))

    # 2. Blurry Image
    img_blur = np.full((480, 480, 3), 170, dtype=np.uint8)
    cv2.circle(img_blur, (240, 240), 90, (80, 80, 80), -1)
    img_blur = cv2.GaussianBlur(img_blur, (55, 55), 0)
    test_cases.append(("Blurry Evidence Image", img_blur))

    # 3. Dark Image
    img_dark = np.full((480, 480, 3), 25, dtype=np.uint8)
    test_cases.append(("Dark / Underexposed Image", img_dark))

    # 4. Jagged Wall Crack Image
    img_crack = np.full((600, 600, 3), 215, dtype=np.uint8)
    pts = np.array([[120, 80], [150, 140], [140, 200], [180, 280], [170, 370], [210, 460], [200, 540]], np.int32)
    cv2.polylines(img_crack, [pts], isClosed=False, color=(20, 20, 20), thickness=3)
    test_cases.append(("Wall Crack Candidate", img_crack))

    # 5. Seepage Discoloration Image
    img_seep = np.full((500, 500, 3), 200, dtype=np.uint8)
    for r in range(90, 10, -8):
        alpha = (95 - r) / 90.0
        color = (int(90 * alpha + 200 * (1 - alpha)), int(120 * alpha + 200 * (1 - alpha)), int(80 * alpha + 200 * (1 - alpha)))
        cv2.circle(img_seep, (250, 250), r, color, -1)
    test_cases.append(("Water Seepage Candidate", img_seep))

    timings = []

    for name, img in test_cases:
        _, buf = cv2.imencode(".jpg", img)
        raw_bytes = buf.tobytes()

        t0 = time.time()
        res = detector.analyze_image(raw_bytes)
        elapsed_ms = (time.time() - t0) * 1000
        timings.append(elapsed_ms)

        iq = res["image_quality"]
        od = res["object_detection"]
        da = res["damage_analysis"]
        rec = res["recommendation"]

        print(f"\n--- Scenario: {name} ---")
        print(f"Resolution:       {iq['resolution']['width']}x{iq['resolution']['height']} ({iq['resolution']['megapixels']} MP)")
        print(f"Image Quality:    {iq['quality_status']} (Score={iq['quality_score']}, Blur={iq['blur_detected']}, Exposure={iq['brightness_status']})")
        print(f"YOLO Objects:     {od['detected_count']} objects localized")
        print(f"Damage Heuristics:{len(da['indicators'])} indicators found (Method={da['method']})")
        if da['indicators']:
            for ind in da['indicators']:
                print(f"  * {ind['indicator_type']}: {ind['label']} (Conf={ind['confidence']}, Reliability={ind['reliability']})")
        print(f"Triage Decision:  Category='{rec['suggested_category']}', Priority='{rec['suggested_priority']}', Severity='{rec['damage_severity']}'")
        print(f"Human Review:     {rec['requires_human_review']}")
        print(f"Reasoning:        {rec['reasoning']}")
        print(f"Latency:          {elapsed_ms:.1f} ms")

    avg_ms = np.mean(timings)
    print("\n" + "=" * 70)
    print(f"PERFORMANCE SUMMARY: Average Latency: {avg_ms:.1f} ms across {len(test_cases)} test cases.")
    print("=" * 70)

if __name__ == "__main__":
    run_benchmark()

