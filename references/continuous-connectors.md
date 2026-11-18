# Continuous Curves And Branch Groups

## Scene schema

```json
{
  "id": "relationship-01",
  "name": "Operations to customer experience",
  "type": "path",
  "x": 400, "y": 200, "width": 300, "height": 200,
  "pathWidth": 300, "pathHeight": 200,
  "pathPoints": [
    {"x": 0, "y": 0},
    {"x": 300, "y": 200, "curve": {
      "type": "cubic", "x1": 130, "y1": 0, "x2": 160, "y2": 200
    }}
  ],
  "stroke": "#a6adb1", "strokeWidth": 1.4,
  "startArrow": "none", "endArrow": "triangle", "z": 9
}
```

Coordinates in `pathPoints` are local pixels in `pathWidth`/`pathHeight`.
Changing the element box moves/scales the path; coordinates need not be
rewritten. A point without `curve` after the first is a straight segment.
Use one open path per relationship. This schema does not support closed paths,
arcs or multiple disconnected subpaths. Use shapes for filled geometry.

For each branch member, add `groupId` and `groupName`. Keep groups flat and
members at the same layer depth, with no interleaved occluding content. The
exporter uses `group_pptx_objects.py` (Python standard library only) after PPTX
creation to form native groups. `off == chOff` and `ext == chExt` preserve the
member transforms. This is not a Boolean union and does not bind lines to boxes.

## Migrate existing sampled curves

```bash
python3 scripts/optimize_scene_connectors.py \
  --input original/scene.json --output optimized/scene.json \
  --curve-color '#a6adb1' --branch-color '#df0028' \
  --tolerance 0.5 --report optimized/connector-report.json
```

Review the report, then repeat with `--apply`. Colors explicitly scope the
candidates; color alone does not establish semantic grouping. The fitter assumes
uniformly parameterized samples and accepts only fits under tolerance. Unevenly
sampled curves may be rejected. It never joins ambiguous endpoints, crosses
intermediate arrowheads, or treats interior crossings as junctions. Endpoint-on-
segment contact suggests a branch group, which must be reviewed by the agent.
Existing paths and groups are left unchanged on repeat runs.

## Verification

- A reconstructed smooth relationship has one `p:sp`, one open `a:path` and a
  native `a:cubicBezTo`, not a collection of tiny lines or an image.
- One intended branch group produces one `p:grpSp` containing the original lines.
- Every original text string remains in `a:t`; no line is dropped or duplicated.
- Arrowheads remain at the intended end (including reversed relationships).
- Bounds, stroke styles and member coordinates survive grouping.
- Render the resulting PPTX. Confirm paths do not cross labels unintentionally.
- Browser editing supports whole-path drag/resize and numerical endpoint/control
  point editing. Group operations are in PowerPoint, not the browser editor.
- In PowerPoint, use Edit Points on curves; ungroup a branch for individual edits.
