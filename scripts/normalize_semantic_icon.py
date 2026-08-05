#!/usr/bin/env python3
"""Normalize a raster semantic icon onto a padded transparent square canvas.

The script also reports whether visible pixels touched the source boundary. That
condition cannot be repaired reliably after generation, but padding the result
prevents additional clipping during HTML/PPT placement.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageOps


SUPPORTED = {".png", ".webp"}


def alpha_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    return mask.getbbox()


def normalize_one(
    source: Path,
    output: Path,
    padding_ratio: float,
    alpha_threshold: int,
    edge_risk_ratio: float,
    fail_on_edge_contact: bool,
) -> dict:
    with Image.open(source) as opened:
        if getattr(opened, "n_frames", 1) != 1:
            raise ValueError(f"{source}: animated or multi-frame images are not supported")
        rgba = ImageOps.exif_transpose(opened).convert("RGBA")

    width, height = rgba.size
    bbox = alpha_bbox(rgba, alpha_threshold)
    if not bbox:
        raise ValueError(f"{source}: no visible pixels above alpha threshold {alpha_threshold}")

    left, top, right, bottom = bbox
    subject_width = right - left
    subject_height = bottom - top
    edge_limit = max(1, math.ceil(min(width, height) * edge_risk_ratio))
    edge_contact = {
        "left": left < edge_limit,
        "top": top < edge_limit,
        "right": width - right < edge_limit,
        "bottom": height - bottom < edge_limit,
    }

    subject = rgba.crop(bbox)
    usable_ratio = 1.0 - 2.0 * padding_ratio
    canvas_size = max(1, math.ceil(max(subject_width, subject_height) / usable_ratio))
    target = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    paste_x = (canvas_size - subject_width) // 2
    paste_y = (canvas_size - subject_height) // 2
    target.alpha_composite(subject, (paste_x, paste_y))

    output_bbox = alpha_bbox(target, alpha_threshold)
    out_left, out_top, out_right, out_bottom = output_bbox or (0, 0, 0, 0)
    minimum_padding = min(out_left, out_top, canvas_size - out_right, canvas_size - out_bottom)
    result = {
        "source": str(source.resolve()),
        "output": str(output.resolve()),
        "sourceSize": [width, height],
        "sourceVisibleBounds": [left, top, right, bottom],
        "sourceEdgeContact": edge_contact,
        "sourceEdgeRiskRatio": edge_risk_ratio,
        "sourceMayAlreadyBeClipped": any(edge_contact.values()),
        "outputSize": [canvas_size, canvas_size],
        "outputVisibleBounds": list(output_bbox or ()),
        "minimumOutputPaddingPx": minimum_padding,
        "minimumOutputPaddingRatio": round(minimum_padding / canvas_size, 4),
        "subjectOccupancy": round(max(subject_width, subject_height) / canvas_size, 4),
        "written": False,
    }
    if not (fail_on_edge_contact and result["sourceMayAlreadyBeClipped"]):
        output.parent.mkdir(parents=True, exist_ok=True)
        target.save(output, format="PNG", optimize=True)
        result["written"] = True
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Add transparent safe-area padding to semantic icon PNG/WebP files."
    )
    parser.add_argument("--input", required=True, help="Input PNG/WebP file or directory")
    parser.add_argument("--output", required=True, help="Output PNG file or directory")
    parser.add_argument("--padding-ratio", type=float, default=0.12)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument("--edge-risk-ratio", type=float, default=0.02)
    parser.add_argument("--report", help="Optional JSON report path")
    parser.add_argument(
        "--fail-on-edge-contact",
        action="store_true",
        help="Exit with status 2 when visible source pixels enter the edge-risk band",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 0.05 <= args.padding_ratio <= 0.30:
        raise SystemExit("--padding-ratio must be between 0.05 and 0.30")
    if not 0 <= args.alpha_threshold <= 254:
        raise SystemExit("--alpha-threshold must be between 0 and 254")
    if not 0 <= args.edge_risk_ratio <= 0.10:
        raise SystemExit("--edge-risk-ratio must be between 0 and 0.10")

    source = Path(args.input).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    if source.is_dir():
        files = sorted(path for path in source.iterdir() if path.suffix.lower() in SUPPORTED)
        if not files:
            raise SystemExit(f"No PNG or WebP files found in {source}")
        stems = [path.stem.casefold() for path in files]
        if len(stems) != len(set(stems)):
            raise SystemExit("Input directory contains PNG/WebP files with colliding output stems")
        output.mkdir(parents=True, exist_ok=True)
        pairs = [(path, output / f"{path.stem}.png") for path in files]
    else:
        if source.suffix.lower() not in SUPPORTED:
            raise SystemExit("Input must be a PNG or WebP file")
        target = output / f"{source.stem}.png" if output.is_dir() else output
        if target.suffix.lower() != ".png":
            raise SystemExit("Output must end in .png")
        pairs = [(source, target)]

    results = [
        normalize_one(
            src,
            dest,
            args.padding_ratio,
            args.alpha_threshold,
            args.edge_risk_ratio,
            args.fail_on_edge_contact,
        )
        for src, dest in pairs
    ]
    report = {
        "paddingRatio": args.padding_ratio,
        "alphaThreshold": args.alpha_threshold,
        "edgeRiskRatio": args.edge_risk_ratio,
        "icons": results,
        "warnings": [
            f"{item['source']}: visible pixels enter the source edge-risk band; regenerate if the symbol is already cut off"
            for item in results
            if item["sourceMayAlreadyBeClipped"]
        ],
    }
    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.fail_on_edge_contact and report["warnings"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
