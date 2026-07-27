# Shared Icon Store

Keep reusable runtime-generated icons outside the installed skill directory.
Skill upgrades may replace files under `~/.codex/skills`, so mutable icon data
belongs under:

```text
~/.codex/assets/visual-to-editable-ppt/
├── icons/
│   ├── semantic/
│   ├── connectors/
│   ├── decorative/
│   ├── generated/
│   ├── manifest.json
│   └── index.json
├── thumbnails/
└── icon-store.json
```

## Initialize

```bash
node scripts/init_shared_icon_store.cjs
```

Use `--root /custom/path` only when the user explicitly chooses a different
shared location.

## Categories

- `semantic`: curated business and domain icons.
- `connectors`: arrows, arcs, chevrons, loops, and decorative connectors.
- `decorative`: ornaments, separators, badges, and non-semantic marks.
- `generated`: assets created for a project and retained for future reuse.

The `kind` metadata still distinguishes `icon`, `arrow`, and `line` inside a
category.

## Register Project Assets

```bash
node scripts/register_shared_icons.cjs \
  --source /project/assets/icons \
  --category generated \
  --collection agent-operations \
  --report /project/semantic-icon-report.json \
  --style "green monochrome outline" \
  --source-type semantic-vector-generated
```

When a report is supplied, register only icons referenced by the scene. Use
`--include-unreferenced` only for an intentionally curated import.

Registration:

- copies the source asset instead of moving it;
- aggregates semantic aliases from every scene use;
- records style, role, kind, provenance, and quality;
- rebuilds `icons/index.json`;
- updates the shared-store count and timestamp.

## Retrieval Order

1. User-selected local library, when explicitly configured.
2. Shared store.
3. Skill-provided built-in seed icons.
4. Generated SVG or transparent image fallback.

Score semantic meaning and page-level style separately. A high visual similarity
must not override a semantic mismatch. A semantic match with a severe style
mismatch should trigger a generated or adapted asset.

## Project Portability

After selection, copy the final asset into the project:

```text
project/
└── assets/
    └── icons/
```

Use project-relative paths in `scene.json`. The shared store is the reusable
source of truth for retrieval, but the project-local copy is the packaging
source for HTML and PPT export.
