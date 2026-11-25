"""
Unit Tests for CampusFix+ Dataset Infrastructure & Validation Pipeline
======================================================================
Tests validator.py and stats.py with synthetic test fixtures created dynamically in tmp_path.
Does NOT fabricate or modify actual production dataset folders.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Tuple

import cv2
import numpy as np
import pytest
import yaml

from dataset_tools.stats import DatasetStatisticsCalculator
from dataset_tools.validator import DatasetValidator


def create_synthetic_image(path: Path, width: int = 640, height: int = 480, color: Tuple[int, int, int] = (128, 128, 128)) -> None:
    """Creates a valid solid-color RGB image file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = np.full((height, width, 3), color, dtype=np.uint8)
    # Add slight random noise to prevent accidental hash collisions
    img[0, 0] = [int(path.name.__hash__() % 255), 100, 50]
    cv2.imwrite(str(path), img)


def setup_mock_dataset(base_dir: Path) -> Tuple[Path, Path]:
    """Scaffolds a mock YOLO dataset structure with data.yaml."""
    images_dir = base_dir / "images"
    labels_dir = base_dir / "labels"

    for split in ["train", "val", "test"]:
        (images_dir / split).mkdir(parents=True, exist_ok=True)
        (labels_dir / split).mkdir(parents=True, exist_ok=True)

    yaml_path = base_dir / "data.yaml"
    config = {
        "path": ".",
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": 5,
        "names": {
            0: "structural_damage",
            1: "water_damage",
            2: "electrical_damage",
            3: "furniture_damage",
            4: "ceiling_damage",
        },
    }
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f)

    return base_dir, yaml_path


class TestDatasetValidator:
    """Test suite for DatasetValidator rule enforcement."""

    def test_empty_dataset_is_valid(self, tmp_path: Path):
        """An initialized empty dataset structure should pass validation with 0 errors."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)
        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is True
        assert report.total_images == 0
        assert report.total_labels == 0
        assert len(report.issues) == 0

    def test_valid_image_and_annotations(self, tmp_path: Path):
        """Valid image with correct YOLO annotations must pass."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "train" / "sample_01.jpg"
        lbl_file = base_dir / "labels" / "train" / "sample_01.txt"

        create_synthetic_image(img_file)
        lbl_file.write_text("0 0.5 0.5 0.2 0.3\n1 0.7 0.8 0.1 0.1\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is True
        assert report.total_images == 1
        assert report.total_annotations == 2
        assert report.format_errors == 0
        assert report.out_of_bounds_boxes == 0

    def test_valid_background_image(self, tmp_path: Path):
        """Negative / background images with empty .txt files should be recognized and valid."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "train" / "clean_wall.jpg"
        lbl_file = base_dir / "labels" / "train" / "clean_wall.txt"

        create_synthetic_image(img_file)
        lbl_file.write_text("", encoding="utf-8")  # Empty text file

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is True
        assert report.total_images == 1
        assert report.empty_label_files == 1
        assert report.total_annotations == 0

    def test_detects_missing_label_file(self, tmp_path: Path):
        """Images missing corresponding label .txt files must fail validation."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "train" / "orphan_img.jpg"
        create_synthetic_image(img_file)

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is False
        assert report.missing_labels == 1

    def test_detects_orphaned_label_file(self, tmp_path: Path):
        """Label .txt files without matching images should be flagged."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        lbl_file = base_dir / "labels" / "val" / "ghost_label.txt"
        lbl_file.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.orphaned_labels == 1
        # Orphaned labels generate warnings or errors

    def test_detects_invalid_class_id(self, tmp_path: Path):
        """Annotations with class ID out of bounds (>= nc or < 0) must fail."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "train" / "sample_bad_class.jpg"
        lbl_file = base_dir / "labels" / "train" / "sample_bad_class.txt"

        create_synthetic_image(img_file)
        # Class 9 is invalid when nc=5 (classes 0-4)
        lbl_file.write_text("9 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is False
        assert report.invalid_class_ids == 1

    def test_detects_out_of_bounds_bounding_box(self, tmp_path: Path):
        """Coordinates not in [0.0, 1.0] or width/height <= 0 must fail."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "test" / "sample_oob.jpg"
        lbl_file = base_dir / "labels" / "test" / "sample_oob.txt"

        create_synthetic_image(img_file)
        # Center x is 1.5 (out of bounds)
        lbl_file.write_text("0 1.5 0.5 0.2 0.2\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is False
        assert report.out_of_bounds_boxes == 1

    def test_detects_malformed_annotation_lines(self, tmp_path: Path):
        """Lines with wrong token counts or non-numeric tokens must be flagged."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_file = base_dir / "images" / "train" / "sample_malformed.jpg"
        lbl_file = base_dir / "labels" / "train" / "sample_malformed.txt"

        create_synthetic_image(img_file)
        # Only 4 tokens instead of 5
        lbl_file.write_text("0 0.5 0.5 0.2\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is False
        assert report.format_errors == 1

    def test_detects_duplicate_images(self, tmp_path: Path):
        """Identical image files across splits should be flagged as duplicates."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        img_train = base_dir / "images" / "train" / "img_a.jpg"
        img_val = base_dir / "images" / "val" / "img_b.jpg"

        # Write exact same bytes
        content = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.imwrite(str(img_train), content)
        cv2.imwrite(str(img_val), content)

        (base_dir / "labels" / "train" / "img_a.txt").write_text("", encoding="utf-8")
        (base_dir / "labels" / "val" / "img_b.txt").write_text("", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.duplicate_images == 1


class TestDatasetStatistics:
    """Test suite for DatasetStatisticsCalculator metrics."""

    def test_stats_on_empty_dataset(self, tmp_path: Path):
        """Statistics on empty dataset should return zero metrics gracefully."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)
        calc = DatasetStatisticsCalculator(dataset_dir=base_dir, yaml_path=yaml_path)
        stats = calc.compute()

        assert stats.total_images == 0
        assert stats.total_annotations == 0
        assert stats.balance_status.startswith("EMPTY")

    def test_stats_per_class_and_split_calculations(self, tmp_path: Path):
        """Verifies counts per class, split percentages, and balance metrics."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        # Create 2 train images, 1 val image
        t1_img = base_dir / "images" / "train" / "t1.jpg"
        t2_img = base_dir / "images" / "train" / "t2.jpg"
        v1_img = base_dir / "images" / "val" / "v1.jpg"

        create_synthetic_image(t1_img, color=(10, 10, 10))
        create_synthetic_image(t2_img, color=(20, 20, 20))
        create_synthetic_image(v1_img, color=(30, 30, 30))

        # t1 has class 0 (wall_crack)
        (base_dir / "labels" / "train" / "t1.txt").write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")
        # t2 has class 0 and class 1 (water_seepage)
        (base_dir / "labels" / "train" / "t2.txt").write_text("0 0.3 0.3 0.1 0.1\n1 0.6 0.6 0.2 0.2\n", encoding="utf-8")
        # v1 has class 1
        (base_dir / "labels" / "val" / "v1.txt").write_text("1 0.4 0.4 0.3 0.3\n", encoding="utf-8")

        calc = DatasetStatisticsCalculator(dataset_dir=base_dir, yaml_path=yaml_path)
        stats = calc.compute()

        assert stats.total_images == 3
        assert stats.total_annotations == 4  # 2 in train (class 0) + 1 in train (class 1) + 1 in val (class 1)
        assert stats.overall_annotations_per_class[0] == 2
        assert stats.overall_annotations_per_class[1] == 2
        assert stats.overall_annotations_per_class[2] == 0

        # Train: 2/3 = 66.67%, Val: 1/3 = 33.33%
        assert abs(stats.split_distribution_pct["train"] - 66.67) < 0.1
        assert abs(stats.split_distribution_pct["val"] - 33.33) < 0.1

        # Markdown report generation should not crash
        md = calc.generate_markdown(stats)
        assert "# CampusFix+ Dataset Statistical Report" in md
        assert "structural_damage" in md


class TestCampusDamageProductionConfig:
    """Verifies the actual datasets/campus_damage directory and five-class taxonomy."""

    def test_campus_damage_actual_five_classes(self):
        """Verifies that datasets/campus_damage/data.yaml defines the exact 5 target classes."""
        dataset_dir = Path("datasets/campus_damage")
        validator = DatasetValidator(dataset_dir=dataset_dir)

        assert validator.nc == 5
        assert validator.names == {
            0: "structural_damage",
            1: "water_damage",
            2: "electrical_damage",
            3: "furniture_damage",
            4: "ceiling_damage",
        }

    def test_campus_damage_dataset_integrity(self):
        """Validates that datasets/campus_damage has pristine YOLO formatting and zero errors."""
        dataset_dir = Path("datasets/campus_damage")
        validator = DatasetValidator(dataset_dir=dataset_dir)
        report = validator.validate()

        assert report.is_valid is True
        assert report.missing_labels == 0
        assert report.orphaned_labels == 0
        assert report.corrupted_images == 0
        assert report.duplicate_images == 0
        assert report.invalid_class_ids == 0
        assert report.out_of_bounds_boxes == 0
        assert report.format_errors == 0
        assert report.total_images == report.total_labels

        calc = DatasetStatisticsCalculator(dataset_dir=dataset_dir)
        stats = calc.compute()
        assert stats.total_images == report.total_images
        assert stats.total_annotations == report.total_annotations

    def test_strict_class_id_boundary_check(self, tmp_path: Path):
        """Ensures that class IDs outside [0..4] are rejected as INVALID_CLASS_ID."""
        base_dir, yaml_path = setup_mock_dataset(tmp_path)

        for invalid_id in [-1, 5, 10]:
            img_file = base_dir / "images" / "train" / f"sample_cls_{invalid_id}.jpg"
            lbl_file = base_dir / "labels" / "train" / f"sample_cls_{invalid_id}.txt"
            create_synthetic_image(img_file)
            lbl_file.write_text(f"{invalid_id} 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        validator = DatasetValidator(dataset_dir=base_dir, data_yaml_path=yaml_path)
        report = validator.validate()

        assert report.is_valid is False
        assert report.invalid_class_ids == 3


