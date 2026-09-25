// DOM Elements
const leftEditor = document.getElementById('left-editor');
const rightEditor = document.getElementById('right-editor');
const leftLineNumbers = document.getElementById('left-line-numbers');
const rightLineNumbers = document.getElementById('right-line-numbers');
const leftTitle = document.getElementById('left-title');
const rightTitle = document.getElementById('right-title');
const leftStatus = document.getElementById('left-status');
const rightStatus = document.getElementById('right-status');
const formatBtns = document.querySelectorAll('.mode-btn[data-format]');

// smol-toml's CommonJS bundle fills the `exports` object index.html provides.
const TOML = window.exports && typeof window.exports.parse === 'function' ? window.exports : null;

// A blocked or failed library download should read as an error in the status
// bar, not as buttons that silently do nothing.
function library(format) {
    const lib = format === 'toml' ? TOML : window.jsyaml;
    if (!lib) throw new Error(`The ${FORMATS[format].label} library failed to load — reload the page`);
    return lib;
}

const FORMATS = {
    json: { label: 'JSON', extension: 'json', mimeType: 'application/json' },
    yaml: { label: 'YAML', extension: 'yaml', mimeType: 'application/yaml' },
    toml: { label: 'TOML', extension: 'toml', mimeType: 'application/toml' },
};

// Current direction. The hash mirrors it as `from-to`, e.g. #yaml-json.
let fromFormat = 'json';
let toFormat = 'yaml';

// Whether the output pane reflects the current input. Stale output is left in
// place while the input is mid-edit and invalid, but must not be swapped in.
let outputIsCurrent = false;

// History for undo functionality
let leftHistory = [];
const MAX_HISTORY = 50;

// One document with every shape the three formats share (no nulls: TOML has
// none), rendered in whichever format is on the input side.
const SAMPLE = {
    name: 'dev-tools',
    version: '1.4.0',
    private: true,
    server: { host: '0.0.0.0', port: 8080, tls: false },
    database: { url: 'postgres://localhost:5432/app', pool: 10, timeoutSeconds: 30.5 },
    features: ['search', 'pwa', 'offline'],
    deploy: [
        { env: 'staging', replicas: 1, region: 'eu-west-1' },
        { env: 'production', replicas: 3, region: 'us-east-1' },
    ],
};

// Initialize
function init() {
    applyHash(DevToolsMain.readHashState());
    updateMode();
    setupEventListeners();
    saveToHistory();
}

function parseHash(value) {
    const [from, to] = String(value || '').split('-');
    if (FORMATS[from] && FORMATS[to] && from !== to) return { from, to };
    return null;
}

function applyHash(value) {
    const parsed = parseHash(value);
    if (!parsed) return false;
    fromFormat = parsed.from;
    toFormat = parsed.to;
    return true;
}

// Setup Event Listeners
function setupEventListeners() {
    formatBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.side === 'from') setFromFormat(btn.dataset.format);
            else setToFormat(btn.dataset.format);
        });
    });

    DevToolsMain.onHashState((value) => {
        const parsed = parseHash(value);
        if (!parsed || (parsed.from === fromFormat && parsed.to === toFormat)) return;
        fromFormat = parsed.from;
        toFormat = parsed.to;
        updateMode();
        handleConvert();
    });

    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            if (action) handleAction(action);
        });
    });

    leftEditor.addEventListener('input', () => {
        updateCharCount('left');
        updateLineNumbers('left');
        saveToHistory();
        handleConvert(); // Live conversion
    });

    leftEditor.addEventListener('scroll', () => syncScroll('left'));
    rightEditor.addEventListener('scroll', () => syncScroll('right'));
}

/* Picking the format already on the other side is a swap rather than an
 * invalid JSON → JSON pair. Changing only one side keeps the input: a user who
 * pastes YAML before switching the input to YAML should not lose it. */
function setFromFormat(format) {
    if (format === fromFormat) return;
    if (format === toFormat) {
        swapDirection();
        return;
    }
    fromFormat = format;
    commitMode();
}

function setToFormat(format) {
    if (format === toFormat) return;
    if (format === fromFormat) {
        swapDirection();
        return;
    }
    toFormat = format;
    commitMode();
}

// Swap direction, carrying the current output over as the new input.
function swapDirection() {
    const output = rightEditor.value;
    [fromFormat, toFormat] = [toFormat, fromFormat];
    if (output && outputIsCurrent) {
        leftEditor.value = output;
        saveToHistory();
    }
    commitMode();
}

function commitMode() {
    DevToolsMain.writeHashState(`${fromFormat}-${toFormat}`);
    updateMode();
    handleConvert();
}

// Update Mode
function updateMode() {
    formatBtns.forEach(btn => {
        const current = btn.dataset.side === 'from' ? fromFormat : toFormat;
        const active = btn.dataset.format === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });

    const from = FORMATS[fromFormat].label;
    const to = FORMATS[toFormat].label;
    document.title = `${from} → ${to} Converter`;
    leftTitle.textContent = `${from} Input`;
    rightTitle.textContent = `${to} Output`;
    leftEditor.placeholder = `Enter your ${from} here...`;
    rightEditor.placeholder = `${to} output will appear here...`;

    updateCharCounts();
    updateLineNumbers('left');
    updateLineNumbers('right');
}

/* ---------- Format layer ---------- */

/* Returns every document in the input. Only YAML can hold more than one
 * (`---` separators, as in a multi-resource Kubernetes manifest). */
function parseDocuments(format, text) {
    switch (format) {
        case 'json':
            return [JSON.parse(text)];
        case 'yaml':
            return library('yaml').loadAll(text).filter(doc => doc !== undefined);
        case 'toml':
            return [library('toml').parse(text)];
    }
    throw new Error(`Unknown format: ${format}`);
}

function stringifyDocuments(format, docs) {
    if (format === 'yaml') return docs.map(doc => stringify('yaml', doc)).join('---\n');
    return stringify(format, docs.length === 1 ? docs[0] : docs);
}

function stringify(format, value) {
    switch (format) {
        case 'json':
            return JSON.stringify(value, null, 2);
        case 'yaml':
            // lineWidth -1: never fold long strings (URLs, commands) across lines.
            return library('yaml').dump(value, { lineWidth: -1, noRefs: true });
        case 'toml':
            assertTomlCompatible(value);
            return library('toml').stringify(value).trimEnd() + '\n';
    }
    throw new Error(`Unknown format: ${format}`);
}

/* TOML is stricter than JSON and YAML. Say which value is the problem instead
 * of surfacing the serializer's generic error. */
function assertTomlCompatible(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) {
        throw new Error('TOML needs a table (object) at the top level');
    }
    const walk = (node, path) => {
        if (node === null || node === undefined) {
            throw new Error(`TOML has no null — "${path}" is null`);
        }
        if (node instanceof Date || typeof node !== 'object') return;
        const entries = Array.isArray(node) ? node.map((v, i) => [i, v]) : Object.entries(node);
        for (const [key, child] of entries) {
            walk(child, Array.isArray(node) ? `${path}[${key}]` : path ? `${path}.${key}` : key);
        }
    };
    walk(value, '');
}

// Status bars hold one line; library errors carry a multi-line code frame.
function firstLine(error) {
    return String(error && error.message || error).split('\n')[0].trim();
}

function documentsLabel(format, docs) {
    const label = FORMATS[format].label;
    return docs.length > 1 ? `${label} (${docs.length} documents)` : label;
}

// Load Sample Data
function loadSample() {
    try {
        leftEditor.value = stringify(fromFormat, SAMPLE);
    } catch (error) {
        updateStatus('left', '✗ ' + firstLine(error), false, true);
        return;
    }
    updateStatus('left', '✓ Sample loaded', true);
    updateCharCount('left');
    updateLineNumbers('left');
    saveToHistory();
    handleConvert();
}

// Handle Actions
function handleAction(action) {
    switch (action) {
        case 'swap':
            swapDirection();
            break;
        case 'load-sample':
            loadSample();
            break;
        case 'validate-left':
            validateInput();
            break;
        case 'beautify-left':
            rewriteInput(docs => docs, 'Beautified');
            break;
        case 'sort-keys':
            rewriteInput(docs => docs.map(sortObjectKeys), 'Keys sorted');
            break;
        case 'clear-left':
            leftEditor.value = '';
            rightEditor.value = '';
            updateStatus('left', 'Cleared', false);
            updateStatus('right', 'Cleared', false);
            updateCharCounts();
            updateLineNumbers('left');
            updateLineNumbers('right');
            saveToHistory();
            break;
        case 'clear-right':
            rightEditor.value = '';
            outputIsCurrent = false;
            updateStatus('right', 'Cleared', false);
            updateCharCount('right');
            updateLineNumbers('right');
            break;
        case 'copy-left':
            copyToClipboard(leftEditor.value, 'left');
            break;
        case 'copy-right':
            copyToClipboard(rightEditor.value, 'right');
            break;
        case 'paste-left':
            pasteFromClipboard();
            break;
        case 'download-left':
            downloadContent('left');
            break;
        case 'download-right':
            downloadContent('right');
            break;
        case 'undo-left':
            undoEdit();
            break;
    }
}

function validateInput() {
    const content = leftEditor.value.trim();
    if (!content) {
        updateStatus('left', 'No content to validate', false);
        return;
    }
    try {
        const docs = parseDocuments(fromFormat, content);
        updateStatus('left', `✓ Valid ${documentsLabel(fromFormat, docs)}`, true);
    } catch (error) {
        updateStatus('left', '✗ ' + firstLine(error), false, true);
    }
}

// Re-serialize the input in its own format (beautify, sort keys).
function rewriteInput(transform, message) {
    const content = leftEditor.value.trim();
    if (!content) {
        updateStatus('left', 'No content to format', false);
        return;
    }
    try {
        const docs = transform(parseDocuments(fromFormat, content));
        leftEditor.value = stringifyDocuments(fromFormat, docs);
        updateStatus('left', message, true);
        updateCharCount('left');
        updateLineNumbers('left');
        saveToHistory();
        handleConvert();
    } catch (error) {
        updateStatus('left', '✗ ' + firstLine(error), false, true);
    }
}

// Sort Object Keys Recursively
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);

    return Object.keys(obj).sort().reduce((result, key) => {
        result[key] = sortObjectKeys(obj[key]);
        return result;
    }, {});
}

// Handle Convert
function handleConvert() {
    const input = leftEditor.value.trim();
    outputIsCurrent = false;

    if (!input) {
        rightEditor.value = '';
        updateStatus('left', 'Ready', false);
        updateStatus('right', 'Ready', false);
        updateCharCount('right');
        updateLineNumbers('right');
        return;
    }

    let docs;
    try {
        docs = parseDocuments(fromFormat, input);
        updateStatus('left', `✓ Valid ${documentsLabel(fromFormat, docs)}`, true);
    } catch (error) {
        updateStatus('left', '✗ ' + firstLine(error), false, true);
        updateStatus('right', 'Waiting for valid input', false);
        return;
    }

    try {
        rightEditor.value = stringifyDocuments(toFormat, docs);
        outputIsCurrent = true;
        const note = docs.length > 1 && toFormat !== 'yaml' ? ` (${docs.length} documents → array)` : '';
        updateStatus('right', `✓ Converted to ${FORMATS[toFormat].label}${note}`, true);
    } catch (error) {
        rightEditor.value = '';
        updateStatus('right', '✗ ' + firstLine(error), false, true);
    }
    updateCharCount('right');
    updateLineNumbers('right');
}

// Copy to Clipboard
async function copyToClipboard(text, side) {
    if (!text) {
        updateStatus(side, 'No content to copy', false);
        return;
    }

    try {
        await DevToolsMain.copyText(text);
        updateStatus(side, '✓ Copied to clipboard', true);
    } catch (error) {
        updateStatus(side, '✗ Failed to copy', false, true);
    }
}

// Paste from Clipboard
async function pasteFromClipboard() {
    try {
        leftEditor.value = await navigator.clipboard.readText();
        updateStatus('left', '✓ Pasted from clipboard', true);
        updateCharCount('left');
        updateLineNumbers('left');
        saveToHistory();
        handleConvert();
    } catch (error) {
        updateStatus('left', '✗ Failed to paste', false, true);
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

    const format = FORMATS[side === 'left' ? fromFormat : toFormat];
    const filename = `data.${format.extension}`;
    const blob = new Blob([content], { type: format.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus(side, `✓ Downloaded ${filename}`, true);
}

// Save to History
function saveToHistory() {
    const content = leftEditor.value;
    if (leftHistory.length > 0 && leftHistory[leftHistory.length - 1] === content) return;
    leftHistory.push(content);
    if (leftHistory.length > MAX_HISTORY) leftHistory.shift();
}

// Undo Edit
function undoEdit() {
    if (leftHistory.length <= 1) {
        updateStatus('left', 'Nothing to undo', false);
        return;
    }

    leftHistory.pop();
    leftEditor.value = leftHistory[leftHistory.length - 1];
    updateCharCount('left');
    updateLineNumbers('left');
    handleConvert();
    updateStatus('left', '✓ Undo successful', true);
}

// Update Status
function updateStatus(side, message, isSuccess = false, isError = false) {
    const statusBar = side === 'left' ? leftStatus : rightStatus;
    const statusText = statusBar.querySelector('.status-text');
    statusText.textContent = message;
    statusText.title = message;
    statusText.classList.remove('success', 'error');
    if (isSuccess) statusText.classList.add('success');
    if (isError) statusText.classList.add('error');
}

// Update Line Numbers
function updateLineNumbers(side) {
    const editor = side === 'left' ? leftEditor : rightEditor;
    const lineNumbersEl = side === 'left' ? leftLineNumbers : rightLineNumbers;
    const lineCount = editor.value.split('\n').length;

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
    statusBar.querySelector('.char-count').textContent = `${editor.value.length} characters`;
}

function updateCharCounts() {
    updateCharCount('left');
    updateCharCount('right');
}

// Initialize on load
init();
