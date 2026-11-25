# CampusFix+ On-Campus Damage Collection Checklist
**Field Survey Protocol & Quality Control for University Facilities**

---

## 1. Survey Scope & Objectives

While public benchmarks provide foundational baseline features, real university campuses have distinct architectural characteristics (concrete block construction, institutional gloss paint, fluorescent troffers, standard institutional furniture).

This checklist guides field surveying teams, maintenance interns, and student contributors collecting authentic damage photographs across campus facilities.

---

## 2. Institutional Permissions & Privacy Rules

> [!IMPORTANT]
> University policy and student privacy regulations must be respected during all survey operations.

- [ ] **Facility Permissions:** Ensure clearance from Campus Facilities Management or Department Chairs before photographing restricted spaces (electrical sub-stations, boiler rooms, server closets).
- [ ] **Zero Faces (Privacy):** Never include identifiable students, faculty, or staff in photographs. If someone walks into frame, wait for them to pass or reframe the shot.
- [ ] **Data Confidentiality:** Avoid capturing visible computer screens, student ID cards, whiteboards with exam answers, or personal documentation.
- [ ] **No Staging:** Never tamper with, loosen, or artificially create physical damage (e.g., unplugging conduits or loosening chair bolts). Photograph only existing in-situ defects.

---

## 3. Building & Room Naming Convention

To prevent **spatial data leakage**, all campus photos must encode the building and room in their filename:

```text
{BUILDING}_{ROOM}_{CLASS}_{INDEX}.jpg
```

### Building Code Standard
- `ADMIN`: Administration Building
- `ENG1`: Engineering Block 1 (Civil / Mechanical)
- `ENG2`: Engineering Block 2 (CS / IT / Electronics)
- `SCI`: Science Complex & Laboratories
- `LIB`: Central University Library
- `HOSTEL_A` / `HOSTEL_B`: Student Residential Quarters
- `CAF`: Student Center & Dining Hall
- `AUD`: Main Auditorium & Lecture Theatres

### Examples
- `ENG2_LAB304_water_damage_01.jpg`
- `LIB_STACKS2_structural_damage_02.jpg`
- `HOSTEL_A_RM112_electrical_damage_01.jpg`
- `CAF_DINING_furniture_damage_03.jpg`
- `ADMIN_HALL1_ceiling_damage_01.jpg`

---

## 4. Photographing Guidelines by Damage Class

### Class 0: `structural_damage`
- [ ] Capture the crack both in **close-up** (showing fissure width) and **context shot** (showing position on the wall/column).
- [ ] Ensure lighting illuminates crack depth (avoid direct flash washing out shadows inside the fissure).
- [ ] *Exclusions:* Do not photograph expansion seams or grout lines.

### Class 1: `water_damage`
- [ ] Capture the full perimeter of the moisture halo or damp patch.
- [ ] If efflorescence (white mineral salt crust) is present, capture the powdery surface texture clearly.
- [ ] Photograph active leaks alongside the source (under-sink pipe, ceiling drip point) when safe.
- [ ] *Exclusions:* Do not photograph temporary beverage spills or normal floor mop sheen.

### Class 2: `electrical_damage`
- [ ] **SAFETY FIRST:** Never touch exposed wires or charred sockets. Maintain a safe standing distance ($\ge 1$ meter).
- [ ] Ensure adequate lighting on dark switchboards using ambient room lights or indirect flashlight.
- [ ] Frame the specific cracked cover plate, melted plastic, or frayed wire insulation.
- [ ] *Exclusions:* Do not photograph normal extension cords or neatly bundled cables.

### Class 3: `furniture_damage`
- [ ] Frame the fractured chair leg, broken desk surface, or collapsed seat support in natural orientation.
- [ ] Include one shot of the defect location on the furniture piece and one broader shot showing the item in classroom context.
- [ ] *Exclusions:* Do not photograph desks with minor pencil scribbles or normal wear.

### Class 4: `ceiling_damage`
- [ ] Photograph overhead perpendicular to the ceiling plane, or at a slight $60^\circ-75^\circ$ upward angle.
- [ ] Capture both the sagging/missing panel and the adjacent grid structure.
- [ ] *Exclusions:* Do not photograph standard AC vents or smoke detectors.

### Negative / Background Samples (Undamaged Campus Spaces)
- [ ] For every 10 damage photos, take **1–2 photos of clean, normal, undamaged campus facilities**:
  - Pristine painted classroom walls.
  - Functional desks in regular use.
  - Standard, intact light switches and power sockets.
  - Clean ceiling tile layouts.

---

## 5. Technical Quality Control Checklist

Before offloading photos from mobile devices or cameras:

- [ ] **Resolution:** Camera set to at least 12 Megapixels ($4000 \times 3000$ px); resized to minimum $640 \times 640$ px upon import.
- [ ] **Blur Check:** Discard any blurry images immediately; zoom in on device to confirm sharp edge definition.
- [ ] **Lighting:** Turn off aggressive camera HDR filters that distort color gradients of water stains.
- [ ] **Duplicate Prevention:**
  - Do NOT take burst photos (holding shutter button).
  - Move your physical standing position between shots (change angle by $30^\circ$ or step back 1 meter) so each photograph provides distinct spatial information.
- [ ] **Format:** Save in standard RGB JPG or PNG format. Avoid proprietary HEIC/HEIF files without conversion.

---

## 6. Field Survey Target Milestones

| Target Location | Priority Classes | Target Photos | Status |
| :--- | :--- | :---: | :---: |
| **Engineering Block 1 Basement & Restrooms** | `water_damage`, `structural_damage` | 50 | [ ] Pending |
| **Old Science Block Laboratories** | `structural_damage`, `electrical_damage` | 50 | [ ] Pending |
| **Library Study Halls & Reading Rooms** | `furniture_damage`, `ceiling_damage` | 40 | [ ] Pending |
| **Student Hostels (Common Areas & Corridors)** | `water_damage`, `furniture_damage`, `electrical_damage` | 60 | [ ] Pending |
| **Lecture Hall Complex (Main Auditorium)** | `ceiling_damage`, `furniture_damage` | 40 | [ ] Pending |
| **Main Campus Dining Hall** | `furniture_damage`, `water_damage` | 30 | [ ] Pending |
| **Control Samples (New Admin Building)** | *Undamaged Backgrounds* | 30 | [ ] Pending |
| **Total Campus Field Target** | **All 5 Classes + Backgrounds** | **300** | [ ] In Progress |

