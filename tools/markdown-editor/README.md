# Markdown Editor

A modern, feature-rich markdown editor with live preview and an elegant dark theme.

## Features

- **Live Preview**: See your markdown rendered instantly as you type
- **Line Numbers**: Professional code editor with synchronized line numbering
- **Comprehensive Toolbar**: Quick access to all markdown formatting options
  - File operations: Undo, Copy, Paste, Download
  - Text formatting: Headings, Font Family (dropdown selector), Bold, Italic, Underline, Strikethrough
  - Text highlighting: Color picker for highlighting text with custom colors
  - Code blocks: Inline code and code blocks
  - Content insertion: Quotes, Lists, Tables (with custom rows/cols/alignment), Links, Images
  - Special elements: Horizontal rules, HTML comments
- **Interactive Table Builder**: Prompts for rows, columns, and text alignment before inserting
- **Resizable Panels**: Drag the divider to adjust editor/preview split
- **Custom Scrollbars**: Stylish gradient scrollbars matching the theme
- **Full-Height Layout**: Maximizes workspace on desktop screens
- **Dark Theme**: Beautiful gradient background with glassy panels

## Usage

Simply open `index.html` in a modern web browser. No build process or dependencies required.

### Keyboard Shortcuts

- `Ctrl+B` / `Cmd+B` - Bold
- `Ctrl+I` / `Cmd+I` - Italic
- `Ctrl+Z` / `Cmd+Z` - Undo
- `Ctrl+Y` / `Cmd+Y` - Redo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` - Redo

### Features Detail

**Selection-Based Actions**: Some actions like Strikethrough, Link, and Comment require text to be selected first. These buttons will be disabled until you select text.

**Download**: Export your markdown as a `.md` file with one click.

**Resizable Panels**: Drag the vertical divider between editor and preview to customize your workspace layout (20-80% range).

## Technologies

- HTML5
- CSS3 (Custom Properties, Flexbox, Custom Scrollbars)
- Vanilla JavaScript
- [Marked.js](https://marked.js.org/) for markdown parsing

## License

See LICENSE file for details.

