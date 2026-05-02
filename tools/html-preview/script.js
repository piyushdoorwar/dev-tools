const iframe = document.getElementById("preview-iframe");
const tabs = document.querySelectorAll(".tab-button");
let updateTimer = null;
let htmlEditor, cssEditor, scriptEditor;
let isLightMode = false;

// Resizer functionality
const resizer = document.querySelector('.resizer');
const editorPanel = document.querySelector('.editor-panel');
const previewPanel = document.querySelector('.preview-panel');
let isResizing = false;

if (resizer) {
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const containerRect = document.querySelector('.panels').getBoundingClientRect();
    const offsetX = e.clientX - containerRect.left;
    const totalWidth = containerRect.width;
    const editorWidth = (offsetX / totalWidth) * 100;
    const previewWidth = 100 - editorWidth;

    // Set minimum widths (25% each)
    if (editorWidth >= 25 && previewWidth >= 25) {
      editorPanel.style.flex = `0 0 ${editorWidth}%`;
      previewPanel.style.flex = `0 0 ${previewWidth}%`;
      
      // Refresh CodeMirror to prevent display issues
      if (htmlEditor) htmlEditor.refresh();
      if (cssEditor) cssEditor.refresh();
      if (scriptEditor) scriptEditor.refresh();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function composePreview() {
  const html = htmlEditor.getValue();
  const css = cssEditor.getValue();
  const script = scriptEditor.getValue();
  const bodyClass = isLightMode ? ' class="light-mode"' : '';
  const scrollbarStyles = `
    ::-webkit-scrollbar { width: 12px; height: 12px; }
    ::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 10px; }
    ::-webkit-scrollbar-thumb { background: linear-gradient(135deg, #8B5CF6, #6739B7); border-radius: 10px; border: 2px solid #1a1a1a; }
    ::-webkit-scrollbar-thumb:hover { background: linear-gradient(135deg, #A78BFA, #8B5CF6); }
  `;
  // Escape closing script tag to prevent parsing issues
  const escapedScript = script.replace(/<\/script>/gi, '<\\/script>');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${scrollbarStyles}${css}</style></head><body${bodyClass}>${html}<script>${escapedScript}<\/script></body></html>`;
}

function refreshPreview() {
  iframe.srcdoc = composePreview();
}

function scheduleRefresh() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    refreshPreview();
  }, 200);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((btn) => btn.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.target;
    
    // Update language label
    const languageLabel = document.getElementById('language-label');
    if (target === 'html') {
      languageLabel.textContent = '.html';
    } else if (target === 'css') {
      languageLabel.textContent = '.css';
    } else if (target === 'script') {
      languageLabel.textContent = '.js';
    }
    
    htmlEditor.getWrapperElement().style.display = target === 'html' ? 'block' : 'none';
    cssEditor.getWrapperElement().style.display = target === 'css' ? 'block' : 'none';
    scriptEditor.getWrapperElement().style.display = target === 'script' ? 'block' : 'none';
    
    // Refresh the active editor to ensure content displays properly
    if (target === 'html') htmlEditor.refresh();
    else if (target === 'css') cssEditor.refresh();
    else if (target === 'script') scriptEditor.refresh();
  });
});

// Initialize editors
htmlEditor = CodeMirror.fromTextArea(document.getElementById('html'), {
  mode: 'htmlmixed',
  theme: 'dracula',
  lineNumbers: true,
  lineWrapping: true,
  styleActiveLine: true,
  matchBrackets: true,
});

cssEditor = CodeMirror.fromTextArea(document.getElementById('css'), {
  mode: 'css',
  theme: 'dracula',
  lineNumbers: true,
  lineWrapping: true,
  styleActiveLine: true,
  matchBrackets: true,
});

scriptEditor = CodeMirror.fromTextArea(document.getElementById('script'), {
  mode: 'javascript',
  theme: 'dracula',
  lineNumbers: true,
  lineWrapping: true,
  styleActiveLine: true,
  matchBrackets: true,
});

// Initially show html
cssEditor.getWrapperElement().style.display = 'none';
scriptEditor.getWrapperElement().style.display = 'none';

// Attach change listeners
htmlEditor.on('change', scheduleRefresh);
cssEditor.on('change', scheduleRefresh);
scriptEditor.on('change', scheduleRefresh);

function downloadZip() {
  const zip = new JSZip();
  zip.file('index.html', htmlEditor.getValue());
  zip.file('styles.css', cssEditor.getValue());
  zip.file('script.js', scriptEditor.getValue());
  zip.generateAsync({ type: 'blob' }).then(function(content) {
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'html-preview.zip';
    a.click();
    URL.revokeObjectURL(url);
  });
}

const downloadZipBtn = document.getElementById('download-zip');
downloadZipBtn.addEventListener('click', downloadZip);

// Get current active editor
function getCurrentEditor() {
  const activeTab = document.querySelector('.tab-button.active');
  const target = activeTab.dataset.target;
  if (target === 'html') return htmlEditor;
  if (target === 'css') return cssEditor;
  if (target === 'script') return scriptEditor;
  return htmlEditor;
}

// Toast notification function
function showToast(message) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Copy button functionality
const copyBtn = document.getElementById('copy-btn');
copyBtn.addEventListener('click', async () => {
  const editor = getCurrentEditor();
  const code = editor.getValue();
  try {
    await navigator.clipboard.writeText(code);
    copyBtn.style.color = '#FFD700';
    showToast('Text copied');
    setTimeout(() => {
      copyBtn.style.color = '';
    }, 1000);
  } catch (err) {
    console.error('Failed to copy:', err);
    showToast('Failed to copy');
  }
});

// Paste button functionality
const pasteBtn = document.getElementById('paste-btn');
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const editor = getCurrentEditor();
    editor.setValue(text);
    pasteBtn.style.color = '#FFD700';
    showToast('Pasted from clipboard');
    setTimeout(() => {
      pasteBtn.style.color = '';
    }, 1000);
  } catch (err) {
    console.error('Failed to paste:', err);
    showToast('Failed to paste');
  }
});

// Load Sample button functionality
const loadSampleBtn = document.getElementById('load-sample-btn');
loadSampleBtn.addEventListener('click', () => {
  const sampleHTML = `<div class="app-container">
  <header class="hero-section">
    <h1><span class="title-yellow">Premium</span> <span class="title-purple">Design</span></h1>
    <p class="subtitle">Experience the power of modern web development with our cutting-edge editor</p>
  </header>

  <section class="feature-grid">
    <div class="feature-card">
      <div class="card-icon">⚡</div>
      <h3>Lightning Fast</h3>
      <p>Real-time preview updates as you type. No delays, no waiting.</p>
    </div>

    <div class="feature-card">
      <div class="card-icon">🎨</div>
      <h3>Beautiful UI</h3>
      <p>Premium dark theme with purple and gold accents for a stunning look.</p>
    </div>

    <div class="feature-card">
      <div class="card-icon">🚀</div>
      <h3>Production Ready</h3>
      <p>Export and deploy your work instantly with one click.</p>
    </div>
  </section>

  <div class="action-bar">
    <button class="btn-primary" onclick="handlePrimaryAction()">Get Started</button>
    <button class="btn-secondary" onclick="handleSecondaryAction()">Learn More</button>
  </div>

  <div class="code-showcase">
    <div class="code-header">
      <span class="code-label">JAVASCRIPT</span>
    </div>
    <pre><code>function createAwesome() {
  return 'Built with ❤️';
}</code></pre>
  </div>

  <div id="notification" class="notification"></div>
</div>`;

  const sampleCSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0d0d0d;
  color: #ffffff;
  padding: 3rem 2rem;
  line-height: 1.6;
  transition: all 0.3s ease;
  -webkit-font-smoothing: antialiased;
}

body.light-mode {
  background: #ffffff;
  color: #1a1a1a;
}

.app-container {
  max-width: 1000px;
  margin: 0 auto;
}

.hero-section {
  text-align: center;
  margin-bottom: 4rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.hero-section h1 {
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.title-yellow {
  color: #FFD700;
  text-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
}

.title-purple {
  background: linear-gradient(135deg, #8B5CF6, #6739B7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

body.light-mode .title-yellow {
  color: #FFC700;
  text-shadow: none;
}

.subtitle {
  font-size: 1.15rem;
  color: #B8B8B8;
  max-width: 600px;
  margin: 0 auto;
}

body.light-mode .subtitle {
  color: #666;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.feature-card {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  padding: 2rem;
  text-align: center;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent);
}

body.light-mode .feature-card {
  background: #f8f8f8;
  border-color: #e0e0e0;
}

.feature-card:hover {
  transform: translateY(-8px);
  border-color: rgba(103, 57, 183, 0.3);
  box-shadow: 0 20px 60px rgba(103, 57, 183, 0.3);
}

.card-icon {
  font-size: 3rem;
  margin-bottom: 1.25rem;
}

.feature-card h3 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #ffffff;
}

body.light-mode .feature-card h3 {
  color: #1a1a1a;
}

.feature-card p {
  color: #B8B8B8;
  font-size: 0.95rem;
  line-height: 1.6;
}

body.light-mode .feature-card p {
  color: #666;
}

.action-bar {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 3rem;
  flex-wrap: wrap;
}

button {
  padding: 1rem 2rem;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-primary {
  background: linear-gradient(135deg, #FFD700, #FFC700);
  color: #0d0d0d;
  box-shadow: 0 8px 24px rgba(255, 215, 0, 0.3);
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(255, 215, 0, 0.5);
}

.btn-primary:active {
  transform: translateY(-1px) scale(0.98);
}

.btn-secondary {
  background: transparent;
  color: #B8B8B8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: #6739B7;
  border-color: #6739B7;
  color: #ffffff;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(103, 57, 183, 0.3);
}

body.light-mode .btn-secondary {
  color: #666;
  border-color: #e0e0e0;
}

.code-showcase {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(103, 57, 183, 0.3);
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.code-header {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid rgba(103, 57, 183, 0.2);
  display: flex;
  justify-content: flex-end;
}

.code-label {
  background: linear-gradient(135deg, #FFD700, #FFC700);
  color: #0d0d0d;
  padding: 0.4rem 1rem;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
}

.code-showcase pre {
  padding: 1.5rem;
  margin: 0;
  overflow-x: auto;
}

.code-showcase code {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #8B5CF6;
}

.notification {
  margin-top: 2rem;
  padding: 1.25rem;
  border-radius: 12px;
  text-align: center;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.3s ease;
  transform: translateY(10px);
}

.notification.show {
  opacity: 1;
  transform: translateY(0);
  background: linear-gradient(135deg, rgba(103, 57, 183, 0.2), rgba(139, 92, 246, 0.2));
  border: 1px solid rgba(103, 57, 183, 0.3);
  color: #FFD700;
}

body.light-mode .notification.show {
  background: linear-gradient(135deg, rgba(103, 57, 183, 0.1), rgba(139, 92, 246, 0.1));
  border-color: rgba(103, 57, 183, 0.2);
  color: #6739B7;
}

@media (max-width: 768px) {
  .hero-section h1 {
    font-size: 2.5rem;
  }
  
  .feature-grid {
    grid-template-columns: 1fr;
  }
}`;

  const sampleJS = `// Show notification with message
function showNotification(message) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Primary action handler
function handlePrimaryAction() {
  const messages = [
    '✨ Welcome aboard! Lets build something amazing!',
    '🚀 Ready to launch your creativity!',
    '🎉 Exciting journey ahead!',
    '⚡ Powered up and ready to go!',
    '🎨 Your canvas awaits!'
  ];
  
  const randomMsg = messages[Math.floor(Math.random() * messages.length)];
  showNotification(randomMsg);
}

// Secondary action handler
function handleSecondaryAction() {
  showNotification('📚 Explore our comprehensive documentation!');
}

// Animate feature cards on load
function animateCards() {
  const cards = document.querySelectorAll('.feature-card');
  
  cards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    
    setTimeout(() => {
      card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 150 * (index + 1));
  });
}

// Initialize animations when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', animateCards);
} else {
  animateCards();
}

// Add parallax effect to hero
const hero = document.querySelector('.hero-section');
if (hero) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 10;
    const y = (e.clientY / window.innerHeight - 0.5) * 10;
    hero.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  });
}`;

  htmlEditor.setValue(sampleHTML);
  cssEditor.setValue(sampleCSS);
  scriptEditor.setValue(sampleJS);
  
  // Refresh all editors to ensure content displays
  htmlEditor.refresh();
  cssEditor.refresh();
  scriptEditor.refresh();
  
  loadSampleBtn.style.color = '#FFD700';
  showToast('Sample code loaded');
  setTimeout(() => {
    loadSampleBtn.style.color = '';
  }, 1000);
});

// Clear button functionality
const clearBtn = document.getElementById('clear-btn');
clearBtn.addEventListener('click', () => {
  const editor = getCurrentEditor();
  editor.setValue('');
  clearBtn.style.color = '#FFD700';
  showToast('Cleared');
  setTimeout(() => {
    clearBtn.style.color = '';
  }, 1000);
});

// Undo button functionality
const undoBtn = document.getElementById('undo-btn');
undoBtn.addEventListener('click', () => {
  const editor = getCurrentEditor();
  editor.undo();
  undoBtn.style.color = '#FFD700';
  showToast('Changes undone');
  setTimeout(() => {
    undoBtn.style.color = '';
  }, 1000);
});

// Theme toggle for preview only
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle.querySelector('.sun-icon');
const moonIcon = themeToggle.querySelector('.moon-icon');

themeToggle.addEventListener('click', () => {
  isLightMode = !isLightMode;
  
  // Toggle icons
  sunIcon.classList.toggle('hidden');
  moonIcon.classList.toggle('hidden');
  
  // Refresh preview with new theme
  refreshPreview();
  
  // Show toast
  showToast(isLightMode ? 'Light mode enabled' : 'Dark mode enabled');
});

refreshPreview();
