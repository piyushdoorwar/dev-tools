# Encoder / Decoder

Text encoding in one place: Base64, Base64url, URL percent-encoding, and HTML entities, with a single direction toggle.

## Features
- Four modes — Base64, Base64url (RFC 4648 §5), URL, HTML entities
- Encode/decode toggle plus a swap action that feeds the output back as input
- Base64 line wrapping at 76 characters; Base64url padding kept or stripped
- URL scope switch between `encodeURIComponent` (component) and `encodeURI` (full URL)
- HTML escaping limited to markup characters, or extended to every non-ASCII code point
- Live conversion with explicit error messages for invalid input
- Copy, paste, download, clear, and per-mode samples

## How It Works
- All text is treated as UTF-8, so accented characters and emoji round-trip.
- Base64 decoding ignores whitespace, accepts either alphabet, and tolerates missing padding; it reports when the decoded bytes are not valid UTF-8.
- URL decoding reports malformed percent-encoding instead of throwing.
- Entity decoding resolves named and numeric references and leaves unknown ones untouched.

## Run Locally
Open `index.html` in your browser.

## Files
- `index.html` — markup and layout
- `style.css` — visual styling
- `script.js` — encoding logic + interactions
- `favicon.svg` — animated app favicon
