#!/usr/bin/env python3
import argparse
import base64
import io
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract icons, arrows, arcs, and decorative line groups directly from a source visual."
    )
    parser.add_argument("--project", required=True)
    parser.add_argument("--source")
    parser.add_argument("--output")
    parser.add_argument("--assets-dir")
    parser.add_argument("--report")
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def element_box(element):
    if element.get("type") == "line":
        x1 = float(element.get("x1", 0))
        x2 = float(element.get("x2", 0))
        y1 = float(element.get("y1", 0))
        y2 = float(element.get("y2", 0))
        return {
            "x": min(x1, x2),
            "y": min(y1, y2),
            "width": abs(x2 - x1),
            "height": abs(y2 - y1),
        }
    return {
        "x": float(element.get("x", 0)),
        "y": float(element.get("y", 0)),
        "width": float(element.get("width", 0)),
        "height": float(element.get("height", 0)),
    }


def clamp_box(box, width, height, padding=0):
    left = max(0, int(math.floor(box["x"] - padding)))
    top = max(0, int(math.floor(box["y"] - padding)))
    right = min(width, int(math.ceil(box["x"] + box["width"] + padding)))
    bottom = min(height, int(math.ceil(box["y"] + box["height"] + padding)))
    return left, top, max(left + 1, right), max(top + 1, bottom)


def border_median(rgb):
    border = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]],
        axis=0,
    )
    return np.median(border.astype(np.float32), axis=0)


def flood_background_mask(rgb, tolerance):
    height, width = rgb.shape[:2]
    background = border_median(rgb)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    traversable = distance <= tolerance
    visited = np.zeros((height, width), dtype=np.uint8)
    queue = deque()

    for x in range(width):
        if traversable[0, x]:
            queue.append((0, x))
        if traversable[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if traversable[y, 0]:
            queue.append((y, 0))
        if traversable[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if visited[y, x] or not traversable[y, x]:
            continue
        visited[y, x] = 1
        if y > 0:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x > 0:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))
    return visited.astype(bool), background


def alpha_background_flood(rgb, tolerance=34, feather=0.7):
    background_mask, background = flood_background_mask(rgb, tolerance)
    foreground = (~background_mask).astype(np.uint8) * 255
    if feather > 0:
        foreground = np.array(
            Image.fromarray(foreground, "L").filter(ImageFilter.GaussianBlur(feather))
        )
    return foreground, background


def alpha_red_chroma(rgb, threshold=24):
    values = rgb.astype(np.float32)
    red = values[:, :, 0]
    green = values[:, :, 1]
    blue = values[:, :, 2]
    dominance = red - np.maximum(green, blue)
    saturation = np.maximum.reduce([red, green, blue]) - np.minimum.reduce([red, green, blue])
    strength = np.minimum(255, np.maximum(0, (dominance - threshold) * 5.2))
    strength *= np.clip(saturation / 42.0, 0, 1)
    return strength.astype(np.uint8), border_median(rgb)


def apply_exclusions(alpha, crop_box, exclusions):
    left, top, _, _ = crop_box
    for exclusion in exclusions or []:
        ex_left = max(0, int(math.floor(float(exclusion["x"]) - left)))
        ex_top = max(0, int(math.floor(float(exclusion["y"]) - top)))
        ex_right = min(
            alpha.shape[1],
            int(math.ceil(float(exclusion["x"]) + float(exclusion["width"]) - left)),
        )
        ex_bottom = min(
            alpha.shape[0],
            int(math.ceil(float(exclusion["y"]) + float(exclusion["height"]) - top)),
        )
        if ex_right > ex_left and ex_bottom > ex_top:
            alpha[ex_top:ex_bottom, ex_left:ex_right] = 0


def rgba_asset(source, crop_box, mode, exclusions=None):
    crop = source.crop(crop_box).convert("RGB")
    rgb = np.array(crop)
    if mode == "red-chroma":
        alpha, background = alpha_red_chroma(rgb)
    else:
        alpha, background = alpha_background_flood(rgb)
    apply_exclusions(alpha, crop_box, exclusions)
    rgba = np.dstack([rgb, alpha])
    image = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    nonzero = int(np.count_nonzero(alpha > 12))
    total = int(alpha.size)
    coverage = nonzero / total if total else 0
    red_pixels = int(
        np.count_nonzero(
            (
                (
                    rgb[:, :, 0].astype(np.int16)
                    - np.maximum(rgb[:, :, 1], rgb[:, :, 2])
                )
                > 24
            )
            & (alpha > 12)
        )
    )
    red_ratio = red_pixels / max(1, nonzero)
    return image, {
        "coverage": round(coverage, 4),
        "redRatio": round(red_ratio, 4),
        "foregroundPixels": nonzero,
        "background": [round(float(value), 1) for value in background],
    }


def png_data_url(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def source_path_for(scene, project_path, explicit):
    if explicit:
        return Path(explicit).expanduser().resolve()
    configured = scene.get("sourceImage", {}).get("src", "")
    if not configured:
        raise ValueError("No source image supplied")
    candidate = Path(configured)
    if not candidate.is_absolute():
        candidate = project_path.parent / candidate
    return candidate.resolve()


def is_auto_icon_candidate(element):
    if element.get("visible") is False or element.get("type") != "image":
        return False
    identity = f"{element.get('id', '')} {element.get('name', '')}".lower()
    if "portrait" in identity or "人物" in identity:
        return False
    kind = str(element.get("libraryAsset", {}).get("kind", "")).lower()
    return kind in {"icon", "arrow", "line"} or bool(element.get("sourceAssetCandidate"))


def record_source_asset(element, crop_box, mode, metrics, role):
    left, top, right, bottom = crop_box
    element["sourceAsset"] = {
        "method": "source-segmentation",
        "role": role,
        "mode": mode,
        "sourceRegion": {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        },
        "metrics": metrics,
    }
    element["libraryIgnored"] = True
    element.pop("libraryAsset", None)
    element.pop("libraryUnmatched", None)


def main():
    args = parse_args()
    project_path = Path(args.project).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve() if args.output else project_path
    report_path = (
        Path(args.report).expanduser().resolve()
        if args.report
        else project_path.parent / "source-asset-recognition-report.json"
    )
    assets_dir = (
        Path(args.assets_dir).expanduser().resolve()
        if args.assets_dir
        else project_path.parent / "assets" / "source-visual-assets"
    )
    scene = json.loads(project_path.read_text(encoding="utf-8"))
    source_path = source_path_for(scene, project_path, args.source)
    source = Image.open(source_path).convert("RGB")
    original_source_size = source.size
    canvas_width = int(scene["canvas"]["width"])
    canvas_height = int(scene["canvas"]["height"])
    if source.size != (canvas_width, canvas_height):
        source = source.resize((canvas_width, canvas_height), Image.Resampling.LANCZOS)

    assets_dir.mkdir(parents=True, exist_ok=True)
    by_id = {element["id"]: element for element in scene.get("elements", [])}
    report = []
    padding = float(scene.get("sourceAssetRecognition", {}).get("iconPadding", 3))
    hide_rejected = bool(scene.get("sourceAssetRecognition", {}).get("hideRejected", False))

    for element in scene.get("elements", []):
        if not is_auto_icon_candidate(element):
            continue
        crop_box = clamp_box(element_box(element), canvas_width, canvas_height, padding)
        asset, metrics = rgba_asset(source, crop_box, "background-flood")
        accepted = metrics["foregroundPixels"] >= 8 and metrics["coverage"] <= 0.82
        item = {
            "id": element["id"],
            "role": "icon",
            "mode": "background-flood",
            "accepted": accepted,
            "sourceRegion": list(crop_box),
            "metrics": metrics,
        }
        report.append(item)
        if not accepted:
            if args.apply and hide_rejected:
                element["visible"] = False
                element["placeholder"] = True
                element["recognitionRejected"] = True
                element["libraryIgnored"] = True
            continue
        if not args.apply:
            continue
        asset_path = assets_dir / f"{element['id']}.png"
        asset.save(asset_path, format="PNG", optimize=True)
        left, top, right, bottom = crop_box
        element["x"] = left
        element["y"] = top
        element["width"] = right - left
        element["height"] = bottom - top
        element["src"] = png_data_url(asset)
        element["fit"] = "contain"
        element["placeholder"] = False
        record_source_asset(element, crop_box, "background-flood", metrics, "icon")

    for group in scene.get("sourceVisualAssetGroups", []):
        if group.get("enabled") is False:
            continue
        crop_box = clamp_box(group["box"], canvas_width, canvas_height, 0)
        mode = group.get("mode", "red-chroma")
        asset, metrics = rgba_asset(source, crop_box, mode, group.get("excludeRects"))
        accepted = metrics["foregroundPixels"] >= int(group.get("minimumPixels", 12))
        item = {
            "id": group["id"],
            "role": group.get("role", "connector"),
            "mode": mode,
            "accepted": accepted,
            "sourceRegion": list(crop_box),
            "metrics": metrics,
            "replaces": group.get("replaceIds", []),
        }
        report.append(item)
        if not accepted or not args.apply:
            continue
        asset_path = assets_dir / f"{group['id']}.png"
        asset.save(asset_path, format="PNG", optimize=True)
        replaced = [by_id[item_id] for item_id in group.get("replaceIds", []) if item_id in by_id]
        for original in replaced:
            original["visible"] = False
            original["sourceReplacedBy"] = group["id"]
        left, top, right, bottom = crop_box
        new_element = {
            "id": group["id"],
            "name": group.get("name", group["id"]),
            "type": "image",
            "visible": True,
            "locked": False,
            "z": group.get("z", min([item.get("z", 1) for item in replaced] or [1])),
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
            "rotation": 0,
            "src": png_data_url(asset),
            "fit": "contain",
            "placeholder": False,
        }
        record_source_asset(
            new_element,
            crop_box,
            mode,
            metrics,
            group.get("role", "connector"),
        )
        existing = by_id.get(group["id"])
        if existing:
            scene["elements"][scene["elements"].index(existing)] = new_element
        else:
            scene["elements"].append(new_element)
        by_id[group["id"]] = new_element

    report_payload = {
        "project": str(project_path),
        "source": str(source_path),
        "originalSourceSize": list(original_source_size),
        "workingSourceSize": [canvas_width, canvas_height],
        "ignoreLocalLibrary": True,
        "total": len(report),
        "accepted": sum(1 for item in report if item["accepted"]),
        "rejected": sum(1 for item in report if not item["accepted"]),
        "assets": report,
    }
    report_path.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        scene["status"] = "draft"
        scene["metadata"] = scene.get("metadata", {})
        scene["metadata"]["sourceAssetRecognition"] = {
            "method": "source-segmentation",
            "ignoreLocalLibrary": True,
            "report": str(report_path),
        }
        output_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report_payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
