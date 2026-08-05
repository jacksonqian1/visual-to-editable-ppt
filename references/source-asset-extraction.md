# Source Asset Extraction

Use screenshot extraction only when the source visual contains the exact icon
or decorative asset needed and no higher-quality library or brand asset should
replace it.

## Adaptive Crop

Mark the image element as a source-asset candidate and run:

```bash
python scripts/extract_source_visual_assets.py \
  --project /project/scene.json \
  --source /project/source.png \
  --assets-dir /project/assets/source-visual-assets \
  --report /project/source-asset-recognition-report.json \
  --apply
```

Recommended scene configuration:

```json
{
  "sourceAssetRecognition": {
    "iconPadding": 3,
    "iconEdgeRiskRatio": 0.04,
    "iconExpansionStep": 4,
    "iconMaxExpansion": 20
  }
}
```

The extractor removes border-connected background, measures the foreground
alpha bounds, and expands only the risky sides. It repeats until visible pixels
clear the edge band or the expansion limit is reached. It records the initial
crop, final crop, every attempt, visible bounds, and `mayBeClipped` status.

## Acceptance Rules

- Require `accepted: true` and `mayBeClipped: false`.
- Inspect the extracted icon at 200–400% zoom against the source.
- Confirm every outline closes correctly and all nodes, strokes, antennae,
  handles, speech-bubble tails, and microphone bases remain present.
- Reject any crop that reaches the source boundary or remains inside the edge
  band after maximum expansion.
- Do not repair a missing edge by adding transparent canvas padding. Re-extract
  from a wider source region, retrieve a library asset, or regenerate it.
- Avoid manual crop coordinates. If unavoidable, begin with 15–25% background
  beyond the visible symbol and run `normalize_semantic_icon.py` with
  `--fail-on-edge-contact` before copying the result into `assets/icons/`.

## HTML Preflight

Keep the extractor's `sourceAsset.metrics` metadata on the scene element.
`scene_to_html.cjs` blocks visible source-extracted images with `edgeRisk`,
`mayBeClipped`, or `recognitionRejected`. Override only after explicit visual
approval by setting `sourceAssetIntegrityApproved: true` on that exact element.
