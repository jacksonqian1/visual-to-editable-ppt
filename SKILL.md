---
name: visual-to-editable-ppt
description: Convert a reference image, screenshot, effect render, or existing HTML slide into a directly editable canvas inside the Codex in-app browser, then export a confirmed design as native editable PowerPoint objects. Use for image-to-HTML-to-PPT workflows, screenshot reconstruction, editable infographic slides, replacing or deleting icons and lines before export, round-trip web editing, or choosing between native editable, live HTML add-in, and high-fidelity raster PowerPoint output.
---

# Visual To Editable PPT

Use a structured scene as the source of truth:

```text
source visual -> scene.json -> Codex in-app editor -> confirmed HTML -> PPTX
```

Do not treat arbitrary HTML or a screenshot as the canonical project state. Keep positions, text, styles, lines, icons, images, names, and layer order in `scene.json`.

## Required Workflow

1. Resolve the exact source visual and inspect its dimensions.
2. Initialize the shared icon store with `scripts/init_shared_icon_store.cjs`.
   Its default root is `~/.codex/assets/visual-to-editable-ppt`. Bind a separate
   user library only when the user supplies one explicitly.
3. Create a project directory containing:
   - `scene.json`
   - the source image when available
   - `icon-library-index.json`
   - `confirmed.html` after confirmation
   - the final `.pptx`
4. Reconstruct the source as scene elements. Preserve every meaningful string
   as text. When reusing an icon from the screenshot itself, follow
   [references/source-asset-extraction.md](references/source-asset-extraction.md)
   and use `scripts/extract_source_visual_assets.py`; do not accept a manual
   tight crop whose visible pixels enter the crop-edge risk band.
5. Run `scripts/audit_scene_geometry.cjs` across the complete scene. Review
   every out-of-bounds object, high-confidence edge-band candidate,
   duplicate-border candidate, and round-rectangle fidelity risk before
   focusing on user-highlighted regions.
6. Infer parent-child relationships and repeated layout groups. Run
   `scripts/solve_layout_constraints.cjs` in report-only mode, then apply
   reviewed constraints. For overflow, expand the parent first, reduce spacing
   second, resize decorative objects third, and scale text/content last.
7. Classify every visual as a semantic icon, structural geometry, connector,
   decoration, or brand asset. For semantic icons, infer meaning from nearby
   text and the source visual, then search the user-selected library, shared
   store, and built-in assets in that order. When no candidate passes both the
   semantic and page-style thresholds, use the `imagegen` skill in built-in
   mode to generate a consistent raster PNG. Do not hand-draw or generate an
   SVG fallback. Run `scripts/normalize_semantic_icon.py` on every generated
   PNG before scene placement. Reject and regenerate any icon whose visible
   subject is already cut off at the source edge. Validate and copy the padded
   PNG into the project before registering it with
   `scripts/register_shared_icons.cjs`.
8. When lines cross or overlap, run `scripts/mark_scene_overlaps.cjs` and review
   the generated `overlapReport`. Keep crossing lines as separate editable
   objects unless the user explicitly requests a merged shape.
9. When a colored band touches the left, right, top, or bottom edge of a rounded
   panel, run `scripts/configure_panel_band_intersection.cjs`. Do not use a
   second rounded rectangle because its interior corners must remain square.
   Keep exactly one visible owner for the panel outline; the script transfers
   the panel stroke to the border overlay to prevent duplicate borders.
10. Start the bundled local editor with `scripts/serve_editor.cjs`.
11. Open the localhost editor in the Codex in-app browser. Keep the user in Codex.
12. Let the user edit text, positions, sizes, icons, images, and line endpoints. The editor autosaves `scene.json`.
13. Render and validate the edited scene. Stop for explicit visual confirmation.
14. Generate annotated HTML with `scripts/scene_to_html.cjs`.
15. Export the confirmed design using the selected mode.
16. Render and structurally inspect the PPTX before delivery.

Never skip the confirmation checkpoint unless the user explicitly asks for immediate export.

## Initialize A Project

Read [references/scene-model.md](references/scene-model.md) before creating or editing `scene.json`.

Copy `assets/project-template.json` into the project directory and replace its example elements. Use the source image's pixel dimensions for `canvas.width` and `canvas.height`.

Read [references/shared-icon-store.md](references/shared-icon-store.md),
[references/icon-library.md](references/icon-library.md), and
[references/generated-semantic-icons.md](references/generated-semantic-icons.md)
before resolving or generating icons. Default to
`semantic-first-with-generated-raster-fallback`. Treat meaning and page-level
style consistency as separate scores. Do not select a semantically weak icon
merely because it resembles the source image.

For image reconstruction:

- Use one scene element per editable object when practical.
- Use `text` for all audience-facing copy.
- Use `rect`, `roundRect`, `ellipse`, and `line` for simple geometry.
- Use `icon` only for simple replaceable glyphs already present in the source.
- Use `image` for generated semantic-icon PNGs and complex visual assets that
  should remain raster or preserve an existing source SVG.
- Use library-selected `image` elements for semantic icons, decorative lines,
  separators, and arrows.
- Keep borders, containers, masks, Boolean clipping shapes, and simple geometry
  as native scene objects. Keep structural connectors that require exact
  endpoints and direction as editable `line` elements. Use reusable assets for
  decorative arrows, arcs, chevrons, and loops only when appropriate.
- Copy every selected shared asset into the project's `assets/icons/` directory
  before final export so the scene is portable.
- Give every element a stable `id` and readable `name`.
- Mark uncertain icons or portraits with `placeholder: true`.
- Represent repeated rows or columns and parent-child containment with
  `layoutConstraints`. Read [references/layout-constraints.md](references/layout-constraints.md)
  before adjusting a local overflow or centering issue.

## Extract Icons From The Source Visual

Read [references/source-asset-extraction.md](references/source-asset-extraction.md)
before extracting a screenshot icon. Use the adaptive extractor, which expands
only the crop sides that still contain foreground pixels near an edge. A source
icon is accepted only when the final alpha bounds clear the configured edge-risk
band. If expansion reaches its limit, retrieve a library icon or regenerate it;
adding transparent padding after pixels are missing is not a repair.

`scene_to_html.cjs` rejects source-extracted image elements marked
`mayBeClipped`, `edgeRisk`, or `recognitionRejected`. Do not bypass this check
unless the user has visually approved that exact edge-touching asset and the
element records `sourceAssetIntegrityApproved: true`.

## Generate Semantic Icons

Apply [references/generated-semantic-icons.md](references/generated-semantic-icons.md)
only to unresolved semantic icons. Create one page-level style contract before
generation and reuse it for every prompt. Generate one distinct icon per
built-in `image_gen` call. For transparent icons, follow the `imagegen` skill's
flat chroma-key workflow and validate alpha and edge cleanup before use.
Normalize the alpha PNG onto a square transparent canvas with 10–14% safe-area
padding on every side. Use the normalized file in `scene.json`; never reference
the tight-cropped intermediate. The PPT exporter preserves `fit: contain` using
the image's intrinsic aspect ratio, preserves `fit: cover` as an intentional
crop, and fails when an image did not load, has an invalid layout box, uses an
unsupported fit, or still depends on a remote URL.

When two or more unresolved semantic icons are independent and subagents are
available, the main agent may parallelize generation. Define the complete icon
inventory, shared style contract, unique IDs, filenames, and isolated staging
paths first. Each subagent must read the `imagegen` skill, generate and validate
only its assigned files, and must not edit `scene.json` or register shared
assets. The main agent performs final family-style QA, updates the scene once,
and registers accepted assets once. Do not delegate a single icon or a tightly
coupled iterative icon family.

Do not use image generation for structural geometry, borders, masks, precise
connectors, high-confidence library assets, official brand assets, or a
user-requested `library-only` workflow.

## Prevent Duplicate Borders

Assign every visible boundary to exactly one stroke-owning object. Do not stack
same-bounds shapes with the same visible stroke. For edge-aligned panel bands,
keep the band and clipping mask borderless and let the single border overlay own
the panel outline. Treat `transparent`, `none`, `hidden`, zero-width, and near-zero
alpha strokes as no border. Review every `duplicateBorders` result from
`audit_scene_geometry.cjs` before export.

## Run The Codex Editor

Load the workspace Node dependency path before starting when necessary.

```bash
node scripts/serve_editor.cjs \
  --project /absolute/path/to/scene.json \
  --port 4173
```

When `--icon-library` is omitted, the editor uses the project's configured
library and then the shared icon store.

Open `http://127.0.0.1:4173` in the Codex in-app browser. If the port is busy, choose another.

The editor must support:

- Direct text editing.
- Dragging and resizing.
- Deleting any selected object.
- Replacing icon glyphs and uploaded images.
- Uploading PNG, JPEG, WebP, GIF, or SVG icons as portable image elements.
- Searching the configured local icon library by name, tag, alias, and type.
- Automatically selecting a high-confidence library match for the selected
  icon, line, or arrow.
- Editing the four corners of a rounded rectangle independently.
- Grouping rectangular regions for union, intersection, and subtraction during
  PPT export.
- Intersecting one rounded rectangle with rectangular masks to create editable
  clipped header bands and similar layered panel effects.
- Marking crossing, overlapping, and tangent objects with a shared group and
  foreground/background role.
- Moving line endpoints and changing line/arrow style.
- Layer selection and reordering.
- Undo and redo.
- Source-image overlay and opacity control.
- Autosave to `scene.json`.

Do not ask the user to edit source code or raw JSON for normal visual changes.

## Generate Confirmed HTML

After the user confirms the editor view:

```bash
node scripts/scene_to_html.cjs \
  --input /absolute/path/to/scene.json \
  --output /absolute/path/to/confirmed.html
```

The generated HTML must:

- Use a fixed-size canvas matching the scene.
- Annotate every convertible object with `data-ppt`.
- Preserve real text as DOM text.
- Add `data-name` and `data-id`.
- Preserve line endpoints in data attributes.
- Avoid body scroll inside the slide.

## Choose An Export Mode

Read [references/export-modes.md](references/export-modes.md) when selecting an output.

Default to `native-editable`:

```bash
node scripts/html_to_editable_pptx.cjs \
  --input /absolute/path/to/confirmed.html \
  --output /absolute/path/to/final.pptx \
  --font-scale 0.52 \
  --merge-overlaps conservative \
  --exact-roundrects true
```

Read [references/boolean-geometry.md](references/boolean-geometry.md) when shapes
overlap or touch. Use explicit `mergeGroup` and `mergeOperation` fields when the
intended result is not a same-style union.

Use:

- `native-editable` for normal sharing, offline use, and PowerPoint editing.
- `live-html` only when the user accepts an Office content add-in, hosted assets, and deployment requirements.
- `high-fidelity-raster` only when fidelity matters more than editability.
- `hybrid` when a visual background may remain raster but important text and controls must stay editable.

## Validate

Read [references/qa.md](references/qa.md) before delivery.

Always verify:

- The editor view has no clipped text or objects outside the canvas.
- No same-bounds objects unintentionally own the same visible border.
- Every semantic child group stays inside its parent safe area.
- Repeated columns and rows are centered, evenly distributed, and aligned to
  common baselines.
- Content occupancy is visually consistent with the source; a zero-overflow
  result is not sufficient when a group is noticeably too small.
- The confirmed HTML matches the latest saved scene.
- Key strings appear as editable PowerPoint text.
- The PPTX is not a single full-slide image unless raster mode was requested.
- Lines preserve endpoints and direction.
- Boolean geometry remains editable PowerPoint custom geometry.
- No unintended overlap or overflow appears in the rendered PPT.

Use `scripts/inspect_pptx.py` for structural checks. Render the PPT using the available presentation rendering tools or the platform previewer and inspect it visually.

## Resources

- [references/scene-model.md](references/scene-model.md): scene schema and element rules.
- [references/icon-library.md](references/icon-library.md): initialization,
  semantic matching, style scoring, and project-local copies.
- [references/shared-icon-store.md](references/shared-icon-store.md): stable
  shared storage, categories, registration, indexing, and generated-asset rules.
- [references/generated-semantic-icons.md](references/generated-semantic-icons.md):
  imagegen prompting, chroma-key cleanup, subagent coordination, and icon QA.
- [references/source-asset-extraction.md](references/source-asset-extraction.md):
  adaptive screenshot-icon crops, edge-risk rejection, and HTML preflight.
- [references/boolean-geometry.md](references/boolean-geometry.md): editable
  union, intersection, subtraction, and tangent-region handling.
- [references/layout-constraints.md](references/layout-constraints.md):
  parent-first containment repair, repeated-column alignment, occupancy, and
  safe scaling rules.
- [references/export-modes.md](references/export-modes.md): export mode selection and HTML embedding constraints.
- [references/qa.md](references/qa.md): editor, HTML, and PPT QA.
- `assets/editor/`: local Codex browser editor.
- `assets/project-template.json`: starter scene.
- `scripts/serve_editor.cjs`: local editor and autosave service.
- `scripts/configure_icon_library.cjs`: bind and index a user-selected library.
- `scripts/init_shared_icon_store.cjs`: initialize the stable shared icon store.
- `scripts/register_shared_icons.cjs`: register project icons and semantic
  metadata in the shared store.
- `scripts/normalize_semantic_icon.py`: center generated PNG/WebP icons on a
  padded transparent square canvas and report possible source-edge clipping.
- `scripts/shared_icon_store.cjs`: shared paths and index maintenance.
- `scripts/search_icon_library.cjs`: query names, tags, aliases, and kinds.
- `scripts/resolve_scene_icons.cjs`: report and apply automatic scene matches.
- `scripts/extract_source_visual_assets.py`: extract screenshot icons with
  connected-background removal and adaptive edge expansion.
- `scripts/mark_scene_overlaps.cjs`: detect and mark interior line crossings
  and collinear overlaps without merging the lines.
- `scripts/configure_panel_band_intersection.cjs`: clip left, right, top, or
  bottom colored bands to a rounded panel while keeping interior corners square.
- `scripts/audit_scene_geometry.cjs`: scan the complete scene for canvas
  overflow, high-confidence edge-band candidates, and round-rectangle fidelity
  risks.
- `scripts/solve_layout_constraints.cjs`: report and apply parent containment,
  equal-column centering, controlled spacing reduction, and last-resort content
  scaling.
- `scripts/scene_to_html.cjs`: deterministic annotated HTML generator.
- `scripts/html_to_editable_pptx.cjs`: native PowerPoint converter.
- `scripts/inspect_pptx.py`: structural PPTX inspection.
