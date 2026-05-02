# JSON ⇄ Toon Converter

A beautiful, modern web application for converting between JSON and Toon format. Built with vanilla JavaScript and featuring a sleek dark theme with smooth animations.

## Features

### Two Conversion Modes
- **JSON → Toon**: Convert standard JSON data into a human-readable Toon format with emoji icons
- **Toon → JSON**: Convert Toon format back to standard JSON

### Toon Format
Toon is a visual, human-friendly data format that uses:
- 📦 Emoji icons for different data types
- 🎯 Clear hierarchical structure with indentation
- ✅ Easy-to-read key-value pairs
- • Bullet points for arrays

### Editor Features
- ✨ Real-time syntax validation
- 🎨 Code beautification
- 📋 Copy/paste support
- 💾 Download converted files
- ↩️ Undo functionality
- 📊 Character count
- 🔢 Line numbers
- 📝 Sample data loading

### JSON-Specific Tools
- 🔤 Change key casing (camelCase, snake_case, PascalCase, kebab-case)
- 📊 Sort JSON keys alphabetically

## Usage

1. Open `index.html` in a modern web browser
2. Select your conversion mode (JSON → Toon or Toon → JSON)
3. Enter or paste your data in the left editor
4. Click the convert button
5. View the converted output in the right editor

## Example

**JSON Input:**
```json
{
  "person": {
    "name": "John Doe",
    "age": 30,
    "hobbies": ["reading", "coding"]
  }
}
```

**Toon Output:**
```
📦 person
  📝 name: John Doe
  🔢 age: 30
  🎯 hobbies
    • reading
    • coding
```

## Technologies
- Pure HTML5
- Vanilla JavaScript (ES6+)
- Modern CSS3 with animations
- No external dependencies

## Browser Support
Works in all modern browsers that support ES6+ JavaScript features.

## License
See LICENSE file for details.

