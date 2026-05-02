(() => {
  const modeTabs = Array.from(document.querySelectorAll('.mode-tab'));
  const modePanels = Array.from(document.querySelectorAll('.mode-panel'));

  const setActiveMode = (mode) => {
    modeTabs.forEach((tab) => {
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    modePanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `mode-${mode}`);
    });
  };

  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => setActiveMode(tab.dataset.mode));
  });

  const lengthSlider = document.getElementById('lengthSlider');
  const lengthValue = document.getElementById('lengthValue');
  const passwordOutput = document.getElementById('passwordOutput');
  const copyPasswordBtn = document.getElementById('copyPasswordBtn');
  const regenPasswordBtn = document.getElementById('regenPasswordBtn');
  const securityInfoBtn = document.getElementById('securityInfoBtn');
  const securityInfoModal = document.getElementById('securityInfoModal');
  const securityInfoCloseBtn = document.getElementById('securityInfoCloseBtn');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  const alphaRadios = Array.from(document.querySelectorAll('input[name="alphaCase"]'));
  const alphaMin = document.getElementById('alphaMin');
  const optNumbers = document.getElementById('optNumbers');
  const numMin = document.getElementById('numMin');
  const optSymbols = document.getElementById('optSymbols');
  const symMin = document.getElementById('symMin');
  const optAvoid = document.getElementById('optAvoid');

  const bulkToggle = document.getElementById('bulkToggle');
  const bulkControls = document.getElementById('bulkControls');
  const bulkCount = document.getElementById('bulkCount');
  const bulkDownloadBtn = document.getElementById('bulkDownloadBtn');

  const hashInput = document.getElementById('hashInput');
  const saltInput = document.getElementById('saltInput');
  const algoSelect = document.getElementById('algoSelect');
  const hashList = document.getElementById('hashList');

  const similarChars = new Set(['O', '0', 'l', '1']);
  const charSets = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+[]{}|;:,.<>?/~-=\\',
  };

  const encoder = new TextEncoder();

  const randomInt = (max) => {
    const array = new Uint32Array(1);
    const maxUint = 0xffffffff;
    const limit = maxUint - (maxUint % max);
    let value = 0;
    do {
      crypto.getRandomValues(array);
      value = array[0];
    } while (value >= limit);
    return value % max;
  };

  const randomChar = (chars) => chars[randomInt(chars.length)];

  const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const applySimilarFilter = (set) =>
    optAvoid.checked ? set.split('').filter((ch) => !similarChars.has(ch)).join('') : set;

  const getAlphaSelection = () => alphaRadios.find((radio) => radio.checked)?.value || 'mixed';

  const getMinValue = (input, fallback = 1) => Math.max(1, Number(input.value) || fallback);

  const buildRequirements = () => {
    const length = Number(lengthSlider.value);
    const minAlpha = getMinValue(alphaMin, 1);
    const minNumbers = optNumbers.checked ? getMinValue(numMin, 1) : 0;
    const minSymbols = optSymbols.checked ? getMinValue(symMin, 1) : 0;

    const selection = getAlphaSelection();
    const lowerSet = applySimilarFilter(charSets.lower);
    const upperSet = applySimilarFilter(charSets.upper);
    const numberSet = applySimilarFilter(charSets.numbers);
    const symbolSet = applySimilarFilter(charSets.symbols);

    const requirements = [];
    const poolChars = new Set();

    const addRequirement = (set, count) => {
      if (!set || count <= 0) return;
      requirements.push({ set, count });
      for (const ch of set) {
        poolChars.add(ch);
      }
    };

    if (selection === 'mixed') {
      addRequirement(lowerSet, 1);
      addRequirement(upperSet, 1);
      const extraLetters = Math.max(minAlpha - 2, 0);
      addRequirement(`${lowerSet}${upperSet}`, extraLetters);
    } else if (selection === 'lower') {
      addRequirement(lowerSet, minAlpha);
    } else {
      addRequirement(upperSet, minAlpha);
    }

    if (optNumbers.checked) {
      addRequirement(numberSet, minNumbers);
    }
    if (optSymbols.checked) {
      addRequirement(symbolSet, minSymbols);
    }

    const totalRequired = requirements.reduce((sum, req) => sum + req.count, 0);
    if (totalRequired > length) {
      return { length, requirements, pool: '', error: 'Increase length or lower minimums.' };
    }

    const pool = Array.from(poolChars).join('');
    if (!pool) {
      return { length, requirements, pool: '', error: 'Select at least one option.' };
    }

    return { length, requirements, pool, error: '' };
  };

  const generatePassword = () => {
    const { length, requirements, pool, error } = buildRequirements();
    if (error) {
      return { password: '', error };
    }

    const requiredChars = [];
    requirements.forEach(({ set, count }) => {
      for (let i = 0; i < count; i += 1) {
        requiredChars.push(randomChar(set));
      }
    });

    const remaining = Array.from({ length: Math.max(length - requiredChars.length, 0) }, () =>
      randomChar(pool)
    );

    const result = shuffle(requiredChars.concat(remaining)).slice(0, length);
    return { password: result.join(''), error: '' };
  };

  const scoreStrength = (length, variety) => {
    const lengthScore = Math.min(60, (length / 64) * 60);
    const varietyScore = (variety / 4) * 40;
    return Math.round(lengthScore + varietyScore);
  };

  const strengthLabel = (score) => {
    if (score >= 80) return 'Elite';
    if (score >= 65) return 'Strong';
    if (score >= 45) return 'Balanced';
    return 'Weak';
  };

  const updateStrength = (password) => {
    const length = password.length;
    const variety = 1 + (optNumbers.checked ? 1 : 0) + (optSymbols.checked ? 1 : 0);
    const score = length === 0 ? 0 : scoreStrength(length, variety);
    const label = strengthLabel(score);

    strengthFill.style.width = `${score}%`;
    strengthFill.dataset.level = label.toLowerCase();
    strengthText.textContent = label;
  };

  const updatePasswordPreview = () => {
    const { password, error } = generatePassword();
    passwordOutput.value = password;
    passwordOutput.placeholder = password ? '' : error || 'Select at least one option.';
    updateStrength(password);
  };

  const updateBulkButton = () => {
    const raw = Number(bulkCount.value) || 10;
    const count = Math.max(2, Math.min(1000, raw));
    bulkCount.value = count;
    bulkDownloadBtn.textContent = `Download ${count} passwords`;
  };

  const setBulkActive = (isActive) => {
    bulkControls.classList.toggle('active', isActive);
  };

  const openSecurityInfo = () => {
    if (!securityInfoModal) return;
    securityInfoModal.classList.add('active');
    securityInfoModal.setAttribute('aria-hidden', 'false');
    securityInfoCloseBtn?.focus();
  };

  const closeSecurityInfo = () => {
    if (!securityInfoModal) return;
    securityInfoModal.classList.remove('active');
    securityInfoModal.setAttribute('aria-hidden', 'true');
    securityInfoBtn?.focus();
  };

  const flashActionIcon = (button) => {
    if (!button) return;

    if (button._actionStateTimeout) {
      window.clearTimeout(button._actionStateTimeout);
    }

    button.classList.remove('is-activated');
    void button.offsetWidth;
    button.classList.add('is-activated');
    button._actionStateTimeout = window.setTimeout(() => {
      button.classList.remove('is-activated');
      button._actionStateTimeout = null;
    }, 500);
  };

  const copyText = async (text, button) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashActionIcon(button);
    } catch (err) {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      flashActionIcon(button);
    }
  };

  const generateBulkItems = () => {
    const count = Math.max(2, Math.min(1000, Number(bulkCount.value) || 10));
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const { password, error } = generatePassword();
      if (error) {
        return [];
      }
      items.push(password);
    }
    return items;
  };

  const updateMinState = () => {
    numMin.disabled = !optNumbers.checked;
    symMin.disabled = !optSymbols.checked;
  };

  lengthSlider.addEventListener('input', () => {
    lengthValue.textContent = lengthSlider.value;
    updatePasswordPreview();
  });

  alphaRadios.forEach((radio) => radio.addEventListener('change', updatePasswordPreview));
  [alphaMin, numMin, symMin].forEach((input) => input.addEventListener('input', updatePasswordPreview));

  [optNumbers, optSymbols].forEach((opt) =>
    opt.addEventListener('change', () => {
      updateMinState();
      updatePasswordPreview();
    })
  );
  optAvoid.addEventListener('change', updatePasswordPreview);
  regenPasswordBtn.addEventListener('click', () => {
    flashActionIcon(regenPasswordBtn);
    updatePasswordPreview();
  });

  copyPasswordBtn.addEventListener('click', () => copyText(passwordOutput.value, copyPasswordBtn));

  securityInfoBtn?.addEventListener('click', openSecurityInfo);
  securityInfoCloseBtn?.addEventListener('click', closeSecurityInfo);
  securityInfoModal?.addEventListener('click', (event) => {
    if (event.target === securityInfoModal) {
      closeSecurityInfo();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && securityInfoModal?.classList.contains('active')) {
      closeSecurityInfo();
    }
  });

  bulkToggle.addEventListener('change', (event) => setBulkActive(event.target.checked));
  bulkCount.addEventListener('input', updateBulkButton);
  bulkCount.addEventListener('blur', updateBulkButton);

  bulkDownloadBtn.addEventListener('click', () => {
    const list = generateBulkItems();
    if (!list.length) return;
    const blob = new Blob([list.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'passwords.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  const bufferToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const md5 = (message) => {
    const rotateLeft = (lValue, iShiftBits) => (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    const addUnsigned = (lX, lY) => {
      const lX4 = lX & 0x40000000;
      const lY4 = lY & 0x40000000;
      const lX8 = lX & 0x80000000;
      const lY8 = lY & 0x80000000;
      const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
      if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
      if (lX4 | lY4) {
        if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
        return lResult ^ 0x40000000 ^ lX8 ^ lY8;
      }
      return lResult ^ lX8 ^ lY8;
    };

    const F = (x, y, z) => (x & y) | (~x & z);
    const G = (x, y, z) => (x & z) | (y & ~z);
    const H = (x, y, z) => x ^ y ^ z;
    const I = (x, y, z) => y ^ (x | ~z);

    const FF = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, F(b, c, d)), addUnsigned(x, ac)), s), b);
    const GG = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, G(b, c, d)), addUnsigned(x, ac)), s), b);
    const HH = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, H(b, c, d)), addUnsigned(x, ac)), s), b);
    const II = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, I(b, c, d)), addUnsigned(x, ac)), s), b);

    const convertToWordArray = (str) => {
      const length = str.length;
      const totalWords = (((length + 8) >>> 6) + 1) * 16;
      const wordArray = new Array(totalWords).fill(0);
      for (let i = 0; i < length; i += 1) {
        wordArray[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
      }
      wordArray[length >> 2] |= 0x80 << ((length % 4) * 8);
      wordArray[totalWords - 2] = length * 8;
      return wordArray;
    };

    const utf8Encode = (string) => unescape(encodeURIComponent(string));
    let x = [];
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const S11 = 7;
    const S12 = 12;
    const S13 = 17;
    const S14 = 22;
    const S21 = 5;
    const S22 = 9;
    const S23 = 14;
    const S24 = 20;
    const S31 = 4;
    const S32 = 11;
    const S33 = 16;
    const S34 = 23;
    const S41 = 6;
    const S42 = 10;
    const S43 = 15;
    const S44 = 21;

    x = convertToWordArray(utf8Encode(message));

    for (let k = 0; k < x.length; k += 16) {
      const AA = a;
      const BB = b;
      const CC = c;
      const DD = d;
      a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
      d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
      c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
      b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
      a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
      d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
      c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
      b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
      a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
      d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
      c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
      b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
      a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
      d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
      c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
      b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
      a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
      d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
      c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
      b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
      a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
      d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
      c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
      b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
      a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
      d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
      c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
      b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
      a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
      d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
      c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
      b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
      a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
      d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
      c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
      b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
      a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
      d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
      c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
      b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
      a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
      d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
      c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
      b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
      a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
      d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
      c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
      b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
      a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
      d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
      c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
      b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
      a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
      d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
      c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
      b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
      a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
      d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
      c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
      b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
      a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
      d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
      c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
      b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
      a = addUnsigned(a, AA);
      b = addUnsigned(b, BB);
      c = addUnsigned(c, CC);
      d = addUnsigned(d, DD);
    }

    const wordToHex = (value) => {
      let hex = '';
      for (let i = 0; i <= 3; i += 1) {
        const byte = (value >>> (i * 8)) & 0xff;
        hex += byte.toString(16).padStart(2, '0');
      }
      return hex;
    };
    return `${wordToHex(a)}${wordToHex(b)}${wordToHex(c)}${wordToHex(d)}`;
  };

  const digestMessage = async (algo, message) => {
    if (algo === 'md5') return md5(message);
    const data = encoder.encode(message);
    const name = algo === 'sha1' ? 'SHA-1' : algo === 'sha256' ? 'SHA-256' : 'SHA-512';
    const hash = await crypto.subtle.digest(name, data);
    return bufferToHex(hash);
  };

  const renderHashList = (items) => {
    hashList.innerHTML = '';
    if (!items.length) {
      hashList.innerHTML = '<p class="helper-text">Enter text above and generate hashes.</p>';
      return;
    }
    items.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'hash-row';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'hash-label';
      labelSpan.textContent = label;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'hash-value';
      valueSpan.textContent = value;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'mini-copy';
      copyBtn.type = 'button';
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
      copyBtn.addEventListener('click', () => copyText(value, copyBtn));
      row.append(labelSpan, valueSpan, copyBtn);
      hashList.appendChild(row);
    });
  };

  let hashTimer = null;

  const runHashGeneration = async () => {
    const raw = hashInput.value.trim();
    if (!raw) {
      renderHashList([]);
      return;
    }
    const salted = `${raw}${saltInput.value}`;
    const selection = algoSelect.value;
    const algorithms = selection === 'all' ? ['md5', 'sha1', 'sha256', 'sha512'] : [selection];

    const results = [];
    for (const algo of algorithms) {
      // eslint-disable-next-line no-await-in-loop
      const value = await digestMessage(algo, salted);
      results.push({
        label: algo.toUpperCase(),
        value,
      });
    }

    renderHashList(results);
  };

  const scheduleHashGeneration = () => {
    if (hashTimer) {
      clearTimeout(hashTimer);
    }
    hashTimer = setTimeout(runHashGeneration, 180);
  };

  hashInput.addEventListener('input', scheduleHashGeneration);
  saltInput.addEventListener('input', scheduleHashGeneration);
  algoSelect.addEventListener('change', runHashGeneration);

  updateBulkButton();
  updateMinState();
  setBulkActive(false);
  updatePasswordPreview();
  renderHashList([]);
})();
