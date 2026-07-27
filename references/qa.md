# QA

## Editor

- Canvas dimensions match the source aspect ratio.
- Autosave succeeds after text, icon, image, and line changes.
- Undo and redo restore the expected state.
- Delete removes the selected object.
- Line endpoint handles update `x1`, `y1`, `x2`, and `y2`.
- Source overlay can be toggled and does not export.
- No duplicate element IDs exist.

## Confirmed HTML

- The slide has fixed pixel dimensions.
- Every exported element has `data-ppt`, `data-id`, and `data-name`.
- Text remains in DOM text nodes.
- No text node has `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1`.
- No exported object extends outside the slide.
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
- Complex placeholders remain clearly replaceable objects.

## Delivery

- Deliver the final PPTX, not scratch files.
- Mention any placeholders or non-editable raster regions.
- Report validation limitations when the platform renderer is unavailable.
