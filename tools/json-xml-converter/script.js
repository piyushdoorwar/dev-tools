// DOM Elements
const leftEditor = document.getElementById('left-editor');
const rightEditor = document.getElementById('right-editor');
const leftLineNumbers = document.getElementById('left-line-numbers');
const rightLineNumbers = document.getElementById('right-line-numbers');
const leftTitle = document.getElementById('left-title');
const rightTitle = document.getElementById('right-title');
const leftStatus = document.getElementById('left-status');
const rightStatus = document.getElementById('right-status');
const modeBtns = document.querySelectorAll('.mode-btn');
const appContainer = document.querySelector('.app-container');

// Current mode
let currentMode = 'json-xml';

// History for undo functionality
let leftHistory = [];
let rightHistory = [];
const MAX_HISTORY = 50;

// Initialize
function init() {
    // Check URL hash for mode
    const hash = window.location.hash.substring(1);
    if (hash === 'xml-json' || hash === 'json-xml') {
        currentMode = hash;
    }
    
    updateMode();
    setupEventListeners();
    updateCharCounts();
}

// Setup Event Listeners
function setupEventListeners() {
    // Mode switcher
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentMode = btn.dataset.mode;
            window.location.hash = currentMode;
            updateMode();
        });
    });
    
    // Hash change
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1);
        if (hash === 'xml-json' || hash === 'json-xml') {
            currentMode = hash;
            updateMode();
        }
    });
    
    // Action buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            if (action) handleAction(action);
        });
    });
    
    // Dropdown items
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const caseType = e.currentTarget.dataset.case;
            if (caseType) changeCasing(caseType);
        });
    });
    
    // Dropdown toggle
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = toggle.nextElementSibling;
            menu.classList.toggle('show');
        });
    });
    
    // Close dropdowns
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    });
    
    // Character count and line numbers
    leftEditor.addEventListener('input', () => {
        updateCharCount('left');
        updateLineNumbers('left');
        saveToHistory('left');
        handleConvert(); // Live conversion
    });
    rightEditor.addEventListener('input', () => {
        updateCharCount('right');
        updateLineNumbers('right');
        saveToHistory('right');
    });
    
    // Sync scroll for line numbers
    leftEditor.addEventListener('scroll', () => syncScroll('left'));
    rightEditor.addEventListener('scroll', () => syncScroll('right'));
    
    // Initialize line numbers
    updateLineNumbers('left');
    updateLineNumbers('right');
}

// Update Mode
function updateMode() {
    // Update mode buttons
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });
    
    // Update container class
    appContainer.className = 'app-container mode-' + currentMode;
    
    // Update favicon based on mode
    const favicon = document.getElementById('favicon');
    if (currentMode === 'json-xml') {
        favicon.href = 'favicon-json-xml.svg';
        document.title = 'JSON → XML Converter';
    } else {
        favicon.href = 'favicon-xml-json.svg';
        document.title = 'XML → JSON Converter';
    }
    
    if (currentMode === 'json-xml') {
        leftTitle.textContent = 'JSON Input';
        rightTitle.textContent = 'XML Output';
        leftEditor.placeholder = 'Enter your JSON here...';
        rightEditor.placeholder = 'XML output will appear here...';
    } else {
        leftTitle.textContent = 'XML Input';
        rightTitle.textContent = 'JSON Output';
        leftEditor.placeholder = 'Enter your XML here...';
        rightEditor.placeholder = 'JSON output will appear here...';
    }
    
    // Clear editors when switching
    leftEditor.value = '';
    rightEditor.value = '';
    updateStatus('left', 'Ready', false);
    updateStatus('right', 'Ready', false);
    updateCharCounts();
    updateLineNumbers('left');
    updateLineNumbers('right');
}

// Load Sample Data
function loadSample() {
    if (currentMode === 'json-xml') {
        // Sample JSON
        leftEditor.value = `{
  "person": {
    "name": "John Doe",
    "age": 30,
    "email": "john.doe@example.com",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "zipCode": "10001"
    },
    "hobbies": ["reading", "coding", "traveling"],
    "isActive": true
  }
}`;
    } else {
        // Sample XML
        leftEditor.value = `<?xml version="1.0" encoding="UTF-8"?>
<library>
  <book id="1">
    <title>The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <year>1925</year>
    <genre>Classic</genre>
  </book>
  <book id="2">
    <title>To Kill a Mockingbird</title>
    <author>Harper Lee</author>
    <year>1960</year>
    <genre>Fiction</genre>
  </book>
</library>`;
    }
    
    updateStatus('left', '✓ Sample loaded', true);
    updateCharCount('left');
    updateLineNumbers('left');
    saveToHistory('left');
    handleConvert(); // Live conversion after loading sample
    setTimeout(() => updateStatus('left', 'Ready', false), 2000);
}

// Handle Actions
function handleAction(action) {
    switch(action) {
        case 'validate-left':
            validateEditor('left');
            break;
        case 'validate-right':
            validateEditor('right');
            break;
        case 'load-sample':
            loadSample();
            break;
        case 'beautify-left':
            beautifyEditor('left');
            handleConvert(); // Live conversion after beautify
            break;
        case 'beautify-right':
            beautifyEditor('right');
            break;
        case 'sort-keys':
            sortJsonKeys();
            break;
        case 'clear-left':
            leftEditor.value = '';
            rightEditor.value = '';
            updateStatus('left', 'Cleared', false);
            updateStatus('right', 'Cleared', false);
            updateCharCount('left');
            updateCharCount('right');
            updateLineNumbers('left');
            updateLineNumbers('right');
            saveToHistory('left');
            break;
        case 'clear-right':
            rightEditor.value = '';
            updateStatus('right', 'Cleared', false);
            updateCharCount('right');
            updateLineNumbers('right');
            saveToHistory('right');
            break;
        case 'copy-left':
            copyToClipboard(leftEditor.value, 'left');
            break;
        case 'copy-right':
            copyToClipboard(rightEditor.value, 'right');
            break;
        case 'paste-left':
            pasteFromClipboard('left');
            break;
        case 'paste-right':
            pasteFromClipboard('right');
            break;
        case 'download-left':
            downloadContent('left');
            break;
        case 'download-right':
            downloadContent('right');
            break;
        case 'undo-left':
            undoEdit('left');
            break;
        case 'undo-right':
            undoEdit('right');
            break;
    }
}

// Validate Editor
function validateEditor(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const content = editor.value.trim();
    
    if (!content) {
        updateStatus(side, 'No content to validate', false);
        return;
    }
    
    try {
        if (currentMode === 'json-xml') {
            if (side === 'left') {
                JSON.parse(content);
                updateStatus(side, '✓ Valid JSON', true);
            } else {
                validateXML(content);
                updateStatus(side, '✓ Valid XML', true);
            }
        } else {
            if (side === 'left') {
                validateXML(content);
                updateStatus(side, '✓ Valid XML', true);
            } else {
                JSON.parse(content);
                updateStatus(side, '✓ Valid JSON', true);
            }
        }
    } catch (error) {
        updateStatus(side, '✗ ' + error.message, false, true);
    }
}

// Beautify Editor
function beautifyEditor(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const content = editor.value.trim();
    
    if (!content) {
        updateStatus(side, 'No content to beautify', false);
        return;
    }
    
    try {
        if (currentMode === 'json-xml') {
            if (side === 'left') {
                const obj = JSON.parse(content);
                editor.value = JSON.stringify(obj, null, 2);
                updateStatus(side, 'Beautified', true);
            } else {
                editor.value = formatXML(content);
                updateStatus(side, 'Beautified', true);
            }
        } else {
            if (side === 'left') {
                editor.value = formatXML(content);
                updateStatus(side, 'Beautified', true);
            } else {
                const obj = JSON.parse(content);
                editor.value = JSON.stringify(obj, null, 2);
                updateStatus(side, 'Beautified', true);
            }
        }
        updateCharCount(side);
        updateLineNumbers(side);
    } catch (error) {
        updateStatus(side, '✗ ' + error.message, false, true);
    }
}

// Sort JSON Keys
function sortJsonKeys() {
    if (currentMode !== 'json-xml') return;
    
    const content = leftEditor.value.trim();
    if (!content) {
        updateStatus('left', 'No JSON to sort', false);
        return;
    }
    
    try {
        const obj = JSON.parse(content);
        const sorted = sortObjectKeys(obj);
        leftEditor.value = JSON.stringify(sorted, null, 2);
        updateStatus('left', 'Keys sorted', true);
        updateCharCount('left');
        updateLineNumbers('left');
        handleConvert(); // Live conversion after sorting
    } catch (error) {
        updateStatus('left', '✗ ' + error.message, false, true);
    }
}

// Sort Object Keys Recursively
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    
    return Object.keys(obj).sort().reduce((result, key) => {
        result[key] = sortObjectKeys(obj[key]);
        return result;
    }, {});
}

// Change Casing
function changeCasing(caseType) {
    if (currentMode !== 'json-xml') return;
    
    const content = leftEditor.value.trim();
    if (!content) {
        updateStatus('left', 'No JSON to convert', false);
        return;
    }
    
    try {
        const obj = JSON.parse(content);
        const converted = convertObjectCasing(obj, caseType);
        leftEditor.value = JSON.stringify(converted, null, 2);
        updateStatus('left', `Converted to ${caseType}`, true);
        updateCharCount('left');
        updateLineNumbers('left');
        handleConvert(); // Live conversion after casing change
    } catch (error) {
        updateStatus('left', '✗ ' + error.message, false, true);
    }
}

// Convert Object Casing
function convertObjectCasing(obj, caseType) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => convertObjectCasing(item, caseType));
    
    return Object.keys(obj).reduce((result, key) => {
        const newKey = convertCase(key, caseType);
        result[newKey] = convertObjectCasing(obj[key], caseType);
        return result;
    }, {});
}

// Convert Case
function convertCase(str, caseType) {
    // Split by various delimiters
    const words = str.split(/[\s_-]|(?=[A-Z])/).filter(Boolean).map(w => w.toLowerCase());
    
    switch(caseType) {
        case 'camel':
            return words.map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
        case 'pascal':
            return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        case 'snake':
            return words.join('_');
        case 'kebab':
            return words.join('-');
        default:
            return str;
    }
}

// Handle Convert
function handleConvert() {
    const input = leftEditor.value.trim();
    
    if (!input) {
        updateStatus('left', 'No input to convert', false);
        return;
    }
    
    try {
        if (currentMode === 'json-xml') {
            const obj = JSON.parse(input);
            const xml = jsonToXML(obj);
            rightEditor.value = xml;
            updateStatus('left', '✓ Valid JSON', true);
            updateStatus('right', '✓ Converted to XML', true);
        } else {
            const obj = xmlToJSON(input);
            rightEditor.value = JSON.stringify(obj, null, 2);
            updateStatus('left', '✓ Valid XML', true);
            updateStatus('right', '✓ Converted to JSON', true);
        }
        updateCharCount('right');
        updateLineNumbers('right');
    } catch (error) {
        updateStatus('left', '✗ ' + error.message, false, true);
    }
}

// JSON to XML Converter
function jsonToXML(obj, rootName = 'root') {
    function escapeXML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    function convert(obj, name, level = 0) {
        const indent = '  '.repeat(level);
        
        if (obj === null || obj === undefined) {
            return `${indent}<${name} />\n`;
        }
        
        if (typeof obj === 'object' && !Array.isArray(obj)) {
            let result = `${indent}<${name}>\n`;
            for (let key in obj) {
                result += convert(obj[key], key, level + 1);
            }
            result += `${indent}</${name}>\n`;
            return result;
        } else if (Array.isArray(obj)) {
            let result = '';
            obj.forEach(item => {
                result += convert(item, name, level);
            });
            return result;
        } else {
            return `${indent}<${name}>${escapeXML(obj)}</${name}>\n`;
        }
    }
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += convert(obj, rootName, 0);
    return xml.trim();
}

// XML to JSON Converter
function xmlToJSON(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Invalid XML: ' + parserError.textContent);
    }
    
    function parseNode(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent.trim();
            return text || null;
        }
        
        if (node.nodeType !== 1) return null; // Element node
        
        const obj = {};
        
        // Handle attributes
        if (node.attributes.length > 0) {
            obj['@attributes'] = {};
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                obj['@attributes'][attr.name] = attr.value;
            }
        }
        
        // Handle child nodes
        if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
            // Only text content
            const text = node.childNodes[0].textContent.trim();
            if (node.attributes.length > 0) {
                obj['#text'] = text;
                return obj;
            }
            return text;
        }
        
        const children = {};
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType !== 1) continue;
            
            const childData = parseNode(child);
            const childName = child.nodeName;
            
            if (children[childName]) {
                if (!Array.isArray(children[childName])) {
                    children[childName] = [children[childName]];
                }
                children[childName].push(childData);
            } else {
                children[childName] = childData;
            }
        }
        
        return Object.keys(children).length > 0 ? { ...obj, ...children } : obj;
    }
    
    const root = xmlDoc.documentElement;
    return { [root.nodeName]: parseNode(root) };
}

// Validate XML
function validateXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error(parserError.textContent);
    }
    return true;
}

// Format XML
function formatXML(xml) {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;
    
    // Normalize existing formatting so beautify is idempotent
    xml = xml
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/>\s+</g, '><')
        .replace(reg, '$1\n$2$3');

    xml.split('\n').forEach(node => {
        node = node.trim();
        if (!node) return;
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) {
                pad -= 1;
            }
        } else if (node.match(/^<\w([^>]*[^\/])?>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }
        
        formatted += PADDING.repeat(pad) + node + '\n';
        pad += indent;
    });
    
    return formatted.trim();
}

// Copy to Clipboard
async function copyToClipboard(text, side) {
    if (!text) {
        updateStatus(side, 'No content to copy', false);
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        updateStatus(side, '✓ Copied to clipboard', true);
        setTimeout(() => updateStatus(side, 'Ready', false), 2000);
    } catch (error) {
        updateStatus(side, '✗ Failed to copy', false, true);
    }
}

// Paste from Clipboard
async function pasteFromClipboard(side) {
    try {
        const text = await navigator.clipboard.readText();
        const editor = side === 'left' ? leftEditor : rightEditor;
        editor.value = text;
        updateStatus(side, '✓ Pasted from clipboard', true);
        updateCharCount(side);
        updateLineNumbers(side);
        saveToHistory(side);
        if (side === 'left') {
            handleConvert(); // Live conversion after paste
        }
        setTimeout(() => updateStatus(side, 'Ready', false), 2000);
    } catch (error) {
        updateStatus(side, '✗ Failed to paste', false, true);
    }
}

// Download Content
function downloadContent(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const content = editor.value;
    
    if (!content) {
        updateStatus(side, 'No content to download', false);
        return;
    }
    
    // Determine file extension and name based on mode and side
    let filename, mimeType;
    
    if (currentMode === 'json-xml') {
        if (side === 'left') {
            filename = 'data.json';
            mimeType = 'application/json';
        } else {
            filename = 'data.xml';
            mimeType = 'application/xml';
        }
    } else {
        if (side === 'left') {
            filename = 'data.xml';
            mimeType = 'application/xml';
        } else {
            filename = 'data.json';
            mimeType = 'application/json';
        }
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateStatus(side, `✓ Downloaded ${filename}`, true);
    setTimeout(() => updateStatus(side, 'Ready', false), 2000);
}

// Save to History
function saveToHistory(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const history = side === 'left' ? leftHistory : rightHistory;
    const content = editor.value;
    
    // Don't save if it's the same as the last entry
    if (history.length > 0 && history[history.length - 1] === content) {
        return;
    }
    
    history.push(content);
    
    // Limit history size
    if (history.length > MAX_HISTORY) {
        history.shift();
    }
    
    // Update the reference
    if (side === 'left') {
        leftHistory = history;
    } else {
        rightHistory = history;
    }
}

// Undo Edit
function undoEdit(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const history = side === 'left' ? leftHistory : rightHistory;
    
    if (history.length <= 1) {
        updateStatus(side, 'Nothing to undo', false);
        return;
    }
    
    // Remove current state
    history.pop();
    
    // Get previous state
    const previousContent = history[history.length - 1];
    editor.value = previousContent;
    
    updateStatus(side, '✓ Undo successful', true);
    updateCharCount(side);
    updateLineNumbers(side);
    setTimeout(() => updateStatus(side, 'Ready', false), 2000);
}

// Update Status
function updateStatus(side, message, isSuccess = false, isError = false) {
    const statusBar = side === 'left' ? leftStatus : rightStatus;
    const statusText = statusBar.querySelector('.status-text');
    statusText.textContent = message;
    statusText.classList.remove('success', 'error');
    if (isSuccess) statusText.classList.add('success');
    if (isError) statusText.classList.add('error');
}

// Update Line Numbers
function updateLineNumbers(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const lineNumbersEl = side === 'left' ? leftLineNumbers : rightLineNumbers;
    
    const content = editor.value;
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    // Generate line numbers
    let lineNumbersHTML = '';
    for (let i = 1; i <= lineCount; i++) {
        lineNumbersHTML += `<span class="line-number">${i}</span>`;
    }
    
    lineNumbersEl.innerHTML = lineNumbersHTML;
}

// Sync Scroll
function syncScroll(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const lineNumbersEl = side === 'left' ? leftLineNumbers : rightLineNumbers;
    
    lineNumbersEl.scrollTop = editor.scrollTop;
}

// Update Character Count
function updateCharCount(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const statusBar = side === 'left' ? leftStatus : rightStatus;
    const charCount = statusBar.querySelector('.char-count');
    charCount.textContent = `${editor.value.length} characters`;
}

function updateCharCounts() {
    updateCharCount('left');
    updateCharCount('right');
}

// Initialize on load
init();
