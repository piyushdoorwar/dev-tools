const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const lineNumbers = document.getElementById('line-numbers');
const resizer = document.getElementById('resizer');

let history = [];
let historyIndex = -1;
let isResizing = false;
let isUndoRedoAction = false;

const initialMarkdown = `# Markdown Editor Guide

Welcome! This editor supports **all standard markdown features** with live preview.

## Text Formatting

You can make text **bold**, *italic*, ***bold and italic***, ~~strikethrough~~, or use <u>underline</u>.

Inline code can be formatted like this: \`const greeting = "Hello World"\`

## Code Blocks

Support for syntax highlighting across multiple languages:

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
\`\`\`

## Lists & Tasks

### Unordered Lists
- Design beautiful interfaces
- Write clean code
- Ship quality products

### Ordered Lists
1. Plan your project
2. Build the features
3. Test thoroughly
4. Deploy to production

### Task Lists
- [x] Create markdown editor
- [x] Add live preview
- [ ] Implement export features
- [ ] Add theme customization

## Tables

Create structured data with tables:

| Feature | Status | Priority |
| :--- | :---: | ---: |
| Live Preview | ✅ Complete | High |
| Code Blocks | ✅ Complete | High |
| Tables | ✅ Complete | Medium |
| Image Upload | ✅ Complete | Medium |
| Export | 🔄 In Progress | Low |

## Links & Quotes

Check out the [Markdown Guide](https://www.markdownguide.org/) for more information.

> "The best way to predict the future is to invent it."
> — Alan Kay

## Additional Elements

### Horizontal Rule

---

### HTML Elements

You can use <span style="color: #2de3ff;">custom colors</span> and other HTML when needed.

<!-- This is a comment and won't appear in the preview -->

## Ready to Start?

Clear this content and start writing your own markdown! Use the toolbar above for quick formatting.
`;

editor.value = '';

const saveToHistory = () => {
  if (isUndoRedoAction) {
    isUndoRedoAction = false;
    return;
  }
  
  const current = editor.value;
  if (historyIndex === -1 || history[historyIndex] !== current) {
    history = history.slice(0, historyIndex + 1);
    history.push(current);
    historyIndex++;
    if (history.length > 100) {
      history.shift();
      historyIndex--;
    }
  }
};

saveToHistory();

const updateLineNumbers = () => {
  const lines = editor.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
};

const render = () => {
  const markdown = editor.value;
  
  // Configure marked to use highlight.js
  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {}
      }
      return code;
    },
    langPrefix: 'hljs language-'
  });
  
  preview.innerHTML = marked.parse(markdown);
  
  // Add language labels to code blocks
  preview.querySelectorAll('pre code').forEach((block) => {
    const pre = block.parentElement;
    const lang = block.className.match(/language-(\w+)/);
    
    if (lang && lang[1]) {
      // Remove existing label if any
      const existingLabel = pre.querySelector('.code-language-label');
      if (existingLabel) existingLabel.remove();
      
      // Add language label
      const label = document.createElement('span');
      label.className = 'code-language-label';
      label.textContent = lang[1];
      pre.insertBefore(label, block);
    }
  });
};

const updateButtonStates = () => {
  const hasSelection = editor.selectionStart !== editor.selectionEnd;
  
  // Update buttons
  document.querySelectorAll('.toolbar-btn[data-requires-selection]').forEach(btn => {
    btn.disabled = !hasSelection;
    if (!hasSelection) {
      btn.dataset.tooltip = btn.dataset.tooltip.split(' (')[0] + ' (Select text first)';
    } else {
      btn.dataset.tooltip = btn.dataset.tooltip.split(' (')[0];
    }
  });
  
  // Update selects
  document.querySelectorAll('.toolbar-select[data-requires-selection]').forEach(select => {
    select.disabled = !hasSelection;
    const baseTooltip = select.dataset.tooltip.split(' (')[0];
    if (!hasSelection) {
      select.dataset.tooltip = baseTooltip + ' (Select text first)';
    } else {
      select.dataset.tooltip = baseTooltip;
    }
  });
  
  // Update color pickers
  document.querySelectorAll('.toolbar-color[data-requires-selection]').forEach(colorPicker => {
    colorPicker.disabled = !hasSelection;
    const baseTooltip = colorPicker.dataset.tooltip.split(' (')[0];
    if (!hasSelection) {
      colorPicker.dataset.tooltip = baseTooltip + ' (Select text first)';
    } else {
      colorPicker.dataset.tooltip = baseTooltip;
    }
  });
};

// Toolbar actions
const insertAtCursor = (before, after = '', placeholder = '') => {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end);
  const text = selectedText || placeholder;
  
  const replacement = before + text + after;
  editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
  
  // Set cursor position
  if (selectedText) {
    editor.selectionStart = start;
    editor.selectionEnd = start + replacement.length;
  } else {
    const cursorPos = start + before.length + text.length;
    editor.selectionStart = cursorPos;
    editor.selectionEnd = cursorPos - after.length;
  }
  
  editor.focus();
  saveToHistory();
  updateLineNumbers();
  render();
};

const insertAtLine = (text) => {
  const start = editor.selectionStart;
  const beforeCursor = editor.value.substring(0, start);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  
  editor.value = editor.value.substring(0, lineStart) + text + editor.value.substring(lineStart);
  editor.selectionStart = editor.selectionEnd = lineStart + text.length;
  editor.focus();
  saveToHistory();
  updateLineNumbers();
  render();
};

const actions = {
  undo: () => {
    if (historyIndex > 0) {
      isUndoRedoAction = true;
      historyIndex--;
      editor.value = history[historyIndex];
      updateLineNumbers();
      render();
      updateButtonStates();
    }
  },
  redo: () => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction = true;
      historyIndex++;
      editor.value = history[historyIndex];
      updateLineNumbers();
      render();
      updateButtonStates();
    }
  },
  copy: async () => {
    try {
      await navigator.clipboard.writeText(editor.value);
    } catch (err) {
      editor.select();
      document.execCommand('copy');
    }
  },
  paste: async () => {
    try {
      const text = await navigator.clipboard.readText();
      const start = editor.selectionStart;
      editor.value = editor.value.substring(0, start) + text + editor.value.substring(editor.selectionEnd);
      editor.selectionStart = editor.selectionEnd = start + text.length;
      saveToHistory();
      updateLineNumbers();
      render();
    } catch (err) {
      console.log('Paste from clipboard not available, use Ctrl+V');
    }
  },
  download: () => {
    const blob = new Blob([editor.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markdown.md';
    a.click();
    URL.revokeObjectURL(url);
  },
  loadSample: () => {
    editor.value = initialMarkdown;
    saveToHistory();
    updateLineNumbers();
    render();
  },
  heading: () => insertAtLine('## '),
  fontcolor: (color) => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    if (selectedText && color) {
      insertAtCursor(`<span style="color: ${color};">`, '</span>');
    }
  },
  bold: () => insertAtCursor('**', '**', 'bold text'),
  italic: () => insertAtCursor('*', '*', 'italic text'),
  underline: () => insertAtCursor('<u>', '</u>', 'underlined text'),
  strikethrough: () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    if (selectedText) {
      insertAtCursor('~~', '~~');
    }
  },
  code: () => insertAtCursor('`', '`', 'code'),
  codeblock: () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    
    // Store selection for later use
    window.codeBlockSelection = { start, end, selectedText };
    
    // Pre-fill code content with selected text
    document.getElementById('codeContent').value = selectedText;
    document.getElementById('codeLanguage').value = '';
    
    openModal('codeBlockModal');
  },
  quote: () => insertAtLine('> '),
  ul: () => insertAtLine('- '),
  ol: () => insertAtLine('1. '),
  task: () => insertAtLine('- [ ] '),
  link: () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    
    // Store selection for later use
    window.linkSelection = { start, end, selectedText };
    
    // Pre-fill the link text with selected text
    document.getElementById('linkText').value = selectedText;
    document.getElementById('linkUrl').value = '';
    
    openModal('linkModal');
  },
  image: () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    
    // Store selection for later use
    window.imageSelection = { start, end, selectedText };
    
    // Pre-fill alt text with selected text
    document.getElementById('imageAlt').value = selectedText;
    document.getElementById('imageUrl').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    
    openModal('imageModal');
  },
  table: () => {
    openModal('tableModal');
  },
  hr: () => insertAtCursor('\n---\n', '', ''),
  comment: () => {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    if (selectedText) {
      insertAtCursor('<!-- ', ' -->');
    }
  }
};

// Attach toolbar button listeners
document.querySelectorAll('.toolbar-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const action = btn.dataset.action;
    if (actions[action]) {
      actions[action]();
    }
  });
});

// Attach select listeners
document.querySelectorAll('.toolbar-select').forEach(select => {
  select.addEventListener('change', (e) => {
    const action = select.dataset.action;
    const value = select.value;
    if (actions[action] && value) {
      // Save selection before action
      const savedStart = editor.selectionStart;
      const savedEnd = editor.selectionEnd;
      
      actions[action](value);
      
      // Restore selection after action
      setTimeout(() => {
        editor.focus();
        editor.setSelectionRange(savedStart, savedEnd);
      }, 0);
      
      select.value = ''; // Reset to default
    }
  });
});

// Attach color picker listeners
document.querySelectorAll('.toolbar-color').forEach(colorPicker => {
  colorPicker.addEventListener('change', (e) => {
    const action = colorPicker.dataset.action;
    const value = colorPicker.value;
    if (actions[action]) {
      // Save selection before action
      const savedStart = editor.selectionStart;
      const savedEnd = editor.selectionEnd;
      
      actions[action](value);
      
      // Restore selection after action
      setTimeout(() => {
        editor.focus();
        editor.setSelectionRange(savedStart, savedEnd);
      }, 0);
    }
  });
});

// Keyboard shortcuts
editor.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key) {
      case 'b':
        e.preventDefault();
        actions.bold();
        break;
      case 'i':
        e.preventDefault();
        actions.italic();
        break;
      case 'z':
        e.preventDefault();
        if (e.shiftKey) {
          actions.redo();
        } else {
          actions.undo();
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          actions.redo();
        }
        break;
    }
  }
});

editor.addEventListener('input', () => {
  saveToHistory();
  updateLineNumbers();
  render();
});

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

editor.addEventListener('select', updateButtonStates);
editor.addEventListener('click', updateButtonStates);
editor.addEventListener('keyup', updateButtonStates);

// Resizer functionality
resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizer.classList.add('resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const container = document.querySelector('.workspace');
  const containerRect = container.getBoundingClientRect();
  const leftPanel = container.querySelector('.panel:first-child');
  const rightPanel = container.querySelector('.right-panel');
  const resizerWidth = resizer.getBoundingClientRect().width;
  const halfResizer = resizerWidth / 2;
  
  const offsetX = e.clientX - containerRect.left;
  const totalWidth = containerRect.width;
  const leftWidth = (offsetX / totalWidth) * 100;
  
  if (leftWidth > 20 && leftWidth < 80) {
    leftPanel.style.flex = `0 0 calc(${leftWidth}% - ${halfResizer}px)`;
    rightPanel.style.flex = `0 0 calc(${100 - leftWidth}% - ${halfResizer}px)`;
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

updateButtonStates();
updateLineNumbers();
render();
// Modal Functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('active');
  
  // Focus first input
  setTimeout(() => {
    const firstInput = modal.querySelector('input:not([type="file"])');
    if (firstInput) firstInput.focus();
  }, 100);
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('active');
}

// Close modal on outside click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal.id);
    }
  });
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
});

// Table Modal Functions
let selectedTableAlign = 'left';

function selectAlign(align) {
  selectedTableAlign = align;
  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.align-btn[data-align="${align}"]`).classList.add('active');
}

function insertTable() {
  const rows = parseInt(document.getElementById('tableRows').value);
  const cols = parseInt(document.getElementById('tableCols').value);
  const align = selectedTableAlign;
  
  if (!rows || !cols || rows < 1 || cols < 1) {
    alert('Please enter valid numbers for rows and columns');
    return;
  }
  
  // Alignment characters
  let alignChar = '---';
  if (align === 'center') alignChar = ':---:';
  else if (align === 'right') alignChar = '---:';
  else if (align === 'left') alignChar = ':---';
  
  // Build table
  let table = '\n';
  
  // Header row
  table += '|';
  for (let i = 1; i <= cols; i++) {
    table += ` Header ${i} |`;
  }
  table += '\n';
  
  // Separator row
  table += '|';
  for (let i = 0; i < cols; i++) {
    table += ` ${alignChar} |`;
  }
  table += '\n';
  
  // Data rows
  for (let r = 1; r <= rows; r++) {
    table += '|';
    for (let c = 1; c <= cols; c++) {
      table += ` Cell ${r},${c} |`;
    }
    table += '\n';
  }
  
  insertAtCursor(table, '', '');
  closeModal('tableModal');
}

// Image Modal Functions
let selectedImageFile = null;

const imageUploadArea = document.getElementById('imageUploadArea');
const imageFileInput = document.getElementById('imageFileInput');

imageUploadArea.addEventListener('click', () => {
  imageFileInput.click();
});

imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageFile(file);
  }
});

// Drag and drop functionality
imageUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageUploadArea.classList.add('drag-over');
});

imageUploadArea.addEventListener('dragleave', () => {
  imageUploadArea.classList.remove('drag-over');
});

imageUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  imageUploadArea.classList.remove('drag-over');
  
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageFile(file);
  }
});

function handleImageFile(file) {
  selectedImageFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
  
  // Clear URL input
  document.getElementById('imageUrl').value = '';
}

function insertImage() {
  const altText = document.getElementById('imageAlt').value || 'image';
  let imageUrl = document.getElementById('imageUrl').value;
  
  // If file is selected, convert to base64
  if (selectedImageFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const markdown = `![${altText}](${e.target.result})`;
      const selection = window.imageSelection || { start: editor.selectionStart, end: editor.selectionEnd };
      
      editor.value = editor.value.substring(0, selection.start) + markdown + editor.value.substring(selection.end);
      editor.selectionStart = editor.selectionEnd = selection.start + markdown.length;
      
      saveToHistory();
      updateLineNumbers();
      render();
      editor.focus();
      
      closeModal('imageModal');
      selectedImageFile = null;
    };
    reader.readAsDataURL(selectedImageFile);
  } else if (imageUrl) {
    const markdown = `![${altText}](${imageUrl})`;
    const selection = window.imageSelection || { start: editor.selectionStart, end: editor.selectionEnd };
    
    editor.value = editor.value.substring(0, selection.start) + markdown + editor.value.substring(selection.end);
    editor.selectionStart = editor.selectionEnd = selection.start + markdown.length;
    
    saveToHistory();
    updateLineNumbers();
    render();
    editor.focus();
    
    closeModal('imageModal');
  } else {
    alert('Please select an image or enter an image URL');
  }
}

// Link Modal Functions
function insertLink() {
  const linkText = document.getElementById('linkText').value;
  const linkUrl = document.getElementById('linkUrl').value;
  
  if (!linkText || !linkUrl) {
    alert('Please enter both link text and URL');
    return;
  }
  
  const markdown = `[${linkText}](${linkUrl})`;
  const selection = window.linkSelection || { start: editor.selectionStart, end: editor.selectionEnd };
  
  editor.value = editor.value.substring(0, selection.start) + markdown + editor.value.substring(selection.end);
  editor.selectionStart = editor.selectionEnd = selection.start + markdown.length;
  
  saveToHistory();
  updateLineNumbers();
  render();
  editor.focus();
  
  closeModal('linkModal');
}

// Code Block Modal Functions
function insertCodeBlock() {
  const language = document.getElementById('codeLanguage').value;
  const content = document.getElementById('codeContent').value;
  
  const langSpec = language ? language : '';
  const codeText = content || 'your code here';
  const markdown = `\n\`\`\`${langSpec}\n${codeText}\n\`\`\`\n`;
  
  const selection = window.codeBlockSelection || { start: editor.selectionStart, end: editor.selectionEnd };
  
  editor.value = editor.value.substring(0, selection.start) + markdown + editor.value.substring(selection.end);
  
  // Position cursor inside the code block
  if (!content) {
    const cursorPos = selection.start + langSpec.length + 5; // After ```lang\n
    editor.selectionStart = cursorPos;
    editor.selectionEnd = cursorPos + 14; // Select "your code here"
  } else {
    editor.selectionStart = editor.selectionEnd = selection.start + markdown.length;
  }
  
  saveToHistory();
  updateLineNumbers();
  render();
  editor.focus();
  
  closeModal('codeBlockModal');
}

// Code editor helper functions
function updateCodeLineNumbers() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  const lines = codeContent.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function syncCodeScroll() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  lineNumbers.scrollTop = codeContent.scrollTop;
}

function pasteCodeBlock() {
  navigator.clipboard.readText().then(text => {
    const codeContent = document.getElementById('codeContent');
    const start = codeContent.selectionStart;
    const end = codeContent.selectionEnd;
    const currentValue = codeContent.value;
    
    codeContent.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    codeContent.selectionStart = codeContent.selectionEnd = start + text.length;
    updateCodeLineNumbers();
    codeContent.focus();
  }).catch(err => {
    console.log('Paste failed, use Ctrl+V');
  });
}

function clearCodeBlock() {
  const codeContent = document.getElementById('codeContent');
  codeContent.value = '';
  updateCodeLineNumbers();
  codeContent.focus();
}

// Code editor helper functions
function updateCodeLineNumbers() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  const lines = codeContent.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function syncCodeScroll() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  lineNumbers.scrollTop = codeContent.scrollTop;
}

function pasteCodeBlock() {
  navigator.clipboard.readText().then(text => {
    const codeContent = document.getElementById('codeContent');
    const start = codeContent.selectionStart;
    const end = codeContent.selectionEnd;
    const currentValue = codeContent.value;
    
    codeContent.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    codeContent.selectionStart = codeContent.selectionEnd = start + text.length;
    updateCodeLineNumbers();
    codeContent.focus();
  }).catch(err => {
    console.log('Paste failed, use Ctrl+V');
  });
}

function clearCodeBlock() {
  const codeContent = document.getElementById('codeContent');
  codeContent.value = '';
  updateCodeLineNumbers();
  codeContent.focus();
}

// Copy preview content
function copyPreviewContent() {
  const preview = document.getElementById('preview');
  const button = document.querySelector('.preview-copy-btn');
  
  const htmlContent = preview.innerHTML;
  const textContent = preview.innerText;
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const plainBlob = new Blob([textContent], { type: 'text/plain' });
  
  const clipboardItem = new ClipboardItem({
    'text/html': blob,
    'text/plain': plainBlob
  });
  
  navigator.clipboard.write([clipboardItem]).then(() => {
    button.classList.add('copied');
    setTimeout(() => button.classList.remove('copied'), 2000);
  }).catch(() => {
    navigator.clipboard.writeText(textContent).then(() => {
      button.classList.add('copied');
      setTimeout(() => button.classList.remove('copied'), 2000);
    }).catch(err => console.error('Failed to copy:', err));
  });
}

