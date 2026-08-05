# Export Modes

## Native Editable

Map scene objects to native PowerPoint objects:

- Text -> text boxes.
- Shapes -> native shapes.
- Lines -> native line shapes with endpoints.
- Icons -> existing glyph/source SVG objects or generated raster PNG image
  objects; unresolved semantic icons must not use a newly hand-drawn SVG fallback.
- Images -> picture objects.

Use this by default. It works offline and allows normal PowerPoint editing.

## Live HTML

Use an Office content add-in to display hosted HTML inside PowerPoint.

Choose only when:

- The organization can deploy or sideload the add-in.
- The HTML can be hosted.
- Network and security requirements are accepted.
- Interactive behavior is more important than ordinary PowerPoint editing.

The HTML is not editable with standard PowerPoint tools. Provide a static fallback for printing, PDF export, and unsupported clients.

## High-Fidelity Raster

Render the confirmed HTML to a full-slide image.

Choose only when:

- Pixel fidelity is the primary requirement.
- PowerPoint editing is not required.
- The user explicitly accepts raster output.

## Hybrid

Use a raster background for complex visual regions while preserving important text, labels, controls, and simple diagrams as native objects.

Choose when a fully native reconstruction is disproportionately expensive but key content must remain editable.

## Round Trip

Do not rely on embedded HTML as the only project source. Keep the scene project in the website or local project directory and associate the PPT with a project identifier or editing link. Regenerate the PPT after web edits.
