# HTML Preview Studio

A sleek, live HTML/CSS/JavaScript editor with instant preview and download capabilities. Inspired by modern code playgrounds, this tool lets you experiment with web development in real-time.

## Features

- **Live Editing**: Edit HTML, CSS, and JavaScript in separate tabs with CodeMirror-powered syntax highlighting and line numbers.
- **Instant Preview**: See changes reflected immediately in the right-hand preview pane.
- **Download ZIP**: Export your current code as a ZIP file containing `index.html`, `styles.css`, and `script.js`.
- **Responsive Design**: Optimized for desktop and mobile viewing.
- **Dark Theme**: Neon-accented dark UI for comfortable coding.

## Getting Started

### Local Development

1. Clone or download the repository.
2. Open a terminal in the project directory.
3. Run a local server:
   ```bash
   python -m http.server 8000
   ```
4. Open `http://localhost:8000` in your browser.

### Online

The project is automatically deployed to GitHub Pages via GitHub Actions on pushes to the `main` branch.

## Usage

- **HTML Tab**: Edit the structure of your web page.
- **CSS Tab**: Style your content with CSS.
- **Script Tab**: Add interactivity with JavaScript.
- **Preview Pane**: View the rendered output in real-time.
- **Download ZIP**: Click to download all files as a ZIP archive.

## Technologies Used

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Editor**: CodeMirror for syntax highlighting
- **Icons**: Custom SVGs
- **Build**: GitHub Actions for deployment
- **Libraries**: JSZip for ZIP generation

## Contributing

Feel free to submit issues or pull requests for improvements.

## License

See [LICENSE](LICENSE) for details.