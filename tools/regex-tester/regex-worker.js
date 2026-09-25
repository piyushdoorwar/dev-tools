self.addEventListener('message', (event) => {
  const { pattern, flags, text, maxMatches = 10000 } = event.data;
  // Tell the page evaluation has begun, so its time budget covers the match
  // itself and not however long this worker took to spin up.
  self.postMessage({ started: true });

  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match = regex.exec(text);
    let truncated = false;

    while (match) {
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push({
        text: match[0] || '',
        index: match.index || 0,
        end: (match.index || 0) + (match[0] || '').length,
        groups: match.groups || null,
        raw: Array.from(match),
      });

      if (!regex.global) break;
      if (match[0] === '') regex.lastIndex += 1;
      match = regex.exec(text);
    }

    // Only a global search can be cut short. A non-global pattern stops after
    // its first match with `match` still set, which used to be reported as
    // "Showing the first 10,000 matches".
    self.postMessage({ matches, truncated });
  } catch (error) {
    self.postMessage({ error: error?.message || 'Invalid regular expression' });
  }
});
