# Boolean Geometry

Use editable PowerPoint custom geometry for overlapping or tangent rectangular
regions. Do not rasterize the result.

## Scene Fields

```json
{
  "type": "rect",
  "mergeGroup": "panel-cutout",
  "mergeOperation": "subtract",
  "autoMerge": false
}
```

Supported operations:

- `union`: combine all rectangles in a group.
- `intersect`: retain only the area shared by every rectangle.
- `subtract`: subtract all later rectangles from the first rectangle in layer
  order.

The general engine supports unrotated `rect` elements. An explicit `intersect`
group may also contain exactly one unrotated `roundRect` plus one or more
rectangles. This produces an editable clipped header band or similar layered
panel effect that follows the rounded boundary. Ellipses and rotated shapes
remain separate native PowerPoint objects.

## Automatic Merging

The exporter conservatively merges touching or overlapping unrotated rectangles
when their fill and border styles are identical. It does not merge differently
styled shapes.

Disable automatic detection while keeping explicit groups:

```bash
node scripts/html_to_editable_pptx.cjs \
  --input confirmed.html \
  --output final.pptx \
  --merge-overlaps explicit
```

Tune edge snapping with `--merge-tolerance`, expressed in canvas pixels.

## Editing

The merged result is a PowerPoint freeform shape. Its fill, border, size, and
individual points remain editable, but PowerPoint does not retain the original
boolean command or source rectangles.

Rounded rectangles with unequal per-corner radii, or with
`forceCustomGeometry: true`, are exported as editable PowerPoint freeforms.
This avoids Office's fixed native rounded-rectangle radius and preserves the
four corner settings from the scene while leaving ordinary rounded rectangles
as stable native shapes.

After the complete-scene geometry audit passes with no out-of-bounds objects,
use `--exact-roundrects true` to export every rounded rectangle as editable
custom geometry. This is the preferred fidelity mode for screenshot
reconstruction, but it must be followed by rendering and overflow inspection.

## Edge-aligned panel bands

Do not model a colored band inside a rounded panel as another rounded rectangle.
The band only inherits corners where it touches the panel's rounded outer edge;
the band's interior edge must stay square.

Configure these cases with:

```bash
node scripts/configure_panel_band_intersection.cjs \
  --input scene.json \
  --panel-id assistant-panel \
  --band-id assistant-label-bg \
  --edge left
```

The script supports `left`, `right`, `top`, and `bottom`. It converts the band
to a borderless rectangle, intersects it with a borderless duplicate of the
rounded panel, transfers the panel's visible stroke to one border overlay, and
clears the original panel stroke. This prevents duplicate outlines while
keeping the PowerPoint result editable. Re-running the script is idempotent and
preserves edits made to the existing overlay stroke.
