# CampusFix+ Computer Vision Dataset Annotation Guide
**Standard Operating Procedure (SOP) for Campus Infrastructure Damage Labeling**

---

## 1. Introduction & Objectives

The CampusFix+ Computer Vision microservice utilizes object detection models (YOLOv8/YOLOv11) to detect, classify, and triage physical infrastructure defects across university facilities. To achieve high inference precision in real-world campus environments, training data must adhere to strict annotation standards.

This guide defines:
1. The **5 core damage classes** and their boundary rules.
2. Step-by-step annotation using **CVAT (Computer Vision Annotation Tool)** and **Label Studio**.
3. **Bounding box creation conventions** (tight fit, occlusions, multi-instance).
4. **Data leakage prevention** and spatial split methodologies.
5. Exporting, validating, and committing datasets to the pipeline.

---

## 2. Infrastructure Damage Class Taxonomy

| Class ID | Class Name | Description | Positive Examples | Negative / Exclude Examples |
| :---: | :--- | :--- | :--- | :--- |
| **0** | `structural_damage` | Structural or surface fissures, spalling, deep wall cracks, masonry breaks, and foundation fractures. | • Diagonal shear cracks<br>• Vertical settlement fissures<br>• Masonry & concrete spalling<br>• Deep plaster cracks | • Architectural expansion joints<br>• Surface pencil/pen graffiti<br>• Straight tile grout lines<br>• Paint brush streaks |
| **1** | `water_damage` | Active water leakage, moisture infiltration, damp stains, water pooling, efflorescence, and moisture paint blistering. | • Dark moisture spread on walls/floors<br>• Peeling/blistering paint from water<br>• White mineral efflorescence<br>• Active puddle near pipes | • Uniformly painted dark walls<br>• Normal cast shadows<br>• Dry spilled beverage marks<br>• Normal floor wax reflections |
| **2** | `electrical_damage` | Hazardous or damaged electrical fixtures, burnt outlets, exposed wiring, broken conduits, or shattered switch plates. | • Exposed live or dangling copper wires<br>• Scorched/burnt power outlets<br>• Broken switch plates exposing terminals<br>• Crushed electrical conduits | • Unplugged laptop/phone chargers<br>• Cable organizers / surface raceways<br>• Standard intact junction boxes |
| **3** | `furniture_damage` | Broken, fractured, or structurally compromised desks, chairs, tables, lab benches, and lecture hall seating. | • Snapped chair legs or detached backrests<br>• Cracked desk laminate/plywood<br>• Detached auditorium armrests<br>• Collapsed metal bench frames | • Minor cosmetic scratches or scuffs<br>• Normal wear and tear on upholstery<br>• Furniture temporarily out of place |
| **4** | `ceiling_damage` | Damaged, stained, sagging, missing, or collapsed ceiling tiles, acoustic panels, gypsum boards, or concrete slabs. | • Sagging or broken acoustic tiles<br>• Water-stained ceiling panels<br>• Missing grid panels with exposed plenum<br>• Concrete spalling showing rebar | • Standard AC vents and return grilles<br>• Flush-mounted smoke detectors<br>• Recessed lighting fixtures |

---

## 3. Recommended Annotation Tools

### Option A: Label Studio (Recommended for Local Teams)
1. **Installation:**
   ```bash
   pip install label-studio
   label-studio start
   ```
2. **Project Setup:**
   - Create a project: `CampusFix-Damage-v1`.
   - In **Labeling Setup**, choose **Object Detection with Bounding Boxes**.
   - Paste the following XML labeling template:
     ```xml
     <View>
       <Image name="image" value="$image"/>
       <RectangleLabels name="label" toName="image">
         <Label value="structural_damage" background="#FF4D4F"/>
         <Label value="water_damage" background="#1890FF"/>
         <Label value="electrical_damage" background="#FADB14"/>
         <Label value="furniture_damage" background="#FA8C16"/>
         <Label value="ceiling_damage" background="#722ED1"/>
       </RectangleLabels>
     </View>
     ```
3. **Export:**
   - Click **Export** -> Select **YOLO** format.
   - Extract the generated `.zip` containing images and `.txt` label files.

### Option B: CVAT (Computer Vision Annotation Tool)
1. **Access:** Use self-hosted CVAT or [app.cvat.ai](https://app.cvat.ai).
2. **Project Setup:**
   - Create project: `CampusFix+ Facility Damage`.
   - Define labels:
     - `structural_damage`
     - `water_damage`
     - `electrical_damage`
     - `furniture_damage`
     - `ceiling_damage`
3. **Task Creation:**
   - Upload campus facility photographs.
   - Ensure image quality: minimum resolution of $640 \times 640$ pixels.
4. **Export:**
   - Menu -> **Export Dataset** -> **YOLO 1.1**.

---

## 4. Bounding Box Protocols & Best Practices

### A. Tight Bounding Boxes
- Draw boxes as **tightly** as possible around the defect.
- **Do not** include excess surrounding background wall or floor.
- Avoid loose margins; tight boundaries allow YOLO to isolate structural edge patterns.

### B. Occlusion & Partial Visibility
- If an object is partially occluded (e.g., a chair leg hidden behind a desk), annotate only the **visible portion** if it is clearly defective, or encompass the full object if >70% is visible.
- If a defect is split into distinct visual segments (e.g., a crack continuing on either side of a poster), create **separate bounding boxes** for each visible segment.

### C. Multi-Instance Labeling
- When multiple cracks or water spots appear in the same image, create individual boxes for each instance rather than one massive box covering the entire wall.
- If a moisture patch covers an entire region with cracks inside it, it is acceptable to have overlapping boxes (`water_damage` box enclosing the area and a nested `structural_damage` box).

### D. Background / Negative Samples
- **Crucial Rule:** In real-world detection, models produce false positives on normal walls and desks unless trained on negative samples.
- Include **10% to 15% negative images** (clean walls, functional desks, intact switchboards) in the dataset.
- In YOLO format, negative images have a corresponding empty `.txt` file (0 bytes). The pipeline validator explicitly supports this.

### E. Privacy & Ethical Standards
- **Never annotate or include recognizable student/faculty faces.** If people appear in the photo, blur their faces before uploading.
- Ensure ID cards, sensitive notices, or exam papers are blurred or excluded.

---

## 5. Preventing Data Leakage & Split Methodology

### The Spatial Leakage Trap
In campus facility datasets, taking multiple photos of the same damaged wall from slightly different angles or distances (burst photography) creates high visual correlation.

> [!WARNING]
> If photos of the **same physical defect** are randomly distributed across `train/` and `test/`, the model memorizes the room's background texture rather than learning generalized damage features. This yields artificially high test accuracy that fails in production.

### Proper Splitting Protocol
1. **Group by Physical Location / Room:**
   - All photos of *Block A - Room 204* must be entirely in **train** OR entirely in **test**.
   - Never split photos of the same room across splits.
2. **Standard Ratios:**
   - **Train (70%):** Model parameter optimization.
   - **Validation (20%):** Hyperparameter tuning and early stopping.
   - **Test (10%):** Unbiased final evaluation on completely unseen campus buildings.

---

## 6. YOLO Annotation Format Specification

Each image in `images/<split>/<filename>.jpg` has a matching text file `labels/<split>/<filename>.txt`.

Each line represents one bounding box:
```text
<class_id> <x_center> <y_center> <width> <height>
```

- `class_id`: Integer from `0` to `4`:
  - `0`: `structural_damage`
  - `1`: `water_damage`
  - `2`: `electrical_damage`
  - `3`: `furniture_damage`
  - `4`: `ceiling_damage`
- `x_center`, `y_center`: Coordinates of the center of the box, normalized between `0.0` and `1.0` relative to image dimensions.
- `width`, `height`: Width and height of the box, normalized between `0.0` and `1.0`.

**Example `labels/train/hallway_crack_001.txt`:**
```text
0 0.452100 0.612400 0.125000 0.354000
1 0.781200 0.340000 0.210000 0.185000
```

---

## 7. Pipeline Validation & Quality Assurance

Before using any annotated dataset for training, execute the built-in dataset validator and statistical tools:

```bash
# 1. Validate dataset integrity
python dataset_tools/validator.py --dataset-dir datasets/campus_damage

# 2. Inspect dataset statistics and class distribution
python dataset_tools/stats.py --dataset-dir datasets/campus_damage --export-md datasets/campus_damage/DATASET_REPORT.md
```

The validator automatically verifies:
- File correspondence (every image has a label, no orphaned labels).
- Coordinate normalization bounds ($0.0 \le coord \le 1.0$).
- Valid class IDs ($0 \le id < 5$ matching configured class taxonomy).
- Duplicate image detection via SHA-256 hash.
- Corrupted or unreadable image files.

---

## 8. Importing Real-World Datasets from CVAT & Roboflow

CampusFix+ provides an automated import utility (`dataset_tools/importer.py`) that imports, validates, and partitions real-world annotations while protecting the repository from data leakage and file collisions.

### A. Exporting Annotations from CVAT
1. In CVAT, navigate to your task or project.
2. Click **Export Task Dataset**.
3. Select **YOLO 1.1** as the export format.
4. Extract the downloaded zip file into a local folder (e.g. `incoming/cvat_cracks/`).

### B. Exporting Annotations from Roboflow
1. In Roboflow, navigate to your dataset version and click **Export Dataset**.
2. Select **YOLOv8 PyTorch TXT** format.
3. Download and extract the zip archive (e.g. `incoming/roboflow_cracks/`).

### C. Wall Crack Pilot Import (Single-Class: `0: wall_crack`)

To import external crack annotations into the single-class pilot dataset (`datasets/wall_crack_pilot/`):

#### 1. Dry-Run Simulation (Recommended First Step)
Simulate the import to verify labels and detect duplicate images without modifying disk:
```bash
python dataset_tools/importer.py \
  --source-dir incoming/cvat_cracks \
  --target-dir datasets/wall_crack_pilot \
  --dry-run
```

#### 2. Execute Import with Spatial Room Clustering
Prevent data leakage by clustering photos of the same physical room into the same split:
```bash
python dataset_tools/importer.py \
  --source-dir incoming/cvat_cracks \
  --target-dir datasets/wall_crack_pilot \
  --group-pattern "^([a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)?)" \
  --conflict-strategy rename \
  --export-summary datasets/wall_crack_pilot/IMPORT_SUMMARY.md
```

### D. Five-Class Dataset Import (`datasets/campus_damage/`)

When importing datasets containing multiple classes, or remapping custom class names:

```bash
python dataset_tools/importer.py \
  --source-dir incoming/roboflow_multi \
  --target-dir datasets/campus_damage \
  --source-yaml incoming/roboflow_multi/data.yaml \
  --class-map '{"crack": 0, "water_stain": 1, "broken_outlet": 2, "broken_chair": 3, "ceiling_tile": 4}' \
  --export-summary datasets/campus_damage/IMPORT_SUMMARY.md
```

### E. Safety Guarantees
- **No Overwrite:** Existing images and labels are never silently overwritten. Filename collisions with different content are safely renamed (e.g. `<stem>_imp_<short_hash>.jpg`).
- **Duplicate Prevention:** Incoming images matching existing SHA-256 hashes are automatically skipped.
- **Validation Check:** Post-import, automatically run `validator.py` and `stats.py` to ensure dataset consistency.
