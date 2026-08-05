# Generated Semantic Icons

Use this workflow only after semantic and page-style retrieval fails for a
`semantic-icon`. Do not use it for structural geometry, borders, masks, precise
connectors, official brand assets, or `library-only` projects.

## Style Contract

Define one contract for the whole page before generation:

- medium: flat raster icon;
- outline or fill treatment;
- palette and forbidden chroma-key color;
- stroke weight and corner treatment;
- perspective and visual density;
- square padding and subject scale;
- forbidden text, shadows, gradients, textures, and background objects.

Reuse the contract verbatim in every icon prompt. Generate one semantic subject
per built-in `image_gen` call.

## Prompt Template

```text
Use case: productivity-visual
Asset type: semantic icon for an editable PowerPoint slide
Primary request: create one icon meaning "<semantic>" for role "<role>"
Style/medium: raster PNG icon; <shared style contract>
Composition: one centered symbol, square canvas, equal generous padding, no crop
Color palette: <slide palette>; do not use <key color> in the icon
Scene/backdrop: perfectly flat solid <key color> chroma-key background
Constraints: one subject only; crisp silhouette; no text; no watermark; no
shadow; no gradient; no texture; no background objects
```

Prefer a 1024×1024 master. Do not switch to the imagegen CLI merely for size
control. Downscale locally only when the project needs a smaller deliverable.
Keep the visible symbol inside the central 72–80% of the canvas. Require at
least 10% clear background on every side; prompt-level padding alone is not a
substitute for post-generation measurement.

## Transparency And Validation

Follow the `imagegen` skill's built-in chroma-key workflow. Choose a key color
absent from the icon; for green icons prefer `#ff00ff`. Run the installed
`remove_chroma_key.py` helper, then validate:

- an alpha channel exists and all four corners are transparent;
- the subject is centered, uncropped, and uses consistent square padding;
- no chroma-key fringe, spill, shadow, or background patch remains;
- the icon meaning is correct without relying on text;
- stroke weight, palette, density, and perspective match the full icon family.

Then normalize every accepted alpha PNG before scene placement:

```bash
python scripts/normalize_semantic_icon.py \
  --input /project/staging/icon.png \
  --output /project/staging/normalized/icon.png \
  --padding-ratio 0.12 \
  --fail-on-edge-contact \
  --report /project/staging/reports/icon-safe-area-report.json
```

Use the normalized output, not the tight-cropped staging file. If the report
sets `sourceMayAlreadyBeClipped: true`, inspect the source: padding can prevent
further clipping but cannot restore missing pixels, so regenerate when the
symbol itself is cut off. Copy only a passing normalized file into
`assets/icons/`. Do not downscale before normalization. In parallel workflows,
give every icon a unique report path or run one final directory-level
normalization and emit a single aggregate report.

Ask before using the imagegen CLI or native-transparency fallback.

## Project And Shared Store

Copy each normalized PNG into `<project>/assets/icons/` before referencing it.
Represent it as an independent `image` element with `fit: contain`, a
project-relative `src`, stable ID/name, `placeholder: false`, `libraryQuery`,
and generation provenance. The PNG remains movable, resizable, and replaceable,
but its pixels are not native PowerPoint vector geometry.

Register accepted files only after project-local validation. Use semantic
aliases and raster provenance:

```bash
node scripts/register_shared_icons.cjs \
  --source /project/assets/icons \
  --category generated \
  --collection project-name \
  --report /project/semantic-icon-report.json \
  --style "<shared style contract>" \
  --source-type semantic-raster-generated \
  --generator imagegen-built-in
```

The padded project-local file is the packaging source. Never leave the final scene
dependent on `$CODEX_HOME/generated_images` or the shared store.

## Subagent Coordination

Parallelize only when at least two unresolved icons are independent. The main
agent defines the full inventory and style contract, then assigns non-overlapping
IDs, filenames, and staging directories. Each subagent generates one icon per
imagegen call, removes the chroma key when required, validates its assigned
files, and returns prompt/path metadata. Subagents must not modify `scene.json`
or the shared icon store. The main agent performs final family QA and commits
scene and registration changes once.
