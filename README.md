# Visual To Editable PPT

A Codex skill for converting reference images, screenshots, and existing HTML
slides into editable browser scenes and native editable PowerPoint files.

The workflow keeps a structured `scene.json` as the source of truth:

```text
source visual -> scene.json -> Codex editor -> confirmed HTML -> editable PPTX
```

## Capabilities

- Reconstructs text, shapes, icons, images, and connector lines as editable objects.
- Opens a local visual editor inside Codex for review and adjustment.
- Uses a configurable local icon library for icons, lines, and arrows.
- Supports independent corner radii and editable Boolean shape intersections.
- Detects crossing and overlapping lines without flattening them.
- Audits full-slide bounds and rounded-rectangle fidelity.
- Solves repeated-column alignment and parent-child containment constraints.
- Exports confirmed HTML scenes as native editable PowerPoint objects.
- Verifies that the result is not a single full-slide image.

## Install

Clone the repository into your Codex skills directory:

```bash
git clone https://github.com/jacksonqian1/visual-to-editable-ppt.git \
  ~/.codex/skills/visual-to-editable-ppt
```

Restart or refresh Codex so the skill is discovered.

## Usage

Mention the skill and provide a reference image:

```text
$visual-to-editable-ppt Convert this image into an editable page, open it in
Codex for review, and export the confirmed result as PPT.
```

See [SKILL.md](SKILL.md) for the complete workflow and
[references/scene-model.md](references/scene-model.md) for the scene format.

## Repository Layout

- `SKILL.md`: primary Codex skill instructions.
- `assets/editor/`: local browser editor.
- `assets/project-template.json`: scene starter template.
- `references/`: scene, export, geometry, icon, layout, and QA guidance.
- `scripts/`: editor server, audits, geometry tools, HTML generation, and PPT export.

## Notes

- The skill is designed for use inside Codex with its bundled document and
  browser runtimes.
- Configure a local icon-library directory during project initialization.
- Confirm the browser preview before exporting unless immediate export was
  explicitly requested.
