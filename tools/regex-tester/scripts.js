const regexInput = document.getElementById('regexInput');
const regexInputWrap = document.getElementById('regexInputWrap');
const regexError = document.getElementById('regexError');
const textInput = document.getElementById('textInput');
const textHighlight = document.getElementById('textHighlight');
const outputTemplate = document.getElementById('outputTemplate');
const outputList = document.getElementById('outputList');
const outputMeta = document.getElementById('outputMeta');
const matchList = document.getElementById('matchList');
const matchMeta = document.getElementById('matchMeta');
const matchCount = document.getElementById('matchCount');
const matchSearch = document.getElementById('matchSearch');
const prevMatchBtn = document.getElementById('prevMatchBtn');
const nextMatchBtn = document.getElementById('nextMatchBtn');
const highlightToggle = document.getElementById('highlightToggle');

const pasteRegexBtn = document.getElementById('pasteRegexBtn');
const pasteTextBtn = document.getElementById('pasteTextBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const copyOutputBtn = document.getElementById('copyOutputBtn');
const toastStack = document.getElementById('toastStack');

const openCheatSheetBtn = document.getElementById('openCheatSheetBtn');
const closeCheatSheetBtn = document.getElementById('closeCheatSheetBtn');
const cheatSheetModal = document.getElementById('cheatSheetModal');

const FLAG_ORDER = ['g', 'i', 'm', 's', 'u', 'y'];

const flagButtons = FLAG_ORDER.map((flag) =>
  document.querySelector(`.flag-btn[data-flag="${flag}"]`)
).filter(Boolean);

const flagButtonMap = new Map(flagButtons.map((button) => [button.dataset.flag, button]));

const sampleData = {
  pattern: '[A-Z][a-z]+',
  flags: 'g',
  template: '$0\\n',
  text:
    'TITLE: Regex Playground\\n' +
    'AUTHOR: DEVUTILS\\n' +
    'notes: lower-case key (toggle i)\\n' +
    '\\n' +
    'BLOCK: first line\\n' +
    'second line continues\\n' +
    'third line ends\\n' +
    '\\n' +
    'PATH: /api/v1/users\\n' +
    'ID: 12345\\n' +
    'TAG: Alpha_Beta\\n' +
    '\\n' +
    'Tip: Toggle g i m s y to see how matches change.'
};

let matches = [];
let activeMatchIndex = -1;

function setFlagState(flags) {
  FLAG_ORDER.forEach((flag) => {
    const button = flagButtonMap.get(flag);
    if (!button) {
      return;
    }
    const isActive = flags.includes(flag);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function getFlags() {
  return FLAG_ORDER.filter((flag) => {
    const button = flagButtonMap.get(flag);
    return button && button.classList.contains('active');
  }).join('');
}

function showError(message) {
  regexError.textContent = message;
  regexInputWrap.classList.add('has-error');
}

function clearError() {
  regexError.textContent = '';
  regexInputWrap.classList.remove('has-error');
}

function compileRegex() {
  const pattern = regexInput.value;
  if (!pattern) {
    clearError();
    return null;
  }

  try {
    const regex = new RegExp(pattern, getFlags());
    clearError();
    return regex;
  } catch (err) {
    const message = err && err.message ? err.message : 'Invalid regular expression';
    showError(message);
    return null;
  }
}

function buildMatch(match) {
  const start = match.index ?? 0;
  const text = match[0] ?? '';
  return {
    text,
    index: start,
    end: start + text.length,
    groups: match.groups || null,
    raw: match
  };
}

function collectMatches(regex, text) {
  const results = [];
  if (!regex) {
    return results;
  }

  if (!regex.flags.includes('g')) {
    const singleMatch = regex.exec(text);
    if (singleMatch) {
      results.push(buildMatch(singleMatch));
    }
    return results;
  }

  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    results.push(buildMatch(match));
    if (match[0] === '') {
      // Avoid infinite loops on zero-length matches.
      regex.lastIndex += 1;
    }
    match = regex.exec(text);
  }

  return results;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function syncScroll() {
  textHighlight.scrollTop = textInput.scrollTop;
  textHighlight.scrollLeft = textInput.scrollLeft;
}

function renderHighlight(text) {
  const safeText = escapeHtml(text);

  if (!highlightToggle.checked || matches.length === 0) {
    textHighlight.innerHTML = safeText;
    syncScroll();
    return;
  }

  let output = '';
  let lastIndex = 0;

  matches.forEach((match, index) => {
    if (match.end <= match.index) {
      return;
    }
    output += escapeHtml(text.slice(lastIndex, match.index));
    const className = index === activeMatchIndex ? 'match active' : 'match';
    output += `<mark class="${className}">${escapeHtml(text.slice(match.index, match.end))}</mark>`;
    lastIndex = match.end;
  });

  output += escapeHtml(text.slice(lastIndex));
  textHighlight.innerHTML = output;
  syncScroll();
}

function normalizeTemplate(template) {
  return (template || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

function applyTemplate(template, match) {
  let output = template;

  output = output.replace(/\$<([^>]+)>/g, (_, name) => {
    if (!match.groups || match.groups[name] === undefined) {
      return '';
    }
    return String(match.groups[name]);
  });

  output = output.replace(/\$(\d+)/g, (_, index) => {
    const group = match.raw[Number(index)];
    return group === undefined ? '' : String(group);
  });

  output = output.replace(/\$\$/g, '$');

  return output;
}

function updateOutput() {
  const template = normalizeTemplate(outputTemplate.value);
  const formatted = matches.map((match) => applyTemplate(template, match)).join('');
  outputList.textContent = formatted;
  outputMeta.textContent = `${matches.length} item${matches.length === 1 ? '' : 's'}`;
}

function updateMatchCount() {
  const total = matches.length;
  if (total === 0) {
    matchCount.textContent = '0 matches';
    return;
  }

  if (total === 1) {
    matchCount.textContent = '1 match';
    return;
  }

  const current = activeMatchIndex >= 0 ? activeMatchIndex + 1 : 1;
  matchCount.textContent = `${current} of ${total} matches`;
}

function updateNavButtons() {
  const canStep = matches.length > 1;
  prevMatchBtn.disabled = !canStep;
  nextMatchBtn.disabled = !canStep;
}

function renderMatchList() {
  const query = matchSearch.value.trim().toLowerCase();
  matchList.innerHTML = '';

  const filtered = [];
  matches.forEach((match, index) => {
    if (!query) {
      filtered.push({ match, index });
      return;
    }

    const values = [match.text, `${match.index},${match.end}`];
    if (match.raw && match.raw.length > 1) {
      match.raw.slice(1).forEach((group) => values.push(group || ''));
    }

    const isMatch = values.some((value) => String(value).toLowerCase().includes(query));
    if (isMatch) {
      filtered.push({ match, index });
    }
  });

  matchMeta.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = matches.length === 0 ? 'No matches yet.' : 'No matches found.';
    matchList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(({ match, index }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'match-item';
    item.dataset.index = String(index);
    if (index === activeMatchIndex) {
      item.classList.add('active');
    }

    const label = document.createElement('div');
    label.className = 'match-text';
    label.textContent = match.text === '' ? '[empty]' : `"${match.text}"`;

    const meta = document.createElement('div');
    meta.className = 'match-meta';
    meta.textContent = `{${match.index}, ${match.end}}`;

    item.appendChild(label);
    item.appendChild(meta);

    item.addEventListener('click', () => {
      setActiveMatch(index, true);
    });

    fragment.appendChild(item);
  });

  matchList.appendChild(fragment);
}

function setActiveMatch(index, focus) {
  if (index < 0 || index >= matches.length) {
    return;
  }

  activeMatchIndex = index;
  updateMatchCount();
  renderHighlight(textInput.value);
  renderMatchList();
  scrollMatchListToActive();

  if (focus) {
    const match = matches[index];
    textInput.focus();
    textInput.setSelectionRange(match.index, match.end);
    scrollTextToMatch(match);
  }
}

function updateAll() {
  const text = textInput.value;
  const regex = compileRegex();

  if (!regex) {
    matches = [];
    activeMatchIndex = -1;
    renderHighlight(text);
    updateOutput();
    updateMatchCount();
    updateNavButtons();
    renderMatchList();
    return;
  }

  matches = collectMatches(regex, text);
  if (matches.length === 0) {
    activeMatchIndex = -1;
  } else if (activeMatchIndex < 0 || activeMatchIndex >= matches.length) {
    activeMatchIndex = 0;
  }

  renderHighlight(text);
  updateOutput();
  updateMatchCount();
  updateNavButtons();
  renderMatchList();
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(temp);
      resolve();
    } catch (err) {
      document.body.removeChild(temp);
      reject(err);
    }
  });
}

function scrollTextToMatch(match) {
  const textBefore = textInput.value.slice(0, match.index);
  const lineIndex = textBefore.split('\n').length - 1;
  const computed = window.getComputedStyle(textInput);
  const lineHeight = parseFloat(computed.lineHeight) || 16;
  const targetTop = Math.max(0, lineIndex * lineHeight - textInput.clientHeight / 3);
  textInput.scrollTop = targetTop;
  syncScroll();
}

function scrollMatchListToActive() {
  const activeItem = matchList.querySelector(`.match-item[data-index="${activeMatchIndex}"]`);
  if (!activeItem) {
    return;
  }
  activeItem.scrollIntoView({ block: 'nearest' });
}

function flashCopied(button) {
  const isIconOnly = button.classList.contains('icon-only');
  const originalText = button.textContent;
  const originalTooltip = button.getAttribute('data-tooltip');
  button.classList.add('copied');

  if (isIconOnly) {
    setTimeout(() => {
      button.classList.remove('copied');
    }, 1500);
    return;
  }

  button.textContent = 'Copied';
  setTimeout(() => {
    button.classList.remove('copied');
    button.textContent = originalText;
  }, 1500);
}

function openModal(modal) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function pasteFromClipboard(target) {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return Promise.reject(new Error('Clipboard access not available'));
  }

  return navigator.clipboard.readText().then((text) => {
    target.value = text;
    updateAll();
    showToast('Pasted from clipboard');
  });
}

function showToast(message) {
  if (!toastStack) {
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastStack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

function loadSample() {
  regexInput.value = sampleData.pattern;
  outputTemplate.value = sampleData.template;
  textInput.value = sampleData.text;
  matchSearch.value = '';
  setFlagState(sampleData.flags);
  updateAll();
}

regexInput.addEventListener('input', updateAll);
textInput.addEventListener('input', updateAll);
textInput.addEventListener('scroll', syncScroll);
outputTemplate.addEventListener('input', updateOutput);
matchSearch.addEventListener('input', renderMatchList);
highlightToggle.addEventListener('change', () => renderHighlight(textInput.value));

flagButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const isActive = button.classList.toggle('active');
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    updateAll();
  });
});

prevMatchBtn.addEventListener('click', () => {
  if (!matches.length) {
    return;
  }
  const nextIndex = activeMatchIndex <= 0 ? matches.length - 1 : activeMatchIndex - 1;
  setActiveMatch(nextIndex, true);
});

nextMatchBtn.addEventListener('click', () => {
  if (!matches.length) {
    return;
  }
  const nextIndex = activeMatchIndex >= matches.length - 1 ? 0 : activeMatchIndex + 1;
  setActiveMatch(nextIndex, true);
});

pasteRegexBtn.addEventListener('click', () => {
  pasteFromClipboard(regexInput).catch(() => {
    regexInput.focus();
  });
});

pasteTextBtn.addEventListener('click', () => {
  pasteFromClipboard(textInput).catch(() => {
    textInput.focus();
  });
});

sampleBtn.addEventListener('click', () => {
  loadSample();
});

clearBtn.addEventListener('click', () => {
  regexInput.value = '';
  outputTemplate.value = '$0\\n';
  textInput.value = '';
  matchSearch.value = '';
  setFlagState('g');
  updateAll();
  showToast('Cleared');
});

copyOutputBtn.addEventListener('click', () => {
  copyText(outputList.textContent || '')
    .then(() => {
      showToast('Copied');
    })
    .catch(() => {});
});


openCheatSheetBtn.addEventListener('click', () => {
  openModal(cheatSheetModal);
});

closeCheatSheetBtn.addEventListener('click', () => {
  closeModal(cheatSheetModal);
});

cheatSheetModal.addEventListener('click', (event) => {
  if (event.target === cheatSheetModal) {
    closeModal(cheatSheetModal);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cheatSheetModal.classList.contains('active')) {
    closeModal(cheatSheetModal);
  }
});

setFlagState('g');
updateAll();
