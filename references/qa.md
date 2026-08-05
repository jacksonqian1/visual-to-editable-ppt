# QA

## Editor

- Canvas dimensions match the source aspect ratio.
- Autosave succeeds after text, icon, image, and line changes.
- Undo and redo restore the expected state.
- Delete removes the selected object.
- Line endpoint handles update `x1`, `y1`, `x2`, and `y2`.
- Source overlay can be toggled and does not export.
- No duplicate element IDs exist.
- No same-bounds shapes unintentionally own the same visible stroke.

## Confirmed HTML

- The slide has fixed pixel dimensions.
- Every exported element has `data-ppt`, `data-id`, and `data-name`.
- Text remains in DOM text nodes.
- No text node has `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1`.
- No exported object extends outside the slide.
- Every screenshot-extracted icon has `mayBeClipped: false`, no active edge-risk
  side, and a visual comparison against the source at 200–400% zoom.
- `duplicateBorders` is empty or every reported pair is explicitly justified.
- Line endpoint attributes match the scene.
- The page renders without external network dependencies unless explicitly allowed.

## PowerPoint

- Slide count and dimensions are correct.
- Key strings are present in text boxes.
- Native-editable output contains multiple shapes and text boxes.
- Native-editable output is not dominated by one full-slide image.
- Lines preserve direction and arrowheads.
- Rotated objects preserve their angle.
- No object extends outside the slide.
- Rendered output has no unintended clipping, wrapping, overlap, or missing fonts.
- An edge-aligned band and clipping mask export without a visible outline, and
  the parent panel has exactly one visible outer border.
- Generated semantic PNG icons have validated alpha, transparent corners,
  consistent 10–14% safe-area padding, no visible pixels touching the asset
  boundary, no chroma-key fringe, and no accidental background box.
- Source-extracted icons retain closed outlines and small extremities such as
  antennae, side nodes, handles, speech-bubble tails, and microphone bases.
- Every `fit: contain` image preserves its intrinsic aspect ratio in the PPT;
  compare the HTML and rendered PPT icon silhouettes, not just their boxes.
- Every `fit: cover` image remains proportionally cropped rather than stretched.
- Export fails rather than silently stretching or omitting an image whose
  intrinsic dimensions could not be loaded, whose layout box is empty/off-slide,
  whose fit is unsupported, or whose source is still remote.
- Complex placeholders remain clearly replaceable objects.

## Delivery

- Deliver the final PPTX, not scratch files.
- Mention any placeholders or non-editable raster regions.
- Report validation limitations when the platform renderer is unavailable.
