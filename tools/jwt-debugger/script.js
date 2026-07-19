const sampleToken =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MjAwMDAwMDAwMH0.pz_pRefsOI9vFk0DmIlabrh1c0YnVhEjW5iJY1ULYF0';

const jwtInput = document.getElementById('jwtInput');
const headerJson = document.getElementById('headerJson');
const payloadJson = document.getElementById('payloadJson');
const statusMessage = document.getElementById('statusMessage');
const publicKeyTextarea = document.getElementById('publicKeyTextarea');
const privateKeyTextarea = document.getElementById('privateKeyTextarea');
const secretEditable = document.getElementById('secretEditable');
let secret = '';
// const unixInput = document.getElementById('unixInput');
// const localTime = document.getElementById('localTime');
// const utcTime = document.getElementById('utcTime');
// const relativeTime = document.getElementById('relativeTime');
// const dayOfYear = document.getElementById('dayOfYear');
// const weekOfYear = document.getElementById('weekOfYear');
// const isLeap = document.getElementById('isLeap');
// const expiryText = document.getElementById('expiryText');
// const issuedText = document.getElementById('issuedText');
// const timeLeftText = document.getElementById('timeLeft');

const statusIcon = statusMessage.querySelector('.status-icon');
const statusLabel = document.querySelector('.status-label');
const copyBtn = document.getElementById('copyBtn');
const pasteBtn = document.getElementById('pasteBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const algoSelect = document.getElementById('algoSelect');
// const applyHeaderBtn = document.getElementById('applyHeaderBtn');
// const applyPayloadBtn = document.getElementById('applyPayloadBtn');
const datetimeModal = document.getElementById('datetimeModal');
const iatUnixInput = document.getElementById('iatUnixInput');
const expUnixInput = document.getElementById('expUnixInput');
const iatUtcInput = document.getElementById('iatUtcInput');
const expUtcInput = document.getElementById('expUtcInput');
const iatRelativeSpan = document.getElementById('iatRelativeSpan');
const expRelativeSpan = document.getElementById('expRelativeSpan');
const updateDatetimeBtn = document.getElementById('updateDatetimeBtn');
const closeModal = datetimeModal.querySelector('.close');
const verifyBtn = document.getElementById('verifyBtn');
const applyBtn = document.getElementById('applyBtn');
const secretTextarea = document.getElementById('secretTextarea');
const asymSection = document.getElementById('asymSection');
const secretDescription = document.getElementById('secretDescription');
const secretLabel = document.getElementById('secretLabel');
const secretSection = document.getElementById('secretSection');

function updateSecretSections() {
  const algo = algoSelect.value;
  const copyBtn = document.querySelector('[data-copy-target]');
  if (algo === 'HS256') {
    secretSection.style.display = 'block';
    asymSection.style.display = 'none';
    secretDescription.textContent = '';
    secretLabel.textContent = 'Secret';
    copyBtn.dataset.copyTarget = 'secretTextarea';
  } else {
    secretSection.style.display = 'none';
    asymSection.style.display = 'block';
    secretDescription.textContent = '';
    copyBtn.dataset.copyTarget = 'privateKeyTextarea';
  }
}

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeBytes(str) {
  try {
    const replaced = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = replaced.padEnd(replaced.length + ((4 - (replaced.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch (err) {
    return null;
  }
}

function base64UrlDecode(str) {
  const bytes = base64UrlDecodeBytes(str);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    return null;
  }
}

async function computeSignature(data, secret, alg) {
  if (alg === 'HS256') {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  } else if (alg === 'RS256' || alg === 'PS256') {
    try {
      const key = await importRsaPrivateKey(secret, alg);
      const signatureAlgorithm = alg === 'PS256'
        ? { name: 'RSA-PSS', saltLength: 32 }
        : 'RSASSA-PKCS1-v1_5';
      const signature = await crypto.subtle.sign(signatureAlgorithm, key, new TextEncoder().encode(data));
      return btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    } catch (e) {
      console.error('Failed to import RSA key:', e);
      return '';
    }
  } else if (alg === 'ES256') {
    try {
      const key = await importEcdsaPrivateKey(secret);
      const derSignature = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, new TextEncoder().encode(data));
      const signatureArray = new Uint8Array(derSignature);
      let jwtSignature;
      if (signatureArray.length === 64) {
        jwtSignature = signatureArray;
      } else {
        jwtSignature = derToJwtEcSignature(signatureArray);
      }
      return btoa(String.fromCharCode(...jwtSignature))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    } catch (e) {
      console.error('Failed to import EC key:', e);
      return '';
    }
  } else {
    return '';
  }
}

function importRsaPrivateKey(pem, alg = 'RS256') {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
  const binaryDer = atob(pemContents);
  const der = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    der[i] = binaryDer.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    {
      name: alg === 'PS256' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

async function importRsaPublicKey(pem, alg = 'RS256') {
  try {
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    const binaryDer = atob(pemContents);
    const der = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      der[i] = binaryDer.charCodeAt(i);
    }
    return await crypto.subtle.importKey(
      'spki',
      der,
      {
        name: alg === 'PS256' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );
  } catch (e) {
    throw new Error('Invalid public key PEM');
  }
}

async function importEcdsaPrivateKey(pem) {
  try {
    let pemHeader = "-----BEGIN EC PRIVATE KEY-----";
    let pemFooter = "-----END EC PRIVATE KEY-----";
    let pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    if (pemContents === pem.replace(/\s/g, '')) {
      // Not EC specific, try PKCS#8
      pemHeader = "-----BEGIN PRIVATE KEY-----";
      pemFooter = "-----END PRIVATE KEY-----";
      pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    }
    const binaryDer = atob(pemContents);
    const der = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      der[i] = binaryDer.charCodeAt(i);
    }
    return await crypto.subtle.importKey(
      'pkcs8',
      der,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['sign']
    );
  } catch (e) {
    throw new Error('Invalid EC private key PEM');
  }
}

async function importEcdsaPublicKey(pem) {
  try {
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    const binaryDer = atob(pemContents);
    const der = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      der[i] = binaryDer.charCodeAt(i);
    }
    return await crypto.subtle.importKey(
      'spki',
      der,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['verify']
    );
  } catch (e) {
    throw new Error('Invalid EC public key PEM');
  }
}

function jwtEcSignatureToDer(signature) {
  // signature is base64url decoded, 64 bytes: r (32) + s (32)
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  
  // Convert to big-endian integers, remove leading zeros
  function toAsn1Integer(bytes) {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    if (bytes[start] & 0x80) {
      // Negative, add leading zero
      return new Uint8Array([0, ...bytes.slice(start)]);
    }
    return bytes.slice(start);
  }
  
  const rAsn1 = toAsn1Integer(r);
  const sAsn1 = toAsn1Integer(s);
  
  // DER SEQUENCE { INTEGER r, INTEGER s }
  const rLen = rAsn1.length;
  const sLen = sAsn1.length;
  const totalLen = 2 + rLen + 2 + sLen; // 0x30 totalLen 0x02 rLen r 0x02 sLen s
  const der = new Uint8Array(2 + totalLen);
  der[0] = 0x30; // SEQUENCE
  der[1] = totalLen;
  der[2] = 0x02; // INTEGER
  der[3] = rLen;
  der.set(rAsn1, 4);
  const sStart = 4 + rLen;
  der[sStart] = 0x02; // INTEGER
  der[sStart + 1] = sLen;
  der.set(sAsn1, sStart + 2);
  
  return der;
}

function derToJwtEcSignature(der) {
  // Parse DER SEQUENCE { INTEGER r, INTEGER s }
  if (der[0] !== 0x30) throw new Error('Invalid DER');
  const seqLen = der[1];
  let pos = 2;
  if (der[pos] !== 0x02) throw new Error('Invalid r');
  const rLen = der[pos + 1];
  pos += 2;
  const r = der.slice(pos, pos + rLen);
  pos += rLen;
  if (der[pos] !== 0x02) throw new Error('Invalid s');
  const sLen = der[pos + 1];
  pos += 2;
  const s = der.slice(pos, pos + sLen);
  
  // Pad r and s to 32 bytes
  function padTo32(bytes) {
    if (bytes.length > 32) throw new Error('Too long');
    const padded = new Uint8Array(32);
    padded.set(bytes, 32 - bytes.length);
    return padded;
  }
  
  const rPadded = padTo32(r);
  const sPadded = padTo32(s);
  
  return new Uint8Array([...rPadded, ...sPadded]);
}

function parseJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const header = base64UrlDecode(parts[0]);
  const payload = base64UrlDecode(parts[1]);
  if (!header || !payload) return null;
  try {
    return {
      header: JSON.parse(header),
      payload: JSON.parse(payload),
      signature: parts[2] || '',
    };
  } catch (error) {
    return null;
  }
}

function updateStatus(tokenMeta) {
  if (!tokenMeta) {
    statusMessage.classList.add('invalid');
    statusIcon.textContent = '!';
    statusLabel.textContent = 'Paste a complete JWT to inspect';
    return;
  }

  if (!tokenMeta.signature) {
    statusMessage.classList.add('invalid');
    statusIcon.textContent = '!';
    statusLabel.textContent = 'Unsigned token — apply a key to sign';
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokenMeta.payload.exp && tokenMeta.payload.exp < now) {
    statusMessage.classList.add('invalid');
    statusIcon.textContent = '⨯';
    statusLabel.textContent = 'Token expired — signature stale';
  } else {
    statusMessage.classList.remove('invalid');
    statusIcon.textContent = '✔';
    statusLabel.textContent = 'Signature segments intact';
  }
}

async function updateJwt() {
  const currentToken = jwtInput.value.trim();
  const tokenMeta = parseJwt(currentToken);
  if (tokenMeta) {
    const headerEncoded = base64UrlEncode(JSON.stringify(tokenMeta.header));
    const payloadEncoded = base64UrlEncode(JSON.stringify(tokenMeta.payload));
    const data = `${headerEncoded}.${payloadEncoded}`;
    const newSignature = await computeSignature(data, secret, tokenMeta.header.alg);
    const newToken = `${data}.${newSignature}`;
    jwtInput.value = newToken;
    updateStatus(parseJwt(newToken));
  }
}

function prettyPrint(json) {
  return JSON.stringify(json, null, 2);
}

function updateDisplay(token) {
  const tokenMeta = parseJwt(token);
  if (!tokenMeta) {
    if (headerJson !== document.activeElement) headerJson.textContent = '{ }';
    if (payloadJson !== document.activeElement) payloadJson.textContent = '{ }';
    // expiryText.textContent = '—';
    // issuedText.textContent = '—';
    // timeLeftText.content = '—';
    // setUnixField(Math.floor(Date.now() / 1000));
    // updateTimePanel(parseInt(unixInput.value, 10));
    updateStatus(null);
    return;
  }

  if (headerJson !== document.activeElement) headerJson.textContent = prettyPrint(tokenMeta.header);
  if (payloadJson !== document.activeElement) payloadJson.textContent = prettyPrint(tokenMeta.payload);

  // Update algorithm dropdown
  algoSelect.value = tokenMeta.header.alg || 'HS256';
  updateSecretSections();
  // Update signature algorithm display
  const sigAlgo = document.getElementById('sigAlgo');
  const sigCode = document.getElementById('sigCode');
  const alg = tokenMeta.header.alg;
  let algoName = 'HMACSHA256';
  if (alg === 'HS256') algoName = 'HMACSHA256';
  else if (alg === 'RS256') algoName = 'RSASHA256';
  else if (alg === 'ES256') algoName = 'ECDSASHA256';
  else algoName = alg;
  sigAlgo.textContent = algoName;
  sigCode.textContent = `${algoName}(
  base64UrlEncode(header) + '.' + base64UrlEncode(payload),
  your-secret
)`;
  // if (tokenMeta.payload.exp) {
  //   expiryText.textContent = new Date(tokenMeta.payload.exp * 1000).toLocaleString();
  // } else {
  //   expiryText.textContent = '—';
  // }
  // if (tokenMeta.payload.iat) {
  //   issuedText.textContent = new Date(tokenMeta.payload.iat * 1000).toLocaleString();
  // } else {
  //   issuedText.textContent = '—';
  // }
  // if (tokenMeta.payload.exp) {
  //   timeLeftText.textContent = formatDuration(tokenMeta.payload.exp - Math.floor(Date.now() / 1000));
  //   setUnixField(tokenMeta.payload.exp);
  //   updateTimePanel(tokenMeta.payload.exp);
  // } else {
  //   timeLeftText.textContent = '—';
  //   setUnixField(Math.floor(Date.now() / 1000));
  //   updateTimePanel(parseInt(unixInput.value, 10));
  // }

  updateStatus(tokenMeta);
}

// function setUnixField(value) {
//   unixInput.value = value || '';
// }

function formatDuration(seconds) {
  if (seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.max(seconds, 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

// function updateTimePanel(value) {
//   const unix = Number(value) || Math.floor(Date.now() / 1000);
//   const date = new Date(unix * 1000);
//   localTime.textContent = date.toLocaleString();
//   utcTime.textContent = date.toISOString();
//   relativeTime.textContent = describeRelative(unix - Date.now() / 1000);
//   dayOfYear.textContent = getDayOfYear(date);
//   weekOfYear.textContent = getWeekNumber(date);
//   isLeap.textContent = isLeapYear(date.getUTCFullYear()) ? 'true' : 'false';
// }

function describeRelative(diff) {
  const prefix = diff >= 0 ? 'from now' : 'ago';
  const [abs, unit] = formatRelativePoint(Math.abs(diff));
  return `${abs} ${prefix}`;
}

function formatRelativePoint(diff) {
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days) return [`${days}d`, ''];
  if (hours) return [`${hours}h`, ''];
  if (minutes) return [`${minutes}m`, ''];
  return [`${Math.max(Math.floor(diff % 60), 1)}s`, ''];
}

// function getDayOfYear(date) {
//   const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
//   const diff = date - start;
//   return Math.floor(diff / 86400000);
// }

// function getWeekNumber(date) {
//   const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
//   const dayNum = target.getUTCDay() || 7;
//   target.setUTCDate(target.getUTCDate() + 4 - dayNum);
//   const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
//   const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
//   return week;
// }

// function isLeapYear(year) {
//   return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
// }

function copyToClipboard(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value)?.catch(() => {
    const area = document.createElement('textarea');
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
  });
}

function showToast(message) {
  return;
}

function flashActionIcon(button) {
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
}

document.addEventListener('DOMContentLoaded', () => {
  updateSecretSections();
  updateDisplay(sampleToken);
  jwtInput.value = sampleToken;
document.querySelectorAll('[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.copyTarget;
    const element = document.getElementById(target);
    const content = element && 'value' in element ? element.value : element?.textContent ?? '';
    copyToClipboard(content);
    if (content) {
      flashActionIcon(btn);
    }
  });
});

// timeCopyBtn.addEventListener('click', () => {
//   copyToClipboard(unixInput.value);
// });

// clipboardBtn.addEventListener('click', async () => {
//   try {
//     const text = await navigator.clipboard.readText();
//     jwtInput.value = text;
//     updateDisplay(text.trim());
//   } catch (err) {
//     console.warn('clipboard not accessible');
//   }
// });

sampleBtn.addEventListener('click', () => {
  jwtInput.value = sampleToken;
  updateDisplay(sampleToken);
  flashActionIcon(sampleBtn);
  showToast('Sample JWT loaded');
});

clearBtn.addEventListener('click', () => {
  jwtInput.value = '';
  updateDisplay('');
  flashActionIcon(clearBtn);
  showToast('JWT cleared');
});

jwtInput.addEventListener('input', () => {
  updateDisplay(jwtInput.value.trim());
});

// Real-time update for header
headerJson.addEventListener('input', () => {
  const newHeaderText = headerJson.textContent;
  try {
    const newHeader = JSON.parse(newHeaderText);
    const currentToken = jwtInput.value.trim();
    const parts = currentToken.split('.');
    if (parts.length === 3) {
      const newHeaderEncoded = base64UrlEncode(JSON.stringify(newHeader));
      const newToken = `${newHeaderEncoded}.${parts[1]}.${parts[2]}`;
      jwtInput.value = newToken;
      // Update algorithm
      algoSelect.value = newHeader.alg || 'HS256';
      updateStatus(parseJwt(newToken));
    }
  } catch (e) {
    // Invalid JSON, do nothing
  }
});

// Real-time update for payload
payloadJson.addEventListener('input', () => {
  const newPayloadText = payloadJson.textContent;
  try {
    const newPayload = JSON.parse(newPayloadText);
    const currentToken = jwtInput.value.trim();
    const parts = currentToken.split('.');
    if (parts.length === 3) {
      const newPayloadEncoded = base64UrlEncode(JSON.stringify(newPayload));
      const newToken = `${parts[0]}.${newPayloadEncoded}.${parts[2]}`;
      jwtInput.value = newToken;
      updateStatus(parseJwt(newToken));
    }
  } catch (e) {
    // Invalid JSON, do nothing
  }
});

// Beautify header on blur
headerJson.addEventListener('blur', () => {
  const text = headerJson.textContent;
  try {
    const parsed = JSON.parse(text);
    headerJson.textContent = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Leave as is if invalid
  }
});

// Beautify payload on blur
payloadJson.addEventListener('blur', () => {
  const text = payloadJson.textContent;
  try {
    const parsed = JSON.parse(text);
    payloadJson.textContent = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Leave as is if invalid
  }
});

// Beautify secret on blur for editable
secretEditable.addEventListener('blur', () => {
  // No beautify needed
});

// Verify button
if (verifyBtn) {
  verifyBtn.addEventListener('click', async () => {
    const currentToken = jwtInput.value.trim();
    const tokenMeta = parseJwt(currentToken);
    if (!tokenMeta || !tokenMeta.signature) return;
    const algo = tokenMeta.header.alg;
    if (algo === 'HS256') {
      if (!secretTextarea.value.trim()) {
        showToast('Secret is required for verification');
        return;
      }
    } else {
      if (!publicKeyTextarea.value.trim()) {
        showToast('Public key is required for verification');
        return;
      }
    }
    const data = base64UrlEncode(JSON.stringify(tokenMeta.header)) + '.' + base64UrlEncode(JSON.stringify(tokenMeta.payload));
    try {
      let isValid = false;
      if (algo === 'HS256') {
        const secretValue = secretTextarea.value;
        const expected = await computeSignature(data, secretValue, 'HS256');
        isValid = expected === tokenMeta.signature;
      } else if (algo === 'RS256' || algo === 'PS256') {
        const publicKey = publicKeyTextarea.value;
        const pubKey = await importRsaPublicKey(publicKey, algo);
        const signatureBytes = base64UrlDecodeBytes(tokenMeta.signature);
        if (signatureBytes) {
          const signatureAlgorithm = algo === 'PS256'
            ? { name: 'RSA-PSS', saltLength: 32 }
            : 'RSASSA-PKCS1-v1_5';
          isValid = await crypto.subtle.verify(signatureAlgorithm, pubKey, signatureBytes, new TextEncoder().encode(data));
        }
      } else if (algo === 'ES256') {
        const publicKey = publicKeyTextarea.value;
        const pubKey = await importEcdsaPublicKey(publicKey);
        const signatureBytes = base64UrlDecodeBytes(tokenMeta.signature);
        if (signatureBytes && signatureBytes.length === 64) {
          isValid = await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pubKey, signatureBytes, new TextEncoder().encode(data));
        }
      }
      if (isValid) {
        statusMessage.classList.remove('invalid');
        statusIcon.textContent = '✔';
        statusLabel.textContent = 'Signature verified';
      } else {
        statusMessage.classList.add('invalid');
        statusIcon.textContent = '⨯';
        statusLabel.textContent = 'Signature invalid';
      }
      flashActionIcon(verifyBtn);
    } catch (e) {
      let message = 'Invalid key';
      if (algo === 'RS256') message = 'Invalid RSA public key';
      else if (algo === 'ES256') message = 'Invalid EC public key';
      else if (algo === 'PS256') message = 'Invalid RSA-PSS public key';
      showToast(message);
    }
  });
}

// Apply button
if (applyBtn) {
  applyBtn.addEventListener('click', async () => {
    const algo = algoSelect.value;
    let keyValue = '';
    if (algo === 'HS256') {
      keyValue = secretTextarea.value;
      if (!keyValue.trim()) {
        showToast('Secret is required for signing');
        return;
      }
    } else {
      keyValue = privateKeyTextarea.value;
      if (!keyValue.trim()) {
        showToast('Private key is required for signing');
        return;
      }
    }
    secret = keyValue;
    secretEditable.textContent = secret || 'your-secret';
    try {
      await updateJwt();
      flashActionIcon(applyBtn);
    } catch (e) {
      let message = 'Invalid key';
      if (algo === 'RS256') message = 'Invalid RSA private key';
      else if (algo === 'ES256') message = 'Invalid EC private key';
      else if (algo === 'PS256') message = 'Invalid RSA-PSS private key';
      showToast(message);
    }
  });
}

// Eye button listeners
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tokenMeta = parseJwt(jwtInput.value.trim());
    if (tokenMeta && tokenMeta.payload) {
      const iat = tokenMeta.payload.iat || Math.floor(Date.now() / 1000);
      const exp = tokenMeta.payload.exp || Math.floor(Date.now() / 1000) + 3600;
      iatUnixInput.value = iat;
      expUnixInput.value = exp;
      updateModalFields();
      datetimeModal.style.display = 'flex';
      flashActionIcon(btn);
    }
  });
});

// Close modal
closeModal.addEventListener('click', () => {
  datetimeModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === datetimeModal) {
    datetimeModal.style.display = 'none';
  }
});

// Update modal fields
function updateModalFields() {
  const iat = parseInt(iatUnixInput.value, 10);
  const exp = parseInt(expUnixInput.value, 10);
  if (!isNaN(iat)) {
    const date = new Date(iat * 1000);
    iatUtcInput.value = date.toISOString();
    iatRelativeSpan.textContent = describeRelative(iat - Date.now() / 1000);
  }
  if (!isNaN(exp)) {
    const date = new Date(exp * 1000);
    expUtcInput.value = date.toISOString();
    expRelativeSpan.textContent = describeRelative(exp - Date.now() / 1000);
  }
}

// Unix input changes
iatUnixInput.addEventListener('input', updateModalFields);
expUnixInput.addEventListener('input', updateModalFields);
iatUtcInput.addEventListener('input', () => {
  const date = new Date(iatUtcInput.value);
  if (!Number.isNaN(date.getTime())) {
    iatUnixInput.value = Math.floor(date.getTime() / 1000);
    updateModalFields();
  }
});
expUtcInput.addEventListener('input', () => {
  const date = new Date(expUtcInput.value);
  if (!Number.isNaN(date.getTime())) {
    expUnixInput.value = Math.floor(date.getTime() / 1000);
    updateModalFields();
  }
});

// Update button
updateDatetimeBtn.addEventListener('click', async () => {
  const iat = parseInt(iatUnixInput.value, 10);
  const exp = parseInt(expUnixInput.value, 10);
  const tokenMeta = parseJwt(jwtInput.value.trim());
  if (tokenMeta) {
    const newPayload = { ...tokenMeta.payload };
    if (!isNaN(iat)) newPayload.iat = iat;
    if (!isNaN(exp)) newPayload.exp = exp;
    payloadJson.textContent = JSON.stringify(newPayload, null, 2);
    payloadJson.dispatchEvent(new Event('input'));
    if (secret) await updateJwt();
    datetimeModal.style.display = 'none';
  }
});

// Update algorithm dropdown when changed
algoSelect.addEventListener('change', async () => {
  updateSecretSections();
  const currentToken = jwtInput.value.trim();
  const tokenMeta = parseJwt(currentToken);
  if (tokenMeta) {
    const newHeader = { ...tokenMeta.header, alg: algoSelect.value };
    headerJson.textContent = JSON.stringify(newHeader, null, 2);
    const newHeaderEncoded = base64UrlEncode(JSON.stringify(newHeader));
    const payloadEncoded = base64UrlEncode(JSON.stringify(tokenMeta.payload));
    const data = `${newHeaderEncoded}.${payloadEncoded}`;
    const keyValue = algoSelect.value === 'HS256' ? secretTextarea.value : privateKeyTextarea.value;
    const newSignature = keyValue
      ? await computeSignature(data, keyValue, algoSelect.value)
      : '';
    const newToken = `${data}.${newSignature}`;
    jwtInput.value = newToken;
    updateStatus(parseJwt(newToken));
  }
});

// Copy button functionality
copyBtn.addEventListener('click', () => {
  if (jwtInput.value.trim()) {
    copyToClipboard(jwtInput.value.trim());
    flashActionIcon(copyBtn);
    showToast('JWT copied to clipboard');
  } else {
    showToast('Nothing to copy');
  }
});

// Paste button functionality
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    jwtInput.value = text;
    updateDisplay(text.trim());
    flashActionIcon(pasteBtn);
    showToast('JWT pasted from clipboard');
  } catch (err) {
    showToast('Failed to paste from clipboard');
  }
});

});
