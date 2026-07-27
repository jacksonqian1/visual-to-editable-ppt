# Local Icon Library

Use semantic meaning, object role, and page-level style to select icons,
decorative lines, separators, and arrows. The shared icon store is the default
source. A user-selected library may override or supplement it.

## Initialization

Bind the directory to a project:

```bash
node scripts/configure_icon_library.cjs \
  --project /absolute/path/to/scene.json \
  --library /absolute/path/to/icon-library \
  --policy semantic-first-with-generated-vector-fallback \
  --threshold 72
```

Omit `--library` to bind the shared store.

This writes `iconLibrary` into `scene.json` and creates a project-local
`icon-library-index.json`. Existing `index.json` and `manifest.json` metadata are
used when present. Otherwise supported image files are scanned recursively.

Supported formats: PNG, JPEG, WebP, GIF, and SVG.

## Search

Search names, tags, aliases, style, relative paths, and Chinese/English direction
synonyms:

```bash
node scripts/search_icon_library.cjs \
  --library /absolute/path/to/icon-library \
  --query "循环箭头" \
  --kind arrow \
  --limit 10
```

Kinds are `icon`, `line`, and `arrow`.

## Automatic Resolution

Create a review report first:

```bash
node scripts/resolve_scene_icons.cjs \
  --project /absolute/path/to/scene.json
```

After reviewing the highest-scoring matches, apply accepted matches:

```bash
node scripts/resolve_scene_icons.cjs \
  --project /absolute/path/to/scene.json \
  --apply
```

The resolver embeds selected assets as Data URLs. For line and arrow elements it
preserves the original endpoint data under `originalLine` before converting the
visual to an image element.

## Matching Rules

- Prefer exact names and aliases over broad tag matches.
- Respect the project's confidence threshold.
- Store the selected resource metadata in `libraryAsset`.
- Store the semantic request in `libraryQuery`.
- When no candidate reaches the threshold, set `placeholder: true` and
  `libraryUnmatched: true`.
- Under `semantic-first-with-generated-vector-fallback`, reject candidates that
  fail either the semantic or style threshold. Generate a consistent SVG or
  transparent image only after retrieval fails.
- Register accepted generated assets in the shared store with semantic aliases,
  role, kind, style, provenance, and quality score.
- Copy the selected asset into the project before export. Shared-store paths are
  for retrieval and reuse, not a runtime dependency of the final project.
- `library-only` remains available when the user explicitly prohibits
  generation.
- Native structural geometry is allowed only when it is not acting as a semantic
  icon, decorative line, separator, or arrow.
