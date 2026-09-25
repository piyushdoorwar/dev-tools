const { parseJson, stringify, runJsonPath, runJq, typeOf } = window.JsonQuery;
const { $, $$ } = DevToolsMain;

const input = $('#input');
const output = $('#output');
const outputTitle = $('#output-title');
const inputStatus = $('#input-status');
const outputStatus = $('#output-status');
const queryInput = $('#query');
const queryLang = $('#query-lang');
const indentSelect = $('#indent');
const indentOption = $('#indent-option');
const sortKeys = $('#sort-keys');
const resultSwitch = $('#result-switch');
const fileInput = $('#file-input');

const LANGS = {
    jsonpath: { label: 'JSONPath', placeholder: '$.store.book[?@.price < 10].title' },
    jq: { label: 'jq', placeholder: '.store.book[] | select(.price < 10) | .title' },
};
const INDENTS = { 2: '  ', 4: '    ', tab: '\t' };

// Written as text rather than built from an object so it can show off what
// JSON.parse would lose: the integer-like keys under "warehouses" keep their
// order, and "orderId" keeps every digit.
const SAMPLE = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95, "tags": ["quotes"] },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99, "tags": ["war", "classic"] },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99, "tags": ["sea", "classic"] },
      { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99, "tags": ["fantasy", "classic", "epic"] }
    ],
    "bicycle": { "color": "red", "price": 399.00 }
  },
  "orderId": 12345678901234567890,
  "warehouses": { "10": "Leeds", "2": "Bristol" }
}`;

const state = {
    style: 'pretty',
    lang: 'jsonpath',
    result: 'values',
    // Each language keeps its own query, so flipping between them to compare
    // does not throw away what was typed.
    queries: { jsonpath: '', jq: '' },
};

// Parsing is the expensive step; a query keystroke should not repeat it.
let parsed = { text: null, value: undefined, error: null, duplicates: [], bigNumbers: 0 };

function parseInput(text) {
    if (parsed.text === text) return parsed;
    try {
        const result = parseJson(text);
        parsed = { text, value: result.value, error: null, duplicates: result.duplicates, bigNumbers: result.bigNumbers };
    } catch (error) {
        parsed = { text, value: undefined, error, duplicates: [], bigNumbers: 0 };
    }
    return parsed;
}

function formatOptions() {
    return {
        indent: state.style === 'minified' ? '' : INDENTS[indentSelect.value] || '  ',
        sortKeys: sortKeys.checked,
    };
}

/* ---------- Status ---------- */

function setStatus(bar, message, kind = '') {
    const text = bar.querySelector('.status-text');
    text.textContent = message;
    text.title = message;
    bar.classList.remove('is-success', 'is-warning', 'is-error');
    if (kind) bar.classList.add(`is-${kind}`);
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : /(s|x|ch|sh)$/.test(word) ? 'es' : 's'}`;

function describeDocument(value) {
    const type = typeOf(value);
    if (type === 'object') return plural(value.size, 'key');
    if (type === 'array') return plural(value.length, 'item');
    return type;
}

function depthOf(value) {
    let max = 0;
    const stack = [[value, 0]];
    while (stack.length) {
        const [v, d] = stack.pop();
        const children = Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : null;
        if (!children) continue;
        max = Math.max(max, d + 1);
        for (const child of children) stack.push([child, d + 1]);
    }
    return max;
}

/* ---------- Render ---------- */

function render() {
    const text = input.value;
    const query = queryInput.value.trim();
    outputTitle.textContent = query ? 'Query result' : state.style === 'minified' ? 'Minified' : 'Formatted';

    if (!text.trim()) {
        output.value = '';
        output.classList.remove('is-stale');
        setStatus(inputStatus, 'Ready');
        setStatus(outputStatus, 'Ready');
        queryInput.removeAttribute('aria-invalid');
        return;
    }

    const doc = parseInput(text);
    if (doc.error) {
        setStatus(inputStatus, `✗ ${doc.error.message}`, 'error');
        inputStatus.classList.toggle('is-jump', doc.error.position !== undefined);
        setStatus(outputStatus, 'Waiting for valid JSON');
        output.classList.add('is-stale');
        return;
    }
    inputStatus.classList.remove('is-jump');

    const facts = [`✓ Valid JSON · ${describeDocument(doc.value)} · depth ${depthOf(doc.value)}`];
    if (doc.bigNumbers) facts.push(`${plural(doc.bigNumbers, 'large number')} kept exact`);
    if (doc.duplicates.length) {
        const first = doc.duplicates[0];
        const more = doc.duplicates.length > 1 ? ` (+${doc.duplicates.length - 1} more)` : '';
        setStatus(inputStatus, `⚠ Duplicate key "${first.key}" at line ${first.line}, column ${first.column}${more} — only the last value is kept`, 'warning');
    } else {
        setStatus(inputStatus, facts.join(' · '), 'success');
    }

    const options = formatOptions();
    if (!query) {
        queryInput.removeAttribute('aria-invalid');
        output.value = stringify(doc.value, options);
        output.classList.remove('is-stale');
        if (state.style === 'minified') {
            const before = text.length;
            const after = output.value.length;
            const saved = before ? Math.round((1 - after / before) * 100) : 0;
            setStatus(outputStatus, `✓ Minified · ${before.toLocaleString()} → ${after.toLocaleString()} characters (${saved >= 0 ? '−' : '+'}${Math.abs(saved)}%)`, 'success');
        } else {
            const indent = { 2: '2-space', 4: '4-space', tab: 'tab' }[indentSelect.value];
            setStatus(outputStatus, `✓ Formatted · ${indent} indent${options.sortKeys ? ' · keys sorted' : ''}`, 'success');
        }
        return;
    }

    try {
        if (state.lang === 'jsonpath') {
            const nodes = runJsonPath(query, doc.value);
            const values = state.result === 'paths' ? nodes.map(n => n.path) : nodes.map(n => n.value);
            output.value = stringify(values, options);
            setStatus(outputStatus, nodes.length ? `✓ ${plural(nodes.length, 'match')}` : 'No matches', nodes.length ? 'success' : '');
        } else {
            const results = runJq(query, doc.value);
            output.value = results.map(r => stringify(r, options)).join('\n');
            setStatus(outputStatus, results.length ? `✓ ${plural(results.length, 'result')}` : 'No results', results.length ? 'success' : '');
        }
        output.classList.remove('is-stale');
        queryInput.removeAttribute('aria-invalid');
    } catch (error) {
        // Keep the last good result on screen while the query is mid-edit,
        // dimmed so it does not read as the answer.
        output.classList.add('is-stale');
        queryInput.setAttribute('aria-invalid', 'true');
        setStatus(outputStatus, `✗ ${error.message}`, 'error');
    }
}

/* ---------- Controls ---------- */

function setStyle(style) {
    state.style = style;
    $$('.mode-btn[data-style]').forEach(btn => {
        const active = btn.dataset.style === style;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    indentOption.classList.toggle('is-disabled', style === 'minified');
    indentOption.querySelector('.dd__trigger').disabled = style === 'minified';
    render();
}

function setResult(result) {
    state.result = result;
    $$('.mode-btn[data-result]').forEach(btn => {
        const active = btn.dataset.result === result;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    render();
}

function setLang(lang, { query, writeHash = true } = {}) {
    if (!LANGS[lang]) lang = 'jsonpath';
    state.queries[state.lang] = queryInput.value;
    state.lang = lang;
    if (query !== undefined) state.queries[lang] = query;
    queryInput.value = state.queries[lang];
    queryInput.placeholder = LANGS[lang].placeholder;
    DevToolsMain.selectDropdownValue(queryLang.nextElementSibling, lang, { emit: false });
    resultSwitch.hidden = lang !== 'jsonpath';
    if (writeHash) DevToolsMain.writeHashState(lang);
    render();
}

function loadText(text, message) {
    input.value = text;
    render();
    // Only a clean parse gets the success prefix: a duplicate-key warning must
    // keep its warning styling, not be repainted green.
    if (message && !parsed.error && !parsed.duplicates.length) {
        setStatus(inputStatus, `${message} · ${inputStatus.textContent.replace(/^✓ /, '')}`, 'success');
    }
}

function jumpToError() {
    const error = parsed.error;
    if (!error || error.position === undefined) return;
    input.focus();
    input.setSelectionRange(error.position, Math.min(error.position + 1, input.value.length));
    // Scroll the caret line into view: textareas do not do it on setSelectionRange.
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.scrollTop = Math.max(0, (error.line - 3) * lineHeight);
}

async function handleAction(action) {
    switch (action) {
        case 'sample':
            loadText(SAMPLE, 'Sample loaded');
            break;
        case 'open':
            fileInput.click();
            break;
        case 'paste':
            try {
                loadText(await navigator.clipboard.readText(), 'Pasted');
            } catch {
                DevToolsMain.showToast('Clipboard access was blocked — paste with Ctrl+V instead', 'error');
            }
            break;
        case 'format-input': {
            if (!input.value.trim()) {
                DevToolsMain.showToast('Nothing to format', 'warning');
                break;
            }
            const doc = parseInput(input.value);
            if (doc.error) {
                DevToolsMain.showToast('Fix the JSON error first', 'error');
                jumpToError();
                break;
            }
            loadText(stringify(doc.value, formatOptions()), 'Input formatted');
            break;
        }
        case 'clear':
            input.value = '';
            render();
            input.focus();
            break;
        case 'copy':
            if (!output.value) {
                DevToolsMain.showToast('Nothing to copy', 'warning');
                break;
            }
            try {
                await DevToolsMain.copyText(output.value);
                DevToolsMain.showToast('Copied to clipboard', 'success');
            } catch {
                DevToolsMain.showToast('Copy failed', 'error');
            }
            break;
        case 'download': {
            if (!output.value) {
                DevToolsMain.showToast('Nothing to download', 'warning');
                break;
            }
            const name = queryInput.value.trim() ? 'query-result' : state.style === 'minified' ? 'minified' : 'formatted';
            // A file ends with a newline so the next diff does not flag the last line.
            const body = output.value.endsWith('\n') ? output.value : output.value + '\n';
            DevToolsMain.downloadText(`${name}.json`, body, 'application/json');
            break;
        }
    }
}

function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), `Opened ${file.name}`);
    reader.onerror = () => DevToolsMain.showToast(`Could not read ${file.name}`, 'error');
    reader.readAsText(file);
}

function init() {
    $$('.action-btn[data-action]').forEach(btn => btn.addEventListener('click', () => handleAction(btn.dataset.action)));
    $$('.mode-btn[data-style]').forEach(btn => btn.addEventListener('click', () => setStyle(btn.dataset.style)));
    $$('.mode-btn[data-result]').forEach(btn => btn.addEventListener('click', () => setResult(btn.dataset.result)));

    input.addEventListener('input', render);
    queryInput.addEventListener('input', render);
    indentSelect.addEventListener('change', render);
    sortKeys.addEventListener('change', render);
    queryLang.addEventListener('change', () => setLang(queryLang.value));

    inputStatus.addEventListener('click', jumpToError);

    fileInput.addEventListener('change', () => {
        readFile(fileInput.files[0]);
        fileInput.value = '';
    });
    input.addEventListener('dragover', (event) => {
        event.preventDefault();
        input.classList.add('is-dragover');
    });
    input.addEventListener('dragleave', () => input.classList.remove('is-dragover'));
    input.addEventListener('drop', (event) => {
        event.preventDefault();
        input.classList.remove('is-dragover');
        readFile(event.dataTransfer.files[0]);
    });

    $$('.example').forEach(btn => btn.addEventListener('click', () => {
        if (!input.value.trim()) loadText(SAMPLE);
        setLang(btn.dataset.lang, { query: btn.dataset.query });
        DevToolsMain.closeModal('#helpModal');
        queryInput.focus();
    }));

    DevToolsMain.onHashState((value) => {
        if (LANGS[value] && value !== state.lang) setLang(value, { writeHash: false });
    });

    // Unknown or missing hash falls back to JSONPath without rewriting the URL.
    setLang(DevToolsMain.readHashState(), { writeHash: false });
}

init();
