# Image cell thumbnail regression fix

## Goal

Keep both the `画面` and `参考` image fields inside a bounded storyboard cell after upload. A source image must never enlarge the row.

## Behaviour

- Image cells use a fixed thumbnail area with `object-fit: cover`.
- `画面` and `参考` each support up to five images, arranged vertically.
- A row grows only according to the configured thumbnail stack, never according to source-image dimensions.
- Clicking a thumbnail remains the route for viewing a larger image.

## Implementation

Use the same bounded thumbnail layout for one-image and multi-image image cells. Remove any height inheritance that lets a single reference image fill the table cell. Add regression coverage for both `画面` and `参考` cells.

## Verification

Render uploaded frame and reference images in tests and assert the bounded thumbnail class and image fit rules. Run the full test suite and production build.
