# CampusFix+ Public Dataset Research & Suitability Assessment
**Evaluation of External Datasets for 5-Class Campus Infrastructure Damage Detection**

---

## 1. Executive Summary

This research report investigates publicly available computer vision datasets across **Roboflow Universe**, **Kaggle**, **Hugging Face**, **GitHub**, and **Academic Research Repositories (Mendeley Data, Zenodo, MDPI)**.

The objective is to identify legitimate, openly-licensed visual data supporting the five finalized CampusFix+ damage categories:
- `0`: `structural_damage`
- `1`: `water_damage`
- `2`: `electrical_damage`
- `3`: `furniture_damage`
- `4`: `ceiling_damage`

Each candidate dataset was audited for:
- License type & commercial/academic usage rights.
- Access requirements (direct HTTP vs. API key vs. gated login).
- Annotation format & compatibility with YOLOv8 bounding boxes ($[cls, x_c, y_c, w, h]$).
- Domain relevance (real campus/institutional building defects vs. unrelated contexts).
- Risk of false positives (strictly excluding normal items from damage classes).

---

## 2. Multi-Class Dataset Comparison Table

| Dataset Name | Source / Platform | Classes Available | Images | Annotation Format | License | Access / Auth Requirement | Suitability Rating | Target CampusFix+ Class |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :---: | :---: |
| **Water Seepage3 / Seepage6** | Roboflow Universe | `water_seepage`, `efflorescence`, `stain` | ~680 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `water_damage` (1) |
| **Water Damage Finder** | Roboflow Universe | `water-damage`, `stain` | ~280 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `water_damage` (1) |
| **Damage Detection for Concrete Structures** | Mendeley Data (DOI: 10.17632/9t3y6hhddk.1) | `efflorescence`, `spalling`, `crack` | 2,750 | Pascal VOC XML | CC BY 4.0 | Direct Open Access | **Suitable** | `water_damage` (1), `structural_damage` (0) |
| **Surface Damage Identification in Heritage** | ResearchGate / Zenodo | `Dampness`, `Efflorescence`, `Water Seepage`, `Spalls` | ~1,200 | Bounding Boxes | CC BY 4.0 | Direct Open Access | **Suitable** | `water_damage` (1), `structural_damage` (0) |
| **Wikimedia Architectural Pathology (Water/Damp)** | Wikimedia Commons | Damp walls, water stains, efflorescence, peeling paint | ~150 curated | Unannotated Photos | CC BY / CC BY-SA / CC0 | Direct HTTPS (No Auth) | **Suitable (Needs Annotation)** | `water_damage` (1) |
| **Wall Cracks Dataset (`wall-cracks-t29lu`)** | Roboflow Universe | `wall_crack` | 2,140 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `structural_damage` (0) |
| **Concrete Crack Images for Classification (CCIC)** | Mendeley Data (DOI: 10.17632/5y9wdsg2zt.2) | `Positive` (crack), `Negative` (clean) | 40,000 | Image Classification (Patches) | CC BY 4.0 | Direct Open Access | **Partially Suitable** | `structural_damage` (0) *(Backgrounds/Crops)* |
| **SDNET2018 Concrete Benchmark** | Utah State University | `Cracked`, `Non-cracked` concrete | 56,000 | Image Classification (256x256) | CC BY 4.0 | Direct Open Access | **Partially Suitable** | `structural_damage` (0) *(Patches only)* |
| **Cracks in the Foundation (CIF)** | Hugging Face (`ibm-research/cif-dataset`) | `Cracks`, `Net-Cracks`, `Precipitation`, `Spalling` | ~3,000 | COCO / Instance Seg | CDLA-Permissive-2.0 | Direct / HF Datasets | **Partially Suitable** | `structural_damage` (0), `water_damage` (1) |
| **Electrical Hazard Detection (`damage-wire`)** | Roboflow Universe | `damaged_wire`, `burned_socket`, `overloaded_socket` | ~450 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `electrical_damage` (2) |
| **Electrical Wiring Faults** | Mendeley Data / Kaggle | Damaged cables, misrouted wires | 1,800 | Pascal VOC XML | CC BY 4.0 | Direct / Kaggle Auth | **Partially Suitable** | `electrical_damage` (2) *(Harness focused)* |
| **Cable Damage (`francesco/cable-damage`)** | Hugging Face | `cable_damage` | ~320 | COCO JSON | Open Source | Direct / HF Datasets | **Partially Suitable** | `electrical_damage` (2) |
| **Furniture Defect Detection** | Roboflow Universe | `broken_chair`, `broken_table`, `broken_desk` | ~380 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `furniture_damage` (3) |
| **Kaggle Furniture Image Dataset** | Kaggle | Chairs, Tables, Desks, Beds (Normal) | 4,000+ | Image Classification | CC0 | Kaggle Account | **Unsuitable as Damage** *(Ideal Negative/Background)* | N/A *(Normal Furniture)* |
| **Large-Span Ceiling Damage Dataset** | MDPI / Kawaguchi Lab | `peelings`, `cracks`, `distortions`, `fall-offs` | ~1,200 | Academic Image Set | CC BY 4.0 | Direct Academic Access | **Suitable** | `ceiling_damage` (4) |
| **Ceiling Damage Detection** | Roboflow Universe | `damaged_tile`, `ceiling_crack`, `water_stain` | ~310 | YOLOv8 PyTorch TXT | CC BY 4.0 | Free Roboflow API Key | **Suitable** | `ceiling_damage` (4) |

---

## 3. Detailed Dataset Suitability Breakdown

### A. Suitable Datasets
1. **Roboflow Universe: `Water Seepage3` & `Water Damage Finder`**
   - *Pros:* Explicitly captures building wall seepage, mineral efflorescence, and brown moisture halos on drywall. Pre-formatted in YOLO format.
   - *Cons:* Requires a free Roboflow API key to download exports.
   - *Verdict:* Highly suitable for transfer learning.
2. **Mendeley Data: `Damage Detection Dataset for Concrete Structures` (CC BY 4.0)**
   - *Pros:* Fully open access with verified DOI. Contains 2,750 high-resolution architectural images with Pascal VOC XML bounding boxes for efflorescence and surface deterioration.
   - *Cons:* XML coordinates must be converted to normalized YOLO format via standard coordinate transforms.
   - *Verdict:* Excellent legitimate academic source.
3. **Roboflow Universe: `wall-cracks-t29lu` & `damage-wire`**
   - *Pros:* Covers concrete fissures and scorched switch plates with bounding boxes.
   - *Verdict:* Verified suitable for Classes 0 and 2.
4. **Curated Wikimedia Commons Architectural Pathology Collection**
   - *Pros:* Publicly accessible under CC BY, CC BY-SA, and CC0 licenses. High-resolution photographic evidence of real university, municipal, and residential water damage without paywalls or API gating.
   - *Cons:* Does not include bounding-box label files out-of-the-box; must be placed in a staging directory for manual bounding box annotation before ingestion into training splits.

---

### B. Partially Suitable Datasets
1. **CCIC & SDNET2018 (Mendeley / Utah State)**
   - *Why Partially Suitable:* These datasets contain cropped image patches ($227 \times 227$ or $256 \times 256$ pixels) labeled binary `crack` vs. `no-crack`. Because they lack full-frame context and bounding-box coordinates, they cannot be directly used to train an object detection model like YOLOv8. However, the `no-crack` subsets are valuable for negative background validation.
2. **Hugging Face `cif-dataset` ("Cracks in the Foundation")**
   - *Why Partially Suitable:* Targets civil infrastructure (bridges, retaining walls, dam spillways) rather than indoor university facilities. While structural patterns transfer well, background textures (soil, heavy concrete) differ from classroom plaster and drywall.
3. **Mendeley Data `Electrical Wiring Faults`**
   - *Why Partially Suitable:* Targets industrial electrical harnesses and cable assemblies rather than building wall sockets, conduit lines, and light switches.

---

### C. Unsuitable Datasets (Risk of Negative Training)
1. **Generic Kaggle Furniture Datasets (e.g. `Furniture Image Dataset`)**
   - *Why Unsuitable as Damage:* These contain catalog photographs of **brand-new, undamaged chairs, tables, and desks**. If ingested as `furniture_damage`, the model will learn that any chair is a broken chair. They may only be used as **negative background samples** (with empty `.txt` label files) to teach the model to ignore intact furniture.
2. **Time-Series / Sensor Leaking Datasets (e.g. `LeakDB`)**
   - *Why Unsuitable:* These are CSV datasets containing water pipe flow rates, pressures, and acoustic frequency logs. They contain no computer vision images.
3. **Flood Aerial / Satellite Imagery (e.g. `detect-flood-damage`)**
   - *Why Unsuitable:* These are orbital satellite photographs of flooded cities and landscape inundation. They have zero visual relevance to indoor campus room maintenance.

---

## 4. Class Mapping Specification

The following mapping matrix converts external annotations into the five CampusFix+ target classes:

| Source Dataset | Original Class Label | CampusFix+ Target Class ID | CampusFix+ Target Class Name | Action / Remapping Rule |
| :--- | :--- | :---: | :--- | :--- |
| Roboflow Seepage | `water_seepage` | `1` | `water_damage` | Direct remap via `importer.py` alias |
| Roboflow Seepage | `efflorescence` | `1` | `water_damage` | Direct remap (mineral salt crust from moisture) |
| Roboflow Seepage | `stain` | `1` | `water_damage` | Filter: accept only if moisture/water halo |
| Roboflow Water Damage | `water-damage` | `1` | `water_damage` | Direct remap |
| Mendeley Concrete | `efflorescence` | `1` | `water_damage` | Convert VOC XML to YOLO $[1, x_c, y_c, w, h]$ |
| Roboflow Cracks | `wall_crack` | `0` | `structural_damage` | Direct remap via `importer.py` alias |
| Roboflow Cracks | `crack` | `0` | `structural_damage` | Direct remap |
| Roboflow Hazard | `burned_socket` | `2` | `electrical_damage` | Direct remap |
| Roboflow Hazard | `damaged_wire` | `2` | `electrical_damage` | Direct remap |
| Roboflow Furniture | `broken_chair` | `3` | `furniture_damage` | Direct remap |
| Roboflow Furniture | `broken_desk` | `3` | `furniture_damage` | Direct remap |
| Roboflow Ceiling | `damaged_tile` | `4` | `ceiling_damage` | Direct remap |
| Roboflow Ceiling | `water_stain_ceiling` | `4` | `ceiling_damage` | Direct remap (ceiling panel priority) |
| Generic Catalogs | `chair` / `table` (intact) | *None* | *Background / Negative* | Create empty `.txt` file (0 bytes) |

---

## 5. Legitimate Acquisition & Authentication Reporting

In accordance with strict ethical and technical constraints:
- **Roboflow Universe:** Datasets under CC BY 4.0 can be exported via the Roboflow Python SDK or REST API. However, this requires a personal Roboflow account and `ROBOFLOW_API_KEY`. In this repository, we document the exact projects and provide CLI ingestion scripts rather than embedding hardcoded or unauthorized tokens.
- **Kaggle:** Requires a `kaggle.json` API credential. Datasets requiring manual web download are documented with direct landing pages.
- **Open-Access Repositories (Mendeley Data, Wikimedia Commons, MDPI):** Permitted for direct HTTPS retrieval under CC BY 4.0, CC BY-SA 4.0, and CC0 licenses. All downloaded files are tracked in `datasets/campus_damage/SOURCE_MANIFEST.csv` with original source URLs, author attribution, and SHA-256 hashes.

