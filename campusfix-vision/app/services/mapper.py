"""
mapper.py - Decision logic mapping YOLO objects and OpenCV damage heuristics
to CampusFix+ categories, SLA priorities, and triage recommendations.

Design Principles:
- Conservative prioritization: Never assign CRITICAL purely based on single-image heuristics.
- Result transparency: Distinctly report why a category and priority were recommended.
- Human-in-the-loop: Always flags requires_human_review = True for unverified triage.
"""

import numpy as np

CATEGORY_MAPPING = {
    # Plumbing
    "sink": ("PLUMBING", "MEDIUM"),
    "toilet": ("PLUMBING", "HIGH"),
    "water_leak": ("PLUMBING", "HIGH"),
    "water_stain": ("PLUMBING", "MEDIUM"),
    "seepage": ("PLUMBING", "HIGH"),
    "pipe": ("PLUMBING", "MEDIUM"),
    "water_damage": ("PLUMBING", "HIGH"),

    # Electrical
    "microwave": ("ELECTRICAL", "MEDIUM"),
    "oven": ("ELECTRICAL", "MEDIUM"),
    "toaster": ("ELECTRICAL", "LOW"),
    "refrigerator": ("ELECTRICAL", "MEDIUM"),
    "clock": ("ELECTRICAL", "LOW"),
    "tv": ("ELECTRICAL", "MEDIUM"),
    "electrical_fault": ("ELECTRICAL", "HIGH"),
    "exposed_wiring": ("ELECTRICAL", "HIGH"),
    "broken_light": ("ELECTRICAL", "MEDIUM"),
    "electrical_damage": ("ELECTRICAL", "HIGH"),

    # Civil / Structure
    "wall_crack": ("CIVIL", "HIGH"),
    "structural_damage": ("CIVIL", "HIGH"),
    "broken_window": ("CIVIL", "HIGH"),
    "door_damage": ("CIVIL", "MEDIUM"),
    "tile_crack": ("CIVIL", "MEDIUM"),
    "ceiling_damage": ("CIVIL", "MEDIUM"),

    # Furniture
    "chair": ("FURNITURE", "LOW"),
    "couch": ("FURNITURE", "LOW"),
    "bed": ("FURNITURE", "MEDIUM"),
    "dining table": ("FURNITURE", "LOW"),
    "broken_furniture": ("FURNITURE", "MEDIUM"),
    "furniture_damage": ("FURNITURE", "MEDIUM"),

    # IT / Network
    "laptop": ("IT_NETWORK", "MEDIUM"),
    "mouse": ("IT_NETWORK", "LOW"),
    "keyboard": ("IT_NETWORK", "LOW"),
    "cell phone": ("IT_NETWORK", "LOW"),
    "network_device": ("IT_NETWORK", "MEDIUM"),

    # Cleanliness
    "trash": ("CLEANLINESS", "LOW"),
    "stain": ("CLEANLINESS", "LOW"),
    "debris": ("CLEANLINESS", "LOW"),

    # Safety
    "fire_hydrant": ("SAFETY", "HIGH"),
    "hazard": ("SAFETY", "HIGH")
}

PRIORITY_RANKS = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
RANK_TO_PRIORITY = {1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL"}
RANK_TO_SEVERITY = {1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "HIGH"}  # Cap severity from image at HIGH

def build_recommendation(
    yolo_detections: list[dict],
    damage_indicators: list[dict],
    quality_info: dict
) -> dict:
    """
    Synthesizes object detections and damage indicators into an actionable triage recommendation.
    """
    # Case 1: Image is degraded / unreadable
    if quality_info.get("quality_status") == "POOR":
        blur_note = "blur detected" if quality_info.get("blur_detected") else ""
        bright_note = quality_info.get("brightness_status", "").lower()
        reason = f"Image quality is degraded ({blur_note} {bright_note}). Manual administrator triage recommended."
        return {
            "suggested_category": "OTHER",
            "suggested_priority": "MEDIUM",
            "damage_severity": "LOW",
            "requires_human_review": True,
            "confidence": 0.40,
            "reasoning": reason
        }

    # Case 2: Damage indicators detected (cracks, moisture)
    if damage_indicators:
        primary_indicator = damage_indicators[0]
        label = primary_indicator.get("label", "damage")
        cat, prio = CATEGORY_MAPPING.get(label, ("CIVIL", "MEDIUM"))

        reasoning = (
            f"Preliminary visual damage indicator ({label}) identified with heuristic confidence "
            f"{int(primary_indicator.get('confidence', 0.6) * 100)}%. "
            f"Recommending '{cat}' with {prio} SLA priority pending physical verification."
        )

        return {
            "suggested_category": cat,
            "suggested_priority": prio,
            "damage_severity": "HIGH" if prio == "HIGH" else "MEDIUM",
            "requires_human_review": True,
            "confidence": primary_indicator.get("confidence", 0.65),
            "reasoning": reasoning
        }

    # Case 3: YOLO object detections found
    if yolo_detections:
        category_votes = {}
        highest_rank = 1
        labels = []

        for obj in yolo_detections:
            lbl = obj.get("label", "").lower()
            conf = obj.get("confidence", 0.5)
            labels.append(lbl)

            cat, prio = CATEGORY_MAPPING.get(lbl, ("OTHER", "MEDIUM"))
            category_votes[cat] = category_votes.get(cat, 0.0) + conf
            rank = PRIORITY_RANKS.get(prio, 2)
            if rank > highest_rank:
                highest_rank = rank

        best_cat = max(category_votes.items(), key=lambda x: x[1])[0]
        final_prio = RANK_TO_PRIORITY[highest_rank]
        severity = RANK_TO_SEVERITY[highest_rank]

        unique_labels = list(dict.fromkeys(labels))
        reasoning = (
            f"Localized campus fixture/asset ({', '.join(unique_labels[:2])}). "
            f"Triage mapped to '{best_cat}' with {final_prio} SLA priority."
        )

        avg_conf = round(float(np.mean([d.get("confidence", 0.5) for d in yolo_detections])), 2)

        return {
            "suggested_category": best_cat,
            "suggested_priority": final_prio,
            "damage_severity": severity,
            "requires_human_review": True,
            "confidence": avg_conf,
            "reasoning": reasoning
        }

    # Case 4: No objects or damage indicators
    return {
        "suggested_category": "OTHER",
        "suggested_priority": "MEDIUM",
        "damage_severity": "LOW",
        "requires_human_review": True,
        "confidence": 0.50,
        "reasoning": "No recognized campus assets or structural anomalies found in image. Defaulting to general review queue."
    }
