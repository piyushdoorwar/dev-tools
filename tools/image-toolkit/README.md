# Image Toolkit

Three browser-only image workflows over one local pipeline:

- **Convert** — PNG, JPEG, WebP, SVG, and BMP in; PNG, JPEG, or WebP out. The source format is detected from file contents, lossy output has quality and background controls, and images can be re-encoded without standard embedded metadata.
- **Favicons & app icons** — one square image in; every standard size out, plus a multi-resolution `favicon.ico`, a maskable Android icon, `site.webmanifest`, and the markup to paste into `<head>`, packed as a ZIP. Each size is rendered from the original rather than resampled from a larger icon.
- **Optimize SVG** — parse, strip editor metadata, comments and empty groups, round coordinate precision, and re-serialize, with a before/after size report.

The tool intentionally does not offer raster-to-SVG conversion or animated GIF flattening. Metadata removal does not guarantee that an image's origin cannot be inferred from its pixels, watermarks, or external provenance systems.
