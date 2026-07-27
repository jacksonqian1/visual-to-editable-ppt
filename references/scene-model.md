# Scene Model

Use UTF-8 JSON. The scene is the canonical project state.

## Root

```json
{
  "version": 1,
  "title": "Slide title",
  "status": "draft",
  "canvas": {
    "width": 1672,
    "height": 941,
    "background": "#ffffff"
  },
  "sourceImage": {
    "src": "./source.jpg",
    "opacity": 0.25,
    "visible": false
  },
  "sharedIconStore": {
    "enabled": true,
    "root": "~/.codex/assets/visual-to-editable-ppt",
    "icons": "~/.codex/assets/visual-to-editable-ppt/icons",
    "index": "~/.codex/assets/visual-to-editable-ppt/icons/index.json"
  },
  "layoutConstraints": [],
  "elements": []
}
```

`status` is `draft` or `confirmed`. Export only the latest user-confirmed scene.

`layoutConstraints` records parent-child containment and repeated layout intent.
Keep constraints declarative and ID-based so objects remain independently
editable. Read `layout-constraints.md` for supported constraint types.

## Common Element Fields

Every element requires:

```json
{
  "id": "stable-unique-id",
  "name": "Readable layer name",
  "type": "text",
  "x": 100,
  "y": 120,
  "width": 300,
  "height": 60,
  "rotation": 0,
  "visible": true,
  "locked": false,
  "z": 10
}
```

Coordinates and dimensions are pixels in canvas space. `z` controls layer order.

## Text

```json
{
  "type": "text",
  "text": "Editable text",
  "fontFamily": "PingFang SC",
  "fontSize": 28,
  "fontWeight": 700,
  "color": "#111111",
  "align": "left",
  "lineHeight": 1.25
}
```

Keep text separate from background shapes. Do not bake text into images.

## Shapes

Supported types:

- `rect`
- `roundRect`
- `ellipse`

Shape fields:

```json
{
  "fill": "#ffffff",
  "stroke": "#df3030",
  "strokeWidth": 1,
  "radiusTopLeft": 8,
  "radiusTopRight": 8,
  "radiusBottomRight": 8,
  "radiusBottomLeft": 8
}
```

Use the four radius properties only for `roundRect`. Their order follows CSS:
top-left, top-right, bottom-right, bottom-left. A legacy `radius` value remains
supported as the fallback for projects created before per-corner radii.

Unrotated `rect` elements may participate in editable Boolean geometry:

```json
{
  "mergeGroup": "panel-union",
  "mergeOperation": "union",
  "autoMerge": true
}
```

The boolean-geometry reference defines the operation and export rules.

### Crossing and overlap markers

Use generic markers when objects must remain separate but their relationship
must survive HTML and PPT export:

```json
{
  "overlapGroup": "line-cross-01",
  "overlapKind": "crossing",
  "overlapRole": "foreground"
}
```

Supported `overlapKind` values are `crossing`, `overlap`, and `tangent`.
Supported `overlapRole` values are `foreground`, `background`, and `member`.
These markers do not merge the source objects. They are exported into HTML data
attributes and PowerPoint object names and alt text.

## Lines

Lines use explicit endpoints:

```json
{
  "type": "line",
  "x1": 100,
  "y1": 200,
  "x2": 360,
  "y2": 260,
  "stroke": "#c40000",
  "strokeWidth": 2,
  "dash": "solid",
  "startArrow": "none",
  "endArrow": "triangle"
}
```

Do not infer line endpoints from a rotated rectangle during PPT export.

## Icons

```json
{
  "type": "icon",
  "glyph": "◎",
  "fontFamily": "Arial",
  "fontSize": 36,
  "color": "#c40000",
  "align": "center",
  "placeholder": false
}
```

Use a Unicode glyph for simple replaceable icons. Uploaded PNG, JPEG, WebP, GIF,
or SVG icons use `image` with a Data URL so the scene remains portable.

## Images

```json
{
  "type": "image",
  "src": "./assets/portrait.png",
  "fit": "contain",
  "placeholder": false
}
```

Prefer project-relative paths or data URLs. Mark uncertain visual reconstruction with `placeholder: true`.

Library-selected assets may also include:

```json
{
  "libraryQuery": "循环箭头",
  "libraryAsset": {
    "id": "arrows/loop.png",
    "name": "center loop red arrow ring",
    "kind": "arrow",
    "score": 84
  },
  "libraryUnmatched": false
}
```

When `iconLibrary.policy` is `semantic-first-with-generated-vector-fallback`,
store the semantic request and selection provenance. Register generated assets
in `sharedIconStore`, then copy the selected file into the project. When the
policy is explicitly `library-only`, unresolved semantic icons, arrows, and
decorative lines must use placeholders instead of generated substitutes.

## IDs And Ordering

- Keep IDs stable across edits and exports.
- Use lowercase kebab-case IDs.
- Keep names audience-readable for the layer panel.
- Sort by `z`, then source order.
- Never reuse an ID.
