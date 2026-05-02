# Codex Project Guide

## Purpose
This repo is a small, client-side web app for generating and decoding identifier formats in the browser. It is a static site with no build step, no framework, and no backend.

Primary user flows:
- Generate one or many IDs.
- Switch between supported ID formats.
- Copy, download, clear, and manually edit generated output.
- Decode pasted UUIDs and ULIDs into human-readable metadata.

## Stack
- `index.html`: single-page app markup and UI structure.
- `styles.css`: all visual design, layout, responsive rules, and interaction styling.
- `scripts.js`: all behavior, generation logic, decoding logic, dropdown behavior, clipboard actions, and toast notifications.
- `favicon.svg`: site icon.

## Architecture
The app is intentionally simple:
- HTML defines two side-by-side panels: generator on the left and decoder on the right.
- CSS provides a premium dark theme with purple/yellow accents, soft glow, glassy panels, and responsive stacking below `900px`.
- JavaScript is plain DOM code with module-free global functions and browser APIs like `crypto`, `crypto.subtle`, `TextEncoder`, `Blob`, and `navigator.clipboard`.

There is no state library. UI state lives in DOM values plus a few script-level variables:
- `caseMode`
- `caseLocked`
- `lastTimestamp`
- `lastTimeBytes`
- `objectIdCounter`

## Supported ID Types
Generation supports:
- UUID v1
- UUID v3
- UUID v4
- UUID v5
- UUID v7
- ULID
- Object ID
- Nano ID

Decoding currently supports:
- UUIDs matching versions `1-7`
- ULIDs

Decoding does not currently support:
- Object ID
- Nano ID

## UI Structure
### Generator panel
Main elements:
- Custom dropdown backed by a hidden native `<select>` for ID type.
- Count input capped to `1..1000`.
- Conditional hash inputs for UUID v3 and UUID v5:
  - namespace
  - name
- Editable output area using a `contenteditable` div.
- Toolbar actions:
  - case toggle
  - download
  - copy
  - clear

### Decoder panel
Main elements:
- Free-text input for pasted value.
- Actions for clipboard paste, sample generation, and clear.
- Read-only decoded fields:
  - standard
  - raw
  - version
  - variant
  - time

## Behavior Summary
### Generation flow
`generateIds()` reads the selected ID type and count, generates values in a loop, applies output casing, then writes newline-separated results into the output area.

Important details:
- UUID v4 uses `crypto.randomUUID()`.
- UUID v5 uses async SHA-1 via `crypto.subtle.digest`.
- UUID v3 uses a custom in-file MD5 implementation.
- ULID generation keeps same-millisecond values monotonic by incrementing the random bytes.
- Object ID uses:
  - 4-byte Unix timestamp in seconds
  - 5 random bytes
  - 3-byte counter
- Nano ID uses a fixed 64-character alphabet and bitmasking with `b & 63`.

### Decode flow
`decodeValue()` validates the input against UUID and ULID regexes, normalizes the value, then fills the read-only fields.

UUID decoding:
- Converts canonical UUID text into bytes.
- Shows normalized lowercase standard form.
- Shows raw bytes as colon-separated hex.
- Infers version from the version nibble.
- Always labels the variant as standard RFC/DCE style.
- Extracts timestamps for:
  - UUID v1
  - UUID v7

ULID decoding:
- Uppercases the input.
- Decodes Crockford Base32 into 16 bytes.
- Reads the first 48 bits as a millisecond timestamp.

### Case behavior
- Default output case is lowercase.
- ULID switches output to uppercase when selected.
- UUID v3 and UUID v5 lock the case toggle to lowercase.
- Switching case rewrites the current output area contents.

## File-Specific Notes
### `index.html`
- Holds the full UI and all interaction hooks via `id` and `data-field` attributes.
- The app includes a Cloudflare Web Analytics script at the bottom.
- The decoder currently renders only five fields.

### `scripts.js`
- Central behavior file with direct DOM querying at the top.
- Helper functions are grouped informally rather than split into modules.
- Several utilities are reused across generation and decoding:
  - `hexToBytes`
  - `formatRaw`
  - `bytesToUuid`
  - ULID base32 encode/decode helpers

### `styles.css`
- Defines the entire design language with CSS custom properties in `:root`.
- Uses a dark visual system with animated radial gradients and elevated panels.
- Mobile behavior mainly relies on grid collapse and tighter padding.

## Important Constraints For Future Changes
- Keep this repo framework-free unless explicitly asked to add tooling.
- Prefer browser-native APIs over third-party libraries.
- Preserve the current single-page structure unless the request is explicitly architectural.
- Match the existing visual direction: dark, premium, high-contrast, polished.
- Keep controls keyboard-usable and avoid breaking ARIA attributes already in place.
- If adding a new ID type, update both the dropdown UI and generation switch together.
- If adding decoder support for a new format, also add UI fields only if the metadata deserves a visible slot.

## Known Quirks And Risks
- `scripts.js` still writes `clock` and `node` decoded fields, but `index.html` no longer renders those fields. This is harmless but stale.
- The decoder only understands UUID and ULID, even though the generator supports more types.
- The sample button always loads a random UUID v4, not a sample for the currently selected type.
- Namespace handling for UUID v3/v5 sanitizes and left-pads input instead of validating strict UUID namespace correctness.
- The output area is editable, so generated values can be manually changed before copy/download.

## Good Prompt Context For Future Codex Requests
Use these assumptions unless a prompt says otherwise:
- This is a static browser app with vanilla HTML, CSS, and JavaScript.
- There is no package manager, test runner, or build pipeline in the repo today.
- Changes should usually be small and localized across `index.html`, `styles.css`, and `scripts.js`.
- New features should feel native to the current UI rather than bolted on.
- Any new decode fields should be reflected in both HTML and JS together.

## Example Prompt Starters
- "Add decode support for MongoDB ObjectId while preserving the current UI style."
- "Refactor `scripts.js` for readability without changing behavior or adding build tooling."
- "Make the custom dropdown fully keyboard navigable while keeping the same design."
- "Add validation messaging for UUID v3/v5 namespace input using the existing toast pattern."
- "Add tests only if you also introduce a lightweight browser-safe setup; otherwise keep this repo dependency-free."
