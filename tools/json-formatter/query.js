/* JSON parsing, diff-friendly formatting, and the JSONPath and jq engines.
 *
 * Why not JSON.parse? A formatter whose output is meant to be diffed must not
 * change the document behind the user's back, and JSON.parse does two things
 * that do exactly that:
 *
 *  - Object keys that look like array indices ("2", "10") are hoisted to the
 *    front in numeric order, so {"b":1,"10":2} reformats as {"10":2,"b":1}.
 *  - Numbers are coerced to doubles, so an ID like 12345678901234567890
 *    reformats as 12345678901234567000, and 1.50 as 1.5.
 *
 * So objects are parsed into Maps (insertion order, any key), and a number
 * whose literal would not survive a round trip is kept as a JsonNumber holding
 * its original text. Everything in this file works on that representation.
 */
(function (global) {
    'use strict';

    class JsonNumber {
        constructor(raw) {
            this.raw = raw;
            this.value = Number(raw);
        }
    }

    class JsonSyntaxError extends Error {
        constructor(message, position, text) {
            const { line, column } = lineColumn(text, position);
            super(`Line ${line}, column ${column}: ${message}`);
            this.position = position;
            this.line = line;
            this.column = column;
        }
    }

    function lineColumn(text, position) {
        let line = 1;
        let lineStart = 0;
        for (let i = 0; i < position && i < text.length; i++) {
            if (text.charCodeAt(i) === 10) {
                line++;
                lineStart = i + 1;
            }
        }
        return { line, column: position - lineStart + 1 };
    }

    /* ---------- Parser ---------- */

    const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

    function describe(ch) {
        return ch === undefined ? 'end of input' : `"${ch}"`;
    }

    /* Returns { value, duplicates, bigNumbers }. `duplicates` lists repeated
     * keys (the last value wins, as with JSON.parse) so the UI can warn:
     * a formatter that silently drops one is hiding a real bug. */
    function parseJson(text) {
        let i = 0;
        const duplicates = [];
        let bigNumbers = 0;

        const fail = (message, at = i) => { throw new JsonSyntaxError(message, at, text); };

        const skipWhitespace = () => {
            for (;;) {
                const c = text.charCodeAt(i);
                if (c === 32 || c === 10 || c === 13 || c === 9) i++;
                else break;
            }
        };

        const parseString = () => {
            const start = i;
            i++; // opening quote
            let needsDecode = false;
            for (;;) {
                if (i >= text.length) fail('Unterminated string', start);
                const c = text.charCodeAt(i);
                if (c === 34) break;
                if (c === 92) {
                    needsDecode = true;
                    i += 2;
                    continue;
                }
                if (c < 32) fail('Control character in string — escape it as \\n, \\t, or \\u00XX');
                i++;
            }
            i++; // closing quote
            if (!needsDecode) return text.slice(start + 1, i - 1);
            try {
                return JSON.parse(text.slice(start, i));
            } catch {
                fail('Invalid escape sequence in string', start);
            }
        };

        const parseValue = (depth) => {
            if (depth > 2000) fail('Nesting is too deep');
            skipWhitespace();
            const ch = text[i];
            if (ch === '{') {
                const start = i;
                i++;
                const object = new Map();
                skipWhitespace();
                if (text[i] === '}') {
                    i++;
                    return object;
                }
                for (;;) {
                    skipWhitespace();
                    if (text[i] !== '"') {
                        fail(text[i] === '}' ? 'Trailing comma before "}"' : `Expected a double-quoted property name, found ${describe(text[i])}`);
                    }
                    const keyAt = i;
                    const key = parseString();
                    skipWhitespace();
                    if (text[i] !== ':') fail(`Expected ":" after property name, found ${describe(text[i])}`);
                    i++;
                    const value = parseValue(depth + 1);
                    if (object.has(key)) duplicates.push({ key, ...lineColumn(text, keyAt) });
                    object.set(key, value);
                    skipWhitespace();
                    if (text[i] === ',') {
                        i++;
                        continue;
                    }
                    if (text[i] === '}') {
                        i++;
                        return object;
                    }
                    fail(i >= text.length ? `Unclosed "{" opened at ${where(start)}` : `Expected "," or "}", found ${describe(text[i])}`);
                }
            }
            if (ch === '[') {
                const start = i;
                i++;
                const array = [];
                skipWhitespace();
                if (text[i] === ']') {
                    i++;
                    return array;
                }
                for (;;) {
                    skipWhitespace();
                    if (text[i] === ']') fail('Trailing comma before "]"');
                    array.push(parseValue(depth + 1));
                    skipWhitespace();
                    if (text[i] === ',') {
                        i++;
                        continue;
                    }
                    if (text[i] === ']') {
                        i++;
                        return array;
                    }
                    fail(i >= text.length ? `Unclosed "[" opened at ${where(start)}` : `Expected "," or "]", found ${describe(text[i])}`);
                }
            }
            if (ch === '"') return parseString();
            if (ch === '-' || (ch >= '0' && ch <= '9')) {
                NUMBER_RE.lastIndex = i;
                const match = NUMBER_RE.exec(text);
                if (!match) fail('Invalid number');
                i += match[0].length;
                const raw = match[0];
                const value = Number(raw);
                if (String(value) === raw) return value;
                if (/^-?\d+$/.test(raw) && !Number.isSafeInteger(value)) bigNumbers++;
                return new JsonNumber(raw);
            }
            for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
                if (text.startsWith(word, i)) {
                    i += word.length;
                    return value;
                }
            }
            if (ch === "'") fail('Strings must use double quotes');
            fail(i >= text.length ? 'Unexpected end of input' : `Unexpected ${describe(ch)}`);
        };

        const where = (position) => {
            const { line, column } = lineColumn(text, position);
            return `line ${line}, column ${column}`;
        };

        const value = parseValue(0);
        skipWhitespace();
        if (i < text.length) fail(`Unexpected ${describe(text[i])} after the end of the document`);
        return { value, duplicates, bigNumbers };
    }

    /* ---------- Stringify ---------- */

    // Plain code-unit order: deterministic, and what `sort` does everywhere.
    const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

    function stringify(value, { indent = '  ', sortKeys = false } = {}) {
        const newline = indent ? '\n' : '';
        const colon = indent ? ': ' : ':';
        const walk = (v, pad) => {
            if (v === null || v === undefined) return 'null';
            switch (typeof v) {
                case 'string': return JSON.stringify(v);
                case 'number': return Number.isFinite(v) ? String(v) : 'null';
                case 'boolean': return String(v);
            }
            if (v instanceof JsonNumber) return v.raw;
            const inner = pad + indent;
            if (Array.isArray(v)) {
                if (!v.length) return '[]';
                return '[' + newline + v.map(item => inner + walk(item, inner)).join(',' + newline) + newline + pad + ']';
            }
            if (v instanceof Map) {
                if (!v.size) return '{}';
                const keys = [...v.keys()];
                if (sortKeys) keys.sort(compareKeys);
                return '{' + newline + keys.map(key => inner + JSON.stringify(key) + colon + walk(v.get(key), inner)).join(',' + newline) + newline + pad + '}';
            }
            return 'null';
        };
        return walk(value, '');
    }

    /* Convert to and from ordinary JS values: used by tests and by nothing
     * that cares about key order. */
    function toPlain(v) {
        if (v instanceof JsonNumber) return v.value;
        if (Array.isArray(v)) return v.map(toPlain);
        if (v instanceof Map) {
            const out = {};
            for (const [k, val] of v) Object.defineProperty(out, k, { value: toPlain(val), enumerable: true, writable: true, configurable: true });
            return out;
        }
        return v;
    }

    function fromPlain(v) {
        if (Array.isArray(v)) return v.map(fromPlain);
        if (v && typeof v === 'object') return new Map(Object.entries(v).map(([k, val]) => [k, fromPlain(val)]));
        return v;
    }

    /* ---------- Shared value semantics ---------- */

    function typeOf(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'number' || v instanceof JsonNumber) return 'number';
        if (typeof v === 'string') return 'string';
        if (Array.isArray(v)) return 'array';
        return 'object';
    }

    const num = (v) => (v instanceof JsonNumber ? v.value : v);
    const isObject = (v) => v instanceof Map;
    const truthy = (v) => v !== null && v !== undefined && v !== false;

    // jq's total order: null < false < true < numbers < strings < arrays < objects.
    const TYPE_RANK = { null: 0, boolean: 1, number: 3, string: 4, array: 5, object: 6 };

    function compareValues(a, b) {
        const ta = typeOf(a);
        const tb = typeOf(b);
        const ra = ta === 'boolean' ? (a ? 2 : 1) : TYPE_RANK[ta];
        const rb = tb === 'boolean' ? (b ? 2 : 1) : TYPE_RANK[tb];
        if (ra !== rb) return ra < rb ? -1 : 1;
        if (ta === 'number') {
            const x = num(a);
            const y = num(b);
            return x < y ? -1 : x > y ? 1 : 0;
        }
        if (ta === 'string') return compareKeys(a, b);
        if (ta === 'array') {
            for (let k = 0; k < Math.min(a.length, b.length); k++) {
                const c = compareValues(a[k], b[k]);
                if (c) return c;
            }
            return a.length - b.length ? (a.length < b.length ? -1 : 1) : 0;
        }
        if (ta === 'object') {
            const ka = [...a.keys()].sort(compareKeys);
            const kb = [...b.keys()].sort(compareKeys);
            const c = compareValues(ka, kb);
            if (c) return c;
            for (const key of ka) {
                const d = compareValues(a.get(key), b.get(key));
                if (d) return d;
            }
        }
        return 0;
    }

    const equals = (a, b) => compareValues(a, b) === 0;

    function stringLength(s) {
        let n = 0;
        for (const _ of s) n++; // code points, not UTF-16 units
        return n;
    }

    class QueryError extends Error {
        constructor(message, position) {
            super(position === undefined ? message : `${message} (at column ${position + 1})`);
            this.position = position;
        }
    }

    /* =====================================================================
     * JSONPath — RFC 9535, with a little leniency: the leading `$` may be
     * omitted, `[?(…)]` is accepted alongside `[?…]`, and dot names may
     * contain `-` because real-world keys do.
     * ===================================================================== */

    const NOTHING = Symbol('nothing');
    const NAME_START = /[A-Za-z_\u0080-￿]/;
    const NAME_CHAR = /[A-Za-z0-9_\-\u0080-￿]/;

    function compileJsonPath(source) {
        let src = source.trim();
        let offset = source.indexOf(src);
        if (!src) throw new QueryError('Empty query');
        if (src[0] !== '$') {
            // `store.book` or `.store.book` or `[0]` → treat as relative to root.
            const prefix = src[0] === '.' || src[0] === '[' ? '$' : '$.';
            src = prefix + src;
            offset -= prefix.length;
        }
        let i = 0;

        const err = (message, at = i) => { throw new QueryError(message, at + offset); };
        const ws = () => { while (/\s/.test(src[i] || '')) i++; };
        const eat = (s) => {
            if (src.startsWith(s, i)) {
                i += s.length;
                return true;
            }
            return false;
        };
        const expect = (s) => { if (!eat(s)) err(`Expected "${s}"${src[i] ? `, found "${src[i]}"` : ' but the query ended'}`); };

        const parseName = () => {
            const start = i;
            if (!NAME_START.test(src[i] || '')) err(src[i] ? `Unexpected "${src[i]}" after "."` : 'Expected a name after "."');
            while (i < src.length && NAME_CHAR.test(src[i])) i++;
            return src.slice(start, i);
        };

        const parseStringLiteral = () => {
            const quote = src[i];
            const start = i;
            i++;
            let out = '';
            while (i < src.length && src[i] !== quote) {
                if (src[i] === '\\') {
                    const next = src[i + 1];
                    const map = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '/': '/', '\\': '\\', "'": "'", '"': '"' };
                    if (next === 'u') {
                        const hex = src.slice(i + 2, i + 6);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('Invalid \\u escape');
                        out += String.fromCharCode(parseInt(hex, 16));
                        i += 6;
                        continue;
                    }
                    if (!(next in map)) err(`Invalid escape "\\${next || ''}"`);
                    out += map[next];
                    i += 2;
                    continue;
                }
                out += src[i++];
            }
            if (src[i] !== quote) err('Unterminated string', start);
            i++;
            return out;
        };

        const parseInt_ = () => {
            const m = /^-?\d+/.exec(src.slice(i));
            if (!m) return null;
            i += m[0].length;
            return Number(m[0]);
        };

        // segments := (segment)*   — stops at anything that cannot start one.
        const parseSegments = () => {
            const segments = [];
            for (;;) {
                ws();
                if (eat('..')) {
                    if (src[i] === '[') segments.push({ descendant: true, selectors: parseBracket() });
                    else if (eat('*')) segments.push({ descendant: true, selectors: [{ type: 'wildcard' }] });
                    else segments.push({ descendant: true, selectors: [{ type: 'name', name: parseName() }] });
                } else if (src[i] === '.' ) {
                    i++;
                    if (eat('*')) segments.push({ selectors: [{ type: 'wildcard' }] });
                    else segments.push({ selectors: [{ type: 'name', name: parseName() }] });
                } else if (src[i] === '[') {
                    segments.push({ selectors: parseBracket() });
                } else {
                    return segments;
                }
            }
        };

        const parseBracket = () => {
            expect('[');
            const selectors = [];
            for (;;) {
                ws();
                selectors.push(parseSelector());
                ws();
                if (eat(',')) continue;
                expect(']');
                return selectors;
            }
        };

        const parseSelector = () => {
            const c = src[i];
            if (c === "'" || c === '"') return { type: 'name', name: parseStringLiteral() };
            if (c === '*') {
                i++;
                return { type: 'wildcard' };
            }
            if (c === '?') {
                i++;
                ws();
                return { type: 'filter', expr: parseOr() };
            }
            const start = parseInt_();
            ws();
            if (src[i] === ':') {
                i++;
                ws();
                const end = parseInt_();
                ws();
                let step = null;
                if (eat(':')) {
                    ws();
                    step = parseInt_();
                }
                return { type: 'slice', start, end, step };
            }
            if (start === null) err(c ? `Unexpected "${c}" in brackets` : 'Unclosed "["');
            return { type: 'index', index: start };
        };

        // Filter expressions.
        const parseOr = () => {
            let left = parseAnd();
            for (;;) {
                ws();
                if (!eat('||')) return left;
                left = { op: 'or', left, right: parseAnd() };
            }
        };

        const parseAnd = () => {
            let left = parseNot();
            for (;;) {
                ws();
                if (!eat('&&')) return left;
                left = { op: 'and', left, right: parseNot() };
            }
        };

        const parseNot = () => {
            ws();
            if (src[i] === '!' && src[i + 1] !== '=') {
                i++;
                return { op: 'not', expr: parseNot() };
            }
            return parseComparison();
        };

        const CMP = ['==', '!=', '<=', '>=', '<', '>'];
        // Inside function arguments a bare literal is a value, not a test.
        let argDepth = 0;

        const parseComparison = () => {
            ws();
            const at = i;
            if (src[i] === '(') {
                i++;
                const inner = parseOr();
                ws();
                expect(')');
                return inner;
            }
            const left = parseComparable();
            ws();
            const op = CMP.find(o => src.startsWith(o, i));
            if (!op) {
                if (left.kind === 'literal' && !argDepth) err('A literal on its own is not a test — compare it with something', at);
                return { op: 'test', expr: left };
            }
            i += op.length;
            ws();
            return { op, left, right: parseComparable() };
        };

        const parseComparable = () => {
            ws();
            const c = src[i];
            if (c === '@' || c === '$') {
                i++;
                return { kind: 'query', relative: c === '@', segments: parseSegments() };
            }
            if (c === "'" || c === '"') return { kind: 'literal', value: parseStringLiteral() };
            const numMatch = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
            if (numMatch) {
                i += numMatch[0].length;
                return { kind: 'literal', value: Number(numMatch[0]) };
            }
            for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
                if (src.startsWith(word, i) && !NAME_CHAR.test(src[i + word.length] || '')) {
                    i += word.length;
                    return { kind: 'literal', value };
                }
            }
            const fn = /^([a-z][a-z0-9_]*)\s*\(/.exec(src.slice(i));
            if (fn) {
                const at = i;
                i += fn[0].length;
                if (!JSONPATH_FUNCTIONS[fn[1]]) err(`Unknown function "${fn[1]}" — available: ${Object.keys(JSONPATH_FUNCTIONS).join(', ')}`, at);
                const args = [];
                ws();
                if (!eat(')')) {
                    for (;;) {
                        argDepth++;
                        const arg = parseOr();
                        argDepth--;
                        // A bare query or literal argument is a value, not a test.
                        args.push(arg.op === 'test' ? arg.expr : arg);
                        ws();
                        if (eat(',')) continue;
                        expect(')');
                        break;
                    }
                }
                return { kind: 'function', name: fn[1], args };
            }
            err(c ? `Unexpected "${c}" in filter` : 'The filter ended unexpectedly');
        };

        expect('$');
        const segments = parseSegments();
        ws();
        if (i < src.length) err(`Unexpected "${src[i]}"`);
        return segments;
    }

    function normalizedPath(path) {
        return '$' + path.map(p => (typeof p === 'number' ? `[${p}]` : `['${p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`)).join('');
    }

    function childNodes(node) {
        const { value, path } = node;
        if (Array.isArray(value)) return value.map((v, k) => ({ value: v, path: [...path, k] }));
        if (isObject(value)) return [...value].map(([k, v]) => ({ value: v, path: [...path, k] }));
        return [];
    }

    function descendants(node, out = []) {
        out.push(node);
        for (const child of childNodes(node)) descendants(child, out);
        return out;
    }

    function sliceIndices(length, start, end, step) {
        step = step === null ? 1 : step;
        if (step === 0) return [];
        const norm = (n) => (n >= 0 ? n : length + n);
        const out = [];
        if (step > 0) {
            const lo = Math.min(Math.max(start === null ? 0 : norm(start), 0), length);
            const hi = Math.min(Math.max(end === null ? length : norm(end), 0), length);
            for (let k = lo; k < hi; k += step) out.push(k);
        } else {
            const hi = Math.min(Math.max(start === null ? length - 1 : norm(start), -1), length - 1);
            const lo = Math.min(Math.max(end === null ? -length - 1 : norm(end), -1), length - 1);
            for (let k = hi; k > lo; k += step) out.push(k);
        }
        return out;
    }

    function applySegments(segments, nodes, root) {
        for (const segment of segments) {
            const next = [];
            const targets = segment.descendant ? nodes.flatMap(n => descendants(n)) : nodes;
            for (const node of targets) {
                for (const selector of segment.selectors) applySelector(selector, node, root, next);
            }
            nodes = next;
        }
        return nodes;
    }

    function applySelector(selector, node, root, out) {
        const { value, path } = node;
        switch (selector.type) {
            case 'name':
                if (isObject(value) && value.has(selector.name)) out.push({ value: value.get(selector.name), path: [...path, selector.name] });
                return;
            case 'wildcard':
                out.push(...childNodes(node));
                return;
            case 'index': {
                if (!Array.isArray(value)) return;
                const k = selector.index < 0 ? value.length + selector.index : selector.index;
                if (k >= 0 && k < value.length) out.push({ value: value[k], path: [...path, k] });
                return;
            }
            case 'slice':
                if (!Array.isArray(value)) return;
                for (const k of sliceIndices(value.length, selector.start, selector.end, selector.step)) {
                    out.push({ value: value[k], path: [...path, k] });
                }
                return;
            case 'filter':
                for (const child of childNodes(node)) {
                    if (evalFilter(selector.expr, child.value, root)) out.push(child);
                }
        }
    }

    function evalComparable(expr, current, root) {
        if (expr.kind === 'literal') return expr.value;
        if (expr.kind === 'query') {
            const start = expr.relative ? current : root;
            const nodes = applySegments(expr.segments, [{ value: start, path: [] }], root);
            return nodes.length === 1 ? nodes[0].value : NOTHING;
        }
        if (expr.kind === 'function') return callJsonPathFunction(expr, current, root);
        return truthy(evalFilter(expr, current, root));
    }

    function nodesOf(expr, current, root) {
        if (expr.kind !== 'query') throw new QueryError('This function needs a query argument such as @.items');
        return applySegments(expr.segments, [{ value: expr.relative ? current : root, path: [] }], root);
    }

    const JSONPATH_FUNCTIONS = {
        length: (args, cur, root) => {
            const v = evalComparable(args[0], cur, root);
            if (typeof v === 'string') return stringLength(v);
            if (Array.isArray(v)) return v.length;
            if (isObject(v)) return v.size;
            return NOTHING;
        },
        count: (args, cur, root) => nodesOf(args[0], cur, root).length,
        value: (args, cur, root) => {
            const nodes = nodesOf(args[0], cur, root);
            return nodes.length === 1 ? nodes[0].value : NOTHING;
        },
        match: (args, cur, root) => regexTest(args, cur, root, true),
        search: (args, cur, root) => regexTest(args, cur, root, false),
    };

    const regexCache = new Map();
    function cachedRegex(pattern, flags) {
        const key = flags + '/' + pattern;
        if (!regexCache.has(key)) {
            if (regexCache.size > 200) regexCache.clear();
            try {
                regexCache.set(key, new RegExp(pattern, flags));
            } catch (e) {
                throw new QueryError(`Invalid regular expression: ${e.message}`);
            }
        }
        return regexCache.get(key);
    }

    function regexTest(args, cur, root, whole) {
        const s = evalComparable(args[0], cur, root);
        const pattern = evalComparable(args[1], cur, root);
        if (typeof s !== 'string' || typeof pattern !== 'string') return false;
        return cachedRegex(whole ? `^(?:${pattern})$` : pattern, 'u').test(s);
    }

    function callJsonPathFunction(expr, current, root) {
        const arity = { length: 1, count: 1, value: 1, match: 2, search: 2 }[expr.name];
        if (expr.args.length !== arity) throw new QueryError(`${expr.name}() takes ${arity} argument${arity > 1 ? 's' : ''}`);
        return JSONPATH_FUNCTIONS[expr.name](expr.args, current, root);
    }

    function evalFilter(expr, current, root) {
        switch (expr.op) {
            case 'or': return evalFilter(expr.left, current, root) || evalFilter(expr.right, current, root);
            case 'and': return evalFilter(expr.left, current, root) && evalFilter(expr.right, current, root);
            case 'not': return !evalFilter(expr.expr, current, root);
            case 'test': {
                const e = expr.expr;
                if (e.kind === 'query') return nodesOf(e, current, root).length > 0;
                const v = evalComparable(e, current, root);
                return v !== NOTHING && truthy(v);
            }
        }
        const a = evalComparable(expr.left, current, root);
        const b = evalComparable(expr.right, current, root);
        switch (expr.op) {
            case '==': return pathEquals(a, b);
            case '!=': return !pathEquals(a, b);
            case '<': return pathLess(a, b);
            case '>': return pathLess(b, a);
            case '<=': return pathLess(a, b) || pathEquals(a, b);
            case '>=': return pathLess(b, a) || pathEquals(a, b);
        }
        return false;
    }

    function pathEquals(a, b) {
        if (a === NOTHING || b === NOTHING) return a === b;
        return equals(a, b);
    }

    // Only numbers with numbers and strings with strings are ordered (RFC 9535 §2.3.5.2.2).
    function pathLess(a, b) {
        const ta = typeOf(a);
        if (a === NOTHING || b === NOTHING || ta !== typeOf(b)) return false;
        if (ta === 'number') return num(a) < num(b);
        if (ta === 'string') return a < b;
        return false;
    }

    function runJsonPath(source, data) {
        const segments = compileJsonPath(source);
        return applySegments(segments, [{ value: data, path: [] }], data)
            .map(node => ({ value: node.value, path: normalizedPath(node.path) }));
    }

    /* =====================================================================
     * jq — a practical subset: paths, pipes, comma, construction, operators,
     * alternatives, conditionals, variables, reduce, try/catch, assignment,
     * string interpolation, @formats, and the everyday builtins. No `def`,
     * no modules, no streaming.
     * ===================================================================== */

    const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'end', 'as', 'reduce', 'foreach', 'try', 'catch', 'and', 'or', 'def', 'label', 'import', 'include']);

    function tokenizeJq(src, base = 0) {
        const tokens = [];
        let i = 0;
        const err = (m, at = i) => { throw new QueryError(m, at + base); };
        const PUNCT = ['|=', '+=', '-=', '*=', '/=', '%=', '//=', '==', '!=', '<=', '>=', '//', '..', '|', ',', '(', ')', '[', ']', '{', '}', ':', ';', '.', '?', '<', '>', '+', '-', '*', '/', '%', '='];
        PUNCT.sort((a, b) => b.length - a.length);
        while (i < src.length) {
            const c = src[i];
            if (/\s/.test(c)) {
                i++;
                continue;
            }
            if (c === '#') {
                while (i < src.length && src[i] !== '\n') i++;
                continue;
            }
            const start = i;
            if (c === '"') {
                tokens.push({ t: 'str', parts: readJqString(), pos: start + base });
                continue;
            }
            if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
                const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
                i += m[0].length;
                tokens.push({ t: 'num', v: Number(m[0]), pos: start + base });
                continue;
            }
            if (c === '.' && /[A-Za-z_]/.test(src[i + 1] || '')) {
                i++;
                const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
                i += m[0].length;
                tokens.push({ t: 'field', v: m[0], pos: start + base });
                continue;
            }
            if (c === '$') {
                const m = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
                if (!m) err('Expected a variable name after "$"');
                i += m[0].length;
                tokens.push({ t: 'var', v: m[1], pos: start + base });
                continue;
            }
            if (c === '@') {
                const m = /^@([A-Za-z0-9]+)/.exec(src.slice(i));
                if (!m) err('Expected a format name after "@"');
                i += m[0].length;
                tokens.push({ t: 'format', v: m[1], pos: start + base });
                continue;
            }
            if (/[A-Za-z_]/.test(c)) {
                const m = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
                i += m[0].length;
                tokens.push({ t: KEYWORDS.has(m[0]) ? 'kw' : 'ident', v: m[0], pos: start + base });
                continue;
            }
            const p = PUNCT.find(s => src.startsWith(s, i));
            if (!p) err(`Unexpected "${c}"`);
            i += p.length;
            tokens.push({ t: 'p', v: p, pos: start + base });
        }
        tokens.push({ t: 'eof', pos: src.length + base });
        return tokens;

        // A string is a list of literal parts and interpolated sub-programs.
        function readJqString() {
            const start = i;
            i++;
            const parts = [];
            let buf = '';
            while (i < src.length && src[i] !== '"') {
                if (src[i] !== '\\') {
                    buf += src[i++];
                    continue;
                }
                const next = src[i + 1];
                if (next === '(') {
                    if (buf) parts.push(buf);
                    buf = '';
                    const exprStart = i + 2;
                    let depth = 1;
                    let k = exprStart;
                    let inStr = false;
                    for (; k < src.length && depth; k++) {
                        if (inStr) {
                            if (src[k] === '\\') k++;
                            else if (src[k] === '"') inStr = false;
                        } else if (src[k] === '"') inStr = true;
                        else if (src[k] === '(') depth++;
                        else if (src[k] === ')') depth--;
                    }
                    if (depth) err('Unclosed "\\(" in string', i);
                    parts.push(parseJqTokens(tokenizeJq(src.slice(exprStart, k - 1), base + exprStart)));
                    i = k;
                    continue;
                }
                const map = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '/': '/', '\\': '\\', '"': '"' };
                if (next === 'u') {
                    const hex = src.slice(i + 2, i + 6);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('Invalid \\u escape');
                    buf += String.fromCharCode(parseInt(hex, 16));
                    i += 6;
                    continue;
                }
                if (!(next in map)) err(`Invalid escape "\\${next || ''}"`);
                buf += map[next];
                i += 2;
            }
            if (src[i] !== '"') err('Unterminated string', start);
            i++;
            if (buf || !parts.length) parts.push(buf);
            return parts;
        }
    }

    function parseJqTokens(tokens) {
        let k = 0;
        const peek = (o = 0) => tokens[k + o];
        const is = (t, v) => peek().t === t && (v === undefined || peek().v === v);
        const isP = (v) => is('p', v);
        const next = () => tokens[k++];
        const err = (m, tok = peek()) => { throw new QueryError(m, tok.pos); };
        const expectP = (v) => {
            if (!isP(v)) err(`Expected "${v}"${peek().t === 'eof' ? ' but the query ended' : `, found ${show(peek())}`}`);
            return next();
        };
        const expectKw = (v) => {
            if (!is('kw', v)) err(`Expected "${v}"${peek().t === 'eof' ? ' but the query ended' : `, found ${show(peek())}`}`);
            return next();
        };
        const show = (tok) => (tok.t === 'eof' ? 'end of query' : tok.t === 'str' ? 'a string' : `"${tok.t === 'field' ? '.' + tok.v : tok.t === 'var' ? '$' + tok.v : tok.v}"`);

        // pipe := term 'as' $name '|' pipe | comma ('|' pipe)?
        // A binding source is a postfix term, and parsePostfix stops at `as`,
        // so whatever parseComma returns just before an `as` is that term.
        const parsePipe = () => {
            if (is('kw', 'def')) err('"def" (user-defined functions) is not supported');
            const left = parseComma();
            if (is('kw', 'as')) {
                next();
                const tok = peek();
                if (tok.t !== 'var') err('Destructuring is not supported — bind a single $variable');
                next();
                expectP('|');
                return { type: 'as', source: left, name: tok.v, body: parsePipe() };
            }
            if (isP('|')) {
                next();
                return { type: 'pipe', left, right: parsePipe() };
            }
            return left;
        };

        const parseComma = () => {
            let left = parseAlt();
            while (isP(',')) {
                next();
                left = { type: 'comma', left, right: parseAlt() };
            }
            return left;
        };

        const parseAlt = () => {
            const left = parseAssign();
            if (isP('//')) {
                next();
                return { type: 'alt', left, right: parseAlt() };
            }
            return left;
        };

        const ASSIGN = ['=', '|=', '+=', '-=', '*=', '/=', '%=', '//='];
        const parseAssign = () => {
            const left = parseOr();
            const tok = peek();
            if (tok.t === 'p' && ASSIGN.includes(tok.v)) {
                next();
                return { type: 'assign', op: tok.v, left, right: parseOr(), pos: tok.pos };
            }
            return left;
        };

        const parseOr = () => {
            let left = parseAnd();
            while (is('kw', 'or')) {
                next();
                left = { type: 'or', left, right: parseAnd() };
            }
            return left;
        };

        const parseAnd = () => {
            let left = parseCompare();
            while (is('kw', 'and')) {
                next();
                left = { type: 'and', left, right: parseCompare() };
            }
            return left;
        };

        const CMP = ['==', '!=', '<', '<=', '>', '>='];
        const parseCompare = () => {
            const left = parseAdditive();
            if (peek().t === 'p' && CMP.includes(peek().v)) {
                const op = next().v;
                const right = parseAdditive();
                if (peek().t === 'p' && CMP.includes(peek().v)) err('Comparisons do not chain — use "and"');
                return { type: 'binop', op, left, right };
            }
            return left;
        };

        const parseAdditive = () => {
            let left = parseMultiplicative();
            while (isP('+') || isP('-')) {
                const op = next().v;
                left = { type: 'binop', op, left, right: parseMultiplicative() };
            }
            return left;
        };

        const parseMultiplicative = () => {
            let left = parseUnary();
            while (isP('*') || isP('/') || isP('%')) {
                const op = next().v;
                left = { type: 'binop', op, left, right: parseUnary() };
            }
            return left;
        };

        const parseUnary = () => {
            if (isP('-')) {
                next();
                return { type: 'neg', expr: parseUnary() };
            }
            return parsePostfix();
        };

        // Suffixes: .name ."str" [..] [] [a:b] ? and `.[` after any term.
        const parsePostfix = () => {
            let node = parsePrimary();
            for (;;) {
                if (is('field')) {
                    node = { type: 'index', target: node, key: { type: 'literal', value: next().v } };
                } else if (isP('.') && peek(1).t === 'str') {
                    next();
                    node = { type: 'index', target: node, key: stringNode(next()) };
                } else if (isP('.') && peek(1).t === 'p' && peek(1).v === '[') {
                    next();
                    node = parseBracketSuffix(node);
                } else if (isP('[')) {
                    node = parseBracketSuffix(node);
                } else if (isP('?')) {
                    next();
                    node = { type: 'try', body: node, handler: null };
                } else {
                    return node;
                }
            }
        };

        const parseBracketSuffix = (target) => {
            expectP('[');
            if (isP(']')) {
                next();
                return { type: 'iterate', target };
            }
            if (isP(':')) {
                next();
                const to = parsePipe();
                expectP(']');
                return { type: 'slice', target, from: null, to };
            }
            const key = parsePipe();
            if (isP(':')) {
                next();
                const to = isP(']') ? null : parsePipe();
                expectP(']');
                return { type: 'slice', target, from: key, to };
            }
            expectP(']');
            return { type: 'index', target, key };
        };

        const stringNode = (tok) => {
            if (tok.parts.every(p => typeof p === 'string')) return { type: 'literal', value: tok.parts.join('') };
            return { type: 'interp', parts: tok.parts };
        };

        const parsePrimary = () => {
            const tok = peek();
            if (tok.t === 'num') {
                next();
                return { type: 'literal', value: tok.v };
            }
            if (tok.t === 'str') {
                next();
                return stringNode(tok);
            }
            if (tok.t === 'format') {
                next();
                if (!JQ_FORMATS[tok.v]) err(`Unknown format "@${tok.v}" — available: ${Object.keys(JQ_FORMATS).map(f => '@' + f).join(' ')}`, tok);
                if (is('str')) {
                    const s = next();
                    return { type: 'interp', parts: s.parts, format: tok.v };
                }
                return { type: 'format', name: tok.v };
            }
            if (tok.t === 'field') {
                next();
                return { type: 'index', target: { type: 'identity' }, key: { type: 'literal', value: tok.v } };
            }
            if (tok.t === 'var') {
                next();
                return { type: 'var', name: tok.v, pos: tok.pos };
            }
            if (tok.t === 'p') {
                switch (tok.v) {
                    case '.':
                        next();
                        if (is('str')) return { type: 'index', target: { type: 'identity' }, key: stringNode(next()) };
                        return { type: 'identity' };
                    case '..':
                        next();
                        return { type: 'recurse' };
                    case '(': {
                        next();
                        const inner = parsePipe();
                        expectP(')');
                        return inner;
                    }
                    case '[': {
                        next();
                        if (isP(']')) {
                            next();
                            return { type: 'array', body: null };
                        }
                        const body = parsePipe();
                        expectP(']');
                        return { type: 'array', body };
                    }
                    case '{':
                        return parseObject();
                }
            }
            if (tok.t === 'kw') {
                if (tok.v === 'if') return parseIf();
                if (tok.v === 'try') {
                    next();
                    const body = parsePostfixOnly();
                    let handler = null;
                    if (is('kw', 'catch')) {
                        next();
                        handler = parsePostfixOnly();
                    }
                    return { type: 'try', body, handler };
                }
                if (tok.v === 'reduce') {
                    next();
                    const source = parsePostfix();
                    expectKw('as');
                    const v = peek();
                    if (v.t !== 'var') err('Expected a $variable after "as"');
                    next();
                    expectP('(');
                    const init = parsePipe();
                    expectP(';');
                    const update = parsePipe();
                    expectP(')');
                    return { type: 'reduce', source, name: v.v, init, update };
                }
                if (tok.v === 'foreach' || tok.v === 'label' || tok.v === 'import' || tok.v === 'include') {
                    err(`"${tok.v}" is not supported`);
                }
            }
            if (tok.t === 'ident' && (tok.v === 'true' || tok.v === 'false' || tok.v === 'null') && !(peek(1).t === 'p' && peek(1).v === '(')) {
                next();
                return { type: 'literal', value: tok.v === 'null' ? null : tok.v === 'true' };
            }
            if (tok.t === 'ident') {
                next();
                const args = [];
                if (isP('(')) {
                    next();
                    for (;;) {
                        args.push(parsePipe());
                        if (isP(';')) {
                            next();
                            continue;
                        }
                        expectP(')');
                        break;
                    }
                }
                const key = `${tok.v}/${args.length}`;
                if (!JQ_BUILTINS[key]) {
                    const arities = Object.keys(JQ_BUILTINS).filter(b => b.startsWith(tok.v + '/')).map(b => b.split('/')[1]);
                    if (arities.length) err(`${tok.v} takes ${arities.join(' or ')} argument${arities.join('') === '1' ? '' : 's'}, not ${args.length}`, tok);
                    err(`Unknown function "${tok.v}"`, tok);
                }
                return { type: 'call', name: key, args, pos: tok.pos };
            }
            if (tok.t === 'eof') err('The query ended unexpectedly');
            err(`Unexpected ${show(tok)}`);
        };

        // `try` binds to a postfix term, not a whole pipeline.
        const parsePostfixOnly = parsePostfix;

        // Consumes `if` or `elif`; an elif chain is an if nested in the else
        // branch, and the innermost one consumes the single closing `end`.
        const parseIf = () => {
            next();
            const cond = parsePipe();
            expectKw('then');
            const then = parsePipe();
            if (is('kw', 'elif')) return { type: 'if', cond, then, otherwise: parseIf() };
            let otherwise = null;
            if (is('kw', 'else')) {
                next();
                otherwise = parsePipe();
            }
            expectKw('end');
            return { type: 'if', cond, then, otherwise };
        };

        const parseObject = () => {
            expectP('{');
            const entries = [];
            while (!isP('}')) {
                const tok = peek();
                let key;
                let value = null;
                if (tok.t === 'ident' || tok.t === 'kw') {
                    next();
                    key = { type: 'literal', value: tok.v };
                    if (!isP(':')) value = { type: 'index', target: { type: 'identity' }, key };
                } else if (tok.t === 'str') {
                    next();
                    key = stringNode(tok);
                    if (!isP(':')) value = { type: 'index', target: { type: 'identity' }, key };
                } else if (tok.t === 'var') {
                    next();
                    key = { type: 'literal', value: tok.v };
                    if (!isP(':')) value = { type: 'var', name: tok.v, pos: tok.pos };
                } else if (tok.t === 'num') {
                    err('Object keys must be strings — quote the number');
                } else if (isP('(')) {
                    next();
                    key = parsePipe();
                    expectP(')');
                } else {
                    err(`Expected an object key, found ${show(tok)}`);
                }
                if (!value) {
                    expectP(':');
                    value = parseObjectValue();
                }
                entries.push({ key, value });
                if (isP(',')) {
                    next();
                    continue;
                }
                if (!isP('}')) err(`Expected "," or "}" in object, found ${show(peek())}`);
            }
            expectP('}');
            return { type: 'object', entries };
        };

        // An object value may be a pipeline but not a comma list (the comma
        // separates entries), so parse `alt ('|' alt)*`.
        const parseObjectValue = () => {
            let node = parseAlt();
            while (isP('|')) {
                next();
                node = { type: 'pipe', left: node, right: parseAlt() };
            }
            return node;
        };

        const ast = parsePipe();
        if (!is('eof')) err(`Unexpected ${show(peek())}`);
        return ast;
    }

    class JqError extends Error {
        constructor(value) {
            super(typeof value === 'string' ? value : stringify(value, { indent: '' }));
            this.value = value;
        }
    }

    const MAX_STEPS = 2_000_000;

    function describeValue(v) {
        const text = stringify(v, { indent: '' });
        return `${typeOf(v)} (${text.length > 30 ? text.slice(0, 27) + '...' : text})`;
    }

    function runJq(source, data) {
        if (!source.trim()) throw new QueryError('Empty query');
        const ast = parseJqTokens(tokenizeJq(source));
        const ctx = { steps: 0 };
        try {
            return evaluate(ast, data, null, ctx);
        } catch (e) {
            if (e instanceof RangeError) throw new QueryError('Recursion is too deep');
            throw e;
        }
    }

    function lookupVar(env, name, pos) {
        for (let e = env; e; e = e.parent) if (e.name === name) return e.value;
        throw new QueryError(`$${name} is not defined`, pos);
    }

    // Cartesian product helper: calls fn with every combination of outputs.
    function each(node, input, env, ctx, fn) {
        for (const v of evaluate(node, input, env, ctx)) fn(v);
    }

    function evaluate(node, input, env, ctx) {
        if (++ctx.steps > MAX_STEPS) throw new QueryError('The query did too much work — stopped to keep the page responsive');
        switch (node.type) {
            case 'identity': return [input];
            case 'recurse': return recurseValues(input);
            case 'literal': return [node.value];
            case 'var': return [lookupVar(env, node.name, node.pos)];
            case 'pipe': {
                const out = [];
                each(node.left, input, env, ctx, v => out.push(...evaluate(node.right, v, env, ctx)));
                return out;
            }
            case 'comma': return [...evaluate(node.left, input, env, ctx), ...evaluate(node.right, input, env, ctx)];
            case 'as': {
                const out = [];
                each(node.source, input, env, ctx, v => out.push(...evaluate(node.body, input, { name: node.name, value: v, parent: env }, ctx)));
                return out;
            }
            case 'index': {
                const out = [];
                each(node.target, input, env, ctx, t => each(node.key, input, env, ctx, key => out.push(indexValue(t, key))));
                return out;
            }
            case 'slice': {
                const out = [];
                each(node.target, input, env, ctx, t => {
                    const froms = node.from ? evaluate(node.from, input, env, ctx) : [null];
                    const tos = node.to ? evaluate(node.to, input, env, ctx) : [null];
                    for (const f of froms) for (const to of tos) out.push(sliceValue(t, f, to));
                });
                return out;
            }
            case 'iterate': {
                const out = [];
                each(node.target, input, env, ctx, t => out.push(...iterateValue(t)));
                return out;
            }
            case 'try':
                try {
                    return evaluate(node.body, input, env, ctx);
                } catch (e) {
                    if (!(e instanceof JqError)) throw e;
                    return node.handler ? evaluate(node.handler, e.value, env, ctx) : [];
                }
            case 'array': return [node.body ? evaluate(node.body, input, env, ctx) : []];
            case 'object': {
                let partials = [new Map()];
                for (const entry of node.entries) {
                    const next = [];
                    for (const partial of partials) {
                        for (const key of evaluate(entry.key, input, env, ctx)) {
                            if (typeof key !== 'string') throw new JqError(`Object keys must be strings, not ${describeValue(key)}`);
                            for (const value of evaluate(entry.value, input, env, ctx)) {
                                const m = new Map(partial);
                                m.set(key, value);
                                next.push(m);
                            }
                        }
                    }
                    partials = next;
                }
                return partials;
            }
            case 'interp': {
                let partials = [''];
                for (const part of node.parts) {
                    if (typeof part === 'string') {
                        partials = partials.map(p => p + part);
                        continue;
                    }
                    const next = [];
                    for (const p of partials) {
                        for (const v of evaluate(part, input, env, ctx)) {
                            next.push(p + (node.format ? JQ_FORMATS[node.format](v) : toText(v)));
                        }
                    }
                    partials = next;
                }
                return partials;
            }
            case 'format': return [JQ_FORMATS[node.name](input)];
            case 'neg': return evaluate(node.expr, input, env, ctx).map(v => {
                if (typeOf(v) !== 'number') throw new JqError(`${describeValue(v)} cannot be negated`);
                return -num(v);
            });
            case 'binop': {
                const out = [];
                // jq evaluates the right operand first; output order follows.
                each(node.right, input, env, ctx, b => each(node.left, input, env, ctx, a => out.push(binop(node.op, a, b))));
                return out;
            }
            case 'and':
            case 'or': {
                const out = [];
                each(node.left, input, env, ctx, a => {
                    if (node.type === 'and' && !truthy(a)) return out.push(false);
                    if (node.type === 'or' && truthy(a)) return out.push(true);
                    each(node.right, input, env, ctx, b => out.push(truthy(b)));
                });
                return out;
            }
            case 'alt': {
                let left = [];
                try {
                    left = evaluate(node.left, input, env, ctx).filter(truthy);
                } catch (e) {
                    if (!(e instanceof JqError)) throw e;
                }
                return left.length ? left : evaluate(node.right, input, env, ctx);
            }
            case 'if': {
                const out = [];
                each(node.cond, input, env, ctx, c => {
                    if (truthy(c)) out.push(...evaluate(node.then, input, env, ctx));
                    else if (node.otherwise) out.push(...evaluate(node.otherwise, input, env, ctx));
                    else out.push(input);
                });
                return out;
            }
            case 'reduce': {
                const out = [];
                each(node.init, input, env, ctx, init => {
                    let acc = init;
                    each(node.source, input, env, ctx, v => {
                        const results = evaluate(node.update, acc, { name: node.name, value: v, parent: env }, ctx);
                        acc = results.length ? results[results.length - 1] : null;
                    });
                    out.push(acc);
                });
                return out;
            }
            case 'assign': return assign(node, input, env, ctx);
            case 'call': return JQ_BUILTINS[node.name](input, node.args, env, ctx);
        }
        throw new QueryError(`Cannot evaluate ${node.type}`);
    }

    function recurseValues(v, out = []) {
        out.push(v);
        if (Array.isArray(v)) for (const x of v) recurseValues(x, out);
        else if (isObject(v)) for (const x of v.values()) recurseValues(x, out);
        return out;
    }

    function indexValue(t, key) {
        if (t === null || t === undefined) {
            if (typeof key === 'string' || typeOf(key) === 'number' || key === null) return null;
        }
        if (isObject(t) && typeof key === 'string') return t.has(key) ? t.get(key) : null;
        if (Array.isArray(t) && typeOf(key) === 'number') {
            let n = Math.floor(num(key));
            if (n < 0) n += t.length;
            return n >= 0 && n < t.length ? t[n] : null;
        }
        if (Array.isArray(t) && Array.isArray(key)) {
            // .[[1,2]] → indices where the subarray occurs
            const out = [];
            if (!key.length) return null;
            for (let s = 0; s + key.length <= t.length; s++) {
                if (key.every((x, j) => equals(t[s + j], x))) out.push(s);
            }
            return out;
        }
        if (typeof key === 'string') throw new JqError(`Cannot index ${typeOf(t)} with "${key}"`);
        throw new JqError(`Cannot index ${typeOf(t)} with ${typeOf(key)}`);
    }

    // Resolves jq slice bounds (negative, null, fractional) to [start, end).
    function sliceBounds(len, from, to) {
        const clamp = (x, dflt) => {
            if (x === null || x === undefined) return dflt;
            if (typeOf(x) !== 'number') throw new JqError('Slice bounds must be numbers');
            let n = Math.floor(num(x));
            if (n < 0) n += len;
            return Math.min(Math.max(n, 0), len);
        };
        const a = clamp(from, 0);
        return [a, Math.max(a, clamp(to, len))];
    }

    function sliceValue(t, from, to) {
        if (t === null) return null;
        if (!Array.isArray(t) && typeof t !== 'string') throw new JqError(`Cannot slice ${typeOf(t)}`);
        const chars = typeof t === 'string' ? [...t] : t;
        const part = chars.slice(...sliceBounds(chars.length, from, to));
        return typeof t === 'string' ? part.join('') : part;
    }

    // A slice in a path is written {"start": a, "end": b}, as jq's path() does.
    const isSliceKey = (key) => isObject(key) && key.has('start') && key.has('end');

    function iterateValue(t) {
        if (Array.isArray(t)) return t;
        if (isObject(t)) return [...t.values()];
        throw new JqError(`Cannot iterate over ${describeValue(t)}`);
    }

    function binop(op, a, b) {
        const ta = typeOf(a);
        const tb = typeOf(b);
        switch (op) {
            case '==': return equals(a, b);
            case '!=': return !equals(a, b);
            case '<': return compareValues(a, b) < 0;
            case '<=': return compareValues(a, b) <= 0;
            case '>': return compareValues(a, b) > 0;
            case '>=': return compareValues(a, b) >= 0;
            case '+':
                if (ta === 'null') return b;
                if (tb === 'null') return a;
                if (ta === 'number' && tb === 'number') return num(a) + num(b);
                if (ta === 'string' && tb === 'string') return a + b;
                if (ta === 'array' && tb === 'array') return [...a, ...b];
                if (ta === 'object' && tb === 'object') return new Map([...a, ...b]);
                break;
            case '-':
                if (ta === 'number' && tb === 'number') return num(a) - num(b);
                if (ta === 'array' && tb === 'array') return a.filter(x => !b.some(y => equals(x, y)));
                break;
            case '*':
                if (ta === 'number' && tb === 'number') return num(a) * num(b);
                if ((ta === 'string' && tb === 'number') || (ta === 'number' && tb === 'string')) {
                    const [s, n] = ta === 'string' ? [a, num(b)] : [b, num(a)];
                    return n > 0 ? s.repeat(Math.ceil(n) > 1e6 ? 0 : Math.max(1, Math.round(n))) : null;
                }
                if (ta === 'object' && tb === 'object') return deepMerge(a, b);
                break;
            case '/':
                if (ta === 'number' && tb === 'number') {
                    if (num(b) === 0) throw new JqError(`${describeValue(a)} and ${describeValue(b)} cannot be divided because the divisor is zero`);
                    return num(a) / num(b);
                }
                if (ta === 'string' && tb === 'string') return a.split(b);
                break;
            case '%':
                if (ta === 'number' && tb === 'number') {
                    const d = Math.trunc(num(b));
                    if (d === 0) throw new JqError(`${describeValue(a)} and ${describeValue(b)} cannot be divided because the divisor is zero`);
                    return Math.trunc(num(a)) % d;
                }
                break;
        }
        const verb = { '+': 'added', '-': 'subtracted', '*': 'multiplied', '/': 'divided', '%': 'divided' }[op];
        throw new JqError(`${describeValue(a)} and ${describeValue(b)} cannot be ${verb}`);
    }

    function deepMerge(a, b) {
        const out = new Map(a);
        for (const [k, v] of b) out.set(k, isObject(v) && isObject(out.get(k)) ? deepMerge(out.get(k), v) : v);
        return out;
    }

    function toText(v) {
        return typeof v === 'string' ? v : stringify(v, { indent: '' });
    }

    /* ---------- Paths (for del, paths, path, getpath and assignment) ---------- */

    // Returns [path, value] pairs for a path expression.
    function evalPaths(node, input, env, ctx) {
        if (++ctx.steps > MAX_STEPS) throw new QueryError('The query did too much work — stopped to keep the page responsive');
        switch (node.type) {
            case 'identity': return [[[], input]];
            case 'recurse': {
                const out = [];
                const walk = (p, v) => {
                    out.push([p, v]);
                    if (Array.isArray(v)) v.forEach((x, idx) => walk([...p, idx], x));
                    else if (isObject(v)) for (const [key, x] of v) walk([...p, key], x);
                };
                walk([], input);
                return out;
            }
            case 'pipe': {
                const out = [];
                for (const [p, v] of evalPaths(node.left, input, env, ctx)) {
                    for (const [q, w] of evalPaths(node.right, v, env, ctx)) out.push([[...p, ...q], w]);
                }
                return out;
            }
            case 'comma': return [...evalPaths(node.left, input, env, ctx), ...evalPaths(node.right, input, env, ctx)];
            case 'index': {
                const out = [];
                for (const [p, v] of evalPaths(node.target, input, env, ctx)) {
                    for (const key of evaluate(node.key, input, env, ctx)) {
                        const k = typeOf(key) === 'number' ? Math.floor(num(key)) : key;
                        const value = indexValue(v, k);
                        const normalized = typeof k === 'number' && k < 0 && Array.isArray(v) ? k + v.length : k;
                        out.push([[...p, normalized], value]);
                    }
                }
                return out;
            }
            case 'slice': {
                const out = [];
                for (const [p, v] of evalPaths(node.target, input, env, ctx)) {
                    const froms = node.from ? evaluate(node.from, input, env, ctx) : [null];
                    const tos = node.to ? evaluate(node.to, input, env, ctx) : [null];
                    for (const f of froms) {
                        for (const to of tos) out.push([[...p, new Map([['start', f], ['end', to]])], sliceValue(v, f, to)]);
                    }
                }
                return out;
            }
            case 'iterate': {
                const out = [];
                for (const [p, v] of evalPaths(node.target, input, env, ctx)) {
                    if (Array.isArray(v)) v.forEach((x, idx) => out.push([[...p, idx], x]));
                    else if (isObject(v)) for (const [key, x] of v) out.push([[...p, key], x]);
                    else if (v !== null) throw new JqError(`Cannot iterate over ${describeValue(v)}`);
                }
                return out;
            }
            case 'try':
                try {
                    return evalPaths(node.body, input, env, ctx);
                } catch (e) {
                    if (!(e instanceof JqError)) throw e;
                    return [];
                }
            case 'if': {
                const out = [];
                for (const c of evaluate(node.cond, input, env, ctx)) {
                    if (truthy(c)) out.push(...evalPaths(node.then, input, env, ctx));
                    else if (node.otherwise) out.push(...evalPaths(node.otherwise, input, env, ctx));
                    else out.push([[], input]);
                }
                return out;
            }
            case 'alt': {
                let left = [];
                try {
                    left = evalPaths(node.left, input, env, ctx).filter(([, v]) => truthy(v));
                } catch (e) {
                    if (!(e instanceof JqError)) throw e;
                }
                return left.length ? left : evalPaths(node.right, input, env, ctx);
            }
            case 'as': {
                const out = [];
                for (const v of evaluate(node.source, input, env, ctx)) {
                    out.push(...evalPaths(node.body, input, { name: node.name, value: v, parent: env }, ctx));
                }
                return out;
            }
            case 'call': {
                const [name] = node.name.split('/');
                if (name === 'empty') return [];
                if (name === 'select') {
                    return evaluate(node.args[0], input, env, ctx).filter(truthy).map(() => [[], input]);
                }
                if (name === 'recurse' && node.args.length === 0) return evalPaths({ type: 'recurse' }, input, env, ctx);
                if (name === 'first' && node.args.length === 1) return evalPaths(node.args[0], input, env, ctx).slice(0, 1);
                if (name === 'last' && node.args.length === 1) return evalPaths(node.args[0], input, env, ctx).slice(-1);
                if (name === 'getpath') {
                    return evaluate(node.args[0], input, env, ctx).map(p => [p, getPath(input, p)]);
                }
                if (name === 'paths' && node.args.length === 0) {
                    return evalPaths({ type: 'recurse' }, input, env, ctx).filter(([p]) => p.length);
                }
                break;
            }
        }
        throw new JqError('Invalid path expression — only paths like .a, .[0], .[], .., select(…) and pipes of them can be assigned or deleted');
    }

    function getPath(v, path) {
        for (const key of path) {
            if (v === null || v === undefined) return null;
            v = isSliceKey(key) ? sliceValue(v, key.get('start'), key.get('end')) : indexValue(v, key);
        }
        return v;
    }

    function setPath(v, path, value, depth = 0) {
        if (depth === path.length) return value;
        const key = path[depth];
        if (isSliceKey(key)) {
            if (v !== null && v !== undefined && !Array.isArray(v)) throw new JqError(`Cannot update a slice of ${typeOf(v)}`);
            const a = v ? [...v] : [];
            const [start, end] = sliceBounds(a.length, key.get('start'), key.get('end'));
            const replacement = setPath(a.slice(start, end), path, value, depth + 1);
            if (!Array.isArray(replacement)) throw new JqError('A slice can only be replaced with an array');
            a.splice(start, end - start, ...replacement);
            return a;
        }
        if (typeof key === 'string') {
            if (v !== null && v !== undefined && !isObject(v)) throw new JqError(`Cannot index ${typeOf(v)} with "${key}"`);
            const m = new Map(v || []);
            m.set(key, setPath(m.has(key) ? m.get(key) : null, path, value, depth + 1));
            return m;
        }
        if (typeof key === 'number') {
            if (v !== null && v !== undefined && !Array.isArray(v)) throw new JqError(`Cannot index ${typeOf(v)} with number`);
            const a = v ? [...v] : [];
            let idx = key < 0 ? a.length + key : key;
            if (idx < 0) throw new JqError('Out of bounds negative array index');
            if (idx > 1e7) throw new JqError('Array index too large');
            while (a.length < idx) a.push(null);
            a[idx] = setPath(idx < a.length ? a[idx] : null, path, value, depth + 1);
            return a;
        }
        throw new JqError(`Invalid path component ${describeValue(key)}`);
    }

    function deletePaths(v, paths) {
        // Delete deepest/last first so earlier array indices stay valid.
        const sorted = [...paths].sort((a, b) => compareValues(b, a));
        for (const p of sorted) v = deletePath(v, p);
        return v;
    }

    function deletePath(v, path) {
        if (!path.length) return null;
        if (v === null || v === undefined) return v;
        const [key, ...rest] = path;
        if (isSliceKey(key)) {
            if (!Array.isArray(v)) throw new JqError(`Cannot delete a slice of ${typeOf(v)}`);
            const [start, end] = sliceBounds(v.length, key.get('start'), key.get('end'));
            const a = [...v];
            if (rest.length) a.splice(start, end - start, ...deletePath(a.slice(start, end), rest));
            else a.splice(start, end - start);
            return a;
        }
        if (isObject(v)) {
            if (typeof key !== 'string') throw new JqError(`Cannot delete field at index ${describeValue(key)} of object`);
            if (!v.has(key)) return v;
            const m = new Map(v);
            if (rest.length) m.set(key, deletePath(m.get(key), rest));
            else m.delete(key);
            return m;
        }
        if (Array.isArray(v)) {
            if (typeof key !== 'number') throw new JqError(`Cannot delete field "${key}" of array`);
            const idx = key < 0 ? v.length + key : key;
            if (idx < 0 || idx >= v.length) return v;
            const a = [...v];
            if (rest.length) a[idx] = deletePath(a[idx], rest);
            else a.splice(idx, 1);
            return a;
        }
        throw new JqError(`Cannot delete from ${typeOf(v)}`);
    }

    function assign(node, input, env, ctx) {
        const paths = evalPaths(node.left, input, env, ctx).map(([p]) => p);
        if (node.op === '|=') {
            let acc = input;
            const removals = [];
            for (const p of paths) {
                const results = evaluate(node.right, getPath(acc, p), env, ctx);
                if (results.length) acc = setPath(acc, p, results[0]);
                else removals.push(p);
            }
            return [removals.length ? deletePaths(acc, removals) : acc];
        }
        const out = [];
        for (const rhs of evaluate(node.right, input, env, ctx)) {
            let acc = input;
            for (const p of paths) {
                let value = rhs;
                if (node.op === '//=') {
                    const current = getPath(acc, p);
                    value = truthy(current) ? current : rhs;
                } else if (node.op !== '=') {
                    value = binop(node.op[0], getPath(acc, p), rhs);
                }
                acc = setPath(acc, p, value);
            }
            out.push(acc);
        }
        return out;
    }

    /* ---------- Builtins ---------- */

    const sortedValues = (arr) => [...arr].sort(compareValues);

    function requireType(v, type, fn) {
        if (typeOf(v) !== type) throw new JqError(`${fn} needs ${type === 'array' || type === 'object' ? 'an' : 'a'} ${type}, not ${describeValue(v)}`);
        return v;
    }

    function keysOf(v, sort) {
        if (isObject(v)) return sort ? [...v.keys()].sort(compareKeys) : [...v.keys()];
        if (Array.isArray(v)) return v.map((_, idx) => idx);
        throw new JqError(`${describeValue(v)} has no keys`);
    }

    // Evaluates f once per element and pairs it with the element.
    function byKey(arr, fnNode, env, ctx, name) {
        requireType(arr, 'array', name);
        return arr.map(x => ({ x, k: evaluate(fnNode, x, env, ctx) }));
    }

    function contains(a, b) {
        const ta = typeOf(a);
        if (ta !== typeOf(b)) throw new JqError(`${describeValue(a)} and ${describeValue(b)} cannot have their containment checked`);
        if (ta === 'object') return [...b].every(([k, v]) => a.has(k) && contains(a.get(k), v));
        if (ta === 'array') return b.every(y => a.some(x => typeOf(x) === typeOf(y) && contains(x, y)));
        if (ta === 'string') return a.includes(b);
        return equals(a, b);
    }

    function flatten(arr, depth) {
        if (depth < 0) throw new JqError('flatten depth must not be negative');
        const out = [];
        for (const x of arr) {
            if (Array.isArray(x) && depth > 0) out.push(...flatten(x, depth - 1));
            else out.push(x);
        }
        return out;
    }

    function jqRegex(pattern, flags) {
        if (typeof pattern !== 'string') throw new JqError(`${describeValue(pattern)} cannot be matched, as it is not a string`);
        let f = 'u';
        for (const c of flags || '') {
            if (c === 'g') f += 'g';
            else if (c === 'i') f += 'i';
            else if (c === 'x') pattern = pattern.replace(/\\#/g, '\u0000').replace(/\s+|#.*$/gm, '').replace(/\u0000/g, '\\#');
            else if (c === 's') f += 's';
            else if (c === 'n') { /* ignore empty matches: not supported, harmless */ }
            else throw new JqError(`"${c}" is not a valid regex flag`);
        }
        try {
            return cachedRegex(pattern, f);
        } catch (e) {
            throw new JqError(e.message);
        }
    }

    function captureObject(match) {
        const m = new Map();
        for (const [name, value] of Object.entries(match.groups || {})) m.set(name, value === undefined ? null : value);
        return m;
    }

    function requireString(v, fn) {
        if (typeof v !== 'string') throw new JqError(`${fn} needs a string, not ${describeValue(v)}`);
        return v;
    }

    // Arguments are filters evaluated against the call's input; a filter that
    // yields several values runs the builtin once per value, as in jq.
    const withArgs = (fn) => (input, args, env, ctx) => {
        const out = [];
        const go = (idx, vals) => {
            if (idx === args.length) {
                out.push(...fn(input, ...vals));
                return;
            }
            for (const v of evaluate(args[idx], input, env, ctx)) go(idx + 1, [...vals, v]);
        };
        go(0, []);
        return out;
    };
    const one = (fn) => withArgs((input, ...a) => [fn(input, ...a)]);

    const JQ_BUILTINS = {
        'empty/0': () => [],
        'not/0': one(v => !truthy(v)),
        'length/0': one(v => {
            switch (typeOf(v)) {
                case 'null': return 0;
                case 'boolean': throw new JqError('boolean has no length');
                case 'number': return Math.abs(num(v));
                case 'string': return stringLength(v);
                case 'array': return v.length;
                default: return v.size;
            }
        }),
        'utf8bytelength/0': one(v => new TextEncoder().encode(requireString(v, 'utf8bytelength')).length),
        'keys/0': one(v => keysOf(v, true)),
        'keys_unsorted/0': one(v => keysOf(v, false)),
        'values/0': (v) => (v === null ? [] : [v]),
        'has/1': one((v, k) => {
            if (isObject(v) && typeof k === 'string') return v.has(k);
            if (Array.isArray(v) && typeOf(k) === 'number') return num(k) >= 0 && num(k) < v.length;
            throw new JqError(`Cannot check whether ${typeOf(v)} has a ${typeOf(k)} key`);
        }),
        'in/1': one((k, v) => JQ_BUILTINS['has/1'](v, [{ type: 'literal', value: k }], null, { steps: 0 })[0]),
        'contains/1': one((a, b) => contains(a, b)),
        'inside/1': one((a, b) => contains(b, a)),
        'type/0': one(typeOf),
        'arrays/0': (v) => (typeOf(v) === 'array' ? [v] : []),
        'objects/0': (v) => (typeOf(v) === 'object' ? [v] : []),
        'iterables/0': (v) => (Array.isArray(v) || isObject(v) ? [v] : []),
        'scalars/0': (v) => (Array.isArray(v) || isObject(v) ? [] : [v]),
        'booleans/0': (v) => (typeOf(v) === 'boolean' ? [v] : []),
        'numbers/0': (v) => (typeOf(v) === 'number' ? [v] : []),
        'strings/0': (v) => (typeOf(v) === 'string' ? [v] : []),
        'nulls/0': (v) => (v === null ? [v] : []),
        'select/1': (input, [f], env, ctx) => (evaluate(f, input, env, ctx).some(truthy) ? [input] : []),
        'map/1': (input, [f], env, ctx) => [iterateValue(input).flatMap(x => evaluate(f, x, env, ctx))],
        'map_values/1': (input, [f], env, ctx) => {
            if (Array.isArray(input)) return [input.flatMap(x => evaluate(f, x, env, ctx).slice(0, 1))];
            if (isObject(input)) {
                const m = new Map();
                for (const [k, v] of input) {
                    const r = evaluate(f, v, env, ctx);
                    if (r.length) m.set(k, r[0]);
                }
                return [m];
            }
            throw new JqError(`Cannot iterate over ${describeValue(input)}`);
        },
        'add/0': one(v => iterateValue(v).reduce((acc, x) => (acc === undefined ? x : binop('+', acc, x)), undefined) ?? null),
        'any/0': one(v => iterateValue(v).some(truthy)),
        'all/0': one(v => iterateValue(v).every(truthy)),
        'any/1': (input, [f], env, ctx) => [iterateValue(input).some(x => evaluate(f, x, env, ctx).some(truthy))],
        'all/1': (input, [f], env, ctx) => [iterateValue(input).every(x => evaluate(f, x, env, ctx).every(truthy))],
        'any/2': (input, [g, f], env, ctx) => [evaluate(g, input, env, ctx).some(x => evaluate(f, x, env, ctx).some(truthy))],
        'all/2': (input, [g, f], env, ctx) => [evaluate(g, input, env, ctx).every(x => evaluate(f, x, env, ctx).every(truthy))],
        'range/1': withArgs((_, n) => {
            const out = [];
            for (let x = 0; x < num(n); x++) {
                if (out.length >= MAX_STEPS) throw new QueryError('range() is too large');
                out.push(x);
            }
            return out;
        }),
        'range/2': withArgs((_, a, b) => {
            const out = [];
            for (let x = num(a); x < num(b); x++) {
                if (out.length >= MAX_STEPS) throw new QueryError('range() is too large');
                out.push(x);
            }
            return out;
        }),
        'range/3': withArgs((_, a, b, s) => {
            const out = [];
            const step = num(s);
            if (step === 0) return out;
            for (let x = num(a); step > 0 ? x < num(b) : x > num(b); x += step) {
                if (out.length >= MAX_STEPS) throw new QueryError('range() is too large');
                out.push(x);
            }
            return out;
        }),
        'floor/0': one(v => Math.floor(num(requireType(v, 'number', 'floor')))),
        'ceil/0': one(v => Math.ceil(num(requireType(v, 'number', 'ceil')))),
        'round/0': one(v => Math.round(num(requireType(v, 'number', 'round')))),
        'fabs/0': one(v => Math.abs(num(requireType(v, 'number', 'fabs')))),
        'abs/0': one(v => Math.abs(num(requireType(v, 'number', 'abs')))),
        'sqrt/0': one(v => Math.sqrt(num(requireType(v, 'number', 'sqrt')))),
        'pow/2': withArgs((_, a, b) => [Math.pow(num(a), num(b))]),
        'log/0': one(v => Math.log(num(requireType(v, 'number', 'log')))),
        'min/0': one(v => (requireType(v, 'array', 'min').length ? sortedValues(v)[0] : null)),
        'max/0': one(v => (requireType(v, 'array', 'max').length ? sortedValues(v).at(-1) : null)),
        'min_by/1': (input, [f], env, ctx) => {
            const pairs = byKey(input, f, env, ctx, 'min_by');
            return [pairs.length ? pairs.reduce((a, b) => (compareValues(b.k, a.k) < 0 ? b : a)).x : null];
        },
        'max_by/1': (input, [f], env, ctx) => {
            const pairs = byKey(input, f, env, ctx, 'max_by');
            return [pairs.length ? pairs.reduce((a, b) => (compareValues(b.k, a.k) >= 0 ? b : a)).x : null];
        },
        'sort/0': one(v => sortedValues(requireType(v, 'array', 'sort'))),
        'sort_by/1': (input, [f], env, ctx) => [byKey(input, f, env, ctx, 'sort_by').sort((a, b) => compareValues(a.k, b.k)).map(p => p.x)],
        'group_by/1': (input, [f], env, ctx) => {
            const pairs = byKey(input, f, env, ctx, 'group_by').sort((a, b) => compareValues(a.k, b.k));
            const groups = [];
            for (const p of pairs) {
                const last = groups.at(-1);
                if (last && equals(last.k, p.k)) last.items.push(p.x);
                else groups.push({ k: p.k, items: [p.x] });
            }
            return [groups.map(g => g.items)];
        },
        'unique/0': one(v => sortedValues(requireType(v, 'array', 'unique')).filter((x, idx, arr) => idx === 0 || !equals(arr[idx - 1], x))),
        'unique_by/1': (input, [f], env, ctx) => {
            const pairs = byKey(input, f, env, ctx, 'unique_by').sort((a, b) => compareValues(a.k, b.k));
            return [pairs.filter((p, idx) => idx === 0 || !equals(pairs[idx - 1].k, p.k)).map(p => p.x)];
        },
        'reverse/0': one(v => {
            if (v === null) return [];
            if (typeof v === 'string') return [...v].reverse().join('');
            return [...requireType(v, 'array', 'reverse')].reverse();
        }),
        'first/0': one(v => indexValue(v, 0)),
        'last/0': one(v => indexValue(v, -1)),
        'first/1': (input, [f], env, ctx) => evaluate(f, input, env, ctx).slice(0, 1),
        'last/1': (input, [f], env, ctx) => evaluate(f, input, env, ctx).slice(-1),
        'nth/1': withArgs((v, n) => [indexValue(v, n)]),
        'limit/2': (input, [n, f], env, ctx) => evaluate(n, input, env, ctx).flatMap(count => (num(count) > 0 ? evaluate(f, input, env, ctx).slice(0, num(count)) : [])),
        'flatten/0': one(v => flatten(requireType(v, 'array', 'flatten'), Infinity)),
        'flatten/1': withArgs((v, d) => [flatten(requireType(v, 'array', 'flatten'), num(d))]),
        'to_entries/0': one(v => {
            if (!isObject(v)) throw new JqError(`to_entries needs an object, not ${describeValue(v)}`);
            return [...v].map(([key, value]) => new Map([['key', key], ['value', value]]));
        }),
        'from_entries/0': one(v => {
            const m = new Map();
            for (const entry of requireType(v, 'array', 'from_entries')) {
                if (!isObject(entry)) throw new JqError(`from_entries needs objects with key and value, not ${describeValue(entry)}`);
                const pick = (...names) => { for (const n of names) if (entry.has(n) && entry.get(n) !== null && entry.get(n) !== false) return entry.get(n); return null; };
                let key = pick('key', 'k', 'name', 'Name', 'Key', 'K');
                if (key === null && entry.has('key')) key = entry.get('key');
                const hasValue = ['value', 'v', 'Value', 'V'].find(n => entry.has(n));
                const value = hasValue ? entry.get(hasValue) : null;
                if (typeOf(key) === 'number' || typeof key === 'boolean') key = String(num(key));
                if (typeof key !== 'string') throw new JqError(`Cannot use ${describeValue(key)} as an object key`);
                m.set(key, value);
            }
            return m;
        }),
        'with_entries/1': (input, [f], env, ctx) => {
            const entries = JQ_BUILTINS['to_entries/0'](input, [], env, ctx)[0];
            const mapped = entries.flatMap(e => evaluate(f, e, env, ctx));
            return JQ_BUILTINS['from_entries/0'](mapped, [], env, ctx);
        },
        'recurse/0': (v) => recurseValues(v),
        'recurse/1': (input, [f], env, ctx) => {
            const out = [];
            const go = (v) => {
                if (++ctx.steps > MAX_STEPS) throw new QueryError('The query did too much work — stopped to keep the page responsive');
                out.push(v);
                for (const next of evaluate(f, v, env, ctx)) go(next);
            };
            go(input);
            return out;
        },
        'walk/1': (input, [f], env, ctx) => {
            const go = (v) => {
                let inner = v;
                if (Array.isArray(v)) inner = v.flatMap(x => go(x));
                else if (isObject(v)) {
                    inner = new Map();
                    for (const [k, x] of v) {
                        const r = go(x);
                        if (r.length) inner.set(k, r[0]);
                    }
                }
                return evaluate(f, inner, env, ctx);
            };
            return go(input);
        },
        'join/1': withArgs((v, sep) => {
            requireString(sep, 'join separator');
            return [iterateValue(v).map(x => {
                if (x === null) return '';
                if (Array.isArray(x) || isObject(x)) throw new JqError(`Cannot join with ${typeOf(x)}`);
                return toText(x);
            }).join(sep)];
        }),
        'split/1': withArgs((v, sep) => [requireString(v, 'split').split(requireString(sep, 'split separator'))]),
        'split/2': withArgs((v, re, flags) => [requireString(v, 'split').split(jqRegex(re, (flags || '') + 'g'))]),
        'ascii_downcase/0': one(v => requireString(v, 'ascii_downcase').replace(/[A-Z]/g, c => c.toLowerCase())),
        'ascii_upcase/0': one(v => requireString(v, 'ascii_upcase').replace(/[a-z]/g, c => c.toUpperCase())),
        'ltrimstr/1': withArgs((v, s) => [typeof v === 'string' && typeof s === 'string' && v.startsWith(s) ? v.slice(s.length) : v]),
        'rtrimstr/1': withArgs((v, s) => [typeof v === 'string' && typeof s === 'string' && s && v.endsWith(s) ? v.slice(0, -s.length) : v]),
        'trim/0': one(v => requireString(v, 'trim').trim()),
        'ltrim/0': one(v => requireString(v, 'ltrim').trimStart()),
        'rtrim/0': one(v => requireString(v, 'rtrim').trimEnd()),
        'startswith/1': withArgs((v, s) => [requireString(v, 'startswith').startsWith(requireString(s, 'startswith'))]),
        'endswith/1': withArgs((v, s) => [requireString(v, 'endswith').endsWith(requireString(s, 'endswith'))]),
        'explode/0': one(v => [...requireString(v, 'explode')].map(c => c.codePointAt(0))),
        'implode/0': one(v => String.fromCodePoint(...requireType(v, 'array', 'implode').map(num))),
        'test/1': withArgs((v, re) => [jqRegex(re).test(requireString(v, 'test'))]),
        'test/2': withArgs((v, re, flags) => [jqRegex(re, String(flags || '').replace('g', '')).test(requireString(v, 'test'))]),
        'capture/1': withArgs((v, re) => {
            const m = jqRegex(re).exec(requireString(v, 'capture'));
            return m ? [captureObject(m)] : [];
        }),
        'sub/2': (input, [re, repl], env, ctx) => substitute(input, re, repl, null, false, env, ctx),
        'sub/3': (input, [re, repl, flags], env, ctx) => substitute(input, re, repl, flags, false, env, ctx),
        'gsub/2': (input, [re, repl], env, ctx) => substitute(input, re, repl, null, true, env, ctx),
        'gsub/3': (input, [re, repl, flags], env, ctx) => substitute(input, re, repl, flags, true, env, ctx),
        'index/1': withArgs((v, s) => [v === null ? null : indexOf(v, s, false)]),
        'rindex/1': withArgs((v, s) => [v === null ? null : indexOf(v, s, true)]),
        'indices/1': withArgs((v, s) => [v === null ? null : indicesOf(v, s)]),
        'tostring/0': one(toText),
        'tonumber/0': one(v => {
            if (typeOf(v) === 'number') return v;
            const s = requireString(v, 'tonumber').trim();
            if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) throw new JqError(`Cannot parse "${v}" as a number`);
            return Number(s);
        }),
        'tojson/0': one(v => stringify(v, { indent: '' })),
        'fromjson/0': one(v => {
            try {
                return parseJson(requireString(v, 'fromjson')).value;
            } catch (e) {
                throw new JqError(`${e.message} (while parsing "${v}")`);
            }
        }),
        'ascii/0': one(v => String.fromCharCode(num(v))),
        'infinite/0': () => [Infinity],
        'nan/0': () => [NaN],
        'isnan/0': one(v => Number.isNaN(num(v))),
        'error/0': (v) => { throw new JqError(v); },
        'error/1': withArgs((_, msg) => { throw new JqError(msg); }),
        'getpath/1': withArgs((v, p) => {
            try {
                return [getPath(v, requireType(p, 'array', 'getpath'))];
            } catch (e) {
                if (e instanceof JqError) return [null];
                throw e;
            }
        }),
        'setpath/2': withArgs((v, p, x) => [setPath(v, requireType(p, 'array', 'setpath'), x)]),
        'delpaths/1': withArgs((v, ps) => [deletePaths(v, requireType(ps, 'array', 'delpaths'))]),
        'del/1': (input, [f], env, ctx) => [deletePaths(input, evalPaths(f, input, env, ctx).map(([p]) => p))],
        'path/1': (input, [f], env, ctx) => evalPaths(f, input, env, ctx).map(([p]) => p),
        'paths/0': (input, _, env, ctx) => evalPaths({ type: 'recurse' }, input, env, ctx).filter(([p]) => p.length).map(([p]) => p),
        'paths/1': (input, [f], env, ctx) => evalPaths({ type: 'recurse' }, input, env, ctx)
            .filter(([p, v]) => p.length && evaluate(f, v, env, ctx).some(truthy)).map(([p]) => p),
        'leaf_paths/0': (input, _, env, ctx) => evalPaths({ type: 'recurse' }, input, env, ctx)
            .filter(([p, v]) => p.length && !Array.isArray(v) && !isObject(v)).map(([p]) => p),
        'to_array/0': one(v => (Array.isArray(v) ? v : [v])),
        'splits/1': withArgs((v, re) => requireString(v, 'splits').split(jqRegex(re, 'g'))),
        'ascii_only/0': one(v => requireString(v, 'ascii_only').replace(/[^\x00-\x7f]/g, '')),
    };

    function indexOf(v, s, last) {
        const all = indicesOf(v, s);
        if (!all.length) return null;
        return last ? all.at(-1) : all[0];
    }

    function indicesOf(v, s) {
        if (typeof v === 'string' && typeof s === 'string') {
            const out = [];
            if (!s) return out;
            for (let at = v.indexOf(s); at !== -1; at = v.indexOf(s, at + 1)) out.push(at);
            return out;
        }
        if (Array.isArray(v)) return indexValue(v, Array.isArray(s) ? s : [s]);
        throw new JqError(`Cannot search ${typeOf(v)} for ${typeOf(s)}`);
    }

    function substitute(input, reNode, replNode, flagsNode, global_, env, ctx) {
        requireString(input, global_ ? 'gsub' : 'sub');
        const out = [];
        for (const re of evaluate(reNode, input, env, ctx)) {
            const flagSets = flagsNode ? evaluate(flagsNode, input, env, ctx) : [''];
            for (const flags of flagSets) {
                const regex = jqRegex(re, String(flags || '').replace('g', '') + (global_ || String(flags || '').includes('g') ? 'g' : ''));
                regex.lastIndex = 0;
                let result = '';
                let last = 0;
                let match;
                const isGlobal = regex.global;
                while ((match = regex.exec(input))) {
                    const repls = evaluate(replNode, captureObject(match), env, ctx);
                    const repl = repls.length ? repls[0] : '';
                    result += input.slice(last, match.index) + requireString(repl, 'replacement');
                    last = match.index + match[0].length;
                    if (!isGlobal) break;
                    if (match[0] === '') regex.lastIndex++;
                }
                out.push(result + input.slice(last));
            }
        }
        return out;
    }

    const csvCell = (sep) => (x) => {
        switch (typeOf(x)) {
            case 'number': return String(num(x));
            case 'boolean': return String(x);
            case 'null': return '';
            case 'string': return sep === ',' ? `"${x.replace(/"/g, '""')}"` : x.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        }
        throw new JqError(`${describeValue(x)} is not valid in a ${sep === ',' ? 'csv' : 'tsv'} row`);
    };

    const JQ_FORMATS = {
        text: toText,
        json: (v) => stringify(v, { indent: '' }),
        csv: (v) => requireType(v, 'array', '@csv').map(csvCell(',')).join(','),
        tsv: (v) => requireType(v, 'array', '@tsv').map(csvCell('\t')).join('\t'),
        html: (v) => toText(v).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' })[c]),
        uri: (v) => [...new TextEncoder().encode(toText(v))].map(b => {
            const c = String.fromCharCode(b);
            return /[A-Za-z0-9\-_.~]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0');
        }).join(''),
        sh: (v) => (Array.isArray(v) ? v : [v]).map(x => {
            if (Array.isArray(x) || isObject(x)) throw new JqError(`${describeValue(x)} cannot be escaped for shell`);
            return typeof x === 'string' ? `'${x.replace(/'/g, "'\\''")}'` : toText(x);
        }).join(' '),
        base64: (v) => {
            const bytes = new TextEncoder().encode(toText(v));
            let bin = '';
            for (const b of bytes) bin += String.fromCharCode(b);
            return btoa(bin);
        },
        base64d: (v) => {
            try {
                const bin = atob(toText(v).replace(/=+$/, ''));
                return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
            } catch {
                throw new JqError(`${describeValue(v)} is not valid base64 data`);
            }
        },
    };

    /* ---------- Public API ---------- */

    global.JsonQuery = Object.freeze({
        JsonNumber,
        JsonSyntaxError,
        QueryError,
        JqError,
        parseJson,
        stringify,
        toPlain,
        fromPlain,
        typeOf,
        runJsonPath,
        runJq,
    });
})(globalThis);
