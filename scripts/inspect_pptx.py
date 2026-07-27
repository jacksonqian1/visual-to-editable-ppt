#!/usr/bin/env python3
import argparse
import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}


def inspect_package(pptx_path: Path, expected_text: list[str]) -> dict:
    with zipfile.ZipFile(pptx_path) as archive:
        names = archive.namelist()
        slide_names = sorted(
            name
            for name in names
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        media = [
            name
            for name in names
            if name.startswith("ppt/media/") and not name.endswith("/")
        ]
        text_values = []
        shape_count = 0
        picture_count = 0
        for slide_name in slide_names:
            root = ET.fromstring(archive.read(slide_name))
            shape_count += len(root.findall(".//p:sp", NS))
            shape_count += len(root.findall(".//p:cxnSp", NS))
            picture_count += len(root.findall(".//p:pic", NS))
            text_values.extend(node.text or "" for node in root.findall(".//a:t", NS))
        joined = "\n".join(text_values)
        return {
            "file": str(pptx_path),
            "slides": len(slide_names),
            "shapes": shape_count,
            "text_runs": len(text_values),
            "pictures": picture_count,
            "media_files": len(media),
            "expected_text": {value: value in joined for value in expected_text},
            "single_full_slide_image_risk": len(slide_names) == 1
            and picture_count == 1
            and shape_count <= 2,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect editable PPTX structure")
    parser.add_argument("pptx", type=Path)
    parser.add_argument("--expect-text", action="append", default=[])
    args = parser.parse_args()
    if not args.pptx.exists():
        raise SystemExit(f"File not found: {args.pptx}")
    print(json.dumps(inspect_package(args.pptx, args.expect_text), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
