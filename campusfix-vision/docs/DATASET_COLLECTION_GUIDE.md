# CampusFix+ Dataset Collection & Annotation Guide
**Operational Guide & Field Checklist for 5-Class Campus Damage Detection**

---

## 1. Executive Overview

This document provides end-to-end operational instructions for field teams, student surveyors, and annotators gathering visual training data for the CampusFix+ Computer Vision microservice.

The target dataset will train a specialized YOLOv8/YOLOv11 model detecting **five campus facility damage categories**:
- `0`: **`structural_damage`** (masonry cracks, plaster fissures, foundation cracks, concrete spalling)
- `1`: **`water_damage`** (damp spots, active leaks, efflorescence, water stains, blistering paint)
- `2`: **`electrical_damage`** (exposed wiring, scorched outlets, broken switches, shattered conduit)
- `3`: **`furniture_damage`** (broken desks, damaged chairs, sheared lab tables, cracked benches)
- `4`: **`ceiling_damage`** (sagging acoustic tiles, water-damaged drywall, fallen panels, exposed plenum)

---

## 2. Granular Class Specifications

### Class 0: `structural_damage`
*Goal: Detect genuine structural and masonry integrity failures across walls, columns, beams, and floors.*

- **What Qualifies as Damage:**
  - Diagonal shear cracks across load-bearing brick, masonry, or concrete walls.
  - Vertical or horizontal settlement fractures wider than 1 mm.
  - Spiderweb or map cracking across plaster indicating substrate detachment.
  - Concrete spalling where outer layers have flaked away, exposing aggregate or rebar.
  - Foundation and floor tile cracks with visible displacement or gap.
- **What Must NOT Be Labeled as Damage:**
  - Engineered architectural expansion seams and control joints.
  - Straight tile grout lines or panel joints.
  - Surface pencil, ink, marker, or paint graffiti (cleanliness, not structural).
  - Minor paint brush stroke marks or surface dirt streaks.
- **Bounding Box Rule:**
  - Draw a tight bounding box around the contiguous cracked or spalled area.
  - If a crack branches across a wide expanse (>50% of the image), annotate distinct clusters or branches individually rather than one giant box enclosing healthy wall space.

---

### Class 1: `water_damage`
*Goal: Detect moisture intrusion, pipe leaks, seepage, and resulting material decay.*

- **What Qualifies as Damage:**
  - Dark dampness spreading across walls, floors, or around plumbing fixtures.
  - Visible water rings, brown or yellow discoloration stains on plaster or drywall.
  - Mineral efflorescence (white crystalline salt deposits on brick or concrete).
  - Bubbling, peeling, or blistering paint caused by moisture behind the surface.
  - Active water accumulation, puddles, or persistent dripping near conduits/pipes.
- **What Must NOT Be Labeled as Damage:**
  - Naturally dark or textured wall paint.
  - Ambient cast shadows from furniture, door frames, or lighting fixtures.
  - Temporary spilled beverages (coffee, soda) that have dried without damaging material.
  - Normal wet mop sheen or glossy wax floor reflections.
- **Bounding Box Rule:**
  - Encompass the entire discolored moisture contour or damp patch.
  - If efflorescence or paint blistering is localized inside a larger water ring, enclose the full compromised moisture region.

---

### Class 2: `electrical_damage`
*Goal: Localize electrical safety hazards requiring urgent technician triage.*

- **What Qualifies as Damage:**
  - Loose, severed, or dangling live wires with exposed copper conductors.
  - Burnt, charred, or scorched electrical receptacles and power sockets.
  - Cracked, shattered, or missing faceplates exposing live internal terminals.
  - Broken or detached conduit pipes with loose wiring hanging out.
  - Spark-damaged or melted extension strips attached to walls.
- **What Must NOT Be Labeled as Damage:**
  - Temporarily unplugged appliance cords, laptop adapters, or phone cables.
  - Standard surface cable organizers, raceways, or zip-tie bundles in normal use.
  - Functional switchboards with intact switch covers.
  - Dust or non-scorch discoloration on old plastic covers.
- **Bounding Box Rule:**
  - Box tightly around the damaged fixture or exposed wiring bundle.
  - Do not include the entire undamaged wall or distant power cable lengths.

---

### Class 3: `furniture_damage`
*Goal: Identify defective classroom, laboratory, and library furniture needing repair or replacement.*

- **What Qualifies as Damage:**
  - Snapped, detached, or missing chair legs, casters, or backrests.
  - Fractured desk surfaces, split plywood, cracked melamine laminate.
  - Sheared metal welding or collapsed frames on auditorium seating.
  - Broken armrests with exposed screws or sharp splinters.
  - Detached lab stool seats or unstable bench supports.
- **What Must NOT Be Labeled as Damage:**
  - Minor cosmetic scuffs, pencil markings, or surface stickers.
  - Normal textile wear on cushion fabric without structural tear.
  - Chairs temporarily stacked or placed upside down on desks for janitorial cleaning.
- **Bounding Box Rule:**
  - Annotate the specific damaged component (e.g. broken chair leg or fractured desk top).
  - If the entire chair or desk has collapsed into a damaged heap, annotate the full unit tightly.

---

### Class 4: `ceiling_damage`
*Goal: Detect overhead hazards, compromised grid systems, and falling panel risks.*

- **What Qualifies as Damage:**
  - Sagging, bowed, or warped acoustic ceiling tiles.
  - Missing ceiling panels exposing ductwork, plenum, or wiring trays.
  - Water-saturated, discolored, or disintegrating ceiling panels.
  - Cracked or fallen gypsum board panels.
  - Spalled concrete ceiling patches showing rusted reinforcement steel.
- **What Must NOT Be Labeled as Damage:**
  - Functional AC supply diffusers, return air grilles, or exhaust vents.
  - Flush-mounted commercial smoke detectors, emergency sirens, or sprinkler heads.
  - Modular recessed troffer light bays and LED panels.
- **Bounding Box Rule:**
  - Annotate each damaged, sagging, or missing ceiling panel individually.
  - If several adjacent panels have collapsed, box each distinct panel vacancy or damaged cluster.

---

## 3. Special Labeling Protocols

### A. Multi-Category Co-occurrence
Real campus damage frequently involves compounding issues (e.g. a ceiling pipe leak causing water damage on a wall, which in turn cracks plaster).

- **Rule:** Annotate each distinct category with its own specific bounding box.
- **Example:**
  - If a ceiling panel is water-stained (`ceiling_damage`), annotate it as Class 4.
  - If water has run down the wall leaving a damp brown stain (`water_damage`), annotate that patch as Class 1.
  - If a structural crack emerges within that stain (`structural_damage`), create a tighter nested bounding box for Class 0.
- **Overlapping Boxes:** YOLO handles overlapping bounding boxes natively. Do not compromise accuracy by trying to merge two different damage types into one label.

### B. Normal, Undamaged Images (Negative Backgrounds)
To prevent the model from hallucinating defects on healthy surfaces, the training dataset **must contain 10% to 15% negative background samples**.

- **What to Capture:**
  - Clean, uncracked painted walls under various lighting (fluorescent, natural sunlight, hallway LEDs).
  - Intact, functional student desks, lecture hall chairs, and library tables.
  - Undamaged, standard power sockets and light switches.
  - Perfect acoustic tile ceilings with standard AC vents and smoke detectors.
- **YOLO Label Format for Negative Images:**
  - Place the image in `images/<split>/<filename>.jpg`.
  - Create an **empty text file** `labels/<split>/<filename>.txt` (0 bytes).
  - The CampusFix+ `validator.py` utility explicitly verifies and counts these as valid background samples.

### C. Prevention of Data Leakage (Spatial Clustering)
- **The Pitfall:** Taking 10 photos of the same physical crack from slightly different angles and spreading them across `train/` and `test/` causes data leakage. The model memorizes room paint colors and wall textures instead of generalizing damage features.
- **The Requirement:**
  - Use a standardized filename prefix designating the physical room or building:
    `{building}_{room}_{category}_{index}.jpg`
    *(e.g., `lib_204_crack_01.jpg`, `eng_bld1_room102_water_02.jpg`)*
  - The CampusFix+ importer (`dataset_tools/importer.py`) uses the `--group-pattern` regex to ensure that **all photos of a given room are assigned to the SAME dataset split** (Train, Val, or Test).

---

## 4. Dataset Target & Collection Checklist

### Target Volume: 200–300 Images Per Class
Total Dataset Target: **1,000 to 1,500 annotated images + 150 negative background samples**.

| Class ID | Class Name | Target Count | Minimum Train (70%) | Minimum Val (20%) | Minimum Test (10%) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| `0` | `structural_damage` | 200 – 300 | 140 – 210 | 40 – 60 | 20 – 30 |
| `1` | `water_damage` | 200 – 300 | 140 – 210 | 40 – 60 | 20 – 30 |
| `2` | `electrical_damage` | 200 – 300 | 140 – 210 | 40 – 60 | 20 – 30 |
| `3` | `furniture_damage` | 200 – 300 | 140 – 210 | 40 – 60 | 20 – 30 |
| `4` | `ceiling_damage` | 200 – 300 | 140 – 210 | 40 – 60 | 20 – 30 |
| *N/A* | *Background / Negative* | 100 – 150 | 70 – 105 | 20 – 30 | 10 – 15 |
| **TOTAL** | **All Categories** | **1,100 – 1,650** | **770 – 1,155** | **220 – 330** | **110 – 165** |

---

## 5. Field Collection Protocol & Quality Checklist

Before uploading photos to the dataset pipeline, confirm each item on this checklist:

### Camera & Capture Quality
- [ ] **Resolution:** Minimum $640 \times 640$ pixels; recommended $1280 \times 720$ or higher.
- [ ] **Sharpness:** No motion blur; image must pass OpenCV Laplacian variance check ($\ge 75.0$).
- [ ] **Exposure:** Adequate lighting; avoid extreme underexposure (dark corners) or overexposure (harsh flash washout).
- [ ] **Angle Diversity:** Capture defects from straight-on ($90^\circ$) as well as slight oblique angles ($30^\circ - 45^\circ$).
- [ ] **Distance Diversity:** Include both close-ups (fine texture) and medium shots (facility context).

### Ethical & Privacy Standards
- [ ] **Zero Faces:** No student, faculty, or staff faces visible in the frame (blur or crop if unavoidable).
- [ ] **Confidential Data:** No visible student IDs, exam questions, grading sheets, or personal contact info.

### File Organization
- [ ] **Filenames:** Follow `{building}_{room}_{label}_{seq}.jpg` convention for automated spatial partitioning.
- [ ] **No Duplicates:** Never include burst-mode identical photos (the pipeline SHA-256 validator will reject them).
- [ ] **Paired Labels:** Every image has a corresponding `.txt` file with identical stem in `labels/`.

---

## 6. Pipeline Verification Commands

After populating or importing data, run the validation and statistical verification pipeline:

```bash
# 1. Run strict YOLO dataset validation
python dataset_tools/validator.py --dataset-dir datasets/campus_damage

# 2. Compute class distribution, balance ratio, and generate Markdown report
python dataset_tools/stats.py --dataset-dir datasets/campus_damage --export-md datasets/campus_damage/DATASET_REPORT.md

# 3. Execute automated test suite to ensure pipeline integrity
python -m pytest tests/ -v
```

