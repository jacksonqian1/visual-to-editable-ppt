# Layout Constraints

Use layout constraints after reconstructing the scene and before opening the
editor for final confirmation. Constraints describe the intended relationship
between editable objects without flattening them into a single image.

Store constraints in `scene.layoutConstraints` or
`scene.metadata.layoutConstraints`.

## Equal Columns

Use `equalColumns` for KPI strips, comparison rows, icon menus, and other
repeated horizontal structures.

```json
{
  "id": "dashboard-kpi-columns",
  "type": "equalColumns",
  "parentId": "dashboard-panel",
  "padding": {
    "left": 20,
    "right": 20
  },
  "alignY": "preserve",
  "scaleByType": {
    "image": 1.12,
    "text": 1.08
  },
  "columns": [
    { "ids": ["kpi-icon-1", "kpi-label-1", "kpi-value-1"] },
    { "ids": ["kpi-icon-2", "kpi-label-2", "kpi-value-2"] }
  ]
}
```

The solver scales each column around its own visual center, then distributes
the column centers evenly across the parent's safe width. Review the reported
center offset, occupancy, and center gaps.

Do not infer equal columns from OCR boxes alone. Confirm repeated visual
structure, common baselines, and similar element roles first.

## Containment

Use `containment` when child content approaches or exceeds a panel boundary.

```json
{
  "id": "dashboard-list-containment",
  "type": "containment",
  "parentId": "dashboard-panel",
  "linkedParentIds": ["dashboard-panel-border"],
  "children": {
    "prefixes": ["top5-"]
  },
  "padding": {
    "bottom": 10
  },
  "maxParentExpansion": 36,
  "maxBottom": 850,
  "minimumSpacingScale": 0.88,
  "minimumContentScale": 0.92
}
```

The required correction order is:

1. Expand the parent while the slide and neighboring objects leave room.
2. Reduce internal spacing without changing text size.
3. Scale content only when the first two actions cannot resolve the overflow.

List border overlays, masks, and other parent-sized shapes in
`linkedParentIds` so their geometry remains synchronized.

Set `maxBottom` from the nearest lower obstacle or section boundary. Do not
expand a parent through another module merely because the canvas has space.

## Validation

Run report-only mode first:

```bash
node scripts/solve_layout_constraints.cjs \
  --input /absolute/path/to/scene.json \
  --report /absolute/path/to/layout-report.json
```

Apply only after reviewing the proposed corrections:

```bash
node scripts/solve_layout_constraints.cjs \
  --input /absolute/path/to/scene.json \
  --output /absolute/path/to/scene.json \
  --report /absolute/path/to/layout-report.json \
  --apply true
```

After applying constraints, rerun the full geometry audit, render the editor,
and compare the complete slide with the source. A zero-overflow report does not
replace visual review of scale, centering, rhythm, and hierarchy.

The solver records applied scale signatures in scene metadata. Reapplying an
unchanged constraint may realign edited columns, but must not enlarge them
again.
