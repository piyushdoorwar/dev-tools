# JSON ⇄ XML Converter

A premium dark-themed web application for bidirectional conversion between JSON and XML formats. Built with modern web technologies and featuring a sleek, VS Code-inspired interface.

![JSON-XML Converter](https://img.shields.io/badge/JSON-XML-6739B7?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMiAxMkwxMiAyMkwyMiAxMkwxMiAyWiIgc3Ryb2tlPSIjRkZENzAwIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+)

## ✨ Features

### 🔄 **Bidirectional Conversion**
- **JSON → XML**: Convert JSON data to well-formatted XML
- **XML → JSON**: Parse XML and convert to structured JSON
- URL-based mode switching (`#json-xml` or `#xml-json`)
- Dynamic favicon and title updates based on current mode

### 🎨 **Premium Dark Theme**
- Beautiful gradient backgrounds with animated atmospheric effects
- Purple (#6739B7) and Gold (#FFD700) accent colors
- Smooth transitions and hover effects
- Modern glassmorphism design elements

### 📝 **Code Editor Features**
- Line numbers for both editors
- Synchronized scrolling between line numbers and content
- Syntax highlighting-ready
- JetBrains Mono monospace font
- Auto-resizing and character counting

### 🛠️ **JSON Manipulation Tools**
- **Validate**: Check if JSON/XML is well-formed
- **Beautify**: Format with proper indentation
- **Sort Keys**: Alphabetically organize JSON object keys
- **Case Conversion**: Transform keys between different naming conventions
  - camelCase
  - snake_case
  - PascalCase
  - kebab-case
- **Clear**: Empty the editor
- **Copy**: Copy output to clipboard

### 🎯 **User Experience**
- Real-time character counting
- Status messages with success/error indicators
- Tooltips on all action buttons
- Keyboard-friendly interface
- Responsive design for mobile devices

## 🚀 Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/json-xml-converter.git
cd json-xml-converter
```

2. Open `index.html` in your web browser:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Or simply open the file
open index.html  # macOS
start index.html # Windows
xdg-open index.html # Linux
```

### Usage

#### Converting JSON to XML

1. Select **JSON → XML** mode (default)
2. Paste or type your JSON in the left editor
3. Use the action buttons to:
   - Validate your JSON
   - Beautify the formatting
   - Sort keys alphabetically
   - Change key naming convention
4. Click **Convert JSON to XML** button
5. Copy the XML output from the right editor

#### Converting XML to JSON

1. Click **XML → JSON** mode button or visit `index.html#xml-json`
2. Paste or type your XML in the left editor
3. Validate and beautify if needed
4. Click **Convert XML to JSON** button
5. Copy the JSON output from the right editor

## 🎨 Design System

### Color Palette

- **Primary Purple**: `#6739B7` - Interactive elements and hover states
- **Light Purple**: `#8B5CF6` - Active states and gradients
- **Gold/Yellow**: `#FFD700` - Primary CTA and accents
- **Green**: `#00D09C` - Success states
- **Pink**: `#FF6B9D` - Error states

### Typography

- **UI Font**: Inter (400-800 weights)
- **Code Font**: JetBrains Mono
- **Title**: 2rem, weight 800, gradient fill

### Shadows

- Small: `0 2px 8px rgba(0, 0, 0, 0.3)`
- Medium: `0 8px 24px rgba(0, 0, 0, 0.4)`
- Large: `0 16px 48px rgba(0, 0, 0, 0.5)`
- Purple Glow: `0 8px 24px rgba(103, 57, 183, 0.3)`
- Yellow Glow: `0 8px 24px rgba(255, 215, 0, 0.3)`

## 📁 Project Structure

```
json-xml-converter/
├── index.html              # Main HTML file
├── style.css              # Premium dark theme styles
├── script.js              # Conversion logic and UI interactions
├── favicon-json-xml.svg   # Favicon for JSON→XML mode
├── favicon-xml-json.svg   # Favicon for XML→JSON mode
├── README.md              # Documentation
└── LICENSE                # MIT License
```

## 🔧 Technical Details

### JSON to XML Conversion

- Creates valid XML with proper escaping
- Handles nested objects and arrays
- Adds XML declaration header
- Customizable root element name
- Proper indentation with 2 spaces

### XML to JSON Conversion

- Uses DOMParser for validation
- Preserves XML attributes as `@attributes`
- Handles text content as `#text`
- Converts repeated elements to arrays
- Maintains element hierarchy

### Key Transformations

```javascript
// Example transformations
camelCase:   myVariableName
snake_case:  my_variable_name
PascalCase:  MyVariableName
kebab-case:  my-variable-name
```

## 🌐 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Design inspired by modern code editors (VS Code, Sublime Text)
- Color palette based on premium dark themes
- Icons following the Feather Icons style
- Typography using Google Fonts (Inter, JetBrains Mono)

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Made with 💜 and ⚡ by developers, for developers**
