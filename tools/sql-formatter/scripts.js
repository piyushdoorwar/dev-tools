const editor = document.getElementById('editor');
const lineNumbers = document.getElementById('line-numbers');
const resizer = document.getElementById('resizer');
const outputEl = document.getElementById('output-editor');
const outputLineNumbers = document.getElementById('output-line-numbers');

const controls = {
  stylePreset: document.getElementById('stylePreset'),
  keywordCase: document.getElementById('keywordCase'),
  dataTypeCase: document.getElementById('dataTypeCase'),
  functionCase: document.getElementById('functionCase'),
  identifiersCase: document.getElementById('identifiersCase'),
  variableCase: document.getElementById('variableCase'),
  quotedIdentifierCase: document.getElementById('quotedIdentifierCase'),
  commaLinebreak: document.getElementById('commaLinebreak'),
  listStyle: document.getElementById('listStyle'),
  andOrUnderWhere: document.getElementById('andOrUnderWhere'),
  removeLinebreakBeforeBeautify: document.getElementById('removeLinebreakBeforeBeautify'),
  minify: document.getElementById('minify'),
  removeComments: document.getElementById('removeComments'),
};

const sampleSql = `SELECT DISTINCT c.customer_name,
       c.city,
       o.total_amount,
       SUM(li.quantity) AS total_qty,
       COUNT(*) AS order_count,
       COALESCE(c.segment, 'Retail') AS segment_name
FROM SalesDB.dbo.customers AS c
JOIN SalesDB.dbo.orders AS o ON c.customer_id = o.customer_id
JOIN SalesDB.dbo.line_items AS li ON o.order_id = li.order_id
WHERE c.status = 'Active'
  AND c.city IS NOT NULL
  AND o.created_at >= '2024-01-01'
  AND o.currency = 'usd'
  AND o.total_amount > 500
  AND c.region IN ('North', 'south', 'EAST')
  AND o.sales_rep = @SalesRep
  AND c.account_code = @AccountCode
  AND o.[OrderType] = 'Online'
  AND li.[ProductName] <> 'Sample'
  AND c.[PreferredCustomer] = 1
GROUP BY c.customer_name, c.city, o.total_amount, c.segment
HAVING SUM(li.quantity) > 10
ORDER BY c.customer_name ASC, c.city DESC;

CREATE TABLE SalesDB.dbo.audit_log (
  audit_id INT,
  event_time DATETIME,
  event_type VARCHAR(50),
  user_name VARCHAR(100)
);
`;

editor.value = '';

const debounce = (fn, waitMs) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
};

const detectDialect = (sql) => {
  const text = sql || '';
  if (/@[A-Za-z_][A-Za-z0-9_]*/.test(text) || /\[[^\]]+\]/.test(text)) return 'tsql';
  if (/:[A-Za-z_][A-Za-z0-9_]*/.test(text)) return 'plsql';
  if (/`[^`]+`/.test(text)) return 'mysql';
  if (/\bILIKE\b|\bRETURNING\b|\bSERIAL\b/i.test(text)) return 'postgresql';
  return 'sql';
};

const DIALECT_BADGES = {
  sql: {
    label: 'Standard SQL',
    svg: [
      '<ellipse cx="12" cy="5" rx="9" ry="3"/>',
      '<path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
      '<path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    ].join(''),
  },
  mysql: {
    label: 'MySQL',
    svg: [
      '<path d="M12.7 11.5c-.2-.4-.5-.7-.9-.9-.4-.2-.8-.3-1.3-.3-.6 0-1.1.1-1.5.4-.4.3-.7.6-.9 1.1-.2.5-.3 1-.3 1.6 0 .6.1 1.1.3 1.6.2.5.5.8.9 1.1.4.3.9.4 1.5.4.5 0 .9-.1 1.3-.3.4-.2.7-.5.9-.9l1.4.8c-.3.6-.8 1.1-1.4 1.4-.6.3-1.3.5-2.1.5-.9 0-1.7-.2-2.4-.6-.7-.4-1.2-.9-1.6-1.6-.4-.7-.6-1.5-.6-2.4 0-.9.2-1.7.6-2.4.4-.7.9-1.2 1.6-1.6.7-.4 1.5-.6 2.4-.6.8 0 1.5.2 2.1.5.6.3 1.1.8 1.4 1.4l-1.4.8z"/>',
      '<path d="M16 8v8h-1.5v-3.2h-2.6v3.2H10.4V8h1.5v3.2h2.6V8H16z" transform="translate(3, 0)"/>',
    ].join(''),
  },
  tsql: {
    label: 'Microsoft SQL Server',
    svg: '<path d="M2 4h9v9H2V4zm11 0h9v9h-9V4zM2 15h9v9H2v-9zm11 0h9v9h-9v-9z" opacity="0.9"/>',
  },
  plsql: {
    label: 'Oracle PL/SQL',
    svg: [
      '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>',
      '<path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>',
    ].join(''),
  },
  postgresql: {
    label: 'PostgreSQL',
    svg: '<path d="M17.1 4.3c-1.1-.6-2.4-.8-3.8-.6-.5-.3-1.2-.5-2-.6-1.3-.1-2.5.2-3.4.8C6.8 4.1 5.9 4.8 5.3 5.7c-.6 1-1 2.2-1.1 3.6-.1 1 0 2 .3 2.9-.4.8-.6 1.7-.5 2.6.1 1.4.7 2.5 1.6 3.3.5.5 1.1.8 1.8 1l.3 1.2c.2.8.5 1.4.9 1.9.5.5 1.1.8 1.8.8.3 0 .7-.1 1-.2.4.3.9.5 1.4.5.7 0 1.3-.3 1.7-.8.2.1.4.1.6.1 1.1 0 2-.6 2.5-1.5.4-.7.5-1.5.5-2.4l.1-2.2c.7-.3 1.3-.8 1.7-1.4.6-.9.9-2 .8-3.2-.1-1.4-.6-2.6-1.4-3.5-.5-.6-1.1-1-1.7-1.3-.2-.3-.4-.5-.5-.8zm-5.3 15c-.3 0-.6-.2-.8-.5l-.5-2.2c.4 0 .7-.1 1-.2l.5 2.1c.1.3 0 .5-.2.6-.1.1-.2.2-.3.2h.3zm2.9-1.2c-.1.4-.4.7-.8.7-.1 0-.2 0-.3-.1l-.1-.4-.5-2.1c.3-.2.6-.4.8-.6l.6 1.9c.1.2.2.4.3.6zm2-5.9c-.1.6-.4 1.2-.8 1.6-.4.4-.9.6-1.5.7l-.8-2.9c-.1-.4-.4-.7-.8-.8-.4-.1-.8 0-1.1.3-.3.3-.4.6-.4 1l-.1 3.1c-.5.2-1 .2-1.5.1-.7-.2-1.2-.6-1.5-1.2-.3-.6-.4-1.3-.3-2 .1-.6.4-1.1.8-1.5-.3-.8-.4-1.7-.3-2.6.1-1.1.4-2 .9-2.8.5-.8 1.2-1.3 2-1.6.8-.3 1.8-.3 2.7 0 .4-.4.9-.6 1.5-.7 1-.2 2-.1 2.8.4.5.3.9.7 1.2 1.2.5.7.8 1.6.8 2.7.1 1-.1 1.9-.6 2.6z"/>',
  },
  sqlite: {
    label: 'SQLite',
    svg: [
      '<path d="M12 2L4 6v6c0 5.5 3.4 10.7 8 12 4.6-1.3 8-6.5 8-12V6l-8-4zm0 2.2L18 7v5c0 4.5-2.8 8.7-6 9.9-3.2-1.2-6-5.4-6-9.9V7l6-2.8z"/>',
      '<path d="M12 6.5L7 9v4c0 3 1.9 5.8 4 6.6V6.5zm1 0v13.1c2.1-.8 4-3.6 4-6.6V9l-4-2.5z" opacity="0.6"/>',
    ].join(''),
  },
  snowflake: {
    label: 'Snowflake',
    svg: [
      '<path d="M12 2v4m0 12v4M2 12h4m12 0h4M5.6 5.6l2.8 2.8m7.2 7.2l2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2l-2.8 2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
      '<circle cx="12" cy="12" r="3"/>',
    ].join(''),
  },
};

const updateSqlTypeLabel = (dialect) => {
  const title = document.getElementById('sql-input-title');
  const hint = document.getElementById('sql-type-hint');
  const label = (dialect || 'sql').toUpperCase();
  const badge = DIALECT_BADGES[dialect] || DIALECT_BADGES.sql;
  const dialectBtn = document.getElementById('dialect-btn');
  const dialectIcon = document.getElementById('dialect-icon');
  if (title) title.textContent = 'SQL Input';
  if (hint) hint.textContent = label;
  if (dialectBtn) dialectBtn.title = `${badge.label} (auto-selected)`;
  if (dialectIcon) dialectIcon.innerHTML = badge.svg;
};

const updateLineNumbers = () => {
  const lines = editor.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
};

const updateOutputLineNumbers = (sql) => {
  if (!outputLineNumbers) return;
  const lines = (sql || '').split('\n').length;
  outputLineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
};

const isUnchanged = (value) => !value || value === 'unchanged';

const applyCase = (text, mode) => {
  if (!text) return text;
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'initcap':
      return text
        .toLowerCase()
        .replace(/(^|[^a-zA-Z0-9])([a-zA-Z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    case 'unchanged':
    default:
      return text;
  }
};

const forEachNonQuotedSegment = (sql, fn) => {
  let out = '';
  let i = 0;
  let mode = 'none';
  let segmentStart = 0;

  const flush = (end) => {
    if (end > segmentStart) {
      out += fn(sql.slice(segmentStart, end));
    }
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (mode === 'none') {
      if (ch === "'") {
        flush(i);
        mode = 'single';
        segmentStart = i;
        i++;
        continue;
      }
      if (ch === '"') {
        flush(i);
        mode = 'double';
        segmentStart = i;
        i++;
        continue;
      }
      if (ch === '`') {
        flush(i);
        mode = 'backtick';
        segmentStart = i;
        i++;
        continue;
      }
      if (ch === '[') {
        flush(i);
        mode = 'bracket';
        segmentStart = i;
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (mode === 'single') {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        out += sql.slice(segmentStart, i + 1);
        mode = 'none';
        segmentStart = i + 1;
      }
      i++;
      continue;
    }

    if (mode === 'double') {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        out += sql.slice(segmentStart, i + 1);
        mode = 'none';
        segmentStart = i + 1;
      }
      i++;
      continue;
    }

    if (mode === 'backtick') {
      if (ch === '`') {
        out += sql.slice(segmentStart, i + 1);
        mode = 'none';
        segmentStart = i + 1;
      }
      i++;
      continue;
    }

    if (mode === 'bracket') {
      if (ch === ']') {
        out += sql.slice(segmentStart, i + 1);
        mode = 'none';
        segmentStart = i + 1;
      }
      i++;
      continue;
    }
  }

  if (mode === 'none') {
    flush(sql.length);
  } else {
    out += sql.slice(segmentStart);
  }
  return out;
};

const removeSqlComments = (sql) => {
  // Best-effort: avoids touching quoted strings/identifiers
  return forEachNonQuotedSegment(sql, (seg) => {
    return seg
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--.*$/gm, '');
  });
};

const minifySql = (sql) => {
  // Best-effort minify outside quoted segments.
  const squashed = forEachNonQuotedSegment(sql, (seg) => {
    return seg
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*([(),;=<>+\-*/])\s*/g, '$1')
      .replace(/\s+/g, ' ');
  });
  return squashed.trim();
};

const applyCommaLinebreakStyle = (sql, commaMode) => {
  if (commaMode === 'after') return sql;

  if (commaMode === 'before') {
    return sql.replace(/,\n(\s*)(\S)/g, (m, ws, ch) => `\n${ws},${ch}`);
  }

  if (commaMode === 'beforeSpace') {
    return sql.replace(/,\n(\s*)(\S)/g, (m, ws, ch) => `\n${ws}, ${ch}`);
  }

  return sql;
};

const collapseSelectListIfNeeded = (sql, listStyle) => {
  if (listStyle !== 'notStacked') return sql;

  // Best-effort: collapse only the top-level SELECT list (first SELECT...FROM block)
  const match = sql.match(/\bSELECT\b[\s\S]*?\bFROM\b/);
  if (!match) return sql;

  const block = match[0];
  const collapsed = block
    .replace(/\n\s{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\bSELECT\b\s*/i, 'SELECT ')
    .replace(/\s*\bFROM\b/i, '\nFROM');

  return sql.replace(block, collapsed);
};

const applyFunctionInitCap = (sql, mode) => {
  if (mode !== 'initcap') return sql;

  // Best-effort: Title-case function names before '(' (outside quotes)
  return forEachNonQuotedSegment(sql, (seg) => {
    return seg.replace(/\b([A-Za-z_][A-Za-z0-9_$]*)\s*\(/g, (m, fn) => {
      const formatted = applyCase(fn, 'initcap');
      return m.replace(fn, formatted);
    });
  });
};

const applyVariableCase = (sql, mode) => {
  if (isUnchanged(mode)) return sql;
  return forEachNonQuotedSegment(sql, (seg) => {
    return seg.replace(/([@:][$A-Za-z_][A-Za-z0-9_$]*)/g, (m) => {
      const prefix = m[0];
      const rest = m.slice(1);
      return prefix + applyCase(rest, mode);
    });
  });
};

const applyQuotedIdentifierCase = (sql, mode) => {
  if (isUnchanged(mode)) return sql;

  let out = '';
  let i = 0;
  let state = 'none';
  let buf = '';

  const flush = () => {
    if (buf) {
      out += applyCase(buf, mode);
      buf = '';
    }
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (state === 'none') {
      if (ch === "'") {
        out += ch;
        state = 'single';
        i++;
        continue;
      }
      if (ch === '"') {
        out += ch;
        state = 'double';
        i++;
        continue;
      }
      if (ch === '`') {
        out += ch;
        state = 'backtick';
        i++;
        continue;
      }
      if (ch === '[') {
        out += ch;
        state = 'bracket';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    if (state === 'single') {
      if (ch === "'" && next === "'") {
        out += "''";
        i += 2;
        continue;
      }
      if (ch === "'") {
        out += ch;
        state = 'none';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    if (state === 'double') {
      if (ch === '"' && next === '"') {
        flush();
        out += '""';
        i += 2;
        continue;
      }
      if (ch === '"') {
        flush();
        out += ch;
        state = 'none';
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (state === 'backtick') {
      if (ch === '`' && next === '`') {
        flush();
        out += '``';
        i += 2;
        continue;
      }
      if (ch === '`') {
        flush();
        out += ch;
        state = 'none';
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (state === 'bracket') {
      if (ch === ']' && next === ']') {
        flush();
        out += ']]';
        i += 2;
        continue;
      }
      if (ch === ']') {
        flush();
        out += ch;
        state = 'none';
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
  }

  if (state !== 'none') {
    flush();
  }

  return out;
};

const getFormatterOptions = (cfg) => {
  const opts = {
    language: cfg.dialect,
  };

  if (!isUnchanged(cfg.keywordCase)) opts.keywordCase = cfg.keywordCase;
  if (!isUnchanged(cfg.dataTypeCase)) opts.dataTypeCase = cfg.dataTypeCase;
  if (!isUnchanged(cfg.identifiersCase)) opts.identifierCase = cfg.identifiersCase;

  // sql-formatter supports upper/lower for functionCase.
  // InitCap is handled as a post-step.
  if (cfg.functionCase === 'upper' || cfg.functionCase === 'lower') {
    opts.functionCase = cfg.functionCase;
  }

  // Note: quoted identifier casing is handled separately; identifierCase applies to
  // unquoted identifiers only.

  // Preset styles
  if (cfg.stylePreset === 'indented') {
    opts.tabWidth = 4;
  } else {
    opts.tabWidth = 2;
  }

  if (cfg.stylePreset === 'collapsed') {
    opts.expressionWidth = 200;
  }

  // Alignment presets
  if (cfg.stylePreset === 'rightAligned') {
    opts.indentStyle = 'tabularRight';
  }

  // AND/OR newline placement
  opts.logicalOperatorNewline = cfg.andOrUnderWhere ? 'before' : 'after';

  return opts;
};

const setOutput = (sql) => {
  outputEl.value = sql;
  updateOutputLineNumbers(sql);
};

const formatAndRender = () => {
  const cfg = {
    dialect: detectDialect(editor.value),
    stylePreset: controls.stylePreset.value,
    keywordCase: controls.keywordCase.value,
    dataTypeCase: controls.dataTypeCase.value,
    functionCase: controls.functionCase.value,
    identifiersCase: controls.identifiersCase.value,
    variableCase: controls.variableCase.value,
    quotedIdentifierCase: controls.quotedIdentifierCase.value,
    commaLinebreak: controls.commaLinebreak.value,
    listStyle: controls.listStyle.value,
    andOrUnderWhere: controls.andOrUnderWhere.checked,
    removeLinebreakBeforeBeautify: controls.removeLinebreakBeforeBeautify.checked,
    minify: controls.minify.checked,
    removeComments: controls.removeComments.checked,
  };

  let sql = editor.value;
  updateSqlTypeLabel(cfg.dialect);

  if (cfg.removeLinebreakBeforeBeautify) {
    sql = sql.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ');
  }

  if (cfg.removeComments) {
    sql = removeSqlComments(sql);
  }

  try {
    let out;

    if (cfg.minify) {
      out = minifySql(sql);
    } else {
      const options = getFormatterOptions(cfg);
      if (!window.sqlFormatter || typeof window.sqlFormatter.format !== 'function') {
        throw new Error('sql-formatter library did not load');
      }
      out = window.sqlFormatter.format(sql, options);
      out = collapseSelectListIfNeeded(out, cfg.listStyle);
      if (cfg.stylePreset === 'commasBefore') {
        out = applyCommaLinebreakStyle(out, 'beforeSpace');
      } else {
        out = applyCommaLinebreakStyle(out, cfg.commaLinebreak);
      }
    }

    // Post-processing casing (only for modes not supported by sql-formatter)
    out = applyFunctionInitCap(out, cfg.functionCase);
    out = applyVariableCase(out, cfg.variableCase);
    out = applyQuotedIdentifierCase(out, cfg.quotedIdentifierCase);

    setOutput(out);
  } catch (err) {
    setOutput(`-- Formatting error\n-- ${String(err && err.message ? err.message : err)}`);
  }
};

const scheduleRender = debounce(formatAndRender, 80);

editor.addEventListener('input', () => {
  updateLineNumbers();
  scheduleRender();
});

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

if (outputEl && outputLineNumbers) {
  outputEl.addEventListener('scroll', () => {
    outputLineNumbers.scrollTop = outputEl.scrollTop;
  });
}


Object.values(controls).forEach((el) => {
  el.addEventListener('change', scheduleRender);
  el.addEventListener('input', scheduleRender);
});

// Resizer functionality (kept from template)
let isResizing = false;
resizer.addEventListener('mousedown', () => {
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

  const offsetX = e.clientX - containerRect.left;
  const totalWidth = containerRect.width;
  const resizerWidth = resizer.offsetWidth;
  const availableWidth = totalWidth - resizerWidth;
  const minLeft = availableWidth * 0.2;
  const maxLeft = availableWidth * 0.8;
  const leftPx = Math.min(Math.max(offsetX - resizerWidth / 2, minLeft), maxLeft);
  const rightPx = availableWidth - leftPx;

  leftPanel.style.flex = `0 0 ${leftPx}px`;
  rightPanel.style.flex = `0 0 ${rightPx}px`;
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

updateLineNumbers();
formatAndRender();

window.loadSampleSql = function() {
  editor.value = sampleSql;
  updateLineNumbers();
  formatAndRender();
  saveToEditorHistory();
  editor.focus();
};

// Modal Functions
window.openModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
};

window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
};

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

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
});

// Case button handlers
document.querySelectorAll('.case-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const button = e.currentTarget;
    const setting = button.dataset.setting;
    const value = button.dataset.value;
    
    // Remove active class from siblings
    const group = button.parentElement;
    group.querySelectorAll('.case-btn').forEach(b => b.classList.remove('active'));
    
    // Add active class to clicked button
    button.classList.add('active');
    
    // Update hidden select element
    const selectEl = document.getElementById(setting);
    if (selectEl) {
      selectEl.value = value;
      // Trigger change event to update formatting
      const event = new Event('change', { bubbles: true });
      selectEl.dispatchEvent(event);
    }
    scheduleRender();
  });
});

// Toolbar icon button handlers (Database, Styles)
document.querySelectorAll('.toolbar-icon-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const button = e.currentTarget;
    const setting = button.dataset.setting;
    const value = button.dataset.value;
    
    // Remove active class from siblings in same group
    const group = button.parentElement;
    group.querySelectorAll('.toolbar-icon-btn').forEach(b => b.classList.remove('active'));
    
    // Add active class to clicked button
    button.classList.add('active');
    
    // Update hidden select element
    const selectEl = document.getElementById(setting);
    if (selectEl) {
      selectEl.value = value;
      // Trigger change event to update formatting
      const event = new Event('change', { bubbles: true });
      selectEl.dispatchEvent(event);
    }
  });
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

if (imageUploadArea && imageFileInput) {
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
}

function handleImageFile(file) {
  selectedImageFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('imagePreview');
    if (preview) {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    }
  };
  reader.readAsDataURL(file);
  
  // Clear URL input
  const imageUrl = document.getElementById('imageUrl');
  if (imageUrl) {
    imageUrl.value = '';
  }
}

function insertImage() {
  const altTextEl = document.getElementById('imageAlt');
  const imageUrlEl = document.getElementById('imageUrl');
  
  if (!altTextEl || !imageUrlEl) return;
  
  const altText = altTextEl.value || 'image';
  let imageUrl = imageUrlEl.value;
  
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
  const linkTextEl = document.getElementById('linkText');
  const linkUrlEl = document.getElementById('linkUrl');
  
  if (!linkTextEl || !linkUrlEl) return;
  
  const linkText = linkTextEl.value;
  const linkUrl = linkUrlEl.value;
  
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
  const languageEl = document.getElementById('codeLanguage');
  const contentEl = document.getElementById('codeContent');
  
  if (!languageEl || !contentEl) return;
  
  const language = languageEl.value;
  const content = contentEl.value;
  
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
  if (!codeContent) return;
  codeContent.value = '';
  updateCodeLineNumbers();
  codeContent.focus();
}

// Code editor helper functions
function updateCodeLineNumbers() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  if (!codeContent || !lineNumbers) return;
  const lines = codeContent.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function syncCodeScroll() {
  const codeContent = document.getElementById('codeContent');
  const lineNumbers = document.getElementById('codeLineNumbers');
  if (!codeContent || !lineNumbers) return;
  lineNumbers.scrollTop = codeContent.scrollTop;
}

function pasteCodeBlock() {
  navigator.clipboard.readText().then(text => {
    const codeContent = document.getElementById('codeContent');
    if (!codeContent) return;
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

// Editor history for undo/redo
let editorHistory = [editor.value];
let historyIndex = 0;
let isUndoRedoing = false;

function saveToEditorHistory() {
  if (isUndoRedoing) return;
  
  // Remove any future history if we're not at the end
  editorHistory = editorHistory.slice(0, historyIndex + 1);
  
  // Add current state
  editorHistory.push(editor.value);
  
  // Limit history to 50 entries
  if (editorHistory.length > 50) {
    editorHistory.shift();
  } else {
    historyIndex++;
  }
}

// Save to history on input with debounce
let historySaveTimeout;
editor.addEventListener('input', () => {
  clearTimeout(historySaveTimeout);
  historySaveTimeout = setTimeout(() => {
    saveToEditorHistory();
  }, 500);
});

// File operations
window.undoEditor = function() {
  if (historyIndex > 0) {
    isUndoRedoing = true;
    historyIndex--;
    editor.value = editorHistory[historyIndex];
    updateLineNumbers();
    formatAndRender();
    isUndoRedoing = false;
  }
};

window.redoEditor = function() {
  if (historyIndex < editorHistory.length - 1) {
    isUndoRedoing = true;
    historyIndex++;
    editor.value = editorHistory[historyIndex];
    updateLineNumbers();
    formatAndRender();
    isUndoRedoing = false;
  }
};

window.copyEditor = async function() {
  formatAndRender();
  const textToCopy = outputEl.value || editor.value;
  
  try {
    await navigator.clipboard.writeText(textToCopy);
  } catch (err) {
    // Fallback
    editor.select();
    document.execCommand('copy');
  }
  
  editor.focus();
};

window.downloadFormattedSql = function() {
  formatAndRender();
  const text = outputEl.value || editor.value || '';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'formatted.sql';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

window.pasteEditor = async function() {
  try {
    const text = await navigator.clipboard.readText();
    
    editor.value = text;
    editor.selectionStart = editor.selectionEnd = text.length;
    
    updateLineNumbers();
    formatAndRender();
    saveToEditorHistory();
    editor.focus();
  } catch (err) {
    console.error('Paste failed:', err);
  }
};

// Keyboard shortcuts
editor.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoEditor();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redoEditor();
    }
  }
});
