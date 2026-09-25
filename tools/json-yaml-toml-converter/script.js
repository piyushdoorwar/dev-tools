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
const taskBtns = document.querySelectorAll('.mode-btn[data-task]');
const appContainer = document.querySelector('.app-container');
const indentSelect = document.getElementById('format-indent');
const indentOption = document.querySelector('.indent-option');
const formatNote = document.getElementById('format-note');
const commentWarning = document.getElementById('comment-warning');

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
// from === to is the Format task (#yaml-yaml): re-serialize in place.
let fromFormat = 'json';
let toFormat = 'yaml';

// The output format to return to when leaving the Format task.
let convertTarget = 'yaml';

const isFormatting = () => fromFormat === toFormat;

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
    // A formatter link (#yaml-yaml) should land on something to format.
    if (isFormatting()) loadSample();
}

function parseHash(value) {
    const [from, to] = String(value || '').split('-');
    if (FORMATS[from] && FORMATS[to]) return { from, to };
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

    taskBtns.forEach(btn => {
        btn.addEventListener('click', () => setTask(btn.dataset.task));
    });

    indentSelect.addEventListener('change', () => {
        if (isFormatting()) handleConvert();
    });

    DevToolsMain.onHashState((value) => {
        const parsed = parseHash(value);
        if (!parsed || (parsed.from === fromFormat && parsed.to === toFormat)) return;
        fromFormat = parsed.from;
        toFormat = parsed.to;
        updateMode();
        if (isFormatting() && !leftEditor.value.trim()) loadSample();
        else handleConvert();
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
    if (isFormatting()) {
        fromFormat = toFormat = format;
        commitMode();
        return;
    }
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
    if (isFormatting()) return;
    const output = rightEditor.value;
    [fromFormat, toFormat] = [toFormat, fromFormat];
    if (output && outputIsCurrent) {
        leftEditor.value = output;
        saveToHistory();
    }
    commitMode();
}

/* Format pins the output to the input's format; Convert returns to the last
 * output format used, or the next one along if that is the input's own. */
function setTask(task) {
    if ((task === 'format') === isFormatting()) return;
    if (task === 'format') {
        convertTarget = toFormat;
        toFormat = fromFormat;
    } else {
        toFormat = convertTarget !== fromFormat
            ? convertTarget
            : Object.keys(FORMATS).find(format => format !== fromFormat);
    }
    commitMode();
}

function commitMode() {
    DevToolsMain.writeHashState(`${fromFormat}-${toFormat}`);
    updateMode();
    if (isFormatting() && !leftEditor.value.trim()) loadSample();
    else handleConvert();
}

// Update Mode
function updateMode() {
    formatBtns.forEach(btn => {
        const current = btn.dataset.side === 'from' ? fromFormat : toFormat;
        const active = btn.dataset.format === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });

    const formatting = isFormatting();
    taskBtns.forEach(btn => {
        const active = (btn.dataset.task === 'format') === formatting;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    appContainer.classList.toggle('is-formatting', formatting);

    const from = FORMATS[fromFormat].label;
    const to = FORMATS[toFormat].label;
    leftTitle.textContent = `${from} Input`;
    leftEditor.placeholder = `Enter your ${from} here...`;
    if (formatting) {
        document.title = `${from} Formatter`;
        rightTitle.textContent = `Formatted ${from}`;
        rightEditor.placeholder = `Formatted ${from} will appear here...`;
    } else {
        document.title = `${from} → ${to} Converter`;
        rightTitle.textContent = `${to} Output`;
        rightEditor.placeholder = `${to} output will appear here...`;
    }
    // smol-toml's writer has no indent setting, and JSON has no comments.
    indentOption.hidden = fromFormat === 'toml';
    formatNote.textContent = fromFormat === 'json'
        ? 'Key order is kept.'
        : 'Key order is kept. Formatting re-serializes through a parser, so comments are not kept.';
    updateCommentWarning();

    updateCharCounts();
    updateLineNumbers('left');
    updateLineNumbers('right');
}

/* ---------- Format layer ---------- */

/* Returns every document in the input. Only YAML can hold more than one
 * (`---` separators, as in a multi-resource Kubernetes manifest).
 *
 * options.preserveScalars (the Format task) loads YAML with the core schema:
 * a date stays the string `2024-05-01` instead of becoming a Date that dumps
 * back as `2024-05-01T00:00:00.000Z`, and `<<` merge keys stay literal rather
 * than being expanded. Tags only the default schema knows (!!binary, !!set…)
 * fall back to it. */
function parseDocuments(format, text, options = {}) {
    switch (format) {
        case 'json':
            return [JSON.parse(text)];
        case 'yaml': {
            const yaml = library('yaml');
            const load = (schema) => yaml.loadAll(text, null, schema ? { schema } : undefined)
                .filter(doc => doc !== undefined);
            if (!options.preserveScalars) return load();
            try {
                return load(yaml.CORE_SCHEMA);
            } catch (error) {
                if (!/unknown tag/.test(error && error.message)) throw error;
                return load();
            }
        }
        case 'toml':
            return [library('toml').parse(text)];
    }
    throw new Error(`Unknown format: ${format}`);
}

// options: { indent } (spaces; JSON and YAML only), { preserveScalars } to
// pair with parseDocuments' option of the same name.
function stringifyDocuments(format, docs, options = {}) {
    if (format === 'yaml') return docs.map(doc => stringify('yaml', doc, options)).join('---\n');
    return stringify(format, docs.length === 1 ? docs[0] : docs, options);
}

function stringify(format, value, options = {}) {
    const indent = options.indent || 2;
    switch (format) {
        case 'json':
            return JSON.stringify(value, null, indent);
        case 'yaml': {
            // lineWidth -1: never fold long strings (URLs, commands) across lines.
            const yaml = library('yaml');
            const dumpOptions = { lineWidth: -1, noRefs: true, indent };
            if (options.preserveScalars) {
                // Dump with the schema parseDocuments loaded with, or the
                // default schema would quote '2024-05-01' as a would-be date.
                // A Date (from the !!tag fallback) needs the default schema.
                try {
                    return yaml.dump(value, { ...dumpOptions, schema: yaml.CORE_SCHEMA });
                } catch (error) {
                    return yaml.dump(value, dumpOptions);
                }
            }
            return yaml.dump(value, dumpOptions);
        }
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

/* One-line parse error with a 1-based line and column where the parser gives
 * one: js-yaml's mark is 0-based, smol-toml's TomlError is already 1-based,
 * and V8's JSON.parse reports either "(line L column C)" or "at position N". */
function describeParseError(format, error, text = '') {
    if (format === 'yaml' && error && error.mark) {
        return `Line ${error.mark.line + 1}, column ${error.mark.column + 1}: ${error.reason || firstLine(error)}`;
    }
    if (format === 'toml' && error && Number.isInteger(error.line)) {
        const reason = firstLine(error).replace(/^Invalid TOML document:\s*/, '');
        return `Line ${error.line}, column ${error.column}: ${reason}`;
    }
    if (format === 'json') {
        const message = firstLine(error);
        const lineCol = message.match(/\(line (\d+) column (\d+)\)/);
        if (lineCol) return `Line ${lineCol[1]}, column ${lineCol[2]}: ${message.replace(/\s*\(line \d+ column \d+\)/, '')}`;
        const position = message.match(/at position (\d+)/);
        if (position) {
            const before = text.slice(0, Number(position[1])).split('\n');
            return `Line ${before.length}, column ${before[before.length - 1].length + 1}: ${message}`;
        }
        return message;
    }
    return firstLine(error);
}

/* True when YAML/TOML text has a `#` comment: a # outside quotes that starts
 * the line or follows whitespace (YAML; TOML allows it anywhere unquoted).
 * A heuristic, not a parse: a # inside a block scalar also counts, which errs
 * on the side of warning. */
function hasComments(format, text) {
    if (format === 'json') return false;
    for (const line of String(text).split('\n')) {
        let quote = '';
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (quote) {
                if (ch === '\\' && quote === '"') i++;
                else if (ch === quote) quote = '';
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === '#' && (format === 'toml' || i === 0 || /\s/.test(line[i - 1]))) {
                return true;
            }
        }
    }
    return false;
}

function updateCommentWarning() {
    commentWarning.hidden = !(isFormatting() && hasComments(fromFormat, leftEditor.value));
}

function documentsLabel(format, docs) {
    const label = FORMATS[format].label;
    return docs.length > 1 ? `${label} (${docs.length} documents)` : label;
}

/* The Format task's sample is deliberately untidy so the first render shows
 * what formatting does: YAML gets two documents, uneven indentation and a
 * comment (which triggers the comment-loss warning); JSON arrives minified. */
const MESSY_YAML_SAMPLE = `# Two documents, uneven indentation
apiVersion: v1
kind: Service
metadata:
      name: web
      labels: {app: web, tier: frontend}
spec:
   ports:
   -   port: 80
       targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: web}
spec:
    replicas: 3
    released: 2024-05-01
`;

function sampleText() {
    if (!isFormatting()) return stringify(fromFormat, SAMPLE);
    if (fromFormat === 'yaml') return MESSY_YAML_SAMPLE;
    if (fromFormat === 'json') return JSON.stringify(SAMPLE);
    return stringify(fromFormat, SAMPLE);
}

// Load Sample Data
function loadSample() {
    try {
        leftEditor.value = sampleText();
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
        updateStatus('left', '✗ ' + describeParseError(fromFormat, error, content), false, true);
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
        const docs = transform(parseDocuments(fromFormat, content, { preserveScalars: true }));
        leftEditor.value = stringifyDocuments(fromFormat, docs, { preserveScalars: true });
        updateStatus('left', message, true);
        updateCharCount('left');
        updateLineNumbers('left');
        saveToHistory();
        handleConvert();
    } catch (error) {
        updateStatus('left', '✗ ' + describeParseError(fromFormat, error, content), false, true);
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
    const formatting = isFormatting();
    outputIsCurrent = false;
    updateCommentWarning();

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
        docs = parseDocuments(fromFormat, input, { preserveScalars: formatting });
        updateStatus('left', `✓ Valid ${documentsLabel(fromFormat, docs)}`, true);
    } catch (error) {
        updateStatus('left', '✗ ' + describeParseError(fromFormat, error, input), false, true);
        updateStatus('right', 'Waiting for valid input', false);
        return;
    }

    try {
        if (formatting) {
            const indent = Number(indentSelect.value) || 2;
            rightEditor.value = stringifyDocuments(toFormat, docs, { indent, preserveScalars: true });
            outputIsCurrent = true;
            const count = docs.length > 1 ? ` · ${docs.length} documents` : '';
            const spacing = toFormat === 'toml' ? '' : ` · ${indent}-space indent`;
            updateStatus('right', `✓ Formatted ${FORMATS[toFormat].label}${spacing}${count}`, true);
            updateCharCount('right');
            updateLineNumbers('right');
            return;
        }
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
