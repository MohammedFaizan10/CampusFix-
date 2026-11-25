"""
CampusFix+ Dataset Importer Utility
====================================
Imports YOLO-format images and annotations from CVAT, Roboflow, or custom collections.

Features:
1. Supports pre-split (train/val/test) or un-split datasets.
2. Validates image-label correspondence and image readability.
3. Validates and remaps class IDs against target data.yaml (supports single-class & multi-class).
4. Detects and skips duplicate images via SHA-256 hashing across all splits.
5. Preserves existing data: never silently overwrites files (safe renaming or skipping).
6. Prevents data leakage via building/room spatial clustering for un-split data.
7. Supports dry-run simulation mode.
8. Generates comprehensive import summaries in CLI and Markdown formats.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import cv2
import yaml

try:
    from dataset_tools.validator import DatasetValidator, VALID_IMAGE_EXTS
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dataset_tools.validator import DatasetValidator, VALID_IMAGE_EXTS


@dataclass
class ImageLabelPair:
    """Represents a discovered image and its associated annotation file."""
    image_path: Path
    label_path: Optional[Path]
    source_split: Optional[str]  # 'train', 'val', 'test', or None if unsplit
    room_group: str
    image_hash: str = ""
    is_valid_image: bool = True
    is_background: bool = False
    raw_annotations: List[str] = field(default_factory=list)
    parsed_boxes: List[Tuple[int, float, float, float, float]] = field(default_factory=list)
    target_boxes: List[Tuple[int, float, float, float, float]] = field(default_factory=list)
    error_message: Optional[str] = None


@dataclass
class ImportSummary:
    """Summary metrics of an import operation."""
    source_dir: str
    target_dir: str
    target_yaml: str
    dry_run: bool
    total_images_scanned: int = 0
    total_labels_scanned: int = 0
    valid_pairs: int = 0
    missing_labels: int = 0
    orphaned_labels: int = 0
    corrupt_images: int = 0
    duplicate_images_skipped: int = 0
    conflicts_renamed: int = 0
    conflicts_skipped: int = 0
    unmapped_annotations_dropped: int = 0
    imported_images_per_split: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    imported_annotations_per_class: Dict[int, int] = field(default_factory=lambda: defaultdict(int))
    leakage_warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    actions: List[str] = field(default_factory=list)


class DatasetImporter:
    """Imports and validates YOLO datasets into CampusFix+ repositories."""

    def __init__(
        self,
        source_dir: Path | str,
        target_dir: Path | str,
        target_yaml: Optional[Path | str] = None,
        source_yaml: Optional[Path | str] = None,
        class_map: Optional[Dict[str, int]] = None,
        conflict_strategy: str = "rename",  # 'rename', 'skip', 'error'
        split_ratio: Tuple[float, float, float] = (0.70, 0.20, 0.10),
        group_pattern: str = r"^([a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)?)",
        filter_unmapped: bool = True,
        strict_classes: bool = False,
        allow_background: bool = True,
        dry_run: bool = False,
    ):
        self.source_dir = Path(source_dir).resolve()
        self.target_dir = Path(target_dir).resolve()
        self.target_yaml = (
            Path(target_yaml).resolve() if target_yaml else self.target_dir / "data.yaml"
        )
        self.source_yaml = Path(source_yaml).resolve() if source_yaml else None
        self.conflict_strategy = conflict_strategy.lower()
        self.split_ratio = split_ratio
        self.group_pattern = re.compile(group_pattern)
        self.filter_unmapped = filter_unmapped
        self.strict_classes = strict_classes
        self.allow_background = allow_background
        self.dry_run = dry_run

        self.target_classes: Dict[int, str] = {}
        self.source_classes: Dict[int, str] = {}
        self.class_map: Dict[int, int] = {}

        self._load_configs(class_map)
        self.existing_hashes: Dict[str, Tuple[str, Path]] = {}
        self.existing_filenames: Set[str] = set()
        self._index_existing_target()

    def _load_configs(self, manual_class_map: Optional[Dict[str, int]]) -> None:
        """Loads target and source class definitions and computes class mapping."""
        if not self.target_yaml.exists():
            raise FileNotFoundError(f"Target data.yaml not found at: {self.target_yaml}")

        with open(self.target_yaml, "r", encoding="utf-8") as f:
            t_cfg = yaml.safe_load(f)

        t_names = t_cfg.get("names", {})
        if isinstance(t_names, dict):
            self.target_classes = {int(k): str(v) for k, v in t_names.items()}
        elif isinstance(t_names, list):
            self.target_classes = {i: str(n) for i, n in enumerate(t_names)}
        else:
            raise ValueError(f"Invalid 'names' field in target config: {self.target_yaml}")

        # Invert target map for name matching: name.lower() -> class_id
        target_name_to_id = {name.lower(): cid for cid, name in self.target_classes.items()}

        # Load source yaml if provided
        if self.source_yaml and self.source_yaml.exists():
            with open(self.source_yaml, "r", encoding="utf-8") as f:
                s_cfg = yaml.safe_load(f)
            s_names = s_cfg.get("names", {})
            if isinstance(s_names, dict):
                self.source_classes = {int(k): str(v) for k, v in s_names.items()}
            elif isinstance(s_names, list):
                self.source_classes = {i: str(n) for i, n in enumerate(s_names)}

        # Resolve class mapping
        if manual_class_map:
            for src_key, tgt_val in manual_class_map.items():
                tgt_id = int(tgt_val)
                if tgt_id not in self.target_classes:
                    raise ValueError(
                        f"Mapped target class ID {tgt_id} does not exist in target data.yaml {list(self.target_classes.keys())}"
                    )
                # Check if src_key is integer or name
                try:
                    src_id = int(src_key)
                    self.class_map[src_id] = tgt_id
                except ValueError:
                    # src_key is a class name
                    src_name = str(src_key).strip().lower()
                    # Find if source yaml has this name
                    matched = False
                    for sid, sname in self.source_classes.items():
                        if sname.lower() == src_name:
                            self.class_map[sid] = tgt_id
                            matched = True
                    if not matched:
                        # Fallback: if source class IDs match target names
                        if src_name in target_name_to_id:
                            # Direct name
                            for sid in range(100):
                                self.class_map[tgt_id] = tgt_id
        else:
            # Auto-align by name, alias, or identity
            CLASS_ALIASES = {
                "structural_damage": ["wall_crack", "crack", "masonry_crack", "concrete_crack", "wall_damage", "structural_damage"],
                "water_damage": ["water_seepage", "water_stain", "seepage", "dampness", "efflorescence", "leakage", "water_damage"],
                "electrical_damage": ["electrical_fault", "exposed_wiring", "broken_switch", "broken_outlet", "wire_hazard", "electrical_damage"],
                "furniture_damage": ["broken_furniture", "broken_chair", "broken_desk", "broken_table", "damaged_chair", "furniture_damage"],
                "ceiling_damage": ["broken_ceiling", "ceiling_crack", "ceiling_stain", "fallen_tile", "ceiling_tile", "ceiling_damage"],
            }
            if self.source_classes:
                for sid, sname in self.source_classes.items():
                    sname_clean = sname.lower().replace("-", "_").strip()
                    # 1. Exact match
                    matched = False
                    for tid, tname in self.target_classes.items():
                        tname_clean = tname.lower().replace("-", "_").strip()
                        if sname_clean == tname_clean:
                            self.class_map[sid] = tid
                            matched = True
                            break
                    # 2. Alias match if not exact
                    if not matched:
                        for tid, tname in self.target_classes.items():
                            tname_clean = tname.lower().replace("-", "_").strip()
                            aliases = CLASS_ALIASES.get(tname_clean, [])
                            if sname_clean in aliases:
                                self.class_map[sid] = tid
                                break
            else:
                # Default identity mapping if classes match in count or single class
                if len(self.target_classes) == 1:
                    # Single-class pilot: class 0 maps to class 0
                    self.class_map[0] = 0
                else:
                    for cid in self.target_classes:
                        self.class_map[cid] = cid

    def _index_existing_target(self) -> None:
        """Indexes SHA-256 hashes and filenames of images currently in the target dataset."""
        splits = ["train", "val", "test"]
        for split in splits:
            img_dir = self.target_dir / "images" / split
            if not img_dir.exists():
                continue
            for img_path in img_dir.iterdir():
                if img_path.is_file() and img_path.suffix.lower() in VALID_IMAGE_EXTS:
                    self.existing_filenames.add(img_path.name.lower())
                    try:
                        h = self._compute_file_hash(img_path)
                        self.existing_hashes[h] = (split, img_path)
                    except Exception:
                        pass

    @staticmethod
    def _compute_file_hash(path: Path) -> str:
        """Calculates SHA-256 checksum of a file."""
        hasher = hashlib.sha256()
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _find_pairs(self) -> Tuple[List[ImageLabelPair], ImportSummary]:
        """Scans source directory and pairs images with YOLO annotation files."""
        summary = ImportSummary(
            source_dir=str(self.source_dir),
            target_dir=str(self.target_dir),
            target_yaml=str(self.target_yaml),
            dry_run=self.dry_run,
        )

        if not self.source_dir.exists():
            summary.errors.append(f"Source directory does not exist: {self.source_dir}")
            return [], summary

        # 1. Discover all candidate images and labels
        all_files = [p for p in self.source_dir.rglob("*") if p.is_file() and not p.name.startswith(".")]
        image_files = [p for p in all_files if p.suffix.lower() in VALID_IMAGE_EXTS]
        label_files = {p.stem.lower(): p for p in all_files if p.suffix.lower() == ".txt"}

        summary.total_images_scanned = len(image_files)
        summary.total_labels_scanned = len(label_files)

        pairs: List[ImageLabelPair] = []
        matched_label_stems: Set[str] = set()

        for img_path in image_files:
            stem = img_path.stem.lower()

            # Detect split from directory path if present (e.g. source/train/images or source/images/train)
            parts = [part.lower() for part in img_path.parts]
            detected_split = None
            if "train" in parts:
                detected_split = "train"
            elif "val" in parts or "valid" in parts or "validation" in parts:
                detected_split = "val"
            elif "test" in parts:
                detected_split = "test"

            # Derive room/building group
            room_group = self._extract_room_group(img_path)

            # Find matching label file
            matching_label = label_files.get(stem)
            if matching_label:
                matched_label_stems.add(stem)

            pair = ImageLabelPair(
                image_path=img_path,
                label_path=matching_label,
                source_split=detected_split,
                room_group=room_group,
            )

            # Validate Image Readability
            try:
                img_data = cv2.imread(str(img_path))
                if img_data is None or img_data.size == 0:
                    pair.is_valid_image = False
                    pair.error_message = "Corrupted or unreadable image header."
                    summary.corrupt_images += 1
                else:
                    pair.image_hash = self._compute_file_hash(img_path)
            except Exception as e:
                pair.is_valid_image = False
                pair.error_message = f"Error reading image: {e}"
                summary.corrupt_images += 1

            # Validate Label Presence
            if pair.label_path is None:
                summary.missing_labels += 1
                if not self.allow_background:
                    pair.error_message = "Missing corresponding .txt label file."
                else:
                    pair.is_background = True

            pairs.append(pair)

        # Count orphaned labels
        orphaned = set(label_files.keys()) - matched_label_stems
        summary.orphaned_labels = len(orphaned)
        for orphan_stem in list(orphaned)[:5]:
            summary.errors.append(f"Orphaned label '{label_files[orphan_stem].name}' has no matching image.")
        if len(orphaned) > 5:
            summary.errors.append(f"... and {len(orphaned) - 5} more orphaned label files.")

        return pairs, summary

    def _extract_room_group(self, path: Path) -> str:
        """Extracts room or building group key from filename or immediate parent folder."""
        # 1. Try regex pattern on filename
        match = self.group_pattern.search(path.stem)
        if match:
            return match.group(1).lower()

        # 2. Try parent directory if parent is not generic ('images', 'train', 'val', 'test')
        generic_dirs = {"images", "labels", "train", "val", "valid", "test", "raw", "data"}
        parent_name = path.parent.name.lower()
        if parent_name not in generic_dirs:
            return parent_name

        return path.stem.lower()

    def _parse_and_remap_annotations(
        self, pair: ImageLabelPair, summary: ImportSummary
    ) -> bool:
        """Parses YOLO bounding box lines, validates bounds, and remaps class IDs."""
        if pair.label_path is None or pair.is_background:
            return True

        try:
            content = pair.label_path.read_text(encoding="utf-8").strip()
        except Exception as e:
            pair.error_message = f"Failed to read label file: {e}"
            return False

        if not content:
            pair.is_background = True
            return True

        lines = [l.strip() for l in content.splitlines() if l.strip()]
        pair.raw_annotations = lines

        for line_idx, line in enumerate(lines, start=1):
            tokens = line.split()
            if len(tokens) != 5:
                pair.error_message = (
                    f"Invalid token count in {pair.label_path.name}:{line_idx} (expected 5, got {len(tokens)})"
                )
                return False

            try:
                src_cls = int(tokens[0])
                xc = float(tokens[1])
                yc = float(tokens[2])
                bw = float(tokens[3])
                bh = float(tokens[4])
            except ValueError as ve:
                pair.error_message = f"Non-numeric token in {pair.label_path.name}:{line_idx}: {ve}"
                return False

            # Coordinate range check [0.0, 1.0]
            if not (0.0 <= xc <= 1.0 and 0.0 <= yc <= 1.0 and 0.0 <= bw <= 1.0 and 0.0 <= bh <= 1.0):
                pair.error_message = (
                    f"Out-of-bounds coordinates in {pair.label_path.name}:{line_idx}: [{xc}, {yc}, {bw}, {bh}]"
                )
                return False

            if bw <= 0.0 or bh <= 0.0:
                pair.error_message = f"Zero or negative box dimensions in {pair.label_path.name}:{line_idx}"
                return False

            pair.parsed_boxes.append((src_cls, xc, yc, bw, bh))

            # Remap class ID
            if src_cls in self.class_map:
                tgt_cls = self.class_map[src_cls]
                pair.target_boxes.append((tgt_cls, xc, yc, bw, bh))
            else:
                if self.strict_classes:
                    pair.error_message = (
                        f"Source class ID {src_cls} has no mapping to target classes {list(self.target_classes.keys())}"
                    )
                    return False
                elif self.filter_unmapped:
                    summary.unmapped_annotations_dropped += 1
                else:
                    pair.error_message = f"Unmapped class ID {src_cls} encountered in strict mode."
                    return False

        return True

    def _partition_by_room(
        self, pairs: List[ImageLabelPair], summary: ImportSummary
    ) -> Dict[str, List[ImageLabelPair]]:
        """
        Partitions pairs into train, val, and test splits.
        Enforces that all images sharing the same room_group are assigned to the SAME split,
        preventing spatial data leakage.
        """
        partitioned: Dict[str, List[ImageLabelPair]] = {"train": [], "val": [], "test": []}

        # Check if already pre-split
        pre_split_count = sum(1 for p in pairs if p.source_split in {"train", "val", "test"})
        if pre_split_count == len(pairs) and len(pairs) > 0:
            # Source was already split. Verify room leakage across splits.
            room_to_splits: Dict[str, Set[str]] = defaultdict(set)
            for p in pairs:
                partitioned[p.source_split].append(p)
                room_to_splits[p.room_group].add(p.source_split)

            # Check for spatial leakage
            for room, splits_used in room_to_splits.items():
                if len(splits_used) > 1:
                    warning = (
                        f"Potential spatial data leakage in pre-split source: Room/group '{room}' "
                        f"appears in multiple splits: {sorted(list(splits_used))}."
                    )
                    summary.leakage_warnings.append(warning)
            return partitioned

        # Group by room for unsplit dataset
        groups: Dict[str, List[ImageLabelPair]] = defaultdict(list)
        for p in pairs:
            groups[p.room_group].append(p)

        # Sort room groups deterministically by count descending then name
        sorted_groups = sorted(groups.items(), key=lambda x: (-len(x[1]), x[0]))

        target_train_ratio = self.split_ratio[0]
        target_val_ratio = self.split_ratio[1]
        total_items = len(pairs)

        train_cap = int(total_items * target_train_ratio)
        val_cap = int(total_items * target_val_ratio)

        curr_train = 0
        curr_val = 0

        for group_id, group_pairs in sorted_groups:
            group_size = len(group_pairs)
            if curr_train + group_size <= train_cap or (curr_train == 0 and group_size > train_cap):
                partitioned["train"].extend(group_pairs)
                curr_train += group_size
            elif curr_val + group_size <= val_cap or (curr_val == 0 and group_size > val_cap):
                partitioned["val"].extend(group_pairs)
                curr_val += group_size
            else:
                partitioned["test"].extend(group_pairs)

        return partitioned

    def import_dataset(self) -> ImportSummary:
        """Executes the full import workflow with validation, conflict resolution, and reporting."""
        pairs, summary = self._find_pairs()
        if not pairs and summary.errors:
            return summary

        # 1. Filter out corrupt images and invalid pairs
        valid_pairs: List[ImageLabelPair] = []
        seen_incoming_hashes: Dict[str, ImageLabelPair] = {}

        for p in pairs:
            if not p.is_valid_image:
                summary.errors.append(f"Skipping corrupt image '{p.image_path.name}': {p.error_message}")
                continue

            if p.label_path is None and not self.allow_background:
                summary.errors.append(f"Skipping image without label '{p.image_path.name}'")
                continue

            # Check duplicate against existing dataset in target
            if p.image_hash in self.existing_hashes:
                prev_split, prev_path = self.existing_hashes[p.image_hash]
                summary.duplicate_images_skipped += 1
                summary.actions.append(
                    f"SKIP DUPLICATE: '{p.image_path.name}' matches existing image '{prev_path.name}' in {prev_split}."
                )
                continue

            # Check duplicate within incoming batch
            if p.image_hash in seen_incoming_hashes:
                first_pair = seen_incoming_hashes[p.image_hash]
                summary.duplicate_images_skipped += 1
                summary.actions.append(
                    f"SKIP DUPLICATE: '{p.image_path.name}' is duplicate of incoming '{first_pair.image_path.name}'."
                )
                continue

            seen_incoming_hashes[p.image_hash] = p

            # Parse and remap annotations
            if not self._parse_and_remap_annotations(p, summary):
                summary.errors.append(f"Annotation error in '{p.image_path.name}': {p.error_message}")
                continue

            valid_pairs.append(p)

        summary.valid_pairs = len(valid_pairs)

        # 2. Partition into splits with spatial leakage prevention
        splits = self._partition_by_room(valid_pairs, summary)

        # 3. Perform or simulate file operations
        for split_name, split_pairs in splits.items():
            dest_img_dir = self.target_dir / "images" / split_name
            dest_lbl_dir = self.target_dir / "labels" / split_name

            if not self.dry_run:
                dest_img_dir.mkdir(parents=True, exist_ok=True)
                dest_lbl_dir.mkdir(parents=True, exist_ok=True)

            for p in split_pairs:
                final_filename = p.image_path.name
                target_img_path = dest_img_dir / final_filename
                target_lbl_path = dest_lbl_dir / f"{Path(final_filename).stem}.txt"

                # Check filename collision (different image content, same name)
                if target_img_path.exists() or final_filename.lower() in self.existing_filenames:
                    if self.conflict_strategy == "skip":
                        summary.conflicts_skipped += 1
                        summary.actions.append(
                            f"SKIP CONFLICT: Target filename '{final_filename}' already exists."
                        )
                        continue
                    elif self.conflict_strategy == "error":
                        err = f"FILENAME CONFLICT: File '{final_filename}' already exists in target {split_name}."
                        summary.errors.append(err)
                        return summary
                    else:  # rename strategy (default, never overwrites)
                        short_hash = p.image_hash[:8] if p.image_hash else "imp"
                        stem = p.image_path.stem
                        suffix = p.image_path.suffix
                        final_filename = f"{stem}_imp_{short_hash}{suffix}"
                        target_img_path = dest_img_dir / final_filename
                        target_lbl_path = dest_lbl_dir / f"{stem}_imp_{short_hash}.txt"
                        summary.conflicts_renamed += 1
                        summary.actions.append(
                            f"RENAME CONFLICT: '{p.image_path.name}' -> '{final_filename}' to prevent overwrite."
                        )

                # Record statistics
                summary.imported_images_per_split[split_name] += 1
                self.existing_filenames.add(final_filename.lower())
                self.existing_hashes[p.image_hash] = (split_name, target_img_path)

                for box in p.target_boxes:
                    cid = box[0]
                    summary.imported_annotations_per_class[cid] += 1

                # Write files if not dry-run
                if not self.dry_run:
                    # Copy image safely
                    shutil.copy2(p.image_path, target_img_path)

                    # Write remapped label
                    label_lines = [
                        f"{cid} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}"
                        for cid, xc, yc, bw, bh in p.target_boxes
                    ]
                    target_lbl_path.write_text(
                        "\n".join(label_lines) + ("\n" if label_lines else ""),
                        encoding="utf-8",
                    )

        return summary

    def generate_markdown_summary(self, summary: ImportSummary) -> str:
        """Generates a structured GitHub Flavored Markdown import summary."""
        mode_str = "**DRY-RUN (SIMULATION ONLY - NO FILES WRITTEN)**" if summary.dry_run else "**EXECUTED (FILES IMPORTED)**"
        total_imported = sum(summary.imported_images_per_split.values())
        total_annotations = sum(summary.imported_annotations_per_class.values())

        lines = [
            f"# CampusFix+ Dataset Import Summary",
            f"",
            f"- **Execution Mode:** {mode_str}",
            f"- **Source Directory:** `{summary.source_dir}`",
            f"- **Target Directory:** `{summary.target_dir}`",
            f"- **Target Configuration:** `{summary.target_yaml}`",
            f"- **Target Classes:** `{', '.join([f'{k}: {v}' for k, v in self.target_classes.items()])}`",
            f"",
            f"---",
            f"",
            f"## 1. Import Metrics Overview",
            f"",
            f"| Metric | Count | Description |",
            f"| :--- | :---: | :--- |",
            f"| **Scanned Images** | `{summary.total_images_scanned}` | Total image files found in source |",
            f"| **Scanned Labels** | `{summary.total_labels_scanned}` | Total label `.txt` files found in source |",
            f"| **Valid Pairs** | `{summary.valid_pairs}` | Successfully parsed image-label pairs |",
            f"| **Imported Images** | `{total_imported}` | Images accepted and placed into target splits |",
            f"| **Imported Annotations** | `{total_annotations}` | Total bounding boxes remapped and recorded |",
            f"| **Duplicates Skipped** | `{summary.duplicate_images_skipped}` | Identical SHA-256 hashes detected and skipped |",
            f"| **Conflicts Renamed** | `{summary.conflicts_renamed}` | Filename collisions resolved safely without overwriting |",
            f"| **Conflicts Skipped** | `{summary.conflicts_skipped}` | Filename collisions skipped |",
            f"| **Missing Labels** | `{summary.missing_labels}` | Images without `.txt` (treated as background) |",
            f"| **Orphaned Labels** | `{summary.orphaned_labels}` | Label `.txt` files with no corresponding image |",
            f"| **Corrupted Images** | `{summary.corrupt_images}` | Unreadable images rejected |",
            f"| **Unmapped Boxes Dropped** | `{summary.unmapped_annotations_dropped}` | Non-target classes filtered out |",
            f"",
            f"## 2. Target Split Distribution",
            f"",
            f"| Split | Imported Images | Share (%) |",
            f"| :---: | :---: | :---: |",
        ]

        for sname in ["train", "val", "test"]:
            cnt = summary.imported_images_per_split.get(sname, 0)
            pct = round((cnt / total_imported * 100), 1) if total_imported > 0 else 0.0
            lines.append(f"| **{sname.upper()}** | `{cnt}` | `{pct}%` |")

        lines.extend([
            f"",
            f"## 3. Class Annotation Breakdown",
            f"",
            f"| Class ID | Target Class Name | Imported Annotations |",
            f"| :---: | :--- | :---: |",
        ])

        for cid, cname in sorted(self.target_classes.items()):
            ann_cnt = summary.imported_annotations_per_class.get(cid, 0)
            lines.append(f"| `{cid}` | **{cname}** | `{ann_cnt}` |")

        if summary.leakage_warnings:
            lines.extend([
                f"",
                f"## ⚠️ Spatial Data Leakage Warnings",
                f"",
            ])
            for warn in summary.leakage_warnings:
                lines.append(f"- > [!WARNING] {warn}")

        if summary.errors:
            lines.extend([
                f"",
                f"## 🛑 Errors Encountered",
                f"",
            ])
            for err in summary.errors[:10]:
                lines.append(f"- `{err}`")
            if len(summary.errors) > 10:
                lines.append(f"- *... and {len(summary.errors) - 10} more errors.*")

        lines.extend([
            f"",
            f"---",
            f"*Generated by CampusFix+ Dataset Importer Pipeline*",
        ])

        return "\n".join(lines)


def main() -> int:
    """CLI entry point for dataset importer."""
    parser = argparse.ArgumentParser(
        description="CampusFix+ YOLO Dataset Importer & Spatial Partitioning Utility",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Path to source directory containing CVAT, Roboflow, or raw YOLO images and labels.",
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        required=True,
        help="Target dataset directory (e.g. datasets/wall_crack_pilot or datasets/campus_damage).",
    )
    parser.add_argument(
        "--target-yaml",
        type=Path,
        default=None,
        help="Optional explicit path to target data.yaml (defaults to <target-dir>/data.yaml).",
    )
    parser.add_argument(
        "--source-yaml",
        type=Path,
        default=None,
        help="Optional path to source data.yaml (e.g. from Roboflow export).",
    )
    parser.add_argument(
        "--class-map",
        type=str,
        default=None,
        help="Optional JSON string mapping source class IDs or names to target IDs (e.g. '{\"0\":0}' or '{\"crack\":0}').",
    )
    parser.add_argument(
        "--conflict-strategy",
        choices=["rename", "skip", "error"],
        default="rename",
        help="Action when incoming image has same filename as existing file but different SHA-256.",
    )
    parser.add_argument(
        "--group-pattern",
        type=str,
        default=r"^([a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)?)",
        help="Regex pattern to extract building/room grouping from image stem to prevent data leakage.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate import and validation without writing or copying files to disk.",
    )
    parser.add_argument(
        "--export-summary",
        type=Path,
        default=None,
        help="Optional path to write the Markdown summary report.",
    )

    args = parser.parse_args()

    # Parse class map JSON if provided
    parsed_class_map = None
    if args.class_map:
        try:
            parsed_class_map = json.loads(args.class_map)
        except Exception as e:
            print(f"[ERROR] Invalid JSON in --class-map: {e}", file=sys.stderr)
            return 1

    try:
        importer = DatasetImporter(
            source_dir=args.source_dir,
            target_dir=args.target_dir,
            target_yaml=args.target_yaml,
            source_yaml=args.source_yaml,
            class_map=parsed_class_map,
            conflict_strategy=args.conflict_strategy,
            group_pattern=args.group_pattern,
            dry_run=args.dry_run,
        )
        summary = importer.import_dataset()
    except Exception as e:
        print(f"\n[FATAL ERROR] Importer failed: {e}", file=sys.stderr)
        return 1

    md_summary = importer.generate_markdown_summary(summary)

    # Print Terminal Overview
    mode = "[DRY-RUN SIMULATION]" if summary.dry_run else "[EXECUTED]"
    print("\n" + "=" * 65)
    print(f"  CAMPUSFIX+ DATASET IMPORT REPORT {mode}")
    print("=" * 65)
    print(f" Source:            {summary.source_dir}")
    print(f" Target:            {summary.target_dir}")
    print(f" Total Scanned:     {summary.total_images_scanned} images, {summary.total_labels_scanned} labels")
    print(f" Valid Pairs:       {summary.valid_pairs}")
    print(f" Duplicates Skipped:{summary.duplicate_images_skipped}")
    print(f" Conflicts Renamed: {summary.conflicts_renamed}")
    print(f" Conflicts Skipped: {summary.conflicts_skipped}")
    print("-" * 65)
    print(" Split Placement:")
    for sname in ["train", "val", "test"]:
        cnt = summary.imported_images_per_split.get(sname, 0)
        print(f"   - {sname.upper():<5} : {cnt:>5} images")
    print("-" * 65)
    print(" Class Annotations Remapped:")
    for cid, cname in sorted(importer.target_classes.items()):
        ann_cnt = summary.imported_annotations_per_class.get(cid, 0)
        print(f"   [{cid}] {cname:<20}: {ann_cnt:>5} annotations")
    print("=" * 65)

    if summary.leakage_warnings:
        print("\n[WARNINGS] Potential Spatial Leakage:")
        for w in summary.leakage_warnings:
            print(f"  ! {w}")

    if summary.errors:
        print(f"\n[ERRORS] {len(summary.errors)} issues detected:")
        for err in summary.errors[:5]:
            print(f"  X {err}")

    if args.export_summary:
        args.export_summary.parent.mkdir(parents=True, exist_ok=True)
        args.export_summary.write_text(md_summary, encoding="utf-8")
        print(f"\n[SUCCESS] Markdown summary written to: {args.export_summary.resolve()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
