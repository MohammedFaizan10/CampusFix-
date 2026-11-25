"""
validator.py - Strict YOLO Dataset Validator for CampusFix+.

Validates:
1. Image and annotation file correspondence.
2. Missing label files.
3. Orphaned annotations (labels without images).
4. Malformed YOLO annotation lines (token counts, non-numeric values).
5. Bounding box coordinate boundaries (0.0 <= x, y, w, h <= 1.0, w > 0, h > 0).
6. Out-of-bounds bounding boxes (box spilling significantly outside canvas).
7. Invalid class IDs (checked against nc and names from data.yaml).
8. Duplicate image detection via SHA-256 hash.
9. Empty annotation files (negative/background samples).
10. Image readability and header integrity via OpenCV.
"""

import argparse
import hashlib
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import cv2
import yaml

VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

@dataclass
class AnnotationIssue:
    split: str
    filename: str
    line_number: Optional[int]
    issue_type: str
    message: str
    severity: str = "ERROR"  # 'ERROR' or 'WARNING'

@dataclass
class ValidationReport:
    is_valid: bool = True
    total_images: int = 0
    total_labels: int = 0
    total_annotations: int = 0
    empty_label_files: int = 0
    duplicate_images: int = 0
    corrupted_images: int = 0
    missing_labels: int = 0
    orphaned_labels: int = 0
    format_errors: int = 0
    out_of_bounds_boxes: int = 0
    invalid_class_ids: int = 0
    issues: List[AnnotationIssue] = field(default_factory=list)
    class_distribution: Dict[int, int] = field(default_factory=dict)
    split_summary: Dict[str, Dict[str, int]] = field(default_factory=dict)

    def add_issue(
        self,
        split: str,
        filename: str,
        issue_type: str,
        message: str,
        line_number: Optional[int] = None,
        severity: str = "ERROR"
    ):
        issue = AnnotationIssue(
            split=split,
            filename=filename,
            line_number=line_number,
            issue_type=issue_type,
            message=message,
            severity=severity
        )
        self.issues.append(issue)
        if severity == "ERROR":
            self.is_valid = False

class DatasetValidator:
    def __init__(self, dataset_dir: Path, data_yaml_path: Optional[Path] = None):
        self.dataset_dir = Path(dataset_dir).resolve()
        self.yaml_path = (
            Path(data_yaml_path).resolve()
            if data_yaml_path
            else self.dataset_dir / "data.yaml"
        )
        self.nc: int = 5
        self.names: Dict[int, str] = {}
        self._load_yaml_config()

    def _load_yaml_config(self):
        if not self.yaml_path.exists():
            raise FileNotFoundError(f"Configuration file not found at: {self.yaml_path}")

        with open(self.yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        self.nc = data.get("nc", 5)
        raw_names = data.get("names", {})
        if isinstance(raw_names, list):
            self.names = {i: name for i, name in enumerate(raw_names)}
        elif isinstance(raw_names, dict):
            self.names = {int(k): str(v) for k, v in raw_names.items()}
        else:
            self.names = {i: f"class_{i}" for i in range(self.nc)}

    @staticmethod
    def compute_sha256(filepath: Path) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    def validate(self, splits: Optional[List[str]] = None) -> ValidationReport:
        if splits is None:
            splits = ["train", "val", "test"]

        report = ValidationReport()
        report.class_distribution = {i: 0 for i in range(self.nc)}
        seen_hashes: Dict[str, Tuple[str, Path]] = {}

        for split in splits:
            img_dir = self.dataset_dir / "images" / split
            lbl_dir = self.dataset_dir / "labels" / split

            split_stats = {
                "images": 0,
                "labels": 0,
                "annotations": 0,
                "empty_labels": 0,
            }

            if not img_dir.exists():
                report.add_issue(
                    split,
                    str(img_dir),
                    "MISSING_DIRECTORY",
                    f"Images directory missing: {img_dir}",
                    severity="WARNING"
                )
                continue

            if not lbl_dir.exists():
                report.add_issue(
                    split,
                    str(lbl_dir),
                    "MISSING_DIRECTORY",
                    f"Labels directory missing: {lbl_dir}",
                    severity="WARNING"
                )
                continue

            # Gather files (ignore .gitkeep, hidden files)
            image_files = {
                f.stem: f
                for f in img_dir.iterdir()
                if f.is_file() and f.suffix.lower() in VALID_IMAGE_EXTS and not f.name.startswith(".")
            }
            label_files = {
                f.stem: f
                for f in lbl_dir.iterdir()
                if f.is_file() and f.suffix.lower() == ".txt" and not f.name.startswith(".")
            }

            split_stats["images"] = len(image_files)
            split_stats["labels"] = len(label_files)
            report.total_images += len(image_files)
            report.total_labels += len(label_files)

            # 1. Check for missing labels (image without label file)
            for stem, img_path in image_files.items():
                if stem not in label_files:
                    report.missing_labels += 1
                    report.add_issue(
                        split,
                        img_path.name,
                        "MISSING_LABEL_FILE",
                        f"Image has no matching label file '{stem}.txt' in {lbl_dir.name}",
                        severity="ERROR"
                    )

            # 2. Check for orphaned labels (label without image)
            for stem, lbl_path in label_files.items():
                if stem not in image_files:
                    report.orphaned_labels += 1
                    report.add_issue(
                        split,
                        lbl_path.name,
                        "ORPHANED_LABEL_FILE",
                        f"Label file has no corresponding image in {img_dir.name}",
                        severity="ERROR"
                    )

            # 3. Validate image integrity & check duplicates
            for stem, img_path in image_files.items():
                # Readability check via OpenCV
                try:
                    img = cv2.imread(str(img_path))
                    if img is None:
                        report.corrupted_images += 1
                        report.add_issue(
                            split,
                            img_path.name,
                            "CORRUPTED_IMAGE",
                            "OpenCV could not decode image header or content."
                        )
                        continue
                    h, w = img.shape[:2]
                    if h < 16 or w < 16:
                        report.add_issue(
                            split,
                            img_path.name,
                            "TINY_IMAGE",
                            f"Image dimensions too small ({w}x{h} px).",
                            severity="WARNING"
                        )
                except Exception as e:
                    report.corrupted_images += 1
                    report.add_issue(
                        split,
                        img_path.name,
                        "IMAGE_READ_EXCEPTION",
                        f"Exception during image read: {e}"
                    )
                    continue

                # Duplicate detection via SHA-256
                try:
                    file_hash = self.compute_sha256(img_path)
                    if file_hash in seen_hashes:
                        prev_split, prev_path = seen_hashes[file_hash]
                        report.duplicate_images += 1
                        report.add_issue(
                            split,
                            img_path.name,
                            "DUPLICATE_IMAGE",
                            f"Identical duplicate of '{prev_path.name}' (in {prev_split} split).",
                            severity="ERROR" if prev_split != split else "WARNING"
                        )
                    else:
                        seen_hashes[file_hash] = (split, img_path)
                except Exception:
                    pass

            # 4. Validate label annotations
            for stem, lbl_path in label_files.items():
                try:
                    with open(lbl_path, "r", encoding="utf-8") as f:
                        lines = [line.strip() for line in f.readlines() if line.strip()]

                    if not lines:
                        # Empty label file = background image
                        split_stats["empty_labels"] += 1
                        report.empty_label_files += 1
                        continue

                    for line_idx, line in enumerate(lines, start=1):
                        tokens = line.split()
                        if len(tokens) != 5:
                            report.format_errors += 1
                            report.add_issue(
                                split,
                                lbl_path.name,
                                "MALFORMED_LINE",
                                f"Expected 5 tokens '<cls> <x> <y> <w> <h>', got {len(tokens)}: '{line}'",
                                line_number=line_idx
                            )
                            continue

                        # Parse values
                        try:
                            cls_id = int(tokens[0])
                            xc = float(tokens[1])
                            yc = float(tokens[2])
                            bw = float(tokens[3])
                            bh = float(tokens[4])
                        except ValueError as ve:
                            report.format_errors += 1
                            report.add_issue(
                                split,
                                lbl_path.name,
                                "NON_NUMERIC_VALUE",
                                f"Non-numeric coordinate in line '{line}': {ve}",
                                line_number=line_idx
                            )
                            continue

                        # Class ID check: bounds [0, nc - 1] and present in configured names
                        if cls_id < 0 or cls_id >= self.nc or cls_id not in self.names:
                            report.invalid_class_ids += 1
                            report.add_issue(
                                split,
                                lbl_path.name,
                                "INVALID_CLASS_ID",
                                f"Class ID {cls_id} not in configured classes [0..{self.nc - 1}] ({list(self.names.values())}).",
                                line_number=line_idx
                            )
                        else:
                            report.class_distribution[cls_id] = (
                                report.class_distribution.get(cls_id, 0) + 1
                            )

                        # Range checks: coordinates must be in [0.0, 1.0]
                        has_oob_coord = False
                        coords = [("x_center", xc), ("y_center", yc), ("width", bw), ("height", bh)]
                        for c_name, val in coords:
                            if not (0.0 <= val <= 1.0):
                                has_oob_coord = True
                                report.add_issue(
                                    split,
                                    lbl_path.name,
                                    "OUT_OF_BOUNDS_COORDINATE",
                                    f"{c_name}={val} is outside [0.0, 1.0]",
                                    line_number=line_idx
                                )
                        if has_oob_coord:
                            report.out_of_bounds_boxes += 1

                        # Non-zero dimensions
                        if bw <= 0.0 or bh <= 0.0:
                            report.format_errors += 1
                            report.add_issue(
                                split,
                                lbl_path.name,
                                "ZERO_DIMENSION_BOX",
                                f"Bounding box width ({bw}) and height ({bh}) must be > 0",
                                line_number=line_idx
                            )

                        # Bounding box spatial canvas spill check (only if coordinates themselves are valid)
                        if not has_oob_coord:
                            x1 = xc - bw / 2.0
                            x2 = xc + bw / 2.0
                            y1 = yc - bh / 2.0
                            y2 = yc + bh / 2.0
                            tolerance = 0.05
                            if x1 < -tolerance or y1 < -tolerance or x2 > (1.0 + tolerance) or y2 > (1.0 + tolerance):
                                report.out_of_bounds_boxes += 1
                                report.add_issue(
                                    split,
                                    lbl_path.name,
                                    "BOX_OUTSIDE_CANVAS",
                                    f"Box bounds [{x1:.2f}, {y1:.2f}, {x2:.2f}, {y2:.2f}] spill outside image canvas.",
                                    line_number=line_idx,
                                    severity="WARNING"
                                )

                        split_stats["annotations"] += 1
                        report.total_annotations += 1

                except Exception as e:
                    report.format_errors += 1
                    report.add_issue(
                        split,
                        lbl_path.name,
                        "LABEL_READ_EXCEPTION",
                        f"Failed to read label file: {e}"
                    )

            report.split_summary[split] = split_stats

        return report

def format_report(report: ValidationReport, class_names: Dict[int, str]) -> str:
    lines = []
    lines.append("=" * 70)
    lines.append("CAMPUSFIX+ YOLO DATASET VALIDATION REPORT")
    lines.append("=" * 70)
    lines.append(f"Overall Status: {'PASSED [VALID]' if report.is_valid else 'FAILED [INVALID]'}")
    lines.append(f"Total Images:        {report.total_images}")
    lines.append(f"Total Label Files:   {report.total_labels}")
    lines.append(f"Total Annotations:   {report.total_annotations}")
    lines.append(f"Empty/Background:    {report.empty_label_files}")
    lines.append(f"Missing Labels:      {report.missing_labels}")
    lines.append(f"Orphaned Labels:     {report.orphaned_labels}")
    lines.append(f"Corrupted Images:    {report.corrupted_images}")
    lines.append(f"Duplicate Images:    {report.duplicate_images}")
    lines.append(f"Invalid Class IDs:   {report.invalid_class_ids}")
    lines.append(f"Out of Bounds Boxes: {report.out_of_bounds_boxes}")
    lines.append(f"Format Errors:       {report.format_errors}")
    lines.append("-" * 70)
    lines.append("SPLIT SUMMARY:")
    for split, s in report.split_summary.items():
        lines.append(
            f"  [{split.upper()}]: Images={s['images']}, Labels={s['labels']}, "
            f"Annotations={s['annotations']}, Backgrounds={s['empty_labels']}"
        )
    lines.append("-" * 70)
    lines.append("CLASS ANNOTATION COUNTS:")
    for cid, name in class_names.items():
        count = report.class_distribution.get(cid, 0)
        lines.append(f"  Class {cid} ({name}): {count}")
    lines.append("-" * 70)

    if report.issues:
        lines.append(f"ISSUES DETECTED ({len(report.issues)} total):")
        for issue in report.issues[:20]:
            line_str = f"L{issue.line_number}: " if issue.line_number else ""
            lines.append(
                f"  [{issue.severity}] [{issue.split}] {issue.filename} -> {line_str}"
                f"{issue.issue_type}: {issue.message}"
            )
        if len(report.issues) > 20:
            lines.append(f"  ... and {len(report.issues) - 20} more issues.")
    else:
        lines.append("Zero issues detected! Dataset formatting is pristine.")

    lines.append("=" * 70)
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Validate YOLO dataset formatting for CampusFix+.")
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="datasets/campus_damage",
        help="Path to dataset root folder"
    )
    parser.add_argument(
        "--data-yaml",
        type=str,
        default=None,
        help="Path to data.yaml (defaults to dataset_dir/data.yaml)"
    )
    args = parser.parse_args()

    validator = DatasetValidator(Path(args.dataset_dir), Path(args.data_yaml) if args.data_yaml else None)
    report = validator.validate()
    print(format_report(report, validator.names))

    sys.exit(0 if report.is_valid else 1)

if __name__ == "__main__":
    main()
