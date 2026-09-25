// Certificate Decoder — paste PEM, read the certificate.
//
// Everything runs locally. A small DER reader walks the ASN.1 tree, and the
// X.509 (RFC 5280), PKCS#10 (RFC 2986) and SubjectPublicKeyInfo structures
// are picked out of it by position, the way the RFCs lay them out. Nothing is
// fetched and no library is loaded, so a pasted certificate never leaves the
// page. Fingerprints and chain signatures use WebCrypto.

const {
  NAME_ATTRS, SIG_ALGS, KEY_ALGS, CURVES, EXTENSIONS, KEY_USAGE_BITS,
  EXT_KEY_USAGES, POLICIES, ACCESS_METHODS, OTHER_NAMES, SAMPLE_PEM,
} = window.CERT_DATA;

const input = document.getElementById("input");
const output = document.getElementById("output");
const summaryBadge = document.getElementById("summaryBadge");
const fileInput = document.getElementById("fileInput");
const inputPanel = document.querySelector(".input-panel");

const DAY = 86_400_000;
const EXPIRY_WARNING_DAYS = 30;

const state = {
  items: [],
  selected: 0,
  renderToken: 0,
};

/* --- Bytes ---------------------------------------------------------------- */

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

function toHex(bytes, separator = "") {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(separator).toUpperCase();
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function base64ToBytes(text) {
  const clean = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new DecodeError("The body is not valid Base64.");
  const binary = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function toPem(label, bytes) {
  const body = bytesToBase64(bytes).replace(/.{1,64}/g, "$&\n");
  return `-----BEGIN ${label}-----\n${body}-----END ${label}-----\n`;
}

// Integers are big-endian two's complement; a leading 0x00 only keeps a
// positive number from reading as negative, so it is not part of the value.
function stripSignByte(bytes) {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  return bytes.subarray(start);
}

function bitLength(bytes) {
  const value = stripSignByte(bytes);
  if (value.length === 1 && value[0] === 0) return 0;
  return (value.length - 1) * 8 + (32 - Math.clz32(value[0]));
}

function toBigInt(bytes) {
  return bytes.length ? BigInt(`0x${toHex(bytes)}`) : 0n;
}

/* --- DER reader ----------------------------------------------------------- */

class DecodeError extends Error {}

const UNIVERSAL = 0;
const CONTEXT = 2;
const TAG = {
  BOOLEAN: 1, INTEGER: 2, BIT_STRING: 3, OCTET_STRING: 4, NULL: 5, OID: 6,
  UTF8: 12, SEQUENCE: 16, SET: 17, NUMERIC: 18, PRINTABLE: 19, T61: 20,
  IA5: 22, UTC_TIME: 23, GENERALIZED_TIME: 24, VISIBLE: 26, UNIVERSAL_STR: 28, BMP: 30,
};

function readNode(bytes, offset, limit) {
  if (offset + 2 > limit) throw new DecodeError("The DER data is truncated.");
  const tagByte = bytes[offset];
  let pos = offset + 1;
  let tag = tagByte & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b;
    do {
      if (pos >= limit) throw new DecodeError("The DER data is truncated.");
      b = bytes[pos++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  if (pos >= limit) throw new DecodeError("The DER data is truncated.");
  let length = bytes[pos++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0) throw new DecodeError("Indefinite lengths are BER, not DER.");
    if (count > 4) throw new DecodeError("A DER length field is implausibly large.");
    length = 0;
    for (let i = 0; i < count; i += 1) {
      if (pos >= limit) throw new DecodeError("The DER data is truncated.");
      length = length * 256 + bytes[pos++];
    }
  }
  const end = pos + length;
  if (end > limit) throw new DecodeError("The DER data is truncated.");

  const node = { cls: tagByte >> 6, constructed: Boolean(tagByte & 0x20), tag, start: offset, contentStart: pos, end, bytes };
  if (node.constructed) {
    node.children = [];
    for (let p = pos; p < end;) {
      const child = readNode(bytes, p, end);
      node.children.push(child);
      p = child.end;
    }
  }
  return node;
}

function parseDer(bytes) {
  const root = readNode(bytes, 0, bytes.length);
  if (root.end !== bytes.length) throw new DecodeError("There is trailing data after the DER structure.");
  return root;
}

const content = (node) => node.bytes.subarray(node.contentStart, node.end);
const raw = (node) => node.bytes.subarray(node.start, node.end);
const isUniversal = (node, tag) => node?.cls === UNIVERSAL && node.tag === tag;
const isContext = (node, tag) => node?.cls === CONTEXT && node.tag === tag;

function expect(node, tag, what) {
  if (!isUniversal(node, tag)) throw new DecodeError(`Expected ${what} in the DER structure.`);
  return node;
}

function contextChild(node, tag) {
  return node.children?.find((child) => isContext(child, tag));
}

function bitStringBytes(node) {
  return content(node).subarray(1);
}

function decodeOidBytes(bytes) {
  const arcs = [];
  let value = 0n;
  for (const b of bytes) {
    value = (value << 7n) | BigInt(b & 0x7f);
    if (!(b & 0x80)) {
      if (arcs.length === 0) {
        const first = value < 40n ? 0n : value < 80n ? 1n : 2n;
        arcs.push(first, value - first * 40n);
      } else {
        arcs.push(value);
      }
      value = 0n;
    }
  }
  return arcs.join(".");
}

const decodeOid = (node) => decodeOidBytes(content(expect(node, TAG.OID, "an object identifier")));

function decodeString(node) {
  const bytes = content(node);
  if (node.cls !== UNIVERSAL) return latin1.decode(bytes);
  switch (node.tag) {
    case TAG.UTF8: return utf8.decode(bytes);
    case TAG.BMP: return new TextDecoder("utf-16be").decode(bytes);
    case TAG.UNIVERSAL_STR: {
      let text = "";
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        text += String.fromCodePoint(((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0);
      }
      return text;
    }
    case TAG.PRINTABLE: case TAG.IA5: case TAG.VISIBLE: case TAG.NUMERIC: case TAG.T61:
      return latin1.decode(bytes);
    default:
      return `#${toHex(raw(node))}`;
  }
}

function decodeTime(node) {
  const text = latin1.decode(content(node));
  const match = node.tag === TAG.UTC_TIME
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(text)
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(text);
  if (!match) throw new DecodeError(`Unreadable validity time "${text}".`);
  let year = Number(match[1]);
  // RFC 5280 §4.1.2.5.1: two-digit years 50–99 are 19xx, 00–49 are 20xx.
  if (node.tag === TAG.UTC_TIME) year += year >= 50 ? 1900 : 2000;
  return new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0)));
}

/* --- X.509 building blocks ------------------------------------------------- */

function parseName(node) {
  expect(node, TAG.SEQUENCE, "a distinguished name");
  const attrs = [];
  for (const rdn of node.children) {
    for (const atv of rdn.children || []) {
      const oid = decodeOid(atv.children[0]);
      const known = NAME_ATTRS[oid];
      attrs.push({ oid, short: known?.short || oid, label: known?.label || oid, value: decodeString(atv.children[1]) });
    }
  }
  return { attrs, text: attrs.map((a) => `${a.short}=${a.value}`).join(", "), der: raw(node) };
}

function nameLabel(name) {
  const pick = (short) => name.attrs.findLast((a) => a.short === short)?.value;
  return pick("CN") || pick("O") || pick("OU") || name.text || "(empty name)";
}

function formatIpv6(bytes) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  // Collapse the longest run of two or more zero groups to "::" (RFC 5952).
  let best = { start: -1, len: 0 };
  for (let i = 0; i < 8;) {
    if (groups[i] !== "0") { i += 1; continue; }
    let j = i;
    while (j < 8 && groups[j] === "0") j += 1;
    if (j - i > best.len && j - i >= 2) best = { start: i, len: j - i };
    i = j;
  }
  if (best.start < 0) return groups.join(":");
  return `${groups.slice(0, best.start).join(":")}::${groups.slice(best.start + best.len).join(":")}`;
}

function formatIp(bytes) {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) return formatIpv6(bytes);
  // Name constraints carry address + mask pairs.
  if (bytes.length === 8) return `${formatIp(bytes.subarray(0, 4))}/${formatIp(bytes.subarray(4))}`;
  if (bytes.length === 32) return `${formatIp(bytes.subarray(0, 16))}/${formatIp(bytes.subarray(16))}`;
  return toHex(bytes, ":");
}

function parseGeneralName(node) {
  if (node.cls !== CONTEXT) return { type: "Unknown", value: toHex(raw(node)) };
  switch (node.tag) {
    case 0: {
      const oid = decodeOid(node.children[0]);
      const inner = node.children[1]?.children?.[0];
      return { type: OTHER_NAMES[oid] || `Other (${oid})`, value: inner ? decodeString(inner) : "" };
    }
    case 1: return { type: "Email", value: latin1.decode(content(node)) };
    case 2: return { type: "DNS", value: latin1.decode(content(node)) };
    case 4: return { type: "Directory", value: parseName(node.children[0]).text };
    case 6: return { type: "URI", value: latin1.decode(content(node)) };
    case 7: return { type: "IP", value: formatIp(content(node)) };
    case 8: return { type: "Registered ID", value: decodeOidBytes(content(node)) };
    default: return { type: `[${node.tag}]`, value: toHex(content(node)) };
  }
}

const parseGeneralNames = (node) => (node.children || []).map(parseGeneralName);

// Every URI inside a structure, however deeply it is nested — CRL
// distribution points wrap them in three layers of optional tagging.
function collectUris(node, found = []) {
  if (isContext(node, 6) && !node.constructed) found.push(latin1.decode(content(node)));
  for (const child of node.children || []) collectUris(child, found);
  return found;
}

function parseAlgorithm(node) {
  expect(node, TAG.SEQUENCE, "an algorithm identifier");
  const oid = decodeOid(node.children[0]);
  return { oid, params: node.children[1] || null };
}

function parseRsaPublicKey(bytes) {
  const seq = expect(parseDer(bytes), TAG.SEQUENCE, "an RSA public key");
  const modulus = stripSignByte(content(expect(seq.children[0], TAG.INTEGER, "the RSA modulus")));
  const exponent = content(expect(seq.children[1], TAG.INTEGER, "the RSA exponent"));
  return { bits: bitLength(modulus), exponent: toBigInt(exponent).toString(), modulus: toHex(modulus, ":") };
}

function parseSpki(node) {
  expect(node, TAG.SEQUENCE, "a SubjectPublicKeyInfo");
  const alg = parseAlgorithm(node.children[0]);
  const keyBytes = bitStringBytes(expect(node.children[1], TAG.BIT_STRING, "the public key bits"));
  const known = KEY_ALGS[alg.oid];
  const key = { algorithm: known?.name || alg.oid, oid: alg.oid, spki: raw(node) };

  if (known?.kind === "rsa") {
    Object.assign(key, parseRsaPublicKey(keyBytes));
  } else if (known?.kind === "ec") {
    const curveOid = isUniversal(alg.params, TAG.OID) ? decodeOid(alg.params) : null;
    const curve = CURVES[curveOid];
    key.curve = curve?.name || curveOid || "explicit parameters";
    key.curveOid = curveOid;
    key.bits = curve?.bits;
    key.publicValue = toHex(keyBytes, ":");
  } else if (known?.kind === "dsa") {
    const p = alg.params?.children?.[0];
    if (p) key.bits = bitLength(content(p));
    key.publicValue = toHex(stripSignByte(content(parseDer(keyBytes))), ":");
  } else {
    key.bits = known?.bits;
    key.publicValue = toHex(keyBytes, ":");
  }
  return key;
}

function keySummary(key) {
  if (key.curve) return `${key.algorithm} ${key.curve}`;
  return key.bits ? `${key.algorithm} ${key.bits}` : key.algorithm;
}

function keyWarning(key) {
  if (key.algorithm.startsWith("RSA") && key.bits < 2048) return `${key.bits}-bit RSA is below the 2048-bit minimum`;
  if (key.algorithm === "DSA") return "DSA keys are deprecated";
  return null;
}

/* --- Extensions ------------------------------------------------------------ */

function parseExtension(node) {
  const oid = decodeOid(node.children[0]);
  let index = 1;
  let critical = false;
  if (isUniversal(node.children[1], TAG.BOOLEAN)) {
    critical = content(node.children[1])[0] !== 0;
    index = 2;
  }
  const value = content(expect(node.children[index], TAG.OCTET_STRING, "an extension value"));
  const ext = { oid, name: EXTENSIONS[oid] || oid, critical, length: value.length };
  try {
    ext.data = decodeExtensionValue(oid, value);
  } catch {
    ext.data = undefined;
    ext.malformed = true;
  }
  if (ext.data === undefined) ext.hex = toHex(value.subarray(0, 64), ":") + (value.length > 64 ? "…" : "");
  return ext;
}

function decodeExtensionValue(oid, bytes) {
  switch (oid) {
    case "2.5.29.17":
    case "2.5.29.18":
      return parseGeneralNames(parseDer(bytes));
    case "2.5.29.19": {
      const seq = parseDer(bytes);
      const [first, second] = seq.children;
      const ca = isUniversal(first, TAG.BOOLEAN) && content(first)[0] !== 0;
      const lenNode = isUniversal(first, TAG.INTEGER) ? first : second;
      return { ca, pathLength: lenNode ? Number(toBigInt(content(lenNode))) : null };
    }
    case "2.5.29.15": {
      const bits = parseDer(bytes);
      const data = bitStringBytes(bits);
      return KEY_USAGE_BITS.filter((_, i) => data[i >> 3] & (0x80 >> (i & 7)));
    }
    case "2.5.29.37":
      return parseDer(bytes).children.map((n) => {
        const id = decodeOid(n);
        return EXT_KEY_USAGES[id] || id;
      });
    case "2.5.29.14":
      return toHex(content(parseDer(bytes)), ":");
    case "2.5.29.35": {
      const seq = parseDer(bytes);
      const keyId = contextChild(seq, 0);
      const issuer = contextChild(seq, 1);
      const serial = contextChild(seq, 2);
      return {
        keyId: keyId ? toHex(content(keyId), ":") : null,
        issuer: issuer ? parseGeneralNames(issuer).map((g) => g.value).join("; ") : null,
        serial: serial ? toHex(content(serial), ":") : null,
      };
    }
    case "2.5.29.31":
      return collectUris(parseDer(bytes));
    case "1.3.6.1.5.5.7.1.1":
    case "1.3.6.1.5.5.7.1.11":
      return parseDer(bytes).children.map((desc) => {
        const method = decodeOid(desc.children[0]);
        return { method: ACCESS_METHODS[method] || method, location: parseGeneralName(desc.children[1]).value };
      });
    case "2.5.29.32":
      return parseDer(bytes).children.map((info) => {
        const id = decodeOid(info.children[0]);
        return POLICIES[id] ? `${POLICIES[id]} (${id})` : id;
      });
    case "1.3.6.1.5.5.7.1.24": {
      const features = parseDer(bytes).children.map((n) => Number(toBigInt(content(n))));
      return features.map((f) => (f === 5 ? "OCSP must-staple (status_request)" : f === 17 ? "status_request_v2" : `TLS extension ${f}`));
    }
    case "1.3.6.1.4.1.11129.2.4.2": {
      // An OCTET STRING holding a TLS-encoded SignedCertificateTimestampList:
      // a 2-byte total length, then 2-byte length-prefixed entries.
      const list = content(parseDer(bytes));
      let count = 0;
      for (let pos = 2; pos + 2 <= list.length; count += 1) pos += 2 + ((list[pos] << 8) | list[pos + 1]);
      return `${count} embedded timestamp${count === 1 ? "" : "s"} (Certificate Transparency)`;
    }
    case "1.3.6.1.4.1.11129.2.4.3":
      return "Precertificate — not valid for TLS";
    case "1.3.6.1.5.5.7.48.1.5":
      return "Responder certificate is exempt from revocation checks";
    case "2.16.840.1.113730.1.13":
      return decodeString(parseDer(bytes));
    default:
      return undefined;
  }
}

function extensionMap(extensions) {
  return Object.fromEntries(extensions.map((ext) => [ext.oid, ext]));
}

/* --- Top-level structures --------------------------------------------------- */

function parseCertificate(der) {
  const root = expect(parseDer(der), TAG.SEQUENCE, "a certificate");
  const [tbs, sigAlgNode, sigNode] = root.children;
  expect(tbs, TAG.SEQUENCE, "the to-be-signed certificate");
  expect(sigNode, TAG.BIT_STRING, "the certificate signature");

  const fields = [...tbs.children];
  let version = 1;
  if (isContext(fields[0], 0)) version = Number(toBigInt(content(fields.shift().children[0]))) + 1;
  const [serialNode, , issuerNode, validityNode, subjectNode, spkiNode] = fields;
  const extensionsNode = contextChild(tbs, 3)?.children?.[0];

  const extensions = extensionsNode ? extensionsNode.children.map(parseExtension) : [];
  const sigAlg = parseAlgorithm(sigAlgNode);
  const issuer = parseName(issuerNode);
  const subject = parseName(subjectNode);
  const serial = stripSignByte(content(expect(serialNode, TAG.INTEGER, "the serial number")));

  return {
    kind: "certificate",
    der,
    tbs: raw(tbs),
    signature: bitStringBytes(sigNode),
    version,
    serial: toHex(serial, ":"),
    serialDecimal: toBigInt(serial).toString(),
    signatureAlgorithm: { oid: sigAlg.oid, ...(SIG_ALGS[sigAlg.oid] || { name: sigAlg.oid }) },
    issuer,
    subject,
    notBefore: decodeTime(validityNode.children[0]),
    notAfter: decodeTime(validityNode.children[1]),
    publicKey: parseSpki(spkiNode),
    extensions,
    ext: extensionMap(extensions),
    selfIssued: bytesEqual(issuer.der, subject.der),
  };
}

function parseCsr(der) {
  const root = expect(parseDer(der), TAG.SEQUENCE, "a certificate request");
  const [info, sigAlgNode, sigNode] = root.children;
  expect(info, TAG.SEQUENCE, "the certification request info");
  const [versionNode, subjectNode, spkiNode] = info.children;
  const attributesNode = contextChild(info, 0);

  let extensions = [];
  const attributes = [];
  for (const attr of attributesNode?.children || []) {
    const oid = decodeOid(attr.children[0]);
    const values = attr.children[1]?.children || [];
    if (oid === "1.2.840.113549.1.9.14") {
      extensions = values[0]?.children?.map(parseExtension) || [];
    } else if (oid === "1.2.840.113549.1.9.7") {
      attributes.push({ name: "Challenge password", value: "(present — not shown)" });
    } else {
      attributes.push({ name: oid, value: values.map((v) => decodeString(v)).join(", ") });
    }
  }
  const sigAlg = parseAlgorithm(sigAlgNode);

  return {
    kind: "csr",
    der,
    tbs: raw(info),
    signature: bitStringBytes(expect(sigNode, TAG.BIT_STRING, "the request signature")),
    version: Number(toBigInt(content(versionNode))) + 1,
    subject: parseName(subjectNode),
    publicKey: parseSpki(spkiNode),
    signatureAlgorithm: { oid: sigAlg.oid, ...(SIG_ALGS[sigAlg.oid] || { name: sigAlg.oid }) },
    extensions,
    ext: extensionMap(extensions),
    attributes,
  };
}

function parsePublicKey(der) {
  return { kind: "public-key", der, publicKey: parseSpki(parseDer(der)) };
}

// Minimal DER writer, used only to wrap a bare PKCS#1 RSA key in a
// SubjectPublicKeyInfo so its SPKI pin matches what servers publish.
function derEncode(tag, body) {
  const length = [];
  for (let n = body.length; n > 0; n = Math.floor(n / 256)) length.unshift(n & 0xff);
  const header = body.length < 0x80 ? [body.length] : [0x80 | length.length, ...length];
  return Uint8Array.from([tag, ...header, ...body]);
}

function parsePkcs1PublicKey(der) {
  const rsaAlgId = derEncode(0x30, [...derEncode(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]), 0x05, 0x00]);
  const spki = derEncode(0x30, [...rsaAlgId, ...derEncode(0x03, [0x00, ...der])]);
  const item = parsePublicKey(spki);
  item.format = "PKCS#1";
  return item;
}

/* --- Input ---------------------------------------------------------------- */

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

function decodeBlock(label, bytes) {
  if (/PRIVATE KEY/.test(label)) return { kind: "private-key", label };
  switch (label) {
    case "CERTIFICATE":
    case "X509 CERTIFICATE":
    case "TRUSTED CERTIFICATE":
      // OpenSSL's TRUSTED CERTIFICATE appends trust settings after the DER.
      return parseCertificate(label === "TRUSTED CERTIFICATE" ? bytes.subarray(0, readNode(bytes, 0, bytes.length).end) : bytes);
    case "CERTIFICATE REQUEST":
    case "NEW CERTIFICATE REQUEST":
      return parseCsr(bytes);
    case "PUBLIC KEY":
      return parsePublicKey(bytes);
    case "RSA PUBLIC KEY":
      return parsePkcs1PublicKey(bytes);
    default:
      return { kind: "unsupported", label };
  }
}

// Unlabelled DER — from a .der/.cer file or bare Base64 — is identified by
// trying each structure in turn; the wrong ones fail fast on shape.
function sniffDer(bytes) {
  for (const [label, parse] of [["CERTIFICATE", parseCertificate], ["CERTIFICATE REQUEST", parseCsr], ["PUBLIC KEY", parsePublicKey], ["RSA PUBLIC KEY", parsePkcs1PublicKey]]) {
    try {
      return { label, item: parse(bytes) };
    } catch {
      // try the next shape
    }
  }
  return null;
}

function decodeInput(text) {
  const blocks = [...text.matchAll(PEM_BLOCK)];
  if (blocks.length) {
    return blocks.map(([, label, body]) => {
      try {
        // Encrypted legacy PEM carries "Proc-Type:" headers before the body.
        const bodyOnly = body.includes(":") ? body.split(/\r?\n\r?\n/).pop() : body;
        return decodeBlock(label, base64ToBytes(bodyOnly));
      } catch (error) {
        return { kind: "error", label, message: error instanceof DecodeError ? error.message : `Could not decode this ${label.toLowerCase()}.` };
      }
    });
  }

  if (/-----BEGIN /.test(text)) {
    return [{ kind: "error", message: "Found a BEGIN line with no matching END line." }];
  }

  // No armour: bare Base64 of DER, or Base64 of a whole PEM file (how a
  // Kubernetes secret stores tls.crt).
  const notFound = [{ kind: "error", message: "No certificate found. Paste a PEM block that starts with -----BEGIN CERTIFICATE----- (or PUBLIC KEY / CERTIFICATE REQUEST), or Base64-encoded DER." }];
  let bytes;
  try {
    bytes = base64ToBytes(text);
  } catch {
    return notFound;
  }
  const asText = latin1.decode(bytes);
  if (asText.includes("-----BEGIN ")) return decodeInput(asText);
  const sniffed = sniffDer(bytes);
  return sniffed ? [sniffed.item] : notFound;
}

/* --- Derived data: fingerprints, chain, validity ---------------------------- */

async function digest(algorithm, bytes) {
  if (!crypto.subtle) return null;
  return new Uint8Array(await crypto.subtle.digest(algorithm, bytes.slice()));
}

async function addFingerprints(item) {
  const [sha256, sha1, spki] = await Promise.all([
    item.kind === "certificate" ? digest("SHA-256", item.der) : null,
    item.kind === "certificate" ? digest("SHA-1", item.der) : null,
    digest("SHA-256", item.publicKey.spki),
  ]);
  item.fingerprints = {
    sha256: sha256 && toHex(sha256, ":"),
    sha1: sha1 && toHex(sha1, ":"),
    spkiSha256: spki && toHex(spki, ":"),
    spkiPin: spki && bytesToBase64(spki),
  };
}

// ECDSA signatures are DER SEQUENCE { r, s }; WebCrypto wants r || s, each
// left-padded to the curve's byte length.
function ecdsaDerToRaw(sig, bits) {
  const size = Math.ceil(bits / 8);
  const seq = parseDer(sig);
  const out = new Uint8Array(size * 2);
  seq.children.forEach((node, i) => {
    const value = stripSignByte(content(node));
    if (value.length > size) throw new DecodeError("ECDSA signature is longer than the curve.");
    out.set(value, i * size + (size - value.length));
  });
  return out;
}

// true / false for a definite answer, null when this browser cannot check
// the algorithm (RSA-PSS parameters, secp256k1, Ed448, ML-DSA, SHA-224…).
async function verifySignature(item, signerKey) {
  const sig = item.signatureAlgorithm;
  if (!crypto.subtle) return null;
  try {
    let importAlg;
    let verifyAlg;
    let signature = item.signature;
    if (sig.family === "RSA" && signerKey.algorithm === "RSA" && ["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(sig.hash)) {
      importAlg = { name: "RSASSA-PKCS1-v1_5", hash: sig.hash };
      verifyAlg = importAlg;
    } else if (sig.family === "ECDSA" && CURVES[signerKey.curveOid]?.webcrypto && sig.hash !== "SHA-224") {
      importAlg = { name: "ECDSA", namedCurve: CURVES[signerKey.curveOid].webcrypto };
      verifyAlg = { name: "ECDSA", hash: sig.hash };
      signature = ecdsaDerToRaw(signature, signerKey.bits);
    } else if (sig.family === "Ed25519" && signerKey.algorithm === "Ed25519") {
      importAlg = { name: "Ed25519" };
      verifyAlg = importAlg;
    } else {
      return null;
    }
    const key = await crypto.subtle.importKey("spki", signerKey.spki.slice(), importAlg, false, ["verify"]);
    return await crypto.subtle.verify(verifyAlg, key, signature.slice(), item.tbs.slice());
  } catch {
    return null;
  }
}

async function linkChain(items) {
  const certs = items.filter((item) => item.kind === "certificate");
  await Promise.all(certs.map(async (cert) => {
    const index = items.indexOf(cert);
    // Prefer the next certificate (the conventional leaf-first order), then
    // any other in the paste, then the certificate itself if self-issued.
    const candidates = [items[index + 1], ...certs, cert].filter((c) => c?.kind === "certificate" && bytesEqual(c.subject.der, cert.issuer.der));
    const signer = candidates.find((c) => c !== cert) || (cert.selfIssued ? cert : null);
    if (!signer) {
      cert.chain = { signer: null };
      return;
    }
    cert.chain = { signer: items.indexOf(signer), self: signer === cert, verified: await verifySignature(cert, signer.publicKey) };
  }));
  for (const csr of items.filter((item) => item.kind === "csr")) {
    csr.chain = { self: true, verified: await verifySignature(csr, csr.publicKey) };
  }
}

function isCa(cert) {
  return Boolean(cert.ext["2.5.29.19"]?.data?.ca);
}

function certRole(cert) {
  if (cert.selfIssued && isCa(cert)) return "Root";
  if (isCa(cert)) return "Intermediate";
  return cert.selfIssued ? "Self-signed" : "Leaf";
}

function formatSpan(ms) {
  const days = Math.floor(Math.abs(ms) / DAY);
  if (days < 1) {
    const hours = Math.max(1, Math.round(Math.abs(ms) / 3_600_000));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (days < 90) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

function validityStatus(cert, now = Date.now()) {
  if (now < cert.notBefore) return { state: "warning", label: "Not yet valid", detail: `Starts in ${formatSpan(cert.notBefore - now)}` };
  if (now > cert.notAfter) return { state: "error", label: "Expired", detail: `Expired ${formatSpan(now - cert.notAfter)} ago` };
  const left = cert.notAfter - now;
  const detail = `${Math.floor(left / DAY).toLocaleString("en-US")} days left (${formatSpan(left)})`;
  if (left < EXPIRY_WARNING_DAYS * DAY) return { state: "warning", label: "Expires soon", detail };
  return { state: "success", label: "Valid", detail };
}

function formatDate(date) {
  return `${date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} UTC`;
}

/* --- Rendering ------------------------------------------------------------- */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function copyButton(value, label) {
  return h("button", { class: "action-btn copy-btn", type: "button", "data-copy": value, "data-copy-label": label, "aria-label": `Copy ${label}`, "data-tooltip": `Copy ${label}` }, icon("copy"));
}

function badge(text, state) {
  return h("span", { class: `badge ${state || ""}`.trim() }, text);
}

// One labelled value. `mono` for identifiers and hex; `copy` adds a button.
function row(label, value, { mono = false, copy = false, block = false, id } = {}) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return null;
  const values = Array.isArray(value) ? value : [value];
  const text = values.join("\n");
  return h("div", { class: "field-row", dataset: id ? { field: id } : {} },
    h("dt", {}, label),
    h("dd", { class: [mono && "mono", block && "block"].filter(Boolean).join(" ") || null },
      h("span", { class: "field-value" }, values.length > 1 ? values.map((v) => h("span", { class: "field-line" }, v)) : text),
      copy ? copyButton(text, label.toLowerCase()) : null));
}

function card(title, rows, { id, wide = false, actions = null } = {}) {
  const filled = rows.flat().filter(Boolean);
  if (!filled.length) return null;
  return h("section", { class: `info-card${wide ? " wide" : ""}`, dataset: id ? { card: id } : {} },
    h("header", { class: "info-card-header" }, h("h3", { class: "info-card-title" }, title), actions),
    h("dl", { class: "field-list" }, filled));
}

function nameCard(title, name, id) {
  return card(title, name.attrs.map((a) => row(a.label, a.value)), { id });
}

function sanCard(item) {
  const sans = item.ext["2.5.29.17"]?.data;
  if (!Array.isArray(sans) || !sans.length) return null;
  const all = sans.map((s) => s.value).join("\n");
  return h("section", { class: "info-card wide", dataset: { card: "sans" } },
    h("header", { class: "info-card-header" },
      h("h3", { class: "info-card-title" }, `Subject alternative names (${sans.length})`),
      copyButton(all, "all names")),
    h("ul", { class: "san-list" }, sans.map((s) => h("li", { class: "san-chip" }, h("span", { class: "san-type" }, s.type), h("span", { class: "san-value" }, s.value)))));
}

function publicKeyCard(item) {
  const key = item.publicKey;
  const fp = item.fingerprints || {};
  return card("Public key", [
    row("Algorithm", item.format ? `${key.algorithm} (${item.format})` : key.algorithm, { id: "key-algorithm" }),
    row("Key size", key.bits ? `${key.bits} bits` : null, { id: "key-size" }),
    row("Curve", key.curve, { id: "key-curve" }),
    row("Exponent", key.exponent),
    row("SPKI SHA-256 pin", fp.spkiPin, { mono: true, copy: true, id: "spki-pin" }),
    row("SPKI SHA-256", fp.spkiSha256, { mono: true, copy: true }),
    row(key.modulus ? "Modulus" : "Public value", key.modulus || key.publicValue, { mono: true, copy: true, block: true }),
  ], { id: "public-key", wide: item.kind === "public-key" });
}

function usageCard(item) {
  const bc = item.ext["2.5.29.19"]?.data;
  const ku = item.ext["2.5.29.15"]?.data;
  const eku = item.ext["2.5.29.37"]?.data;
  const label = (text, oid) => (item.ext[oid]?.critical ? `${text} (critical)` : text);
  return card("Usage & constraints", [
    row(label("Basic constraints", "2.5.29.19"), bc ? `${bc.ca ? "CA" : "Not a CA"}${bc.pathLength !== null ? `, path length ${bc.pathLength}` : ""}` : null, { id: "basic-constraints" }),
    row(label("Key usage", "2.5.29.15"), ku, { id: "key-usage" }),
    row(label("Extended key usage", "2.5.29.37"), eku, { id: "eku" }),
    row("Policies", item.ext["2.5.29.32"]?.data, { id: "policies" }),
    row("TLS feature", item.ext["1.3.6.1.5.5.7.1.24"]?.data),
  ], { id: "usage" });
}

function identifiersCard(item) {
  const fp = item.fingerprints || {};
  const aki = item.ext["2.5.29.35"]?.data;
  return card("Identifiers & fingerprints", [
    row("Serial number", item.serial, { mono: true, copy: true, id: "serial" }),
    item.serial && item.serial.length <= 23 ? row("Serial (decimal)", item.serialDecimal, { mono: true }) : null,
    row("SHA-256 fingerprint", fp.sha256, { mono: true, copy: true, id: "sha256" }),
    row("SHA-1 fingerprint", fp.sha1, { mono: true, copy: true, id: "sha1" }),
    row("Subject key ID", item.ext["2.5.29.14"]?.data, { mono: true, copy: true, id: "ski" }),
    row("Authority key ID", aki?.keyId, { mono: true, copy: true, id: "aki" }),
    row("Version", `v${item.version}`),
    row("Signature algorithm", item.signatureAlgorithm.name, { id: "signature-algorithm" }),
  ], { id: "identifiers" });
}

function revocationCard(item) {
  const aia = item.ext["1.3.6.1.5.5.7.1.1"]?.data || [];
  const byMethod = (m) => aia.filter((a) => a.method === m).map((a) => a.location);
  return card("Revocation & issuer info", [
    row("CRL", item.ext["2.5.29.31"]?.data, { mono: true, id: "crl" }),
    row("OCSP", byMethod("OCSP"), { mono: true, id: "ocsp" }),
    row("CA issuers", byMethod("CA issuers"), { mono: true, id: "ca-issuers" }),
    row("Transparency", item.ext["1.3.6.1.4.1.11129.2.4.2"]?.data),
  ], { id: "revocation" });
}

const RENDERED_EXTENSIONS = new Set(["2.5.29.17", "2.5.29.19", "2.5.29.15", "2.5.29.37", "2.5.29.32", "1.3.6.1.5.5.7.1.24", "2.5.29.14", "2.5.29.35", "2.5.29.31", "1.3.6.1.5.5.7.1.1", "1.3.6.1.4.1.11129.2.4.2"]);

function otherExtensionsCard(item) {
  const rest = item.extensions.filter((ext) => !RENDERED_EXTENSIONS.has(ext.oid));
  return card("Other extensions", rest.map((ext) => {
    const label = `${ext.name}${ext.critical ? " (critical)" : ""}`;
    if (ext.data === undefined) return row(label, `${ext.malformed ? "Malformed · " : ""}${ext.length} bytes: ${ext.hex}`, { mono: true });
    const value = Array.isArray(ext.data) ? ext.data.map((d) => (typeof d === "object" ? `${d.method || d.type}: ${d.location || d.value}` : d)) : String(ext.data);
    return row(label, value);
  }), { id: "other-extensions", wide: true });
}

function chainCard(item) {
  if (!item.chain) return null;
  const { signer, self, verified } = item.chain;
  let signedBy;
  if (item.kind === "csr") signedBy = "Self-signed (proof of key possession)";
  else if (signer === null) signedBy = `${nameLabel(item.issuer)} — not in the pasted chain`;
  else signedBy = self ? "Itself (self-signed)" : `#${signer + 1} ${nameLabel(state.items[signer].subject)}`;

  let check = null;
  if (item.kind === "csr" || signer !== null) {
    check = verified === true ? badge("Signature verified", "success")
      : verified === false ? badge("Signature does not match", "error")
        : badge("Not checked in this browser", "");
  }
  return h("section", { class: "info-card", dataset: { card: "chain" } },
    h("header", { class: "info-card-header" }, h("h3", { class: "info-card-title" }, "Signature")),
    h("dl", { class: "field-list" },
      row("Signed by", signedBy, { id: "signed-by" }),
      h("div", { class: "field-row" }, h("dt", {}, "Check"), h("dd", { dataset: { field: "signature-check" } }, check || "—"))));
}

function validityBlock(cert) {
  const status = validityStatus(cert);
  const total = cert.notAfter - cert.notBefore;
  const elapsed = Math.min(Math.max((Date.now() - cert.notBefore) / total, 0), 1);
  return h("section", { class: "info-card wide validity-card", dataset: { card: "validity" } },
    h("header", { class: "info-card-header" },
      h("h3", { class: "info-card-title" }, "Validity"),
      h("span", { class: "validity-detail", id: "validityDetail" }, status.detail)),
    h("div", { class: `validity-bar ${status.state}`, role: "img", "aria-label": `${Math.round(elapsed * 100)}% of the validity period has elapsed` },
      h("span", { class: "validity-fill", style: `width: ${(elapsed * 100).toFixed(1)}%` })),
    h("dl", { class: "field-list validity-dates" },
      row("Not before", formatDate(cert.notBefore), { mono: true, id: "not-before" }),
      row("Not after", formatDate(cert.notAfter), { mono: true, id: "not-after" }),
      row("Lifetime", `${Math.round(total / DAY).toLocaleString("en-US")} days`)));
}

function summaryHeader(item) {
  const badges = [];
  let title;
  let subtitle;
  if (item.kind === "certificate") {
    const status = validityStatus(item);
    badges.push(badge(status.label, status.state));
    badges.push(badge(certRole(item), "info"));
    title = nameLabel(item.subject);
    subtitle = item.selfIssued ? "Self-issued" : `Issued by ${nameLabel(item.issuer)}`;
  } else if (item.kind === "csr") {
    badges.push(badge("Certificate request", "info"));
    title = nameLabel(item.subject);
    subtitle = "PKCS#10 certificate signing request";
  } else {
    badges.push(badge("Public key", "info"));
    title = keySummary(item.publicKey);
    subtitle = item.format === "PKCS#1" ? "PKCS#1 RSA public key" : "SubjectPublicKeyInfo";
  }
  badges.push(badge(keySummary(item.publicKey), ""));
  if (item.signatureAlgorithm?.weak) badges.push(badge(`Weak signature: ${item.signatureAlgorithm.hash}`, "warning"));
  const weakKey = keyWarning(item.publicKey);
  if (weakKey) badges.push(h("span", { class: "badge warning", title: weakKey }, "Weak key"));

  return h("div", { class: "cert-summary" },
    h("div", { class: "cert-summary-text" },
      h("h2", { class: "cert-title", id: "certTitle" }, title),
      h("p", { class: "cert-subtitle" }, subtitle)),
    h("div", { class: "badge-row", id: "badgeRow" }, badges));
}

function renderCertificate(item) {
  return [
    summaryHeader(item),
    h("div", { class: "card-grid" },
      validityBlock(item),
      sanCard(item),
      nameCard("Subject", item.subject, "subject"),
      nameCard("Issuer", item.issuer, "issuer"),
      publicKeyCard(item),
      usageCard(item),
      identifiersCard(item),
      chainCard(item),
      revocationCard(item),
      otherExtensionsCard(item)),
  ];
}

function renderCsr(item) {
  return [
    summaryHeader(item),
    h("div", { class: "card-grid" },
      sanCard(item),
      nameCard("Subject", item.subject, "subject"),
      publicKeyCard(item),
      usageCard(item),
      card("Request details", [
        row("Version", `v${item.version}`),
        row("Signature algorithm", item.signatureAlgorithm.name, { id: "signature-algorithm" }),
        item.attributes.map((a) => row(a.name, a.value)),
      ], { id: "identifiers" }),
      chainCard(item),
      otherExtensionsCard(item)),
  ];
}

function renderPublicKey(item) {
  return [summaryHeader(item), h("div", { class: "card-grid" }, publicKeyCard(item))];
}

function renderNotice(item) {
  if (item.kind === "private-key") {
    return h("div", { class: "notice warning", dataset: { notice: "private-key" } },
      h("strong", {}, "Private key — not decoded."),
      h("p", {}, "This tool only reads public material: certificates, CSRs and public keys. Nothing you paste leaves your browser, but if this key has been pasted or committed anywhere else, treat it as compromised and rotate it."));
  }
  if (item.kind === "unsupported") {
    return h("div", { class: "notice", dataset: { notice: "unsupported" } },
      h("strong", {}, `“${item.label}” blocks aren't supported.`),
      h("p", {}, "Paste a CERTIFICATE, CERTIFICATE REQUEST, PUBLIC KEY or RSA PUBLIC KEY block."));
  }
  return h("div", { class: "notice error", dataset: { notice: "error" } },
    h("strong", {}, item.label ? `Could not decode this ${item.label.toLowerCase()}.` : "Nothing decoded."),
    h("p", {}, item.message));
}

function itemLabel(item) {
  if (item.kind === "certificate") return nameLabel(item.subject);
  if (item.kind === "csr") return `CSR · ${nameLabel(item.subject)}`;
  if (item.kind === "public-key") return keySummary(item.publicKey);
  if (item.kind === "private-key") return "Private key";
  return item.label || "Error";
}

function itemRole(item) {
  if (item.kind === "certificate") return certRole(item);
  return { csr: "CSR", "public-key": "Public key", "private-key": "Skipped", unsupported: "Skipped" }[item.kind] || "Error";
}

function renderChainStrip() {
  if (state.items.length < 2) return null;
  return h("nav", { class: "chain-strip", "aria-label": "Decoded items", role: "tablist" },
    state.items.map((item, i) => {
      const status = item.kind === "certificate" ? validityStatus(item).state : null;
      return h("button", {
        class: `chain-item${i === state.selected ? " active" : ""}`,
        type: "button",
        role: "tab",
        "aria-selected": String(i === state.selected),
        dataset: { index: i },
      },
      h("span", { class: `chain-dot ${status || item.kind}` }),
      h("span", { class: "chain-index" }, `#${i + 1}`),
      h("span", { class: "chain-text" }, h("span", { class: "chain-name" }, itemLabel(item)), h("span", { class: "chain-role" }, itemRole(item))));
    }));
}

function renderSelected() {
  const item = state.items[state.selected];
  const body = {
    certificate: renderCertificate,
    csr: renderCsr,
    "public-key": renderPublicKey,
  }[item.kind]?.(item) ?? renderNotice(item);
  output.replaceChildren(...[renderChainStrip(), h("div", { class: "item-view", id: "itemView" }, body)].filter(Boolean));
}

function renderEmpty() {
  output.replaceChildren(h("div", { class: "empty-state output-empty" },
    h("p", {}, "Paste a PEM certificate, a full chain, a public key or a CSR — or open a .pem, .crt, .cer or .der file."),
    h("p", { class: "hint" }, "Decoding happens entirely in your browser.")));
}

function updateSummaryBadge() {
  const certs = state.items.filter((item) => item.kind === "certificate").length;
  const decoded = state.items.filter((item) => item.publicKey).length;
  let text = "";
  if (certs > 1) text = `${certs} certificates`;
  else if (decoded > 1) text = `${decoded} items`;
  summaryBadge.textContent = text;
  summaryBadge.hidden = !text;
}

async function decodeAndRender() {
  const token = ++state.renderToken;
  const text = input.value.trim();
  if (!text) {
    state.items = [];
    updateSummaryBadge();
    renderEmpty();
    return;
  }
  const items = decodeInput(text);
  await Promise.all(items.filter((item) => item.publicKey).map(addFingerprints));
  await linkChain(items);
  if (token !== state.renderToken) return;

  state.items = items;
  if (state.selected >= items.length) state.selected = 0;
  updateSummaryBadge();
  renderSelected();
}

let debounceTimer = 0;
function scheduleDecode() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(decodeAndRender, 120);
}

/* --- JSON export ------------------------------------------------------------ */

function nameJson(name) {
  return Object.fromEntries(name.attrs.map((a) => [a.short, a.value]));
}

function extensionJson(ext) {
  return { name: ext.name, oid: ext.oid, critical: ext.critical, value: ext.data !== undefined ? ext.data : ext.hex };
}

function itemJson(item) {
  if (!item.publicKey) return { type: item.kind, label: item.label, message: item.message };
  const { spki, ...key } = item.publicKey;
  const base = { type: item.kind, publicKey: key, fingerprints: item.fingerprints };
  if (item.kind === "public-key") return base;
  return {
    type: item.kind,
    subject: nameJson(item.subject),
    ...(item.issuer ? { issuer: nameJson(item.issuer) } : {}),
    ...(item.kind === "certificate" ? {
      serial: item.serial,
      notBefore: item.notBefore.toISOString(),
      notAfter: item.notAfter.toISOString(),
      status: validityStatus(item).label,
    } : {}),
    version: item.version,
    signatureAlgorithm: item.signatureAlgorithm.name,
    publicKey: key,
    fingerprints: item.fingerprints,
    extensions: item.extensions.map(extensionJson),
  };
}

/* --- File input -------------------------------------------------------------- */

async function loadFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = latin1.decode(bytes);
  if (text.includes("-----BEGIN ")) {
    input.value = text;
  } else {
    const sniffed = sniffDer(bytes);
    if (!sniffed) {
      window.DevToolsMain.showToast(`${file.name} is not a certificate, CSR or public key`, "error");
      return;
    }
    // Show binary DER as PEM so what is decoded is also what is on screen.
    input.value = toPem(sniffed.label, bytes);
  }
  state.selected = 0;
  await decodeAndRender();
  window.DevToolsMain.showToast(`Loaded ${file.name}`, "success");
}

/* --- Actions ------------------------------------------------------------------ */

const ACTIONS = {
  async sample() {
    input.value = SAMPLE_PEM;
    state.selected = 0;
    await decodeAndRender();
    window.DevToolsMain.showToast("Sample chain inserted", "info");
  },

  async clear() {
    input.value = "";
    await decodeAndRender();
    window.DevToolsMain.showToast("Cleared", "info");
  },

  async paste() {
    try {
      input.value = await navigator.clipboard.readText();
      state.selected = 0;
      await decodeAndRender();
    } catch {
      input.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  open() {
    fileInput.click();
  },

  "copy-json"() {
    if (!state.items.length) {
      window.DevToolsMain.showToast("Nothing to copy", "error");
      return;
    }
    const json = state.items.length === 1 ? itemJson(state.items[0]) : state.items.map(itemJson);
    window.DevToolsMain.copyText(JSON.stringify(json, null, 2));
    window.DevToolsMain.showToast("Decoded JSON copied", "success");
  },
};

/* --- Wiring ------------------------------------------------------------------- */

input.addEventListener("input", scheduleDecode);

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.(button));
});

output.addEventListener("click", (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    window.DevToolsMain.copyText(copy.dataset.copy);
    const label = copy.dataset.copyLabel;
    window.DevToolsMain.showToast(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied`, "success");
    return;
  }
  const tab = event.target.closest(".chain-item");
  if (tab) {
    state.selected = Number(tab.dataset.index);
    renderSelected();
    output.querySelector(".chain-item.active")?.focus();
  }
});

output.addEventListener("keydown", (event) => {
  if (!event.target.closest(".chain-item") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const last = state.items.length - 1;
  const next = { ArrowLeft: state.selected - 1, ArrowRight: state.selected + 1, Home: 0, End: last }[event.key];
  state.selected = Math.min(Math.max(next, 0), last);
  renderSelected();
  output.querySelector(".chain-item.active")?.focus();
});

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  if (file) loadFile(file);
  fileInput.value = "";
});

inputPanel.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  inputPanel.classList.add("is-dragging");
});
inputPanel.addEventListener("dragleave", (event) => {
  if (!inputPanel.contains(event.relatedTarget)) inputPanel.classList.remove("is-dragging");
});
inputPanel.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  inputPanel.classList.remove("is-dragging");
  if (!file) return;
  event.preventDefault();
  loadFile(file);
});

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

renderEmpty();
