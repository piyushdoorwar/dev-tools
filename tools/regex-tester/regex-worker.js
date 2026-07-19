self.addEventListener('message', (event) => {
  const { pattern, flags, text, maxMatches = 10000 } = event.data;

  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match = regex.exec(text);

    while (match && matches.length < maxMatches) {
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

    self.postMessage({ matches, truncated: Boolean(match) });
  } catch (error) {
    self.postMessage({ error: error?.message || 'Invalid regular expression' });
  }
});
