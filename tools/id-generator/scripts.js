const decodeInput = document.getElementById("decode-input");
const decodedFieldBlocks = document.querySelectorAll(".decoded-field");
const toast = document.getElementById("toast");
const clipboardBtn = document.getElementById("clipboard-btn");
const sampleBtn = document.getElementById("sample-btn") || document.querySelector('[data-action="loadSample"]');
const clearDecodeBtn = document.getElementById("clear-decode-btn");

const generateBtn = document.getElementById("generate-btn");
const copyOutputBtn = document.getElementById("copy-output-btn");
const downloadBtn = document.getElementById("download-btn");
const clearOutputBtn = document.getElementById("clear-output-btn");
const outputArea = document.getElementById("output-area");
const idTypeSelect = document.getElementById("id-type");
const idTypeDropdown = document.getElementById("id-type-dropdown");
const idTypeTrigger = document.getElementById("id-type-trigger");
const idTypeValue = document.getElementById("id-type-value");
const idTypeOptions = document.querySelectorAll("#id-type-menu .precision-option");
const caseToggle = document.querySelector(".case-toggle");
const caseOptionButtons = document.querySelectorAll(".case-option");
const countInput = document.getElementById("count-input");
const hashInputs = document.getElementById("hash-inputs");
const namespaceInput = document.getElementById("namespace-input");
const nameInput = document.getElementById("name-input");

const fieldInputs = {};
decodedFieldBlocks.forEach(block => {
  const key = block.getAttribute("data-field");
  fieldInputs[key] = block.querySelector("input");
});

function setField(key, value) {
  if (fieldInputs[key]) {
    fieldInputs[key].value = value;
  }
}

function resetFields() {
  Object.keys(fieldInputs).forEach(key => setField(key, "—"));
}

let caseMode = "lower";
let caseLocked = false;

function setCaseMode(mode) {
  caseMode = mode;
  caseOptionButtons.forEach(button => {
    const isActive = button.dataset.case === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  applyCaseToOutput();
}

function setCaseLock(locked) {
  caseLocked = locked;
  if (!caseToggle) return;
  caseToggle.classList.toggle("is-locked", locked);
  caseOptionButtons.forEach(button => {
    button.disabled = locked && button.dataset.case !== "lower";
  });
}

function applyCaseToOutput() {
  const text = outputArea.textContent;
  if (!text || !text.trim()) return;
  outputArea.textContent = applyCase(text, caseMode);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove("show"), 1500);
}

document.querySelectorAll(".copy-field").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    const text = fieldInputs[target].value;
    if (!text || text === "—") return;
    navigator.clipboard.writeText(text).then(() => showToast("Copied"));
  });
});

decodeInput?.addEventListener("input", () => decodeValue(decodeInput.value));

clipboardBtn?.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    decodeInput.value = text;
    decodeValue(text);
    showToast("Pasted from clipboard");
  } catch (error) {
    // Fallback: focus input so user can paste manually
    decodeInput.focus();
    decodeInput.select();
    showToast("Press Ctrl+V to paste");
  }
});

sampleBtn?.addEventListener("click", () => {
  const sample = crypto.randomUUID();
  decodeInput.value = sample;
  decodeValue(sample);
});

clearDecodeBtn?.addEventListener("click", () => {
  decodeInput.value = "";
  resetFields();
});

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

function decodeValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    resetFields();
    return;
  }

  if (uuidRegex.test(trimmed)) {
    const normalized = trimmed.toLowerCase();
    const hex = normalized.replace(/-/g, "");
    const bytes = hexToBytes(hex);
    if (!bytes) {
      resetFields();
      return;
    }
    setField("standard", normalized);
    setField("raw", formatRaw(bytes));
    const version = parseInt(hex.charAt(12), 16);
    const versionLabel = {
      1: "1 (time and node based)",
      3: "3 (name based, MD5)",
      4: "4 (random)",
      5: "5 (name based, SHA1)",
      7: "7 (Unix timestamp)",
    }[version] || `${version}`;
    setField("version", versionLabel);
    setField("variant", "Standard (DCE 1.1, ISO/IEC 11578:1996)");
    if (version === 1) {
      const timeLow = BigInt("0x" + hex.slice(0, 8));
      const timeMid = BigInt("0x" + hex.slice(8, 12));
      const timeHi = BigInt("0x" + hex.slice(12, 16)) & 0x0fffn;
      const timestamp = (timeHi << 48n) | (timeMid << 32n) | timeLow;
      const epoch = 0x01b21dd213814000n;
      const unix100ns = timestamp - epoch;
      const ms = Number(unix100ns / 10000n);
      const iso = new Date(ms).toISOString();
      const clockSeq = (((parseInt(hex.slice(16, 18), 16) & 0x3f) << 8) | parseInt(hex.slice(18, 20), 16)).toString(16).padStart(4, "0");
      const node = hex.slice(20);
      setField("time", iso);
      setField("clock", clockSeq);
      setField("node", node);
    } else if (version === 7) {
      const timestamp = BigInt("0x" + hex.slice(0, 12));
      const ms = Number(timestamp);
      const iso = new Date(ms).toISOString();
      setField("time", iso);
      setField("clock", "—");
      setField("node", "—");
    } else {
      setField("time", "—");
      setField("clock", "—");
      setField("node", "—");
    }
    return;
  }

  if (ulidRegex.test(trimmed)) {
    const valueUpper = trimmed.toUpperCase();
    const bytes = decodeUlidToBytes(valueUpper);
    if (!bytes) {
      resetFields();
      return;
    }
    const timestamp =
      (BigInt(bytes[0]) << 40n) |
      (BigInt(bytes[1]) << 32n) |
      (BigInt(bytes[2]) << 24n) |
      (BigInt(bytes[3]) << 16n) |
      (BigInt(bytes[4]) << 8n) |
      BigInt(bytes[5]);
    const iso = new Date(Number(timestamp)).toISOString();
    setField("standard", valueUpper);
    setField("raw", formatRaw(bytes));
    setField("version", "ULID");
    setField("variant", "—");
    setField("time", iso);
    setField("clock", "—");
    setField("node", "—");
    return;
  }

  resetFields();
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function formatRaw(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join(":");
}

const base32Chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const base32Map = base32Chars.split("").reduce((acc, ch, idx) => {
  acc[ch] = idx;
  return acc;
}, {});

function decodeUlidToBytes(value) {
  const bits = [];
  for (const char of value) {
    const idx = base32Map[char];
    if (idx === undefined) return null;
    for (let bit = 4; bit >= 0; bit -= 1) {
      bits.push((idx >> bit) & 1);
    }
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      // A 26-character ULID has 130 encoded bits; the first two are padding.
      byte = (byte << 1) | bits[i * 8 + bit + 2];
    }
    bytes[i] = byte;
  }
  return bytes;
}

const namespaceSafe = value => value.replace(/[^0-9a-fA-F-]/g, "");

function syncIdTypeUi(value) {
  if (!idTypeSelect) return;

  const selectedOption = Array.from(idTypeSelect.options).find(option => option.value === value) || idTypeSelect.options[0];
  if (idTypeValue && selectedOption) {
    idTypeValue.textContent = selectedOption.textContent;
  }

  idTypeOptions.forEach(optionButton => {
    const isActive = optionButton.dataset.value === selectedOption?.value;
    optionButton.classList.toggle("active", isActive);
    if (isActive) {
      optionButton.setAttribute("aria-selected", "true");
    } else {
      optionButton.removeAttribute("aria-selected");
    }
  });
}

function setIdType(value, shouldEmit = true) {
  if (!idTypeSelect) return;

  const exists = Array.from(idTypeSelect.options).some(option => option.value === value);
  if (!exists) return;

  idTypeSelect.value = value;
  syncIdTypeUi(value);

  if (shouldEmit) {
    idTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function bindIdTypeDropdown() {
  if (!idTypeDropdown || !idTypeTrigger || !idTypeSelect) return;

  syncIdTypeUi(idTypeSelect.value);

  idTypeTrigger.addEventListener("click", () => {
    const isOpen = idTypeDropdown.classList.toggle("open");
    idTypeTrigger.setAttribute("aria-expanded", String(isOpen));
  });

  idTypeOptions.forEach(optionButton => {
    optionButton.addEventListener("click", () => {
      setIdType(optionButton.dataset.value, true);
      idTypeDropdown.classList.remove("open");
      idTypeTrigger.setAttribute("aria-expanded", "false");
      idTypeTrigger.focus();
    });
  });

  document.addEventListener("click", event => {
    if (!idTypeDropdown.contains(event.target)) {
      idTypeDropdown.classList.remove("open");
      idTypeTrigger.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      idTypeDropdown.classList.remove("open");
      idTypeTrigger.setAttribute("aria-expanded", "false");
    }
  });
}

function updateHashInputs() {
  const type = idTypeSelect.value;
  if (type === "uuid-v3" || type === "uuid-v5") {
    hashInputs.style.display = "flex";
    setCaseMode("lower");
    setCaseLock(true);
  } else {
    hashInputs.style.display = "none";
    setCaseLock(false);
    if (type === "ulid") {
      setCaseMode("upper");
    }
  }
}

bindIdTypeDropdown();
updateHashInputs();
idTypeSelect.addEventListener("change", () => {
  syncIdTypeUi(idTypeSelect.value);
  updateHashInputs();
});
caseOptionButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (caseLocked) return;
    setCaseMode(button.dataset.case);
  });
});

generateBtn.addEventListener("click", () => generateIds());

copyOutputBtn.addEventListener("click", () => {
  const text = outputArea.textContent.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast("Copied"));
});

downloadBtn.addEventListener("click", () => {
  const text = outputArea.textContent.trim();
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "id.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Downloaded");
});

clearOutputBtn.addEventListener("click", () => {
  outputArea.textContent = "";
});

let lastTimestamp = 0n;
let lastTimeBytes = new Uint8Array(10);
let objectIdCounter = Math.floor(Math.random() * 0xffffff);

async function generateIds() {
  const type = idTypeSelect.value;
  let count = parseInt(countInput.value, 10);
  if (Number.isNaN(count) || count < 1) count = 1;
  if (count > 1000) count = 1000;
  countInput.value = count;
  const results = [];

  for (let i = 0; i < count; i += 1) {
    let value = "";
    switch (type) {
      case "uuid-v1":
        value = generateUUIDv1();
        break;
      case "uuid-v3":
        value = generateUUIDv3(namespaceInput.value, nameInput.value);
        break;
      case "uuid-v4":
        value = crypto.randomUUID();
        break;
      case "uuid-v5":
        value = await generateUUIDv5(namespaceInput.value, nameInput.value);
        break;
      case "uuid-v7":
        value = generateUUIDv7();
        break;
      case "ulid":
        value = generateUlid();
        break;
      case "objectid":
        value = generateObjectId();
        break;
      case "nanoid":
        value = generateNanoId();
        break;
      default:
        value = "";
    }
    if (value) {
      results.push(applyCase(value, caseMode));
    }
  }
  outputArea.textContent = results.join("\n");
}

function applyCase(value, mode) {
  if (mode === "upper") {
    return value.toUpperCase();
  }
  return value.toLowerCase();
}

function generateUUIDv1() {
  const now = BigInt(Date.now());
  const timestamp = now * 10000n + 0x01b21dd213814000n;
  const timeLow = Number(timestamp & 0xffffffffn);
  const timeMid = Number((timestamp >> 32n) & 0xffffn);
  const timeHigh = Number((timestamp >> 48n) & 0x0fffn);
  const clockSeq = Math.floor(Math.random() * 0x3fff) & 0x3fff;
  const node = crypto.getRandomValues(new Uint8Array(6));
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, timeLow);
  view.setUint16(4, timeMid);
  view.setUint16(6, (timeHigh & 0x0fff) | 0x1000); // version 1
  view.setUint16(8, (clockSeq & 0x3fff) | 0x8000); // variant
  buffer.set(node, 10);
  return bytesToUuid(buffer);
}

function generateUUIDv3(namespace, name) {
  const namespaceBytes = normalizedNamespace(namespace);
  const nameBytes = new TextEncoder().encode(name || "");
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, namespaceBytes.length);
  const hash = md5(data);
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

async function generateUUIDv5(namespace, name) {
  const namespaceBytes = normalizedNamespace(namespace);
  const nameBytes = new TextEncoder().encode(name || "");
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, namespaceBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hash = new Uint8Array(hashBuffer.slice(0, 16));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

function generateUUIDv7() {
  const timestamp = BigInt(Date.now());
  const random = crypto.getRandomValues(new Uint8Array(9));
  const buffer = new Uint8Array(16);
  // 48-bit timestamp
  buffer[0] = Number((timestamp >> 40n) & 0xffn);
  buffer[1] = Number((timestamp >> 32n) & 0xffn);
  buffer[2] = Number((timestamp >> 24n) & 0xffn);
  buffer[3] = Number((timestamp >> 16n) & 0xffn);
  buffer[4] = Number((timestamp >> 8n) & 0xffn);
  buffer[5] = Number(timestamp & 0xffn);
  // version 7, subsec 0
  buffer[6] = 0x70;
  // random 72 bits (9 bytes)
  buffer.set(random, 7);
  // set variant to 10xx
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  return bytesToUuid(buffer);
}

function normalizedNamespace(value) {
  const cleaned = namespaceSafe(value || "");
  const trimmed = cleaned.replace(/-/g, "").padStart(32, "0");
  return hexToBytes(trimmed);
}

function bytesToUuid(bytes) {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateUlid() {
  const time = Date.now();
  const timeBytes = new Uint8Array(6);
  let temp = BigInt(time);
  for (let idx = 5; idx >= 0; idx -= 1) {
    timeBytes[idx] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  let randomBytes = new Uint8Array(10);
  if (time === Number(lastTimestamp)) {
    randomBytes = incrementBytes(lastTimeBytes);
  } else {
    crypto.getRandomValues(randomBytes);
  }
  lastTimestamp = BigInt(time);
  lastTimeBytes = randomBytes.slice();
  const payload = new Uint8Array(16);
  payload.set(timeBytes, 0);
  payload.set(randomBytes, 6);
  return encodeCrockfordBase32(payload);
}

function incrementBytes(bytes) {
  const copy = bytes.slice();
  for (let i = copy.length - 1; i >= 0; i -= 1) {
    if (copy[i] === 255) {
      copy[i] = 0;
      continue;
    }
    copy[i] += 1;
    break;
  }
  return copy;
}

function encodeCrockfordBase32(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  const alphabet = base32Chars;
  let output = "";
  for (let i = 0; i < 26; i += 1) {
    const shift = BigInt(5 * (25 - i));
    const index = Number((value >> shift) & 0x1fn);
    output += alphabet[index];
  }
  return output;
}

function generateObjectId() {
  const buffer = new Uint8Array(12);
  const time = Math.floor(Date.now() / 1000);
  buffer[0] = (time >>> 24) & 0xff;
  buffer[1] = (time >>> 16) & 0xff;
  buffer[2] = (time >>> 8) & 0xff;
  buffer[3] = time & 0xff;
  crypto.getRandomValues(buffer.subarray(4, 9));
  objectIdCounter = (objectIdCounter + 1) & 0xffffff;
  buffer[9] = (objectIdCounter >>> 16) & 0xff;
  buffer[10] = (objectIdCounter >>> 8) & 0xff;
  buffer[11] = objectIdCounter & 0xff;
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateNanoId(size = 21) {
  const alphabet = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => alphabet[b & 63])
    .join("");
}

function md5(data) {
  const K = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const padded = padMd5(data);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const chunk = padded.slice(i, i + 64);
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j += 1) {
      const idx = j * 4;
      M[j] = (chunk[idx]) | (chunk[idx + 1] << 8) | (chunk[idx + 2] << 16) | (chunk[idx + 3] << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let j = 0; j < 64; j += 1) {
      let F, g;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      const temp = D;
      D = C;
      C = B;
      B = B + rotateLeft((A + F + K[j] + M[g]) >>> 0, s[j]);
      A = temp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, a0, true);
  view.setUint32(4, b0, true);
  view.setUint32(8, c0, true);
  view.setUint32(12, d0, true);
  return out;
}

function padMd5(data) {
  const length = data.length;
  const withOne = new Uint8Array(length + 1);
  withOne.set(data);
  withOne[length] = 0x80;
  let padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(withOne);
  const bitLength = length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 0x100000000), true);
  return padded;
}

function rotateLeft(value, shift) {
  return (value << shift) | (value >>> (32 - shift));
}
