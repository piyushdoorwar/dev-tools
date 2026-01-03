# Dev Tools

A modern, premium developer utilities dashboard that brings all your essential dev tools together in one sleek interface.

![Dev Tools](https://img.shields.io/badge/version-1.0.0-blue)
![PWA](https://img.shields.io/badge/PWA-enabled-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **Modern UI/UX**: Dark, minimalist design with premium aesthetics
- **Multiple Developer Tools**: Access markdown editors, HTML preview, JWT debuggers, and more
- **Progressive Web App**: Install on any device with offline support
- **Collapsible Sidebar**: Maximize your workspace
- **Search Functionality**: Quickly find the tool you need
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Fast & Lightweight**: Built with vanilla JavaScript for optimal performance

## 🚀 Quick Start

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dev-tools.git
cd dev-tools
```

2. Open `index.html` in your browser or serve with a local server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server
npx http-server
```

3. Visit `http://localhost:8000`

### Install as PWA

1. Open the app in your browser
2. Click the install icon in the address bar
3. Click "Install" in the prompt
4. Access the app from your home screen or applications

## 🛠️ Available Tools

- **Markdown Editor**: Write and preview markdown in real-time
- **HTML Preview**: Test and preview HTML code
- **ID Generator**: Generate unique IDs and UUIDs
- **JWT Debugger**: Decode and debug JSON Web Tokens

## 📁 Project Structure

```
dev-tools/
├── index.html          # Main HTML file
├── app.js             # Application logic
├── styles.css         # Premium modern styling
├── service-worker.js  # Full PWA service worker
├── sw.js             # Simplified service worker
├── manifest.json     # PWA manifest
├── favicon.svg       # App icon
├── LICENSE           # License file
└── README.md         # This file
```

## 🎨 Design Philosophy

The UI/UX features a premium design aesthetic with:

- **Dark Theme**: Easy on the eyes with a sophisticated black background
- **Gradient Accents**: Purple and pink gradients for visual interest
- **Card-Based Layout**: Clean, organized content presentation
- **Smooth Animations**: Delightful micro-interactions
- **Glassmorphism**: Modern blur effects for depth
- **Minimalist Icons**: Clean, simple iconography
- **Yellow CTAs**: High-contrast call-to-action elements

## 🔧 Configuration

### Adding New Tools

Edit `app.js` and add your tool to the `TOOLS` array:

```javascript
{
  id: "your-tool-id",
  name: "Your Tool Name",
  url: `${BASE}your-tool-id/`,
}
```

### Customizing Colors

Edit CSS variables in `styles.css`:

```css
:root {
  --bg: #000000;        /* Background color */
  --purple: #8b5cf6;    /* Primary accent */
  --pink: #ec4899;      /* Secondary accent */
  --yellow: #ffd700;    /* CTA color */
}
```

## 📱 PWA Features

- **Offline Support**: Works without internet connection
- **Install Prompt**: Add to home screen on mobile
- **Caching Strategy**: Smart caching for better performance
- **Background Sync**: Syncs when connection is available

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Tools hosted by [piyushdoorwar](https://github.com/piyushdoorwar)
- Icons from [Feather Icons](https://feathericons.com/)
- Modern design principles for premium user experiences

## 📞 Support

If you have any questions or run into issues, please open an issue on GitHub.

---

Made with ❤️ by developers, for developers
