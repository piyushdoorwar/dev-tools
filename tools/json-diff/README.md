# JSON Diff Studio

A sleek, desktop-optimized web application for comparing JSON documents with intelligent diff highlighting and formatting tools.

## Features

- **Dual JSON Editors**: Paste or type JSON in two side-by-side CodeMirror editors with line numbers
- **Smart Formatting**: Beautify JSON with customizable indentation (spaces or tabs)
- **Intelligent Diffing**: Compare JSON objects and highlight differences:
  - 🔴 **Missing values** (red)
  - 🟢 **Added values** (green)
  - 🔵 **Minor/time-based changes** (blue)
  - 🟠 **Structural updates** (orange)
- **Code Editor Features**: Syntax highlighting, auto-close brackets, bracket matching, and line wrapping
- **Responsive Design**: Optimized for desktop screens with a modern dark theme
- **Inline Diff Highlighting**: Highlights missing, added, minor/time-based, and structural changes directly inside the two editors


## Usage

1. Open `index.html` in your web browser
2. Paste your original JSON in the left editor
3. Paste the modified JSON in the right editor
4. Use the "Format" buttons to beautify individual editors or "Beautify both" for both
5. Adjust indentation settings as needed (size and type)
6. The comparison updates automatically as you type or paste in either editor

## Project Structure

```
json-diff/
├── index.html      # Main HTML file
├── styles.css      # CSS styles
├── script.js       # JavaScript functionality
└── README.md       # This file
```

## Development

This is a static web application with no build process required. Simply open `index.html` in any modern web browser.

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd json-diff

# Open in browser
open index.html
```

## Deployment

This project can be easily deployed to GitHub Pages for free hosting.

### GitHub Pages Setup

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose the **main** branch and **/(root)** folder
5. Click **Save**
6. Your site will be available at `https://[username].github.io/[repository-name]/`

The deployment is automatic - any push to the main branch will update the live site.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

MIT License - see LICENSE file for details