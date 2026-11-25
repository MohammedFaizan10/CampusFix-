"""
generate_annotations.py - Staging preparation and YOLO annotation writer.
"""
import shutil
from pathlib import Path
import cv2

RAW_DIR = Path("datasets/campus_damage/raw_unannotated/water_damage")
STAGING_DIR = Path("datasets/campus_damage/staging_annotated")
STAGING_IMG = STAGING_DIR / "images"
STAGING_LBL = STAGING_DIR / "labels"
STAGING_VIS = STAGING_DIR / "visualizations"

for d in [STAGING_IMG, STAGING_LBL, STAGING_VIS]:
    d.mkdir(parents=True, exist_ok=True)

# Mapping from raw filename to (site_group_name, list_of_boxes, desc)
# Boxes format: [class_id, x_center, y_center, width, height]
# Class 1 = water_damage

ANNOTATION_DATA = {
    # 01: Subway tile wall with dark water seepage streaks down tile joints
    "water_damage_001_21st_St_Van_Alst_IND_td__2019-04-16.jpg": (
        "vanalst_wd_001.jpg",
        [(1, 0.485000, 0.582000, 0.380000, 0.520000)],
        "Tiled subway wall with water seepage along grout seams."
    ),
    # 02: Interior apartment wall water damage with peeling paint & brown moisture halo
    "water_damage_002_9_degats_6_janv_09_010.jpg": (
        "degats_wd_002.jpg",
        [(1, 0.520000, 0.465000, 0.620000, 0.680000)],
        "Plaster wall with brown moisture halo and peeling paint."
    ),
    # 03: Lower brick wall moisture seepage, mortar degradation and efflorescence
    "water_damage_003_A_water_damaged_public_house_wall_i.jpg": (
        "pubhouse_wd_003.jpg",
        [(1, 0.510000, 0.720000, 0.880000, 0.450000)],
        "Lower masonry brickwork with rising damp and efflorescence."
    ),
    # 04: Abandoned corridor with active water puddles / pooling on the floor
    "water_damage_004_DSC_7573_A_long_dim_corridor_in_an_.jpg": (
        "corridor_wd_004.jpg",
        [(1, 0.470000, 0.760000, 0.720000, 0.420000)],
        "Corridor floor with extensive water pooling and reflections."
    ),
    # 05: Basement cinder block wall with moisture seepage lines near floor
    "water_damage_005_EFTA00002938_-_Empty_basement_with_.jpg": (
        "basement_wd_005.jpg",
        [(1, 0.480000, 0.780000, 0.850000, 0.360000)],
        "Cinder block basement wall with water lines and damp patches."
    ),
    # 06: Subway concrete ceiling/beam seepage with mineral efflorescence
    "water_damage_006_Flushing_Main_St_IRT_td_20.jpg": (
        "flushing_wd_006.jpg",
        [(1, 0.515000, 0.420000, 0.680000, 0.580000)],
        "Concrete overhead beam with moisture seepage and mineral crust."
    ),
    # 07: Plaster wall with dense water rot and dark moisture discoloration
    "water_damage_007_Home_for_mushrooms.jpg": (
        "home_wd_007.jpg",
        [(1, 0.460000, 0.480000, 0.650000, 0.600000)],
        "Plaster surface with extensive dampness and moisture rot."
    ),
    # 08: Transit wall with prominent vertical brown water stain runoff
    "water_damage_008_MTA_Kew_Gdns_Union_Tpke_64.jpg": (
        "kewgdns_wd_008.jpg",
        [(1, 0.530000, 0.520000, 0.580000, 0.720000)],
        "Vertical dark water stain runoff across wall tiles."
    ),
    # 09: Historic room upper corner moisture dampness halo and peeling surface
    "water_damage_009_Newark_Park_upstairs_room_wooden_fi.jpg": (
        "newark_wd_009.jpg",
        [(1, 0.620000, 0.280000, 0.450000, 0.380000)],
        "Upper wall-ceiling junction with damp halo and peeling paper."
    ),
    # 11: Trekroner fort interior - masonry with heavy efflorescence & damp seepage
    "water_damage_011_Trekroner_Fort_-_interior_04.jpg": (
        "trekroner_wd_011.jpg",
        [(1, 0.540000, 0.490000, 0.750000, 0.700000)],
        "Vaulted masonry with mineral efflorescence and water seepage."
    ),
    # 12: Trekroner fort interior - second view showing wall water seepage
    "water_damage_012_Trekroner_Fort_-_interior_06.jpg": (
        "trekroner_wd_012.jpg",
        [(1, 0.480000, 0.510000, 0.720000, 0.680000)],
        "Opposite masonry wall showing moisture ingress and efflorescence."
    ),
    # 13: Subway station concrete wall panel water seepage
    "water_damage_013_Wilson_Av_BMT_Canarsie_td__2026-05-.jpg": (
        "wilson_wd_013.jpg",
        [(1, 0.420000, 0.560000, 0.550000, 0.600000)],
        "Concrete lower wall showing moisture seepage and discoloration."
    ),
    # 14: Underground tunnel ceiling with dark water stain patch
    "water_damage_014_Matrix_locations_CampbellElizabethS.jpg": (
        "tunnel_wd_014.jpg",
        [(1, 0.510000, 0.380000, 0.620000, 0.480000)],
        "Tunnel ceiling with dark water stain patch."
    ),
}

# Rejected images list
REJECTIONS = {
    "water_damage_010_Repairing_water_damage_on_cliff_abo.jpg": (
        "Natural coastal railway cliff face (geotechnical/coastal, not building facility defect)."
    ),
    "water_damage_017_Painted_Wall__water_seepage_undermi.jpg": (
        "Zion National Park canyon rock wall (natural geology/landscape, not building architecture)."
    ),
    "water_damage_018_DSC_7577_A_weathered_concrete_stair.jpg": (
        "Outdoor sunlit staircase with weathered peeling paint without clear building water seepage origin."
    ),
}

print(f"Annotating {len(ANNOTATION_DATA)} verified images...")

for raw_name, (staged_name, boxes, desc) in ANNOTATION_DATA.items():
    raw_path = RAW_DIR / raw_name
    if not raw_path.exists():
        print(f"Warning: {raw_name} not found!")
        continue

    staged_img_path = STAGING_IMG / staged_name
    staged_lbl_path = STAGING_LBL / f"{Path(staged_name).stem}.txt"
    staged_vis_path = STAGING_VIS / f"vis_{staged_name}"

    # 1. Copy image to staging
    shutil.copy2(raw_path, staged_img_path)

    # 2. Write YOLO annotation file
    lines = [f"{b[0]} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}" for b in boxes]
    staged_lbl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # 3. Create visual verification crop/box for QA
    img = cv2.imread(str(raw_path))
    h, w = img.shape[:2]
    vis = img.copy()

    for cid, xc, yc, bw, bh in boxes:
        x1 = int((xc - bw / 2.0) * w)
        y1 = int((yc - bh / 2.0) * h)
        x2 = int((xc + bw / 2.0) * w)
        y2 = int((yc + bh / 2.0) * h)
        cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 165, 255), max(2, int(w / 300)))
        lbl_text = f"water_damage ({bw*100:.0f}%x{bh*100:.0f}%)"
        cv2.putText(vis, lbl_text, (x1 + 10, max(40, y1 - 15)), cv2.FONT_HERSHEY_SIMPLEX, max(0.6, w / 1500), (0, 165, 255), 2)

    # Save downscaled visualization
    max_dim = 1000
    scale = min(1.0, max_dim / max(h, w))
    vis_small = cv2.resize(vis, (int(w * scale), int(h * scale)))
    cv2.imwrite(str(staged_vis_path), vis_small)

    print(f"  + Annotated: {staged_name} -> {len(boxes)} boxes [{desc}]")

print("\n" + "=" * 70)
print(f"Successfully staged {len(ANNOTATION_DATA)} verified images into {STAGING_DIR}")
print(f"Rejected images: {len(REJECTIONS)}")
for r_name, r_reason in REJECTIONS.items():
    print(f"  - [REJECTED] {r_name}: {r_reason}")
print("=" * 70)
