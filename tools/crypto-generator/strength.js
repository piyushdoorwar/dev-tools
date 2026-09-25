// Password strength estimator: a compact re-implementation of zxcvbn's model
// (Wheeler, USENIX Security '16) rather than the 800 KB library. It finds
// every pattern an attacker's cracker would try first (ranked dictionary
// words, l33t spellings, keyboard walks, sequences, repeats, dates), prices
// each match in guesses, then picks the cheapest way to cover the whole
// string. The strength is how many guesses that cheapest cover costs.
//
// Guess counts overflow doubles on long inputs, so everything past matching
// is carried as log10(guesses).
//
// Classic-script globals on purpose: specs can page.evaluate them directly.

const STRENGTH_MAX_LENGTH = 128;
const STRENGTH_REF_YEAR = new Date().getFullYear();
const STRENGTH_MIN_YEAR_SPACE = 20;
// zxcvbn's additive penalty per extra match: without it, splitting a string
// into ever more tiny matches would always look cheaper.
const STRENGTH_SEQUENCE_PENALTY_LOG = 4; // log10(10000)

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

// Guesses per second for each attack model. The throttled rate is what a
// login form with lockout allows; the fast-hash rate is a GPU rig against
// unsalted MD5/SHA-1.
const STRENGTH_ATTACKS = [
  { id: 'onlineThrottled', label: 'Online, throttled', detail: '100 guesses / hour — a login form with rate limiting', rate: 100 / 3600 },
  { id: 'onlineUnthrottled', label: 'Online, unthrottled', detail: '10 guesses / second — no rate limiting', rate: 10 },
  { id: 'offlineSlow', label: 'Offline, slow hash', detail: '10⁴ guesses / second — stolen bcrypt, scrypt or Argon2 hashes', rate: 1e4 },
  { id: 'offlineFast', label: 'Offline, fast hash', detail: '10¹⁰ guesses / second — stolen MD5 or SHA-1 hashes on GPUs', rate: 1e10 },
];

const L33T_TABLE = {
  a: ['4', '@'],
  b: ['8'],
  c: ['(', '{', '[', '<'],
  e: ['3'],
  g: ['6', '9'],
  i: ['1', '!', '|'],
  l: ['1', '|', '7'],
  o: ['0'],
  s: ['$', '5'],
  t: ['+', '7'],
  x: ['%'],
  z: ['2'],
};

const strengthDictionaries = (() => {
  const data = typeof PASSWORD_DATA === 'undefined' ? {} : PASSWORD_DATA;
  const rank = (list = [], offset = 0) => new Map(list.map((word, index) => [word, offset + index + 1]));
  const passwords = data.passwords || [];
  // Famous examples rank just after the leaked list: in every wordlist, but
  // tried after the passwords real people actually use.
  return { passwords: rank(passwords), words: rank(data.words), famous: rank(data.famous, passwords.length) };
})();

const STRENGTH_MAX_WORD = 32;

/* --- Keyboard graph ------------------------------------------------------- */

// Slanted QWERTY: each row sits half a key right of the one above, so on a
// doubled x axis a key's neighbours are x±2 on its row and x±1 on the rows
// above and below. That makes 1qaz and zaq1 straight lines, as they are.
const strengthKeyboard = (() => {
  const rows = [
    ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+'],
    ['qQ', 'wW', 'eE', 'rR', 'tT', 'yY', 'uU', 'iI', 'oO', 'pP', '[{', ']}', '\\|'],
    ['aA', 'sS', 'dD', 'fF', 'gG', 'hH', 'jJ', 'kK', 'lL', ';:', "'\""],
    ['zZ', 'xX', 'cC', 'vV', 'bB', 'nN', 'mM', ',<', '.>', '/?'],
  ];
  const shifts = [0, 3, 4, 5];
  const keys = new Map();
  rows.forEach((row, y) => row.forEach((pair, col) => {
    const x = col * 2 + shifts[y];
    keys.set(pair[0], { x, y, shifted: false });
    keys.set(pair[1], { x, y, shifted: true });
  }));
  const positions = [...keys.values()].filter((key) => !key.shifted);
  const occupied = new Set(positions.map((key) => `${key.x},${key.y}`));
  const steps = [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const degree = positions.reduce(
    (sum, key) => sum + steps.filter(([dx, dy]) => occupied.has(`${key.x + dx},${key.y + dy}`)).length,
    0,
  ) / positions.length;
  return { keys, startingPositions: keys.size, averageDegree: degree };
})();

function keyboardDirection(a, b) {
  const from = strengthKeyboard.keys.get(a);
  const to = strengthKeyboard.keys.get(b);
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if ((dy === 0 && Math.abs(dx) === 2) || (Math.abs(dy) === 1 && Math.abs(dx) === 1)) return `${dx},${dy}`;
  return null;
}

/* --- Maths helpers -------------------------------------------------------- */

function log10Add(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const high = Math.max(a, b);
  return high + Math.log10(1 + 10 ** (Math.min(a, b) - high));
}

function log10Factorial(n) {
  let total = 0;
  for (let i = 2; i <= n; i += 1) total += Math.log10(i);
  return total;
}

function nCk(n, k) {
  if (k > n) return 0;
  if (k === 0) return 1;
  let result = 1;
  for (let d = 1; d <= k; d += 1) {
    result *= n;
    result /= d;
    n -= 1;
  }
  return result;
}

// How many case/shift variants an attacker tries for S "special" and U plain
// characters: every way of choosing up to min(S, U) of them.
function variantCount(special, plain) {
  if (special === 0) return 1;
  if (plain === 0) return 2;
  let total = 0;
  for (let i = 1; i <= Math.min(special, plain); i += 1) total += nCk(special + plain, i);
  return total;
}

/* --- Matchers ------------------------------------------------------------- */

function dictionaryMatches(password, original = password, substitutions = null) {
  const lower = password.toLowerCase();
  const matches = [];
  for (let i = 0; i < lower.length; i += 1) {
    for (let j = i + 2; j < Math.min(lower.length, i + STRENGTH_MAX_WORD); j += 1) {
      const word = lower.slice(i, j + 1);
      for (const dict of ['passwords', 'famous', 'words']) {
        const rank = strengthDictionaries[dict].get(word);
        if (!rank) continue;
        const token = original.slice(i, j + 1);
        const subs = {};
        if (substitutions) {
          for (const ch of token) {
            if (substitutions[ch]) subs[ch] = substitutions[ch];
          }
          if (!Object.keys(subs).length) continue;
        }
        matches.push({ pattern: 'dictionary', i, j, token, matched: word, rank, dict, l33t: Boolean(substitutions), subs });
      }
    }
  }
  return matches;
}

// Each l33t character in the password can stand for one of several letters
// ("1" is i or l), so try every consistent assignment — capped, since each
// assignment is a full dictionary pass.
function l33tMatches(password) {
  const reverse = {};
  for (const [letter, subs] of Object.entries(L33T_TABLE)) {
    for (const sub of subs) {
      if (password.includes(sub)) (reverse[sub] ||= []).push(letter);
    }
  }
  const chars = Object.keys(reverse);
  if (!chars.length) return [];
  let maps = [{}];
  for (const ch of chars) {
    const next = [];
    for (const map of maps) {
      for (const letter of reverse[ch]) next.push({ ...map, [ch]: letter });
    }
    maps = next.slice(0, 16);
  }
  const matches = [];
  const seen = new Set();
  for (const map of maps) {
    // Code-unit replace keeps indices aligned with the original string.
    const translated = password.replace(/./gs, (ch) => map[ch] || ch);
    for (const match of dictionaryMatches(translated, password, map)) {
      const key = `${match.i}:${match.j}:${match.matched}:${match.dict}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
  }
  return matches;
}

function spatialMatches(password) {
  const matches = [];
  let i = 0;
  while (i < password.length - 2) {
    let j = i;
    let lastDirection = null;
    let turns = 0;
    while (j + 1 < password.length) {
      const direction = keyboardDirection(password[j], password[j + 1]);
      if (!direction) break;
      if (direction !== lastDirection) turns += 1;
      lastDirection = direction;
      j += 1;
    }
    if (j - i >= 2) {
      const token = password.slice(i, j + 1);
      const shifted = [...token].filter((ch) => strengthKeyboard.keys.get(ch)?.shifted).length;
      matches.push({ pattern: 'spatial', i, j, token, turns, shifted });
      i = j;
    } else {
      i += 1;
    }
  }
  return matches;
}

function charClass(ch) {
  if (/[a-z]/.test(ch)) return 'lower';
  if (/[A-Z]/.test(ch)) return 'upper';
  if (/[0-9]/.test(ch)) return 'digit';
  return null;
}

function sequenceMatches(password) {
  const matches = [];
  const push = (i, j, delta) => {
    if (j - i < 2 || !delta || Math.abs(delta) > 5) return;
    const token = password.slice(i, j + 1);
    const cls = charClass(token[0]);
    if (!cls || [...token].some((ch) => charClass(ch) !== cls)) return;
    matches.push({ pattern: 'sequence', i, j, token, ascending: delta > 0, delta, cls });
  };
  let i = 0;
  let lastDelta = null;
  for (let k = 1; k < password.length; k += 1) {
    const delta = password.charCodeAt(k) - password.charCodeAt(k - 1);
    if (lastDelta === null) lastDelta = delta;
    if (delta === lastDelta) continue;
    push(i, k - 1, lastDelta);
    i = k - 1;
    lastDelta = delta;
  }
  if (password.length > 1) push(i, password.length - 1, lastDelta);
  return matches;
}

function repeatMatches(password) {
  const matches = [];
  const greedy = /(.+)\1+/gs;
  const lazy = /(.+?)\1+/gs;
  const lazyAnchored = /^(.+?)\1+$/s;
  let lastIndex = 0;
  while (lastIndex < password.length) {
    greedy.lastIndex = lastIndex;
    lazy.lastIndex = lastIndex;
    const greedyMatch = greedy.exec(password);
    const lazyMatch = lazy.exec(password);
    if (!greedyMatch) break;
    let match;
    let base;
    // "abcabc" vs "aabaab": the longer match wins; its shortest repeating
    // unit is the base the attacker actually has to guess.
    if (greedyMatch[0].length > lazyMatch[0].length) {
      match = greedyMatch;
      base = lazyAnchored.exec(match[0])[1];
    } else {
      match = lazyMatch;
      base = match[1];
    }
    const i = match.index;
    const j = i + match[0].length - 1;
    const baseAnalysis = mostGuessable(base, omnimatch(base));
    matches.push({
      pattern: 'repeat', i, j, token: match[0], base,
      repeatCount: match[0].length / base.length,
      baseLog10: baseAnalysis.log10,
      baseSequence: baseAnalysis.sequence,
    });
    lastIndex = j + 1;
  }
  return matches;
}

function twoDigitYear(year) {
  if (year > 99) return year;
  return year > 50 ? 1900 + year : 2000 + year;
}

// Pick a day/month/year reading of three numbers, preferring the year
// closest to now — the reading an attacker would try first.
function readDate(parts) {
  const candidates = [];
  const tryYear = (year, rest) => {
    const y = twoDigitYear(year);
    if (y < 1000 || y > 2050) return;
    const [a, b] = rest;
    if ((a >= 1 && a <= 31 && b >= 1 && b <= 12) || (b >= 1 && b <= 31 && a >= 1 && a <= 12)) {
      candidates.push(y);
    }
  };
  const [p0, p1, p2] = parts;
  if (p2.length === 4 || p2.length === 2) tryYear(Number(p2), [Number(p0), Number(p1)]);
  if (p0.length === 4 || p0.length === 2) tryYear(Number(p0), [Number(p1), Number(p2)]);
  if (!candidates.length) return null;
  return candidates.sort((x, y) => Math.abs(x - STRENGTH_REF_YEAR) - Math.abs(y - STRENGTH_REF_YEAR))[0];
}

function dateMatches(password) {
  const matches = [];
  // Bare years.
  for (let i = 0; i + 4 <= password.length; i += 1) {
    const token = password.slice(i, i + 4);
    if (!/^(19|20)\d\d$/.test(token)) continue;
    const year = Number(token);
    if (year > STRENGTH_REF_YEAR + 10) continue;
    matches.push({ pattern: 'date', kind: 'year', i, j: i + 3, token, year, separator: '' });
  }
  // Dates with a separator: 12/05/1990, 1990-05-12, 5.12.90.
  const separated = /^(\d{1,4})([\s/\\_.-])(\d{1,2})\2(\d{1,4})$/;
  for (let i = 0; i < password.length; i += 1) {
    for (let len = 6; len <= 10 && i + len <= password.length; len += 1) {
      const token = password.slice(i, i + len);
      const m = separated.exec(token);
      if (!m) continue;
      const year = readDate([m[1], m[3], m[4]]);
      if (year) matches.push({ pattern: 'date', kind: 'date', i, j: i + len - 1, token, year, separator: m[2] });
    }
  }
  // Run-together dates: 12051990, 900512, 1231.
  const splits = { 4: [[1, 2], [2, 3]], 5: [[1, 3], [2, 3]], 6: [[1, 2], [2, 4], [4, 5]], 7: [[1, 3], [2, 3], [4, 5], [4, 6]], 8: [[2, 4], [4, 6]] };
  for (let i = 0; i < password.length; i += 1) {
    for (let len = 4; len <= 8 && i + len <= password.length; len += 1) {
      const token = password.slice(i, i + len);
      if (!/^\d+$/.test(token)) continue;
      let best = null;
      for (const [a, b] of splits[len]) {
        const year = readDate([token.slice(0, a), token.slice(a, b), token.slice(b)]);
        if (year && (best === null || Math.abs(year - STRENGTH_REF_YEAR) < Math.abs(best - STRENGTH_REF_YEAR))) best = year;
      }
      if (best) matches.push({ pattern: 'date', kind: 'date', i, j: i + len - 1, token, year: best, separator: '' });
    }
  }
  return matches;
}

function omnimatch(password) {
  return [
    ...dictionaryMatches(password),
    ...l33tMatches(password),
    ...spatialMatches(password),
    ...sequenceMatches(password),
    ...repeatMatches(password),
    ...dateMatches(password),
  ];
}

/* --- Guess estimates ------------------------------------------------------ */

function uppercaseVariations(token) {
  if (!/[A-Z]/.test(token) || token.toLowerCase() === token) return 1;
  // Capitalised first letter, last letter, or all caps: the first things
  // a cracker tries, so they barely double the work.
  if (/^[A-Z][^A-Z]+$/.test(token) || /^[^A-Z]+[A-Z]$/.test(token) || /^[^a-z]+$/.test(token)) return 2;
  const upper = [...token].filter((ch) => /[A-Z]/.test(ch)).length;
  const lower = [...token].filter((ch) => /[a-z]/.test(ch)).length;
  return variantCount(upper, lower);
}

function l33tVariations(match) {
  if (!match.l33t) return 1;
  let total = 1;
  const lower = match.token.toLowerCase();
  for (const [sub, letter] of Object.entries(match.subs)) {
    const subbed = [...lower].filter((ch) => ch === sub).length;
    const plain = [...lower].filter((ch) => ch === letter).length;
    total *= variantCount(subbed, plain);
  }
  return total;
}

function matchLog10(match, password) {
  if (match.log10 !== undefined) return match.log10;
  const len = match.j - match.i + 1;
  let log;
  switch (match.pattern) {
    case 'bruteforce':
      log = Math.max(len, Math.log10(len === 1 ? 11 : 51));
      break;
    case 'dictionary':
      log = Math.log10(match.rank * uppercaseVariations(match.token) * l33tVariations(match));
      break;
    case 'spatial': {
      const { startingPositions: s, averageDegree: d } = strengthKeyboard;
      let guesses = 0;
      for (let i = 2; i <= len; i += 1) {
        for (let j = 1; j <= Math.min(match.turns, i - 1); j += 1) guesses += nCk(i - 1, j - 1) * s * d ** j;
      }
      log = Math.log10(guesses * variantCount(match.shifted, len - match.shifted));
      break;
    }
    case 'sequence': {
      let base = match.cls === 'digit' ? 10 : 26;
      if ('aAzZ019'.includes(match.token[0])) base = 4;
      log = Math.log10(base * len * (match.ascending ? 1 : 2));
      break;
    }
    case 'repeat':
      log = match.baseLog10 + Math.log10(match.repeatCount);
      break;
    case 'date': {
      const years = Math.max(Math.abs(match.year - STRENGTH_REF_YEAR), STRENGTH_MIN_YEAR_SPACE);
      log = Math.log10(match.kind === 'year' ? years : years * 365 * (match.separator ? 4 : 1));
      break;
    }
    default:
      log = len;
  }
  // A tiny match inside a longer password can't be priced below this, or
  // the search would stitch together implausibly cheap covers.
  if (match.pattern !== 'bruteforce' && len < password.length) {
    log = Math.max(log, Math.log10(len === 1 ? 10 : 50));
  }
  match.log10 = log;
  return log;
}

// zxcvbn's search: for every prefix and every match count l, keep the
// cheapest cover. Total guesses for l matches = l! * product(guesses) +
// 10000^(l-1); unmatched stretches are filled with brute-force matches.
function mostGuessable(password, matches) {
  const n = password.length;
  if (!n) return { log10: 0, sequence: [] };
  const byEnd = Array.from({ length: n }, () => []);
  matches.forEach((m) => byEnd[m.j].push(m));
  byEnd.forEach((list) => list.sort((a, b) => a.i - b.i));
  const best = Array.from({ length: n }, () => ({ m: new Map(), pi: new Map(), g: new Map() }));

  const update = (m, l) => {
    const k = m.j;
    let pi = matchLog10(m, password);
    if (l > 1) pi += best[m.i - 1].pi.get(l - 1);
    const g = log10Add(log10Factorial(l) + pi, (l - 1) * STRENGTH_SEQUENCE_PENALTY_LOG);
    for (const [otherL, otherG] of best[k].g) {
      if (otherL <= l && otherG <= g) return;
    }
    best[k].m.set(l, m);
    best[k].pi.set(l, pi);
    best[k].g.set(l, g);
  };
  const bruteforce = (i, j) => ({ pattern: 'bruteforce', i, j, token: password.slice(i, j + 1) });

  for (let k = 0; k < n; k += 1) {
    for (const m of byEnd[k]) {
      if (m.i > 0) {
        for (const l of [...best[m.i - 1].m.keys()]) update(m, l + 1);
      } else {
        update(m, 1);
      }
    }
    update(bruteforce(0, k), 1);
    for (let i = 1; i <= k; i += 1) {
      for (const [l, last] of [...best[i - 1].m]) {
        // Two adjacent brute-force runs are one longer run, already tried.
        if (last.pattern !== 'bruteforce') update(bruteforce(i, k), l + 1);
      }
    }
  }

  let bestL = null;
  let bestG = Infinity;
  for (const [l, g] of best[n - 1].g) {
    if (g < bestG) {
      bestG = g;
      bestL = l;
    }
  }
  const sequence = [];
  let k = n - 1;
  let l = bestL;
  while (k >= 0) {
    const m = best[k].m.get(l);
    sequence.unshift(m);
    k = m.i - 1;
    l -= 1;
  }
  return { log10: bestG, sequence };
}

/* --- Presentation --------------------------------------------------------- */

function scoreFromLog10(log) {
  const thresholds = [1e3 + 5, 1e6 + 5, 1e8 + 5, 1e10 + 5].map(Math.log10);
  const index = thresholds.findIndex((t) => log < t);
  return index === -1 ? 4 : index;
}

function formatCrackTime(log10Seconds) {
  if (log10Seconds < 0) return 'less than a second';
  const units = [
    ['second', 1], ['minute', 60], ['hour', 3600], ['day', 86400],
    ['month', 86400 * 31], ['year', 86400 * 365], ['century', 86400 * 365 * 100],
  ];
  if (log10Seconds >= Math.log10(86400 * 365 * 100)) return 'centuries';
  const seconds = 10 ** log10Seconds;
  let unit = units[0];
  for (const candidate of units) {
    if (seconds >= candidate[1]) unit = candidate;
  }
  const count = Math.round(seconds / unit[1]);
  return `${count} ${unit[0]}${count === 1 ? '' : 's'}`;
}

function charsetSize(password) {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password)) size += 33;
  if (/[^\x20-\x7e]/.test(password)) size += 100;
  return size;
}

function describeMatch(match) {
  const quoted = `“${match.token}”`;
  switch (match.pattern) {
    case 'dictionary': {
      const out = [];
      if (match.dict === 'passwords') {
        out.push({ type: 'common', title: 'Common password', text: `${quoted} is #${match.rank} on the list of most-used passwords.` });
      } else if (match.dict === 'famous') {
        out.push({ type: 'common', title: 'Famous password', text: `${quoted} is a well-known example password; cracking wordlists include it.` });
      } else {
        out.push({ type: 'dictionary', title: 'Dictionary word', text: `${quoted} is a common English word (rank ${match.rank}).` });
      }
      if (match.l33t) {
        const subs = Object.entries(match.subs).map(([sub, letter]) => `${sub}→${letter}`).join(', ');
        out.push({ type: 'l33t', title: 'Predictable substitutions', text: `${quoted} is “${match.matched}” with ${subs}; crackers try these swaps automatically.` });
      }
      if (uppercaseVariations(match.token) === 2) {
        out.push({ type: 'case', title: 'Predictable capitals', text: `Capitalising the first letter or all of ${quoted} barely slows a cracker down.` });
      }
      return out;
    }
    case 'spatial':
      return [{ type: 'keyboard', title: 'Keyboard pattern', text: `${quoted} is a walk across neighbouring keys${match.turns === 1 ? ' in a straight line' : ` with ${match.turns - 1} turn${match.turns === 2 ? '' : 's'}`}.` }];
    case 'sequence':
      return [{ type: 'sequence', title: 'Sequence', text: `${quoted} is ${match.ascending ? 'an ascending' : 'a descending'} sequence.` }];
    case 'repeat': {
      const out = [{ type: 'repeat', title: 'Repetition', text: `${quoted} is “${match.base}” repeated ${match.repeatCount} times; repeats add almost nothing.` }];
      match.baseSequence.forEach((inner) => out.push(...describeMatch(inner)));
      return out;
    }
    case 'date':
      return [{ type: 'date', title: match.kind === 'year' ? 'Year' : 'Date', text: `${quoted} looks like ${match.kind === 'year' ? 'a year' : 'a date'}; birthdays and recent years are guessed early.` }];
    default:
      return [];
  }
}

function analysePassword(input) {
  const full = String(input ?? '');
  if (!full) return null;
  const password = full.slice(0, STRENGTH_MAX_LENGTH);
  const matches = omnimatch(password);
  const { log10, sequence } = mostGuessable(password, matches);
  const score = scoreFromLog10(log10);

  const weaknesses = [];
  const seen = new Set();
  const add = (items) => items.forEach((item) => {
    const key = `${item.type}:${item.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    weaknesses.push(item);
  });
  // Only the cheapest cover is priced, but the lesson is often in a pattern
  // it passed over: "qwertyuiop" is priced as common password #22 yet is
  // also a keyboard walk, and "2024" inside a brute-forced "2024!" is still
  // a year. Surface those, without letting 3-character accidents in a
  // random string raise false alarms.
  const teaches = (m) => ['spatial', 'sequence', 'repeat'].includes(m.pattern) ||
    (m.pattern === 'date' && (m.kind === 'year' || m.separator));
  // A digit run like 123 is a sequence first; calling it a keyboard walk too is noise.
  const isSequenceSpan = (m) => matches.some((o) => o.pattern === 'sequence' && o.i === m.i && o.j === m.j);
  for (const match of sequence) {
    add(describeMatch(match));
    const len = match.j - match.i + 1;
    matches
      .filter((other) => other !== match && other.pattern !== match.pattern && teaches(other))
      .filter((other) => other.pattern !== 'spatial' || !isSequenceSpan(other))
      .filter((other) => {
        const otherLen = other.j - other.i + 1;
        if (match.pattern === 'bruteforce' || match.pattern === 'dictionary') {
          const inside = other.i >= match.i && other.j <= match.j;
          const floor = match.pattern === 'bruteforce' ? 4 : Math.max(3, Math.ceil(len / 2));
          return inside && otherLen >= floor;
        }
        return other.i === match.i && other.j === match.j;
      })
      .forEach((other) => add(describeMatch(other)));
  }
  if (full.length < 12) {
    weaknesses.push({ type: 'length', title: 'Short', text: `Only ${full.length} character${full.length === 1 ? '' : 's'}; use at least 12, ideally a passphrase of several random words.` });
  }

  const log10Bits = Math.log2(10);
  const crackTimes = STRENGTH_ATTACKS.map((attack) => ({
    ...attack,
    display: formatCrackTime(log10 - Math.log10(attack.rate)),
  }));

  return {
    password,
    truncated: full.length > STRENGTH_MAX_LENGTH,
    log10,
    score,
    label: STRENGTH_LABELS[score],
    entropyBits: log10 * log10Bits,
    charsetBits: password.length * Math.log2(Math.max(charsetSize(password), 1)),
    crackTimes,
    sequence,
    weaknesses,
  };
}
