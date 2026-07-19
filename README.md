# Dev Tools

A fast, installable collection of developer utilities built with plain HTML, CSS, and JavaScript. The dashboard keeps tools searchable, pinnable, and available from one responsive interface.

## Available tools

- Base Converter
- Crypto Generator
- Fake Data Generator
- File Compressor
- HTML Preview
- ID Generator
- JSON Diff
- JSON to TOON / TOON to JSON Converter
- JSON to XML / XML to JSON Converter
- JWT Debugger
- Markdown Editor
- QR Generator
- Regex Tester
- SQL Formatter
- Text Diff
- Unit Converter

## Run locally

```bash
npm ci
npx playwright install chromium
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000`.

## Test

```bash
npm test
```

The test command checks JavaScript syntax and third-party asset integrity, verifies that the generated PWA cache inventory is current, and runs the Playwright regression suite in Chromium.

## Build

```bash
npm run build
```

This regenerates `precache-manifest.js` and creates a deployable `dist/` directory containing only public application assets. GitHub Actions runs the full test suite before publishing that directory to GitHub Pages.

## Progressive Web App

The service worker precaches the dashboard and every local tool asset. Navigations use a network-first strategy so deployments appear promptly, while static assets use stale-while-revalidate for fast repeat visits and offline support. Version-pinned third-party libraries are cached when available.

When adding or removing public files, run `npm run precache` and commit the updated manifest.

## Add a tool

1. Add the tool under `tools/<tool-id>/`.
2. Register it in the `TOOLS` array in `app.js`.
3. Reuse `tools/main.css` and `tools/main.js` for shared styling and accessibility helpers.
4. Add a focused regression test when the tool introduces new behavior.
5. Run `npm run build` and `npm test`.

## Project structure

```text
dev-tools/
├── .github/workflows/     # Pull-request checks and Pages deployment
├── scripts/               # Cache generation, syntax checks, and site build
├── tests/                 # Playwright regression tests
├── tools/                 # Standalone developer utilities
├── app.js                 # Dashboard behavior and tool registry
├── index.html             # Dashboard shell
├── manifest.json          # Web app manifest
├── precache-manifest.js   # Generated offline asset inventory
├── styles.css             # Dashboard styles
└── sw.js                  # Service worker caching strategies
```

## License

This project is licensed under the [MIT License](LICENSE).
