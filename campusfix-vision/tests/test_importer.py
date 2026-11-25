"""
Unit Tests for CampusFix+ Dataset Importer Workflow
===================================================
Tests YOLO imports from CVAT/Roboflow, class remapping, duplicate detection,
collision avoidance, spatial room clustering, single-class pilot, and five-class configurations.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np
import pytest
import yaml

from dataset_tools.importer import DatasetImporter, ImportSummary
from dataset_tools.validator import DatasetValidator


def create_test_image(path: Path, width: int = 640, height: int = 480, pixel_val: int = 100) -> None:
    """Generates a real valid RGB image to test cv2 reading and hashing."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img = np.full((height, width, 3), pixel_val, dtype=np.uint8)
    # Add a marker byte unique to the filename to avoid accidental identical hashes
    img[0, 0] = [int(path.name.__hash__() % 255), 50, 200]
    cv2.imwrite(str(path), img)


def create_target_dataset(base_dir: Path, classes: Dict[int, str]) -> Tuple[Path, Path]:
    """Creates a clean mock target dataset with data.yaml."""
    for split in ["train", "val", "test"]:
        (base_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (base_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    yaml_path = base_dir / "data.yaml"
    cfg = {
        "path": ".",
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "nc": len(classes),
        "names": classes,
    }
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f)

    return base_dir, yaml_path


class TestDatasetImporter:
    """Comprehensive test suite for DatasetImporter."""

    def test_single_class_pilot_import(self, tmp_path: Path):
        """Tests importing single-class wall crack data into wall_crack_pilot (nc=1)."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"

        # Create 2 source images with class 0 annotations
        img1 = source_dir / "hallway_crack_01.jpg"
        lbl1 = source_dir / "hallway_crack_01.txt"
        create_test_image(img1, pixel_val=50)
        lbl1.write_text("0 0.45 0.55 0.20 0.30\n", encoding="utf-8")

        img2 = source_dir / "hallway_crack_02.jpg"
        lbl2 = source_dir / "hallway_crack_02.txt"
        create_test_image(img2, pixel_val=70)
        lbl2.write_text("0 0.30 0.40 0.15 0.25\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.valid_pairs == 2
        assert sum(summary.imported_images_per_split.values()) == 2
        assert summary.imported_annotations_per_class[0] == 2

        # Validate target dataset with DatasetValidator
        validator = DatasetValidator(dataset_dir=target_dir, data_yaml_path=target_yaml)
        val_report = validator.validate()
        assert val_report.is_valid is True
        assert val_report.total_images == 2
        assert val_report.total_annotations == 2
        assert val_report.class_distribution[0] == 2

    def test_five_class_configuration_import(self, tmp_path: Path):
        """Tests importing multi-class dataset into five-class campus_damage configuration."""
        five_classes = {
            0: "structural_damage",
            1: "water_damage",
            2: "electrical_damage",
            3: "furniture_damage",
            4: "ceiling_damage",
        }
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", five_classes)
        source_dir = tmp_path / "source"

        img = source_dir / "classroom_multi_01.jpg"
        lbl = source_dir / "classroom_multi_01.txt"
        create_test_image(img, pixel_val=80)
        # Contains structural_damage (0), water_damage (1), and furniture_damage (3)
        lbl.write_text("0 0.5 0.5 0.1 0.2\n1 0.6 0.6 0.2 0.2\n3 0.2 0.3 0.1 0.1\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.valid_pairs == 1
        assert summary.imported_annotations_per_class[0] == 1
        assert summary.imported_annotations_per_class[1] == 1
        assert summary.imported_annotations_per_class[3] == 1
        assert summary.imported_annotations_per_class[2] == 0

        # Validate target
        validator = DatasetValidator(dataset_dir=target_dir, data_yaml_path=target_yaml)
        val_report = validator.validate()
        assert val_report.is_valid is True
        assert val_report.total_annotations == 3

    def test_dry_run_mode_does_not_modify_disk(self, tmp_path: Path):
        """Dry-run must simulate full import, validate data, but write zero files to target."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"

        img = source_dir / "test_sim.jpg"
        lbl = source_dir / "test_sim.txt"
        create_test_image(img, pixel_val=90)
        lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=True,
        )
        summary = importer.import_dataset()

        assert summary.dry_run is True
        assert summary.valid_pairs == 1
        assert sum(summary.imported_images_per_split.values()) == 1

        # Check target disk - no images must exist
        target_images = list((target_dir / "images").rglob("*.jpg"))
        assert len(target_images) == 0

    def test_duplicate_image_detection_and_skip(self, tmp_path: Path):
        """Incoming images that have identical SHA-256 hashes to existing target images must be skipped."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})

        # Existing image in target
        existing_img = target_dir / "images" / "train" / "already_here.jpg"
        existing_lbl = target_dir / "labels" / "train" / "already_here.txt"
        # Solid constant array so hash is identical
        img_matrix = np.full((100, 100, 3), 150, dtype=np.uint8)
        cv2.imwrite(str(existing_img), img_matrix)
        existing_lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        # Incoming image with different name but identical content
        source_dir = tmp_path / "source"
        incoming_img = source_dir / "duplicate_upload.jpg"
        incoming_lbl = source_dir / "duplicate_upload.txt"
        source_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(incoming_img), img_matrix)
        incoming_lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.duplicate_images_skipped == 1
        assert sum(summary.imported_images_per_split.values()) == 0

    def test_filename_conflict_strategy_rename(self, tmp_path: Path):
        """If incoming image has same filename but DIFFERENT image content, rename strategy prevents overwrite."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})

        # Existing image named 'photo.jpg' with pixel value 10
        existing_img = target_dir / "images" / "train" / "photo.jpg"
        existing_lbl = target_dir / "labels" / "train" / "photo.txt"
        cv2.imwrite(str(existing_img), np.full((100, 100, 3), 10, dtype=np.uint8))
        existing_lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        # Incoming image also named 'photo.jpg' but with pixel value 200
        source_dir = tmp_path / "source"
        incoming_img = source_dir / "photo.jpg"
        incoming_lbl = source_dir / "photo.txt"
        source_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(incoming_img), np.full((100, 100, 3), 200, dtype=np.uint8))
        incoming_lbl.write_text("0 0.3 0.3 0.1 0.1\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            conflict_strategy="rename",
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.conflicts_renamed == 1
        # Both original and new renamed files must exist in target
        assert existing_img.exists()
        renamed_files = list((target_dir / "images").rglob("photo_imp_*.jpg"))
        assert len(renamed_files) == 1

    def test_filename_conflict_strategy_skip(self, tmp_path: Path):
        """Conflict strategy 'skip' ignores conflicting incoming files."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})

        existing_img = target_dir / "images" / "train" / "photo.jpg"
        existing_lbl = target_dir / "labels" / "train" / "photo.txt"
        cv2.imwrite(str(existing_img), np.full((100, 100, 3), 10, dtype=np.uint8))
        existing_lbl.write_text("", encoding="utf-8")

        source_dir = tmp_path / "source"
        incoming_img = source_dir / "photo.jpg"
        incoming_lbl = source_dir / "photo.txt"
        source_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(incoming_img), np.full((100, 100, 3), 200, dtype=np.uint8))
        incoming_lbl.write_text("0 0.2 0.2 0.1 0.1\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            conflict_strategy="skip",
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.conflicts_skipped == 1
        assert sum(summary.imported_images_per_split.values()) == 0

    def test_detects_corrupt_images(self, tmp_path: Path):
        """Files with image extensions but corrupted data are rejected."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"
        source_dir.mkdir(parents=True, exist_ok=True)

        bad_img = source_dir / "corrupted.jpg"
        bad_lbl = source_dir / "corrupted.txt"
        bad_img.write_bytes(b"not an actual image content header")
        bad_lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.corrupt_images == 1
        assert summary.valid_pairs == 0

    def test_detects_invalid_annotations(self, tmp_path: Path):
        """Annotation syntax errors or out-of-bounds coordinates are detected."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"

        img = source_dir / "oob.jpg"
        lbl = source_dir / "oob.txt"
        create_test_image(img, pixel_val=110)
        # x_center is 1.6 (out of bounds)
        lbl.write_text("0 1.6 0.5 0.2 0.2\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.valid_pairs == 0
        assert len(summary.errors) >= 1

    def test_data_leakage_prevention_spatial_clustering(self, tmp_path: Path):
        """
        Images belonging to the same room (e.g. blockA_room101_01 and blockA_room101_02)
        must never be split across train and test.
        """
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"

        # Create 3 images for room101 and 3 images for room202
        for i in range(1, 4):
            img = source_dir / f"blockA_room101_shot{i}.jpg"
            lbl = source_dir / f"blockA_room101_shot{i}.txt"
            create_test_image(img, pixel_val=10 * i)
            lbl.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        for j in range(1, 4):
            img = source_dir / f"blockB_room202_shot{j}.jpg"
            lbl = source_dir / f"blockB_room202_shot{j}.txt"
            create_test_image(img, pixel_val=50 + 10 * j)
            lbl.write_text("0 0.4 0.4 0.1 0.1\n", encoding="utf-8")

        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            dry_run=False,
        )
        summary = importer.import_dataset()

        # Check where room101 images landed
        r101_splits = set()
        r202_splits = set()

        for split in ["train", "val", "test"]:
            for img_file in (target_dir / "images" / split).glob("*.jpg"):
                if "room101" in img_file.name:
                    r101_splits.add(split)
                if "room202" in img_file.name:
                    r202_splits.add(split)

        # All photos of room101 MUST be in exactly 1 split!
        assert len(r101_splits) == 1
        # All photos of room202 MUST be in exactly 1 split!
        assert len(r202_splits) == 1

    def test_class_remapping_from_custom_source(self, tmp_path: Path):
        """Source class IDs can be remapped via --class-map to target class IDs."""
        target_dir, target_yaml = create_target_dataset(tmp_path / "target", {0: "wall_crack"})
        source_dir = tmp_path / "source"

        img = source_dir / "remapped.jpg"
        lbl = source_dir / "remapped.txt"
        create_test_image(img, pixel_val=130)
        # Source has class 7 representing crack
        lbl.write_text("7 0.5 0.5 0.2 0.2\n", encoding="utf-8")

        # Class map mapping 7 -> 0
        importer = DatasetImporter(
            source_dir=source_dir,
            target_dir=target_dir,
            target_yaml=target_yaml,
            class_map={"7": 0},
            dry_run=False,
        )
        summary = importer.import_dataset()

        assert summary.valid_pairs == 1
        assert summary.imported_annotations_per_class[0] == 1

        # Read the generated target label file to verify rewritten class ID
        target_labels = list((target_dir / "labels").rglob("*.txt"))
        assert len(target_labels) == 1
        target_text = target_labels[0].read_text(encoding="utf-8").strip()
        assert target_text.startswith("0 ")

