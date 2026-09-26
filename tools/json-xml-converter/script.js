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
const xmlIndentSelect = document.getElementById('xml-indent');
const xmlSelfCloseInput = document.getElementById('xml-self-close');
const xmlSortAttrsInput = document.getElementById('xml-sort-attrs');

// Current mode. The hash mirrors it (#json-xml, #xml-json, #xml-format) so
// each mode is linkable; anything else falls back to JSON → XML.
const MODES = ['json-xml', 'xml-json', 'xml-format'];
let currentMode = 'json-xml';

// History for undo functionality
let leftHistory = [];
let rightHistory = [];
const MAX_HISTORY = 50;

// Initialize
function init() {
    // Check URL hash for mode
    const hash = DevToolsMain.readHashState();
    if (MODES.includes(hash)) {
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
            const mode = btn.dataset.mode;
            if (mode === currentMode) return;
            currentMode = mode;
            // replaceState (no hashchange event) plus a message so the
            // dashboard shell mirrors the mode into its address bar.
            DevToolsMain.writeHashState(mode);
            // Apply synchronously so the editors are cleared before the user
            // can type. A later hashchange sees hash === currentMode and does
            // nothing; without that guard it cleared them a second time,
            // asynchronously, wiping anything typed in between.
            updateMode();
        });
    });
    
    // Hash change (deep links, and the shell re-pointing the frame)
    DevToolsMain.onHashState((hash) => {
        if (MODES.includes(hash) && hash !== currentMode) {
            currentMode = hash;
            updateMode();
        }
    });

    // Formatter options reformat live.
    [xmlIndentSelect, xmlSelfCloseInput, xmlSortAttrsInput].forEach(control => {
        control.addEventListener('change', () => {
            if (currentMode === 'xml-format') handleConvert();
        });
    });
    
    // Action buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            if (action) handleAction(action);
        });
    });
    
    // Case menu. Opening, closing and keyboard nav come from the shared .dd
    // component in main.js; we only react to the chosen command.
    document.querySelectorAll('[data-dd="menu"]').forEach(menu => {
        menu.addEventListener('dd:change', (e) => {
            if (e.detail.value) changeCasing(e.detail.value);
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
    } else if (currentMode === 'xml-json') {
        favicon.href = 'favicon-xml-json.svg';
        document.title = 'XML → JSON Converter';
    } else {
        favicon.href = 'favicon-xml-json.svg';
        document.title = 'XML Formatter';
    }
    
    if (currentMode === 'json-xml') {
        leftTitle.textContent = 'JSON Input';
        rightTitle.textContent = 'XML Output';
        leftEditor.placeholder = 'Enter your JSON here...';
        rightEditor.placeholder = 'XML output will appear here...';
    } else if (currentMode === 'xml-json') {
        leftTitle.textContent = 'XML Input';
        rightTitle.textContent = 'JSON Output';
        leftEditor.placeholder = 'Enter your XML here...';
        rightEditor.placeholder = 'JSON output will appear here...';
    } else {
        leftTitle.textContent = 'XML Input';
        rightTitle.textContent = 'Formatted XML';
        leftEditor.placeholder = 'Paste XML to pretty-print, minify, or validate...';
        rightEditor.placeholder = 'Formatted XML will appear here...';
    }
    
    // Clear editors when switching. History restarts too: undo must not
    // bring the other mode's JSON back into an XML pane.
    leftEditor.value = '';
    rightEditor.value = '';
    leftHistory = [''];
    rightHistory = [''];
    updateStatus('left', 'Ready', false);
    updateStatus('right', 'Ready', false);
    updateCharCounts();
    updateLineNumbers('left');
    updateLineNumbers('right');

    // The formatter explains itself: arrive on a messy document that shows
    // off what is kept (comments, CDATA, PIs, mixed content, namespaces).
    if (currentMode === 'xml-format') loadSample();
}

// Which syntax a pane holds in the current mode.
function paneFormat(side) {
    if (currentMode === 'xml-format') return 'xml';
    if (currentMode === 'json-xml') return side === 'left' ? 'json' : 'xml';
    return side === 'left' ? 'xml' : 'json';
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
    } else if (currentMode === 'xml-format') {
        leftEditor.value = XML_FORMAT_SAMPLE;
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
    
    updateCharCount('left');
    updateLineNumbers('left');
    saveToHistory('left');
    // The conversion's own status ("✓ Valid XML") replaces any "sample
    // loaded" note. No timed reset to "Ready": it would wipe an error the
    // user produced by editing within the next two seconds.
    handleConvert(); // Live conversion after loading sample
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
        if (paneFormat(side) === 'json') {
            JSON.parse(content);
            updateStatus(side, '✓ Valid JSON', true);
        } else {
            validateXML(content);
            updateStatus(side, '✓ Valid XML', true);
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
        if (paneFormat(side) === 'json') {
            editor.value = JSON.stringify(JSON.parse(content), null, 2);
        } else {
            editor.value = formatXML(content);
        }
        updateStatus(side, 'Beautified', true);
        updateCharCount(side);
        updateLineNumbers(side);
        saveToHistory(side);
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
        saveToHistory('left');
        handleConvert(); // Live conversion after sorting
    } catch (error) {
        updateStatus('left', '✗ ' + error.message, false, true);
    }
}

// Sort Object Keys Recursively
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    
    return Object.fromEntries(Object.keys(obj).sort().map(key => [key, sortObjectKeys(obj[key])]));
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
        saveToHistory('left');
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
        // Emptying the input must empty the output too, not leave the last
        // conversion sitting there as if it described nothing.
        rightEditor.value = '';
        updateStatus('left', 'Ready', false);
        updateStatus('right', 'Ready', false);
        updateCharCount('right');
        updateLineNumbers('right');
        return;
    }
    
    try {
        if (currentMode === 'json-xml') {
            const obj = JSON.parse(input);
            const xml = jsonToXML(obj);
            rightEditor.value = xml;
            updateStatus('left', '✓ Valid JSON', true);
            updateStatus('right', '✓ Converted to XML', true);
        } else if (currentMode === 'xml-json') {
            const obj = xmlToJSON(input);
            rightEditor.value = JSON.stringify(obj, null, 2);
            updateStatus('left', '✓ Valid XML', true);
            updateStatus('right', '✓ Converted to JSON', true);
        } else {
            const options = xmlFormatOptions();
            rightEditor.value = formatXmlString(input, options);
            updateStatus('left', '✓ Valid XML', true);
            updateStatus('right', options.minify
                ? `✓ Minified (${input.length} → ${rightEditor.value.length} characters)`
                : `✓ Formatted · ${xmlIndentSelect.value === 'tab' ? 'tab' : xmlIndentSelect.value + '-space'} indent`, true);
        }
        updateCharCount('right');
        updateLineNumbers('right');
    } catch (error) {
        updateStatus('left', '✗ ' + error.message, false, true);
        if (currentMode === 'xml-format') updateStatus('right', 'Waiting for valid XML', false);
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
    
    function getElementName(name) {
        const value = String(name);
        if (/^[A-Za-z_][A-Za-z0-9._-]*$/.test(value)) {
            return { tagName: value, keyAttribute: '' };
        }
        return {
            tagName: 'item',
            keyAttribute: ` data-json-key="${escapeXML(value)}"`
        };
    }

    function convert(obj, name, level = 0) {
        const indent = '  '.repeat(level);
        const { tagName, keyAttribute } = getElementName(name);
        
        if (obj === null || obj === undefined) {
            return `${indent}<${tagName}${keyAttribute} />\n`;
        }
        
        if (typeof obj === 'object' && !Array.isArray(obj)) {
            let result = `${indent}<${tagName}${keyAttribute}>\n`;
            for (let key in obj) {
                result += convert(obj[key], key, level + 1);
            }
            result += `${indent}</${tagName}>\n`;
            return result;
        } else if (Array.isArray(obj)) {
            // An empty array still names its key rather than vanishing.
            if (obj.length === 0) return `${indent}<${tagName}${keyAttribute} />\n`;
            let result = '';
            obj.forEach(item => {
                // A nested array is wrapped in its own element; repeating the
                // name for its items too flattened [[1,2],[3]] into [1,2,3].
                if (Array.isArray(item)) {
                    result += `${indent}<${tagName}${keyAttribute}>\n`;
                    item.forEach(inner => { result += convert(inner, 'item', level + 1); });
                    result += `${indent}</${tagName}>\n`;
                } else {
                    result += convert(item, name, level);
                }
            });
            return result;
        } else {
            return `${indent}<${tagName}${keyAttribute}>${escapeXML(obj)}</${tagName}>\n`;
        }
    }
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    if (Array.isArray(obj)) {
        const root = getElementName(rootName);
        xml += `<${root.tagName}${root.keyAttribute}>\n`;
        obj.forEach((item) => {
            xml += convert(item, 'item', 1);
        });
        xml += `</${root.tagName}>\n`;
    } else {
        xml += convert(obj, rootName, 0);
    }
    return xml.trim();
}

// XML to JSON Converter
function xmlToJSON(xmlString) {
    let xmlDoc;
    try {
        xmlDoc = parseXmlDocument(xmlString);
    } catch (error) {
        throw new Error('Invalid XML: ' + error.message);
    }
    
    function parseNode(node) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent.trim();
            return text || null;
        }
        
        if (node.nodeType !== 1) return null; // Element node
        
        const obj = Object.create(null);
        
        // Handle attributes
        const attributes = Array.from(node.attributes).filter(attr => attr.name !== 'data-json-key');
        if (attributes.length > 0) {
            obj['@attributes'] = Object.create(null);
            for (const attr of attributes) {
                obj['@attributes'][attr.name] = attr.value;
            }
        }
        
        // Text and CDATA sections both carry text; comments and processing
        // instructions do not. Checking only for a lone text node dropped
        // <a><![CDATA[x]]></a> and <a>x<!-- note --></a> to an empty {}.
        const childNodes = Array.from(node.childNodes);
        const hasElements = childNodes.some(child => child.nodeType === 1);
        const text = childNodes
            .filter(child => child.nodeType === 3 || child.nodeType === 4)
            .map(child => child.textContent)
            .join('')
            .trim();

        if (!hasElements && childNodes.length > 0) {
            if (attributes.length > 0) {
                obj['#text'] = text;
                return obj;
            }
            return text;
        }
        if (hasElements && text) obj['#text'] = text;
        
        const children = Object.create(null);
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType !== 1) continue;
            
            const childData = parseNode(child);
            const childName = child.getAttribute('data-json-key') ?? child.nodeName;
            
            if (Object.hasOwn(children, childName)) {
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
    parseXmlDocument(xmlString);
    return true;
}

// Beautify for the converter panes: the DOM-based formatter at 2 spaces, so
// mixed content and comments survive a beautify just as they do in the
// XML Formatter mode.
function formatXML(xml) {
    return formatXmlString(xml, { indent: '  ' });
}

/* ---------- XML Formatter ---------- */

const XML_FORMAT_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Catalog export: formatting keeps comments, CDATA and PIs -->
<?xml-stylesheet type="text/xsl" href="catalog.xsl"?>
<catalog xmlns="urn:example:catalog" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2">
<book id="bk101" lang="en"><dc:title>XML Developer's Guide</dc:title>
      <price currency="USD">44.95</price><tags/>
  <description>An <em>in-depth</em> look at creating applications with <b>XML</b>.</description>
<script><![CDATA[if (a < b && c > d) { run(); }]]></script>
</book>
    <book id="bk102"><dc:title>Midnight Rain</dc:title><price currency="GBP">5.95</price></book>
</catalog>`;

function xmlFormatOptions() {
    const indent = xmlIndentSelect.value;
    return {
        indent: indent === 'tab' ? '\t' : ' '.repeat(Number(indent) || 2),
        minify: indent === 'minify',
        selfClose: xmlSelfCloseInput.checked,
        sortAttributes: xmlSortAttrsInput.checked,
    };
}

/* DOMParser reports errors as a <parsererror> element rather than throwing,
 * and each engine words it differently:
 *   Chromium/WebKit: "…error on line 2 at column 11: Opening and ending tag mismatch…"
 *   Firefox:         "XML Parsing Error: mismatched tag…\nLocation: …\nLine Number 2, Column 11:"
 * Pull out line, column and the message so the status bar reads as one line. */
function describeXmlError(text) {
    const raw = String(text || '');
    let match = raw.match(/line (\d+) at column (\d+):\s*([^\n]*)/i);
    if (match) return { line: Number(match[1]), column: Number(match[2]), reason: match[3].trim() };
    match = raw.match(/XML Parsing Error:\s*([^\n]*)[\s\S]*?Line Number (\d+), Column (\d+)/i);
    if (match) return { line: Number(match[2]), column: Number(match[3]), reason: match[1].trim() };
    const reason = raw.replace(/^This page contains the following errors:/, '').split('\n')[0].trim();
    return { line: null, column: null, reason: reason || 'Malformed XML' };
}

function parseXmlDocument(source) {
    const doc = new DOMParser().parseFromString(source, 'text/xml');
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
        const info = describeXmlError(parserError.textContent);
        const where = info.line ? `Line ${info.line}, column ${info.column}: ` : '';
        const error = new Error(where + info.reason);
        error.line = info.line;
        error.column = info.column;
        throw error;
    }
    return doc;
}

/* The DOM loses three things the formatter must keep, so read them from the
 * (already validated) source text:
 *  - the XML declaration, which is not a node at all;
 *  - the doctype's internal subset (Chromium exposes no internalSubset);
 *  - attribute order: Chromium hoists xmlns declarations to the front of
 *    Element.attributes, so source order has to come from the start tags.
 * Start tags are recorded in document order, which is the order of
 * getElementsByTagName('*'). */
function scanXmlSource(source) {
    const result = { declaration: '', doctype: '', attributeOrder: [] };
    const skipTo = (marker, from) => {
        const at = source.indexOf(marker, from);
        return at === -1 ? source.length : at + marker.length;
    };
    let i = 0;
    while (i < source.length) {
        const lt = source.indexOf('<', i);
        if (lt === -1) break;
        if (source.startsWith('<!--', lt)) {
            i = skipTo('-->', lt + 4);
        } else if (source.startsWith('<![CDATA[', lt)) {
            i = skipTo(']]>', lt + 9);
        } else if (source.startsWith('<?', lt)) {
            i = skipTo('?>', lt + 2);
            if (lt === 0 && /^<\?xml\s/.test(source)) result.declaration = source.slice(0, i);
        } else if (source.startsWith('<!', lt)) {
            // DOCTYPE: '>' inside the [internal subset] or a quoted literal
            // does not end it.
            let depth = 0;
            let quote = '';
            let j = lt + 2;
            for (; j < source.length; j++) {
                const ch = source[j];
                if (quote) { if (ch === quote) quote = ''; }
                else if (ch === '"' || ch === "'") quote = ch;
                else if (ch === '[') depth++;
                else if (ch === ']') depth--;
                else if (ch === '>' && depth <= 0) break;
            }
            i = j + 1;
            if (/^<!DOCTYPE/i.test(source.slice(lt, lt + 9))) result.doctype = source.slice(lt, i);
        } else if (source[lt + 1] === '/') {
            i = skipTo('>', lt);
        } else {
            const names = [];
            let j = lt + 1;
            while (j < source.length && !/[\s/>]/.test(source[j])) j++;
            while (j < source.length) {
                while (/\s/.test(source[j])) j++;
                if (source[j] === '>' || source[j] === '/' || j >= source.length) break;
                const start = j;
                while (j < source.length && !/[\s=]/.test(source[j])) j++;
                names.push(source.slice(start, j));
                while (/[\s=]/.test(source[j])) j++;
                const quote = source[j];
                j = source.indexOf(quote, j + 1) + 1 || source.length;
            }
            result.attributeOrder.push(names);
            i = skipTo('>', j);
        }
    }
    return result;
}

// Text: & and < must be escaped; > too, so "]]>" can never appear.
function escapeXmlText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}

// Attributes are always written double-quoted, so " needs escaping and '
// does not. Tab/newline/CR become character references: literal ones would
// be normalized to spaces by the next parser (XML 1.0 §3.3.3).
function escapeXmlAttribute(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/\t/g, '&#9;')
        .replace(/\n/g, '&#10;')
        .replace(/\r/g, '&#13;');
}

const isNamespaceDeclaration = (name) => name === 'xmlns' || name.startsWith('xmlns:');

/* Pretty-print or minify an XML string by re-serializing its DOM.
 * options: { indent: '  ' | '    ' | '\t', minify, selfClose, sortAttributes }
 *
 * Whitespace rule: an element whose children are only elements, comments and
 * PIs (plus whitespace-only text) is laid out one child per line and that
 * whitespace is discarded. Anything with real text or CDATA is mixed content:
 * it and everything inside it is written exactly as parsed, because
 * whitespace there is data (`<p>Hello <b>world</b>!</p>`). xml:space="preserve"
 * forces the same verbatim treatment. */
function formatXmlString(source, options = {}) {
    const opts = { indent: '  ', minify: false, selfClose: true, sortAttributes: false, ...options };
    const text = String(source).replace(/^\uFEFF/, '').trim();
    const doc = parseXmlDocument(text);
    const scan = scanXmlSource(text);

    const sourceOrder = new Map();
    const elements = doc.getElementsByTagName('*');
    // A mismatch means entity expansion produced elements the scanner could
    // not see; fall back to DOM order rather than guess.
    if (elements.length === scan.attributeOrder.length) {
        for (let k = 0; k < elements.length; k++) sourceOrder.set(elements[k], scan.attributeOrder[k]);
    }

    const newline = opts.minify ? '' : '\n';
    const unit = opts.minify ? '' : opts.indent;

    const attributesOf = (el) => {
        const attrs = Array.from(el.attributes);
        const order = sourceOrder.get(el);
        if (order) {
            const rank = (name) => { const at = order.indexOf(name); return at === -1 ? order.length : at; };
            attrs.sort((a, b) => rank(a.name) - rank(b.name));
        }
        if (opts.sortAttributes) {
            // Namespace declarations stay first (in source order) so a reader
            // sees prefixes bound before they are used.
            const decls = attrs.filter(a => isNamespaceDeclaration(a.name));
            const rest = attrs.filter(a => !isNamespaceDeclaration(a.name))
                .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            return decls.concat(rest);
        }
        return attrs;
    };

    const serialize = (node, depth, verbatim) => {
        switch (node.nodeType) {
            case Node.TEXT_NODE:
                return escapeXmlText(node.nodeValue);
            case Node.CDATA_SECTION_NODE:
                return `<![CDATA[${node.nodeValue}]]>`;
            case Node.COMMENT_NODE:
                return `<!--${node.nodeValue}-->`;
            case Node.PROCESSING_INSTRUCTION_NODE:
                return `<?${node.target}${node.data ? ' ' + node.data : ''}?>`;
            case Node.ELEMENT_NODE:
                break;
            default:
                return '';
        }

        const name = node.tagName;
        const open = `<${name}${attributesOf(node).map(a => ` ${a.name}="${escapeXmlAttribute(a.value)}"`).join('')}`;
        const close = `</${name}>`;
        const children = Array.from(node.childNodes);
        if (children.length === 0) return opts.selfClose ? `${open}/>` : `${open}>${close}`;

        const isMixed = children.some(child =>
            child.nodeType === Node.CDATA_SECTION_NODE
            || (child.nodeType === Node.TEXT_NODE && /\S/.test(child.nodeValue)));
        // `<a>  </a>`: whitespace that is the element's only content is its
        // value, not layout between elements.
        const onlyText = children.every(child => child.nodeType === Node.TEXT_NODE);
        if (verbatim || isMixed || onlyText || node.getAttribute('xml:space') === 'preserve') {
            return `${open}>${children.map(child => serialize(child, 0, true)).join('')}${close}`;
        }

        const pad = newline + unit.repeat(depth + 1);
        const body = children
            .filter(child => child.nodeType !== Node.TEXT_NODE)
            .map(child => pad + serialize(child, depth + 1, false))
            .join('');
        return `${open}>${body}${newline}${unit.repeat(depth)}${close}`;
    };

    const parts = [];
    if (scan.declaration) parts.push(scan.declaration);
    for (const node of doc.childNodes) {
        if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
            parts.push(scan.doctype || serializeDoctype(node));
        } else if (node.nodeType !== Node.TEXT_NODE) {
            parts.push(serialize(node, 0, false));
        }
    }
    return parts.join(newline);
}

function serializeDoctype(node) {
    const ids = node.publicId
        ? ` PUBLIC "${node.publicId}" "${node.systemId}"`
        : node.systemId ? ` SYSTEM "${node.systemId}"` : '';
    return `<!DOCTYPE ${node.name}${ids}>`;
}

// Copy to Clipboard
async function copyToClipboard(text, side) {
    if (!text) {
        updateStatus(side, 'No content to copy', false);
        return;
    }
    
    try {
        await navigator.clipboard.writeText(text);
        flashStatus(side, '✓ Copied to clipboard');
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
        flashStatus(side, '✓ Pasted from clipboard');
        updateCharCount(side);
        updateLineNumbers(side);
        saveToHistory(side);
        if (side === 'left') {
            handleConvert(); // Live conversion after paste; its verdict replaces the flash
        }
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
    const isJson = paneFormat(side) === 'json';
    const filename = currentMode === 'xml-format' && side === 'right'
        ? 'formatted.xml'
        : isJson ? 'data.json' : 'data.xml';
    const mimeType = isJson ? 'application/json' : 'application/xml';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    flashStatus(side, `✓ Downloaded ${filename}`);
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
    
    flashStatus(side, '✓ Undo successful');
    updateCharCount(side);
    updateLineNumbers(side);
    // The output follows the input, so undoing the input re-converts it.
    if (side === 'left') handleConvert();
}

// A transient confirmation that reverts to "Ready". Any later status wins:
// a bare setTimeout used to wipe an error that arrived in the meantime
// (paste invalid JSON and the error vanished two seconds later).
const statusTimers = {};

function flashStatus(side, message) {
    updateStatus(side, message, true);
    statusTimers[side] = setTimeout(() => updateStatus(side, 'Ready', false), 2000);
}

// Update Status
function updateStatus(side, message, isSuccess = false, isError = false) {
    clearTimeout(statusTimers[side]);
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
