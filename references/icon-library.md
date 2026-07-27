# Local Icon Library

Use a user-selected local directory as the only source for semantic icons,
decorative lines, separators, and arrows.

## Initialization

Bind the directory to a project:

```bash
node scripts/configure_icon_library.cjs \
  --project /absolute/path/to/scene.json \
  --library /absolute/path/to/icon-library \
  --policy library-only \
  --threshold 35
```

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
- Under `library-only`, never invent, draw, generate, or download a replacement.
  Leave the placeholder blank until the library is expanded or the user selects
  a candidate.
- Native structural geometry is allowed only when it is not acting as a semantic
  icon, decorative line, separator, or arrow.
