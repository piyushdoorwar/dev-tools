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
let currentMode = 'json-toon';
let currentIndent = 2; // Track current indent value
let currentDelimiter = ','; // Track current delimiter value
let currentTokenStats = { jsonTokens: 0, toonTokens: 0, reduction: 0 }; // Track token stats

// History for undo functionality
let leftHistory = [];
let rightHistory = [];
const MAX_HISTORY = 50;

// Initialize
function init() {
    // Check URL hash for mode
    const hash = window.location.hash.substring(1);
    if (hash === 'toon-json' || hash === 'json-toon') {
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
        if (hash === 'toon-json' || hash === 'json-toon') {
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
    
    // Change case buttons
    const caseButtons = document.querySelectorAll('.case-btn');
    caseButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            caseButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const caseType = btn.dataset.case;
            if (caseType) changeCasing(caseType);
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
    
    // Live conversion on option changes
    const indentButtons = document.querySelectorAll('.indent-btn');
    indentButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            indentButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update current indent value
            currentIndent = parseInt(btn.dataset.indent);
            handleConvert();
        });
    });
    
    const delimiterButtons = document.querySelectorAll('.delimiter-btn');
    delimiterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            delimiterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update current delimiter value
            currentDelimiter = btn.dataset.delimiter;
            handleConvert();
        });
    });
    
    // Settings modal
    const settingsModal = document.getElementById('settings-modal');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    
    if (settingsOverlay) {
        settingsOverlay.addEventListener('click', closeSettingsModal);
    }
    if (settingsClose) {
        settingsClose.addEventListener('click', closeSettingsModal);
    }
    
    // Info modal
    const infoModal = document.getElementById('info-modal');
    const infoOverlay = document.getElementById('info-overlay');
    const infoClose = document.getElementById('info-close');
    
    if (infoOverlay) {
        infoOverlay.addEventListener('click', closeInfoModal);
    }
    if (infoClose) {
        infoClose.addEventListener('click', closeInfoModal);
    }
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (settingsModal && settingsModal.classList.contains('show')) {
                closeSettingsModal();
            }
            if (infoModal && infoModal.classList.contains('show')) {
                closeInfoModal();
            }
        }
    });
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
    if (currentMode === 'json-toon') {
        favicon.href = 'favicon-json-toon.svg';
        document.title = 'JSON → Toon Converter';
    } else {
        favicon.href = 'favicon-toon-json.svg';
        document.title = 'Toon → JSON Converter';
    }
    
    if (currentMode === 'json-toon') {
        leftTitle.textContent = 'JSON Input';
        rightTitle.textContent = 'Toon Output';
        leftEditor.placeholder = 'Enter your JSON here...';
        rightEditor.placeholder = 'Toon output will appear here...';
    } else {
        leftTitle.textContent = 'Toon Input';
        rightTitle.textContent = 'JSON Output';
        leftEditor.placeholder = 'Enter your Toon here...';
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
    if (currentMode === 'json-toon') {
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
        // Sample Toon
        leftEditor.value = `person:
name: John Doe
age: 30
email: john.doe@example.com
address:
street: 123 Main St
city: New York
zipCode: "10001"
hobbies[3]:
- reading
- coding
- traveling
isActive: true`;
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
            handleConvert(); // Live conversion after sorting keys
            break;
        case 'open-settings':
            openSettingsModal();
            break;
        case 'open-info':
            openInfoModal();
            break;
        case 'clear-left':
            leftEditor.value = '';
            updateStatus('left', 'Cleared', false);
            updateCharCount('left');
            updateLineNumbers('left');
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
            setTimeout(() => handleConvert(), 100); // Live conversion after paste
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
        if (currentMode === 'json-toon') {
            if (side === 'left') {
                JSON.parse(content);
                updateStatus(side, '✓ Valid JSON', true);
            } else {
                validateToon(content);
                updateStatus(side, '✓ Valid Toon', true);
            }
        } else {
            if (side === 'left') {
                validateToon(content);
                updateStatus(side, '✓ Valid Toon', true);
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
        if (currentMode === 'json-toon') {
            if (side === 'left') {
                const obj = JSON.parse(content);
                editor.value = JSON.stringify(obj, null, 2);
                updateStatus(side, 'Beautified', true);
            } else {
                editor.value = formatToon(content);
                updateStatus(side, 'Beautified', true);
            }
        } else {
            if (side === 'left') {
                editor.value = formatToon(content);
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
    if (currentMode !== 'json-toon') return;
    
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
    if (currentMode !== 'json-toon') return;
    
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
    const infoBtn = document.getElementById('info-btn');
    
    if (!input) {
        rightEditor.value = '';
        updateStatus('left', 'Ready', false);
        updateStatus('right', 'Ready', false);
        updateCharCount('right');
        updateLineNumbers('right');
        if (infoBtn) infoBtn.style.display = 'none';
        return;
    }
    
    // Get indent and delimiter values if available, otherwise use defaults
    const indentSpaces = currentIndent;
    const delimiter = currentDelimiter.replace('\\t', '\t');
    
    try {
        if (currentMode === 'json-toon') {
            const obj = JSON.parse(input);
            const toon = jsonToToon(obj, indentSpaces, delimiter);
            rightEditor.value = toon;
            updateStatus('left', '✓ Valid JSON', true);
            updateStatus('right', '✓ Converted to Toon', true);
            
            // Calculate and store token stats
            const jsonTokens = countTokens(input);
            const toonTokens = countTokens(toon);
            const reduction = ((jsonTokens - toonTokens) / jsonTokens * 100).toFixed(1);
            currentTokenStats = { jsonTokens, toonTokens, reduction };
            
            // Show info button
            if (infoBtn) infoBtn.style.display = 'flex';
        } else {
            const obj = toonToJSON(input);
            const json = JSON.stringify(obj, null, 2);
            rightEditor.value = json;
            updateStatus('left', '✓ Valid Toon', true);
            updateStatus('right', '✓ Converted to JSON', true);
            
            // Hide info button in toon-json mode
            if (infoBtn) infoBtn.style.display = 'none';
        }
        updateCharCount('right');
        updateLineNumbers('right');
    } catch (error) {
        // Silently fail for live conversion - don't show errors while typing
        rightEditor.value = '';
        updateStatus('left', 'Ready', false);
        updateStatus('right', 'Ready', false);
        updateCharCount('right');
        updateLineNumbers('right');
        if (infoBtn) infoBtn.style.display = 'none';
    }
}

// Update Token Statistics
function updateTokenStats(jsonStr, toonStr) {
    const jsonTokens = countTokens(jsonStr);
    const toonTokens = countTokens(toonStr);
    const reduction = ((jsonTokens - toonTokens) / jsonTokens * 100).toFixed(1);
    
    document.getElementById('json-tokens').textContent = jsonTokens;
    document.getElementById('toon-tokens').textContent = toonTokens;
    document.getElementById('token-reduction').textContent = reduction + '%';
    
    const statsSection = document.getElementById('stats-section');
    statsSection.classList.add('show');
}

// Hide Token Statistics
function hideTokenStats() {
    const statsSection = document.getElementById('stats-section');
    statsSection.classList.remove('show');
}

// Count Tokens (simplified - counts non-whitespace sequences)
function countTokens(str) {
    // Remove extra whitespace and count meaningful tokens
    return str.trim().split(/\s+/).filter(t => t.length > 0).length;
}

// JSON to Toon Converter
function jsonToToon(obj, indentSpaces = 2, delimiter = '|') {
    let result = '';
    const indentStr = indentSpaces === 0 ? '' : ' '.repeat(indentSpaces);
    
    function needsQuotes(key) {
        // Quote numeric keys and keys that start with numbers
        return /^\d/.test(key);
    }
    
    function formatValue(value) {
        if (typeof value === 'string') {
            // Quote strings that look like numbers or zip codes
            if (/^\d+$/.test(value)) {
                return `"${value}"`;
            }
            return value;
        }
        return value;
    }
    
    function getObjectSchema(arr) {
        // Check if all items in array have the same keys
        if (arr.length === 0) return null;
        if (typeof arr[0] !== 'object' || arr[0] === null || Array.isArray(arr[0])) return null;
        
        const firstKeys = Object.keys(arr[0]).sort();
        const allSame = arr.every(item => {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
            const keys = Object.keys(item).sort();
            return JSON.stringify(keys) === JSON.stringify(firstKeys);
        });
        
        return allSame ? firstKeys : null;
    }
    
    function convert(obj, key = '', level = 0) {
        const indent = indentStr.repeat(level);
        
        if (obj === null) {
            const keyStr = needsQuotes(key) ? `"${key}"` : key;
            result += `${indent}${keyStr}: null\n`;
            return;
        }
        
        if (typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'string') {
            const keyStr = needsQuotes(key) ? `"${key}"` : key;
            const value = formatValue(obj);
            result += `${indent}${keyStr}: ${value}\n`;
            return;
        }
        
        if (Array.isArray(obj)) {
            const schema = getObjectSchema(obj);
            
            if (schema) {
                // Array of objects with same schema - use compact format
                result += `${indent}${key}[${obj.length}]{${schema.join(delimiter)}}:\n`;
                obj.forEach(item => {
                    const values = schema.map(k => formatValue(item[k]));
                    result += `${indent}${indentStr}${values.join(delimiter)}\n`;
                });
            } else {
                // Regular array or mixed array
                result += `${indent}${key}[${obj.length}]:\n`;
                obj.forEach(item => {
                    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                        result += `${indent}${indentStr}- `;
                        const beforeDash = result.length;
                        for (let k in item) {
                            convert(item[k], k, level + 1);
                        }
                    } else if (Array.isArray(item)) {
                        result += `${indent}${indentStr}- `;
                        convert(item, 'item', level + 1);
                    } else {
                        result += `${indent}${indentStr}- ${formatValue(item)}\n`;
                    }
                });
            }
            return;
        }
        
        if (typeof obj === 'object') {
            if (key) {
                result += `${indent}${key}:\n`;
            }
            for (let k in obj) {
                convert(obj[k], k, level + (key ? 1 : 0));
            }
            return;
        }
    }
    
    // Get the root key or use the first key
    const keys = Object.keys(obj);
    if (keys.length === 1) {
        convert(obj[keys[0]], keys[0], 0);
    } else {
        for (let key of keys) {
            convert(obj[key], key, 0);
        }
    }
    
    return result.trim();
}

// Toon to JSON Converter
function toonToJSON(toonString) {
    const lines = toonString.split('\n').filter(line => line.trim());
    let result = {};
    let i = 0;
    
    function parseValue(value) {
        value = value.trim();
        
        // Handle quoted strings
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }
        
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (/^-?\d+$/.test(value)) return parseInt(value, 10);
        if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
        return value;
    }
    
    function parseLine(line) {
        line = line.trim();
        
        // Check for array with schema: key[count]{field1|field2}:
        const schemaMatch = line.match(/^("?[^"\[]+"?)\[(\d+)\]\{([^}]+)\}:$/);
        if (schemaMatch) {
            const key = schemaMatch[1].replace(/^"|"$/g, '');
            const count = parseInt(schemaMatch[2]);
            const fields = schemaMatch[3].split('|');
            return { type: 'array-schema', key, count, fields };
        }
        
        // Check for array: key[count]:
        const arrayMatch = line.match(/^("?[^"\[]+"?)\[(\d+)\]:$/);
        if (arrayMatch) {
            const key = arrayMatch[1].replace(/^"|"$/g, '');
            const count = parseInt(arrayMatch[2]);
            return { type: 'array', key, count };
        }
        
        // Check for object: key:
        if (line.endsWith(':')) {
            const key = line.slice(0, -1).replace(/^"|"$/g, '');
            return { type: 'object', key };
        }
        
        // Check for array item: - value or - key: value
        if (line.startsWith('- ')) {
            const content = line.substring(2).trim();
            if (content.includes(':')) {
                const colonIndex = content.indexOf(':');
                const key = content.substring(0, colonIndex).trim().replace(/^"|"$/g, '');
                const value = content.substring(colonIndex + 1).trim();
                return { type: 'array-item-kv', key, value };
            }
            return { type: 'array-item', value: content };
        }
        
        // Key-value pair: key: value
        if (line.includes(':')) {
            const colonIndex = line.indexOf(':');
            const key = line.substring(0, colonIndex).trim().replace(/^"|"$/g, '');
            const value = line.substring(colonIndex + 1).trim();
            return { type: 'keyvalue', key, value };
        }
        
        return { type: 'unknown', line };
    }
    
    function buildStructure() {
        const root = {};
        
        while (i < lines.length) {
            const parsed = parseLine(lines[i]);
            
            if (parsed.type === 'keyvalue') {
                root[parsed.key] = parseValue(parsed.value);
                i++;
            } else if (parsed.type === 'object') {
                i++;
                const obj = {};
                
                while (i < lines.length) {
                    const next = parseLine(lines[i]);
                    
                    if (next.type === 'object' || next.type === 'array' || next.type === 'array-schema') {
                        // Nested object or array
                        const nested = buildStructure();
                        Object.assign(obj, nested);
                        break;
                    } else if (next.type === 'keyvalue') {
                        obj[next.key] = parseValue(next.value);
                        i++;
                    } else {
                        break;
                    }
                }
                
                root[parsed.key] = obj;
            } else if (parsed.type === 'array-schema') {
                i++;
                const arr = [];
                
                for (let j = 0; j < parsed.count; j++) {
                    if (i >= lines.length) break;
                    const line = lines[i].trim();
                    const values = line.split(parsed.fields.length > 1 ? '|' : ',');
                    const item = {};
                    
                    parsed.fields.forEach((field, idx) => {
                        if (idx < values.length) {
                            item[field.trim()] = parseValue(values[idx]);
                        }
                    });
                    
                    arr.push(item);
                    i++;
                }
                
                root[parsed.key] = arr;
            } else if (parsed.type === 'array') {
                i++;
                const arr = [];
                
                while (i < lines.length) {
                    const next = parseLine(lines[i]);
                    
                    if (next.type === 'array-item') {
                        arr.push(parseValue(next.value));
                        i++;
                    } else if (next.type === 'array-item-kv') {
                        const obj = {};
                        obj[next.key] = parseValue(next.value);
                        
                        // Check for more properties of this object
                        i++;
                        while (i < lines.length) {
                            const nextKV = parseLine(lines[i]);
                            if (nextKV.type === 'keyvalue') {
                                obj[nextKV.key] = parseValue(nextKV.value);
                                i++;
                            } else {
                                break;
                            }
                        }
                        
                        arr.push(obj);
                    } else {
                        break;
                    }
                }
                
                root[parsed.key] = arr;
            } else {
                i++;
            }
        }
        
        return root;
    }
    
    return buildStructure();
}

// Validate Toon
function validateToon(toonString) {
    if (!toonString || !toonString.trim()) {
        throw new Error('Empty Toon string');
    }
    return true;
}

// Format Toon
function formatToon(toon) {
    // Simple formatting - just ensure consistent spacing
    const lines = toon.split('\n');
    let formatted = '';
    
    for (let line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed) {
            formatted += trimmed + '\n';
        }
    }
    
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
    
    if (currentMode === 'json-toon') {
        if (side === 'left') {
            filename = 'data.json';
            mimeType = 'application/json';
        } else {
            filename = 'data.toon';
            mimeType = 'text/plain';
        }
    } else {
        if (side === 'left') {
            filename = 'data.toon';
            mimeType = 'text/plain';
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
    
    // Live conversion after undo on left editor
    if (side === 'left') {
        handleConvert();
    }
    
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

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Info Modal Functions
function openInfoModal() {
    const modal = document.getElementById('info-modal');
    if (modal) {
        // Update modal with current stats
        document.getElementById('modal-json-tokens').textContent = currentTokenStats.jsonTokens;
        document.getElementById('modal-toon-tokens').textContent = currentTokenStats.toonTokens;
        document.getElementById('modal-token-reduction').textContent = currentTokenStats.reduction + '%';
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeInfoModal() {
    const modal = document.getElementById('info-modal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Initialize on load
init();
