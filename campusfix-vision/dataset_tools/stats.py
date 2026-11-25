"""
CampusFix+ Dataset Statistics Utility
======================================
Analyzes YOLO dataset distributions, class balances, and split ratios.
Generates comprehensive statistical summaries in terminal, Markdown, or JSON formats.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml

try:
    from dataset_tools.validator import DatasetValidator, ValidationReport
except ImportError:
    # Enable running directly as python dataset_tools/stats.py
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from dataset_tools.validator import DatasetValidator, ValidationReport


@dataclass
class SplitStats:
    """Statistics for a single dataset split (train, val, test)."""
    split_name: str
    image_count: int = 0
    labeled_image_count: int = 0
    background_image_count: int = 0
    missing_label_count: int = 0
    total_annotations: int = 0
    annotations_per_class: Dict[int, int] = field(default_factory=lambda: defaultdict(int))
    images_per_class: Dict[int, int] = field(default_factory=lambda: defaultdict(int))
    images_with_multiple_classes: int = 0


@dataclass
class DatasetStats:
    """Overall dataset statistical overview."""
    dataset_name: str
    dataset_root: str
    classes: Dict[int, str]
    splits: Dict[str, SplitStats] = field(default_factory=dict)
    total_images: int = 0
    total_annotations: int = 0
    overall_annotations_per_class: Dict[int, int] = field(default_factory=lambda: defaultdict(int))
    overall_images_per_class: Dict[int, int] = field(default_factory=lambda: defaultdict(int))
    split_distribution_pct: Dict[str, float] = field(default_factory=dict)
    total_background_images: int = 0
    total_missing_labels: int = 0
    total_invalid_annotations: int = 0
    class_imbalance_ratio: float = 0.0
    shannon_diversity_index: float = 0.0
    balance_status: str = "EMPTY"


class DatasetStatisticsCalculator:
    """Calculates granular statistics across YOLO dataset splits."""

    def __init__(self, dataset_dir: Path | str, yaml_path: Optional[Path | str] = None):
        self.dataset_dir = Path(dataset_dir).resolve()
        self.yaml_path = Path(yaml_path).resolve() if yaml_path else self.dataset_dir / "data.yaml"
        self.classes: Dict[int, str] = {}
        self._load_config()

    def _load_config(self) -> None:
        """Loads class definitions from data.yaml."""
        if not self.yaml_path.exists():
            raise FileNotFoundError(f"data.yaml not found at {self.yaml_path}")

        try:
            with open(self.yaml_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f)
            names = config.get("names", {})
            if isinstance(names, dict):
                self.classes = {int(k): str(v) for k, v in names.items()}
            elif isinstance(names, list):
                self.classes = {i: str(name) for i, name in enumerate(names)}
            else:
                self.classes = {}
        except Exception as e:
            raise ValueError(f"Failed to parse {self.yaml_path}: {e}")

    def compute(self) -> DatasetStats:
        """Analyzes all splits and calculates dataset metrics."""
        stats = DatasetStats(
            dataset_name=self.dataset_dir.name,
            dataset_root=str(self.dataset_dir),
            classes=self.classes,
        )

        # First run validator to get accurate validation and invalid annotation counts
        validator = DatasetValidator(dataset_dir=self.dataset_dir, data_yaml_path=self.yaml_path)
        val_report: ValidationReport = validator.validate()
        stats.total_invalid_annotations = (
            val_report.format_errors
            + val_report.out_of_bounds_boxes
            + val_report.invalid_class_ids
        )

        splits = ["train", "val", "test"]
        valid_img_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

        for split in splits:
            split_stat = SplitStats(split_name=split)
            img_dir = self.dataset_dir / "images" / split
            lbl_dir = self.dataset_dir / "labels" / split

            if not img_dir.exists():
                stats.splits[split] = split_stat
                continue

            images = [
                p for p in img_dir.iterdir()
                if p.is_file() and p.suffix.lower() in valid_img_extensions and not p.name.startswith(".")
            ]
            split_stat.image_count = len(images)

            for img_path in images:
                lbl_path = lbl_dir / f"{img_path.stem}.txt"
                if not lbl_path.exists():
                    split_stat.missing_label_count += 1
                    continue

                try:
                    content = lbl_path.read_text(encoding="utf-8").strip()
                except Exception:
                    continue

                if not content:
                    split_stat.background_image_count += 1
                    continue

                split_stat.labeled_image_count += 1
                lines = [line.strip() for line in content.splitlines() if line.strip()]
                classes_in_image: Set[int] = set()

                for line in lines:
                    tokens = line.split()
                    if len(tokens) >= 5:
                        try:
                            cls_id = int(tokens[0])
                            split_stat.total_annotations += 1
                            split_stat.annotations_per_class[cls_id] += 1
                            classes_in_image.add(cls_id)
                        except ValueError:
                            pass

                for cid in classes_in_image:
                    split_stat.images_per_class[cid] += 1

                if len(classes_in_image) > 1:
                    split_stat.images_with_multiple_classes += 1

            stats.splits[split] = split_stat

        # Compute aggregate totals
        stats.total_images = sum(s.image_count for s in stats.splits.values())
        stats.total_annotations = sum(s.total_annotations for s in stats.splits.values())
        stats.total_background_images = sum(s.background_image_count for s in stats.splits.values())
        stats.total_missing_labels = sum(s.missing_label_count for s in stats.splits.values())

        # Distribution %
        if stats.total_images > 0:
            for sname, sstat in stats.splits.items():
                stats.split_distribution_pct[sname] = round((sstat.image_count / stats.total_images) * 100, 2)
        else:
            stats.split_distribution_pct = {s: 0.0 for s in splits}

        # Aggregate per-class counts
        for cid in self.classes.keys():
            total_ann = sum(s.annotations_per_class[cid] for s in stats.splits.values())
            total_img = sum(s.images_per_class[cid] for s in stats.splits.values())
            stats.overall_annotations_per_class[cid] = total_ann
            stats.overall_images_per_class[cid] = total_img

        # Imbalance and Diversity metrics
        stats.class_imbalance_ratio, stats.shannon_diversity_index, stats.balance_status = self._calculate_balance_metrics(
            stats.overall_annotations_per_class
        )

        return stats

    def _calculate_balance_metrics(self, class_counts: Dict[int, int]) -> Tuple[float, float, str]:
        """Calculates imbalance ratio and Shannon diversity index."""
        if not class_counts or sum(class_counts.values()) == 0:
            return 0.0, 0.0, "EMPTY (No annotations present)"

        counts = [c for c in class_counts.values()]
        total = sum(counts)
        non_zero_counts = [c for c in counts if c > 0]

        if not non_zero_counts:
            return 0.0, 0.0, "EMPTY (No instances)"

        max_count = max(counts)
        min_count = min(counts)

        # Imbalance Ratio
        if min_count > 0:
            imbalance_ratio = round(max_count / min_count, 2)
        else:
            # If some classes have 0 annotations
            imbalance_ratio = float("inf")

        # Shannon Diversity Index: H = - sum(p_i * ln(p_i))
        # Normalized Balance Index: H / ln(K)
        k = len(self.classes) if self.classes else len(counts)
        entropy = 0.0
        for count in non_zero_counts:
            p = count / total
            entropy -= p * math.log(p)

        norm_entropy = round(entropy / math.log(k), 3) if k > 1 else 1.0

        if imbalance_ratio == float("inf"):
            status = "SEVERELY IMBALANCED (One or more classes have zero annotations)"
        elif imbalance_ratio > 4.0 or norm_entropy < 0.65:
            status = f"HIGH IMBALANCE (Ratio {imbalance_ratio}:1, Diversity {norm_entropy})"
        elif imbalance_ratio > 2.0 or norm_entropy < 0.85:
            status = f"MODERATE IMBALANCE (Ratio {imbalance_ratio}:1, Diversity {norm_entropy})"
        else:
            status = f"WELL BALANCED (Ratio {imbalance_ratio}:1, Diversity {norm_entropy})"

        return imbalance_ratio, norm_entropy, status

    def generate_markdown(self, stats: DatasetStats) -> str:
        """Renders statistical report in GitHub Flavored Markdown."""
        lines = [
            f"# CampusFix+ Dataset Statistical Report",
            f"",
            f"**Dataset:** `{stats.dataset_name}`  ",
            f"**Path:** `{stats.dataset_root}`  ",
            f"**Configured Classes:** `{len(stats.classes)}`  ",
            f"**Total Images:** `{stats.total_images}`  ",
            f"**Total Annotations:** `{stats.total_annotations}`  ",
            f"**Background / Negative Images:** `{stats.total_background_images}`  ",
            f"**Class Balance Status:** **{stats.balance_status}**  ",
            f"",
            f"---",
            f"",
            f"## 1. Split Distribution",
            f"",
            f"| Split | Image Count | Percentage | Labeled Images | Background Images | Missing Labels | Total Annotations |",
            f"| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
        ]

        for sname, sstat in stats.splits.items():
            pct = stats.split_distribution_pct.get(sname, 0.0)
            lines.append(
                f"| **{sname.upper()}** | {sstat.image_count} | {pct}% | "
                f"{sstat.labeled_image_count} | {sstat.background_image_count} | "
                f"{sstat.missing_label_count} | {sstat.total_annotations} |"
            )

        lines.extend([
            f"",
            f"## 2. Per-Class Annotation Distribution",
            f"",
            f"| Class ID | Class Name | Total Annotations | Total Images | Train | Val | Test | Share (%) |",
            f"| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
        ])

        for cid, cname in sorted(stats.classes.items(), key=lambda x: x[0]):
            tot_ann = stats.overall_annotations_per_class.get(cid, 0)
            tot_img = stats.overall_images_per_class.get(cid, 0)
            tr = stats.splits.get("train", SplitStats("train")).annotations_per_class.get(cid, 0)
            va = stats.splits.get("val", SplitStats("val")).annotations_per_class.get(cid, 0)
            te = stats.splits.get("test", SplitStats("test")).annotations_per_class.get(cid, 0)
            share = round((tot_ann / stats.total_annotations * 100), 1) if stats.total_annotations > 0 else 0.0

            lines.append(
                f"| `{cid}` | **{cname}** | {tot_ann} | {tot_img} | {tr} | {va} | {te} | {share}% |"
            )

        lines.extend([
            f"",
            f"## 3. Data Quality & Health Summary",
            f"",
            f"- **Missing Labels:** `{stats.total_missing_labels}` images lack `.txt` annotation files.",
            f"- **Invalid Annotations:** `{stats.total_invalid_annotations}` corrupt lines or bounding boxes detected.",
            f"- **Imbalance Ratio (Max / Min):** `{stats.class_imbalance_ratio}`",
            f"- **Normalized Shannon Diversity (0-1):** `{stats.shannon_diversity_index}`",
            f"- **Recommendation:** " + (
                "Dataset is currently initialized but empty. Please collect campus damage images and annotate following `docs/ANNOTATION_GUIDE.md` before initiating YOLO model training."
                if stats.total_images == 0 else
                "Review class distribution prior to training; consider oversampling or targeted data collection for underrepresented classes."
            ),
            f"",
            f"---",
            f"*Generated by CampusFix+ Dataset Development Pipeline*",
        ])

        return "\n".join(lines)


def main() -> int:
    """CLI entry point for dataset statistics."""
    parser = argparse.ArgumentParser(
        description="CampusFix+ Dataset Statistics and Balance Analyzer",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("datasets/campus_damage"),
        help="Path to the dataset directory containing data.yaml, images, and labels.",
    )
    parser.add_argument(
        "--yaml-path",
        type=Path,
        default=None,
        help="Optional explicit path to data.yaml.",
    )
    parser.add_argument(
        "--export-md",
        type=Path,
        default=None,
        help="Optional path to write a Markdown statistical report.",
    )
    parser.add_argument(
        "--export-json",
        type=Path,
        default=None,
        help="Optional path to write a JSON statistical report.",
    )

    args = parser.parse_args()

    try:
        calc = DatasetStatisticsCalculator(dataset_dir=args.dataset_dir, yaml_path=args.yaml_path)
        stats = calc.compute()
    except Exception as e:
        print(f"\n[ERROR] Failed to calculate statistics: {e}", file=sys.stderr)
        return 1

    md_report = calc.generate_markdown(stats)

    # Print terminal overview
    print("\n" + "=" * 65)
    print("  CAMPUSFIX+ DATASET STATISTICS OVERVIEW")
    print("=" * 65)
    print(f" Dataset Root:     {stats.dataset_root}")
    print(f" Total Images:     {stats.total_images}")
    print(f" Total Annotations:{stats.total_annotations}")
    print(f" Balance Status:   {stats.balance_status}")
    print("-" * 65)
    print(" Split Breakdown:")
    for sname, sstat in stats.splits.items():
        pct = stats.split_distribution_pct.get(sname, 0.0)
        print(f"   - {sname.upper():<5} : {sstat.image_count:>5} images ({pct:>5.1f}%) | {sstat.total_annotations:>5} annotations")
    print("-" * 65)
    print(" Per-Class Instances:")
    for cid, cname in sorted(stats.classes.items()):
        cnt = stats.overall_annotations_per_class.get(cid, 0)
        imgs = stats.overall_images_per_class.get(cid, 0)
        print(f"   [{cid}] {cname:<20}: {cnt:>5} instances across {imgs:>5} images")
    print("=" * 65)

    if args.export_md:
        args.export_md.parent.mkdir(parents=True, exist_ok=True)
        args.export_md.write_text(md_report, encoding="utf-8")
        print(f"\n[SUCCESS] Markdown report written to: {args.export_md.resolve()}")

    if args.export_json:
        args.export_json.parent.mkdir(parents=True, exist_ok=True)
        # Convert dataclass to clean json serializable dict
        def serialize_stats(s: DatasetStats) -> Dict[str, Any]:
            data = asdict(s)
            # convert inf to string for valid JSON
            if math.isinf(data.get("class_imbalance_ratio", 0)):
                data["class_imbalance_ratio"] = "Infinity"
            return data

        args.export_json.write_text(json.dumps(serialize_stats(stats), indent=2), encoding="utf-8")
        print(f"[SUCCESS] JSON report written to: {args.export_json.resolve()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
