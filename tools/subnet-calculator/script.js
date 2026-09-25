// Subnet Calculator — IPv4 and IPv6 CIDR blocks, subnet splitting, address
// containment and range-to-CIDR, all on one code path.
//
// Every address is a BigInt with a bit width of 32 or 128, so IPv4 and IPv6
// share the arithmetic: a mask is `((1 << width) - 1) ^ ((1 << host) - 1)`
// whatever the family. Numbers would silently lose precision past 2^53, which
// is already inside a single IPv6 /64.

const cidrInput = document.getElementById("cidr-input");
const statusBar = document.getElementById("status");
const statusText = statusBar.querySelector(".status-msg");
const details = document.getElementById("details");
const bitsView = document.getElementById("bits");
const splitPrefix = document.getElementById("split-prefix");
const splitHosts = document.getElementById("split-hosts");
const splitSummary = document.getElementById("split-summary");
const splitBody = document.getElementById("split-body");
const splitNote = document.getElementById("split-note");
const splitLastCol = document.getElementById("split-last-col");
const containsInput = document.getElementById("contains-input");
const containsResult = document.getElementById("contains-result");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");
const rangeResult = document.getElementById("range-result");
const rangeList = document.getElementById("range-list");

const SAMPLE = "192.168.10.77/26";
const VIEWS = ["split", "contains", "range"];
// Rendering more rows than this makes the table slow to scroll and nobody
// reads them; copying still includes up to COPY_LIMIT.
const RENDER_LIMIT = 256;
const COPY_LIMIT = 65536;

const state = {
  block: null,
  view: "split",
  splitPrefix: null,
};

/* --- Address parsing ------------------------------------------------------ */

const V4 = 32;
const V6 = 128;

function allOnes(width) {
  return (1n << BigInt(width)) - 1n;
}

function maskFor(width, prefix) {
  return allOnes(width) ^ allOnes(width - prefix);
}

// Strict dotted quad. Leading zeros are refused because inet_aton() reads
// `010` as octal 8 while most other parsers read it as decimal 10 — the same
// text means two different hosts, which is exactly what a calculator must not
// guess about.
function parseIPv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return { error: "An IPv4 address has four dot-separated parts" };
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return { error: `"${part}" is not an IPv4 octet` };
    if (part.length > 1 && part.startsWith("0")) {
      return { error: `"${part}" has a leading zero, which some parsers read as octal` };
    }
    const octet = Number(part);
    if (octet > 255) return { error: `${octet} is out of range — octets go up to 255` };
    value = (value << 8n) | BigInt(octet);
  }
  return { value };
}

function parseIPv6(text) {
  let body = text;
  let zone = null;
  const percent = body.indexOf("%");
  if (percent >= 0) {
    zone = body.slice(percent + 1);
    body = body.slice(0, percent);
  }

  // An embedded dotted quad (::ffff:192.0.2.1) supplies the last 32 bits;
  // rewrite it as the two hex groups it stands for.
  const lastColon = body.lastIndexOf(":");
  if (body.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4(body.slice(lastColon + 1));
    if (v4.error) return v4;
    const high = (v4.value >> 16n).toString(16);
    const low = (v4.value & 0xffffn).toString(16);
    body = `${body.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = body.split("::");
  if (halves.length > 2) return { error: '"::" can appear only once in an IPv6 address' };
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = [...head, ...rest];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return { error: `"${group}" is not an IPv6 group` };
  }
  if (halves.length === 1 && groups.length !== 8) {
    return { error: "An IPv6 address has eight groups, or fewer with ::" };
  }
  if (halves.length === 2 && groups.length > 7) {
    return { error: "Too many groups for an address that uses ::" };
  }

  const fill = Array(8 - groups.length).fill("0");
  const all = halves.length === 2 ? [...head, ...fill, ...rest] : groups;
  let value = 0n;
  for (const group of all) value = (value << 16n) | BigInt(parseInt(group, 16));
  return { value, zone };
}

function parseAddress(raw) {
  const text = raw.trim().replace(/^\[|\]$/g, "");
  if (!text) return { error: "Enter an address" };
  if (text.includes(":")) {
    const result = parseIPv6(text);
    return result.error ? result : { ...result, width: V6 };
  }
  const result = parseIPv4(text);
  return result.error ? result : { ...result, width: V4 };
}

// A dotted netmask must be contiguous ones followed by zeros; 255.0.255.0 is
// a valid ACL wildcard in some gear but not a subnet mask.
function prefixFromMask(value, width) {
  const ones = value.toString(2).padStart(width, "0");
  if (!/^1*0*$/.test(ones)) return null;
  return ones.indexOf("0") === -1 ? width : ones.indexOf("0");
}

// Accepts `addr/prefix`, `addr/netmask`, `addr netmask`, and a bare address,
// which is read as a single host (/32 or /128).
function parseBlock(raw) {
  const text = raw.trim();
  if (!text) return { empty: true };

  let addressText = text;
  let prefixText = null;
  const slash = text.indexOf("/");
  if (slash >= 0) {
    addressText = text.slice(0, slash).trim();
    prefixText = text.slice(slash + 1).trim();
  } else if (/\s/.test(text)) {
    [addressText, prefixText] = text.split(/\s+/, 2);
  }

  const address = parseAddress(addressText);
  if (address.error) return address;
  const { width } = address;

  let prefix = width;
  let assumed = prefixText === null;
  if (prefixText !== null) {
    if (/^\d{1,3}$/.test(prefixText)) {
      prefix = Number(prefixText);
      if (prefix > width) return { error: `/${prefix} is too long — ${width === V4 ? "IPv4" : "IPv6"} prefixes go up to /${width}` };
    } else if (width === V4 && prefixText.includes(".")) {
      const mask = parseIPv4(prefixText);
      if (mask.error) return { error: `Netmask: ${mask.error}` };
      prefix = prefixFromMask(mask.value, V4);
      if (prefix === null) return { error: `${prefixText} is not a contiguous netmask` };
    } else {
      return { error: `"${prefixText}" is not a prefix length${width === V4 ? " or netmask" : ""}` };
    }
  }

  return { ...address, prefix, assumed };
}

/* --- Formatting ----------------------------------------------------------- */

function formatIPv4(value) {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join(".");
}

function ipv6Groups(value) {
  const groups = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) groups.push(Number((value >> shift) & 0xffffn));
  return groups;
}

// RFC 5952: lower case, no leading zeros, and the longest run of two or more
// zero groups (the first, on a tie) collapsed to "::".
function formatIPv6(value) {
  // RFC 5952 §5: IPv4-mapped addresses keep the dotted quad.
  if (value >> 32n === 0xffffn) return `::ffff:${formatIPv4(value & 0xffffffffn)}`;
  const groups = ipv6Groups(value);
  let bestStart = -1;
  let bestLength = 1;
  for (let index = 0; index < 8; ) {
    if (groups[index] !== 0) { index += 1; continue; }
    let end = index;
    while (end < 8 && groups[end] === 0) end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }
  const hex = groups.map((group) => group.toString(16));
  if (bestStart < 0) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}

function expandIPv6(value) {
  return ipv6Groups(value).map((group) => group.toString(16).padStart(4, "0")).join(":");
}

function formatAddress(value, width) {
  return width === V4 ? formatIPv4(value) : formatIPv6(value);
}

function formatCidr(value, width, prefix) {
  return `${formatAddress(value, width)}/${prefix}`;
}

// Exact below a trillion, then scientific with the power of two, which is
// how people actually talk about IPv6 block sizes.
function formatCount(count, hostBits) {
  if (count < 1_000_000_000_000n) return count.toLocaleString("en-US");
  const digits = count.toString();
  return `${digits[0]}.${digits.slice(1, 3)}e${digits.length - 1} (2^${hostBits})`;
}

function plural(count, word) {
  return `${count.toLocaleString("en-US")} ${word}${count === 1n || count === 1 ? "" : "s"}`;
}

/* --- Classification ------------------------------------------------------- */

// IANA special-purpose registries (RFC 6890 and successors). The most specific
// entry that covers the block wins.
const SPECIAL_V4 = [
  ["0.0.0.0/8", "“This network” (RFC 791)"],
  ["10.0.0.0/8", "Private (RFC 1918)"],
  ["100.64.0.0/10", "Shared address space / CGNAT (RFC 6598)"],
  ["127.0.0.0/8", "Loopback (RFC 1122)"],
  ["169.254.0.0/16", "Link-local (RFC 3927)"],
  ["172.16.0.0/12", "Private (RFC 1918)"],
  ["192.0.0.0/24", "IETF protocol assignments (RFC 6890)"],
  ["192.0.2.0/24", "Documentation, TEST-NET-1 (RFC 5737)"],
  ["192.88.99.0/24", "Deprecated 6to4 relay anycast (RFC 7526)"],
  ["192.168.0.0/16", "Private (RFC 1918)"],
  ["198.18.0.0/15", "Benchmarking (RFC 2544)"],
  ["198.51.100.0/24", "Documentation, TEST-NET-2 (RFC 5737)"],
  ["203.0.113.0/24", "Documentation, TEST-NET-3 (RFC 5737)"],
  ["224.0.0.0/4", "Multicast (RFC 5771)"],
  ["240.0.0.0/4", "Reserved for future use (RFC 1112)"],
  ["255.255.255.255/32", "Limited broadcast (RFC 919)"],
];

const SPECIAL_V6 = [
  ["::/128", "Unspecified address (RFC 4291)"],
  ["::1/128", "Loopback (RFC 4291)"],
  ["::ffff:0:0/96", "IPv4-mapped (RFC 4291)"],
  ["64:ff9b::/96", "NAT64 well-known prefix (RFC 6052)"],
  ["64:ff9b:1::/48", "Local-use NAT64 (RFC 8215)"],
  ["100::/64", "Discard-only (RFC 6666)"],
  ["2001::/32", "Teredo (RFC 4380)"],
  ["2001:db8::/32", "Documentation (RFC 3849)"],
  ["2002::/16", "6to4 (RFC 3056)"],
  ["3fff::/20", "Documentation (RFC 9637)"],
  ["fc00::/7", "Unique local address, ULA (RFC 4193)"],
  ["fe80::/10", "Link-local unicast (RFC 4291)"],
  ["ff00::/8", "Multicast (RFC 4291)"],
  ["2000::/3", "Global unicast (RFC 4291)"],
];

const specialTables = new Map();
function specialTable(width) {
  if (!specialTables.has(width)) {
    const source = width === V4 ? SPECIAL_V4 : SPECIAL_V6;
    specialTables.set(width, source.map(([cidr, label]) => {
      const parsed = parseBlock(cidr);
      return { network: parsed.value, prefix: parsed.prefix, label };
    }));
  }
  return specialTables.get(width);
}

function classify(network, width, prefix) {
  let best = null;
  for (const entry of specialTable(width)) {
    if (entry.prefix > prefix) continue;
    if ((network & maskFor(width, entry.prefix)) !== entry.network) continue;
    if (!best || entry.prefix > best.prefix) best = entry;
  }
  if (best) return best.label;
  return width === V4 ? "Public, globally routable" : "Reserved by IETF";
}

function legacyClass(address) {
  const first = Number(address >> 24n);
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D (multicast)";
  return "E (reserved)";
}

/* --- Block arithmetic ----------------------------------------------------- */

function describeBlock({ value, width, prefix }) {
  const hostBits = width - prefix;
  const mask = maskFor(width, prefix);
  const hostMask = allOnes(hostBits);
  const network = value & mask;
  const last = network | hostMask;
  const total = 1n << BigInt(hostBits);

  // IPv4 reserves the network and broadcast addresses, except on /31
  // point-to-point links (RFC 3021) and /32 host routes. IPv6 has no
  // broadcast; every address is assignable, though the all-zeros one is the
  // subnet-router anycast.
  let first = network;
  let lastUsable = last;
  let usable = total;
  if (width === V4 && hostBits >= 2) {
    first = network + 1n;
    lastUsable = last - 1n;
    usable = total - 2n;
  }

  return { value, width, prefix, hostBits, mask, hostMask, network, last, total, first, lastUsable, usable };
}

// Largest aligned blocks, greedily, from start to end inclusive. Any range
// splits into at most 2 × width blocks this way.
function rangeToCidrs(start, end, width) {
  const blocks = [];
  let cursor = start;
  while (cursor <= end) {
    let hostBits = 0;
    while (hostBits < width) {
      const size = 1n << BigInt(hostBits + 1);
      if (cursor % size !== 0n || cursor + size - 1n > end) break;
      hostBits += 1;
    }
    blocks.push({ network: cursor, prefix: width - hostBits });
    cursor += 1n << BigInt(hostBits);
    if (cursor > allOnes(width)) break;
  }
  return blocks;
}

function reverseZone(block) {
  const { network, width, prefix } = block;
  if (width === V4) {
    const octets = formatIPv4(network).split(".");
    const whole = Math.floor(prefix / 8);
    return { name: `${octets.slice(0, whole).reverse().join(".")}${whole ? "." : ""}in-addr.arpa`, exact: prefix % 8 === 0 };
  }
  const nibbles = expandIPv6(network).replaceAll(":", "").split("");
  const whole = Math.floor(prefix / 4);
  return { name: `${nibbles.slice(0, whole).reverse().join(".")}${whole ? "." : ""}ip6.arpa`, exact: prefix % 4 === 0 };
}

function pointerName(value, width) {
  if (width === V4) return `${formatIPv4(value).split(".").reverse().join(".")}.in-addr.arpa`;
  return `${expandIPv6(value).replaceAll(":", "").split("").reverse().join(".")}.ip6.arpa`;
}

/* --- Rendering: details --------------------------------------------------- */

function detailRow(term, value, { copy = value, note = false, mono = true } = {}) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (note) dd.classList.add("is-note");
  if (copy) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `copy-value${mono ? " is-mono" : ""}`;
    button.dataset.copy = copy;
    button.dataset.label = term;
    button.title = `Copy ${term.toLowerCase()}`;
    button.textContent = value;
    dd.append(button);
  } else {
    dd.textContent = value;
  }
  details.append(dt, dd);
}

function renderDetails(block) {
  details.replaceChildren();
  const { width, prefix } = block;
  const fmt = (value) => formatAddress(value, width);
  const v4 = width === V4;

  detailRow("Address", fmt(block.value));
  detailRow("Network", formatCidr(block.network, width, prefix));
  if (v4) {
    detailRow("Netmask", formatIPv4(block.mask));
    detailRow("Wildcard", formatIPv4(block.hostMask));
    detailRow("Broadcast", block.hostBits >= 2 ? formatIPv4(block.last) : "None", { copy: block.hostBits >= 2 ? formatIPv4(block.last) : null });
  } else {
    detailRow("Expanded", expandIPv6(block.value));
    detailRow("Last address", fmt(block.last));
  }
  detailRow("Usable range", `${fmt(block.first)} – ${fmt(block.lastUsable)}`, { copy: `${fmt(block.first)}-${fmt(block.lastUsable)}` });
  detailRow(v4 ? "Usable hosts" : "Addresses", formatCount(block.usable, block.hostBits), { copy: block.usable.toString(), mono: false });
  if (v4) detailRow("Total addresses", formatCount(block.total, block.hostBits), { copy: block.total.toString(), mono: false });
  if (v4 && block.hostBits === 1) detailRow("Note", "/31 point-to-point link — both addresses are usable (RFC 3021)", { copy: null, note: true });
  if (!v4 && prefix < 64) detailRow("/64 subnets", formatCount(1n << BigInt(64 - prefix), 64 - prefix), { copy: (1n << BigInt(64 - prefix)).toString(), mono: false });
  if (!v4 && prefix > 64 && prefix < 127) detailRow("Note", "Longer than /64 — SLAAC and many IPv6 features expect a /64 LAN", { copy: null, note: true });

  detailRow("Type", classify(block.network, width, prefix), { copy: null, mono: false });
  if (v4) detailRow("Class", legacyClass(block.value), { copy: null, mono: false });

  if (v4) {
    detailRow("Integer", block.value.toString());
    detailRow("Hex", `0x${block.value.toString(16).toUpperCase().padStart(8, "0")}`);
    detailRow("IPv4-mapped IPv6", `::ffff:${formatIPv4(block.value)}`);
  } else {
    detailRow("Hex", `0x${block.value.toString(16).padStart(32, "0")}`);
  }

  const zone = reverseZone(block);
  detailRow("Reverse zone", zone.name, { copy: zone.name });
  if (!zone.exact) detailRow("Note", `/${prefix} is not on a ${v4 ? "8" : "4"}-bit boundary, so its reverse zone needs RFC 2317-style delegation`, { copy: null, note: true });
  detailRow("PTR name", pointerName(block.value, width));

  const size = block.total;
  const top = allOnes(width);
  const links = [];
  if (block.network >= size) links.push(["Previous block", formatCidr(block.network - size, width, prefix)]);
  if (block.last < top) links.push(["Next block", formatCidr(block.last + 1n, width, prefix)]);
  for (const [term, value] of links) detailRow(term, value);
}

// One cell per bit, network bits and host bits coloured apart, grouped in
// octets (IPv4) or 16-bit groups (IPv6) so the prefix boundary is visible.
function renderBits(block) {
  bitsView.replaceChildren();
  const { width, prefix } = block;
  const binary = block.value.toString(2).padStart(width, "0");
  const groupSize = width === V4 ? 8 : 16;

  for (let start = 0; start < width; start += groupSize) {
    const group = document.createElement("span");
    group.className = "bit-group";
    for (let index = start; index < start + groupSize; index += 1) {
      const bit = document.createElement("span");
      bit.className = `bit ${index < prefix ? "is-net" : "is-host"}`;
      bit.textContent = binary[index];
      group.append(bit);
    }
    bitsView.append(group);
  }
  bitsView.setAttribute("aria-label", `Binary: ${prefix} network bits, ${width - prefix} host bits`);
}

/* --- Rendering: split ----------------------------------------------------- */

function smallestPrefixForHosts(hosts, width) {
  // IPv4 subnets lose two addresses to network and broadcast. A /31 would
  // fit two hosts too, but only on point-to-point links, so it is not offered.
  const needed = width === V4 && hosts >= 2n ? hosts + 2n : hosts;
  let hostBits = 0;
  while ((1n << BigInt(hostBits)) < needed) hostBits += 1;
  return width - hostBits;
}

function subnetRows(block, newPrefix, limit) {
  const rows = [];
  const step = 1n << BigInt(block.width - newPrefix);
  const count = 1n << BigInt(newPrefix - block.prefix);
  const shown = count < BigInt(limit) ? count : BigInt(limit);
  for (let index = 0n; index < shown; index += 1n) {
    rows.push(describeBlock({ value: block.network + index * step, width: block.width, prefix: newPrefix }));
  }
  return { rows, count };
}

function renderSplit() {
  const block = state.block;
  splitBody.replaceChildren();
  splitNote.hidden = true;
  if (!block) {
    splitSummary.textContent = "Enter a block above to split it.";
    return;
  }

  const { width, prefix } = block;
  splitLastCol.textContent = width === V4 ? "Broadcast" : "Last address";
  splitPrefix.min = String(Math.min(prefix + 1, width));
  splitPrefix.max = String(width);
  if (prefix >= width) {
    splitSummary.textContent = "A single address cannot be split.";
    return;
  }

  let target = state.splitPrefix;
  if (target === null || target <= prefix || target > width) {
    // A sensible default: /24s out of anything bigger for IPv4, /64s for IPv6,
    // otherwise halve it.
    const conventional = width === V4 ? 24 : 64;
    target = prefix < conventional ? conventional : prefix + 1;
    state.splitPrefix = target;
  }
  if (document.activeElement !== splitPrefix) splitPrefix.value = String(target);

  const { rows, count } = subnetRows(block, target, RENDER_LIMIT);
  const each = describeBlock({ value: block.network, width, prefix: target });
  const hostsWord = width === V4 ? "usable hosts" : "addresses";
  splitSummary.textContent = `${formatCount(count, target - prefix)} × /${target} — ${formatCount(each.usable, each.hostBits)} ${hostsWord} each`;

  const fmt = (value) => formatAddress(value, width);
  for (const [index, row] of rows.entries()) {
    const tr = document.createElement("tr");
    const cells = [
      String(index + 1),
      formatCidr(row.network, width, row.prefix),
      `${fmt(row.first)} – ${fmt(row.lastUsable)}`,
      width === V4 ? (row.hostBits >= 2 ? fmt(row.last) : "—") : fmt(row.last),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    splitBody.append(tr);
  }
  if (count > BigInt(rows.length)) {
    splitNote.hidden = false;
    splitNote.textContent = `Showing the first ${rows.length.toLocaleString("en-US")} of ${formatCount(count, target - prefix)} subnets.`;
  }
}

function splitAsText() {
  const block = state.block;
  if (!block || state.splitPrefix === null || state.splitPrefix <= block.prefix) return "";
  const { rows } = subnetRows(block, state.splitPrefix, COPY_LIMIT);
  return rows.map((row) => formatCidr(row.network, block.width, row.prefix)).join("\n");
}

/* --- Rendering: contains -------------------------------------------------- */

function setResult(element, message, kind) {
  element.textContent = message;
  element.className = `result-line${kind ? ` is-${kind}` : ""}`;
}

function renderContains() {
  const block = state.block;
  const text = containsInput.value.trim();
  if (!text) {
    setResult(containsResult, block ? `Check whether an address falls inside ${formatCidr(block.network, block.width, block.prefix)}.` : "Enter a block above first.", "");
    return;
  }
  if (!block) {
    setResult(containsResult, "Enter a block above first.", "");
    return;
  }
  const probe = parseBlock(text);
  if (probe.error) {
    setResult(containsResult, probe.error, "error");
    return;
  }
  if (probe.width !== block.width) {
    setResult(containsResult, `That is an ${probe.width === V4 ? "IPv4" : "IPv6"} address; the block is ${block.width === V4 ? "IPv4" : "IPv6"}.`, "error");
    return;
  }

  const probeBlock = describeBlock(probe);
  const cidr = formatCidr(block.network, block.width, block.prefix);
  const inside = probeBlock.network >= block.network && probeBlock.last <= block.last;
  const label = probe.assumed ? formatAddress(probe.value, probe.width) : formatCidr(probeBlock.network, probe.width, probe.prefix);
  if (!inside) {
    const overlaps = probeBlock.network <= block.last && probeBlock.last >= block.network;
    setResult(containsResult, overlaps ? `${label} overlaps ${cidr} but is not inside it.` : `${label} is outside ${cidr}.`, overlaps ? "warning" : "error");
    return;
  }
  if (probe.assumed) {
    const offset = probe.value - block.network;
    let role = "";
    if (block.width === V4 && block.hostBits >= 2 && probe.value === block.network) role = " — it is the network address, not assignable to a host";
    else if (block.width === V4 && block.hostBits >= 2 && probe.value === block.last) role = " — it is the broadcast address, not assignable to a host";
    setResult(containsResult, `${label} is inside ${cidr}, address #${offset.toLocaleString("en-US")} of the block${role}.`, role ? "warning" : "success");
    return;
  }
  setResult(containsResult, `${label} is a subnet of ${cidr}.`, "success");
}

/* --- Rendering: range ----------------------------------------------------- */

function renderRange() {
  rangeList.replaceChildren();
  const startText = rangeStart.value.trim();
  const endText = rangeEnd.value.trim();
  if (!startText || !endText) {
    setResult(rangeResult, "Enter a first and last address to get the smallest set of CIDR blocks that covers them exactly.", "");
    return;
  }
  const start = parseAddress(startText);
  const end = parseAddress(endText);
  if (start.error || end.error) {
    setResult(rangeResult, start.error ? `First address: ${start.error}` : `Last address: ${end.error}`, "error");
    return;
  }
  if (start.width !== end.width) {
    setResult(rangeResult, "Both ends must be the same address family.", "error");
    return;
  }
  const [low, high] = start.value <= end.value ? [start.value, end.value] : [end.value, start.value];
  const blocks = rangeToCidrs(low, high, start.width);
  const total = high - low + 1n;
  const swapped = start.value > end.value ? " (ends swapped)" : "";
  setResult(rangeResult, `${plural(blocks.length, "block")} covering ${formatCount(total, start.width)} ${total === 1n ? "address" : "addresses"}${swapped}.`, blocks.length === 1 ? "success" : "");

  for (const block of blocks) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cidr-chip";
    button.textContent = formatCidr(block.network, start.width, block.prefix);
    button.title = "Open this block in the calculator";
    li.append(button);
    rangeList.append(li);
  }
}

function rangeAsText() {
  return [...rangeList.querySelectorAll(".cidr-chip")].map((chip) => chip.textContent).join("\n");
}

/* --- Main render ---------------------------------------------------------- */

function setStatus(message, kind) {
  statusText.textContent = message;
  statusBar.className = `status-bar${kind ? ` is-${kind}` : ""}`;
}

function run() {
  const parsed = parseBlock(cidrInput.value);
  cidrInput.classList.toggle("is-invalid", Boolean(parsed.error));

  if (parsed.empty || parsed.error) {
    state.block = null;
    details.replaceChildren();
    bitsView.replaceChildren();
    setStatus(parsed.error || "Enter an IPv4 or IPv6 block, e.g. 10.0.0.0/16 or 2001:db8::/48", parsed.error ? "error" : "");
  } else {
    const block = describeBlock(parsed);
    state.block = block;
    renderDetails(block);
    renderBits(block);
    const family = block.width === V4 ? "IPv4" : "IPv6";
    const cidr = formatCidr(block.network, block.width, block.prefix);
    if (parsed.assumed) {
      setStatus(`${family} host address — no prefix given, so it is read as /${block.width}. Add one, e.g. /24.`, "warning");
    } else if (block.network !== block.value) {
      setStatus(`${family} · host bits set — the network is ${cidr}`, "warning");
    } else {
      setStatus(`${family} · valid network ${cidr}`, "success");
    }
  }

  renderSplit();
  renderContains();
}

/* --- Views ---------------------------------------------------------------- */

function applyView(view) {
  state.view = VIEWS.includes(view) ? view : "split";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== state.view;
  });
}

/* --- Actions -------------------------------------------------------------- */

function copy(value, label) {
  if (!value) {
    window.DevToolsMain.showToast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => window.DevToolsMain.showToast(`${label} copied`, "success"))
    .catch(() => window.DevToolsMain.showToast("Copy failed", "error"));
}

const ACTIONS = {
  sample() {
    cidrInput.value = SAMPLE;
    state.splitPrefix = null;
    run();
    window.DevToolsMain.showToast("Sample inserted", "info");
  },
  clear() {
    cidrInput.value = "";
    state.splitPrefix = null;
    run();
    cidrInput.focus();
  },
  "copy-cidr"() {
    const block = state.block;
    copy(block ? formatCidr(block.network, block.width, block.prefix) : "", "Network");
  },
  "copy-split"() {
    copy(splitAsText(), "Subnets");
  },
  "copy-range"() {
    copy(rangeAsText(), "CIDR blocks");
  },
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    ACTIONS[action.dataset.action]?.();
    return;
  }
  const value = event.target.closest(".copy-value");
  if (value) {
    copy(value.dataset.copy, value.dataset.label);
    return;
  }
  const chip = event.target.closest(".cidr-chip");
  if (chip) {
    cidrInput.value = chip.textContent;
    state.splitPrefix = null;
    run();
    window.DevToolsMain.showToast(`Opened ${chip.textContent}`, "info");
  }
});

cidrInput.addEventListener("input", () => {
  state.splitPrefix = null;
  run();
});

splitPrefix.addEventListener("input", () => {
  const value = Number(splitPrefix.value.replace(/^\//, ""));
  if (!Number.isInteger(value) || !state.block) return;
  if (value <= state.block.prefix || value > state.block.width) return;
  state.splitPrefix = value;
  splitHosts.value = "";
  renderSplit();
});

splitHosts.addEventListener("input", () => {
  if (!state.block || !/^\d+$/.test(splitHosts.value.trim())) return;
  const hosts = BigInt(splitHosts.value.trim());
  if (hosts < 1n) return;
  const target = smallestPrefixForHosts(hosts, state.block.width);
  if (target <= state.block.prefix) {
    splitSummary.textContent = `${hosts.toLocaleString("en-US")} hosts do not fit in a smaller subnet of this block.`;
    splitBody.replaceChildren();
    return;
  }
  state.splitPrefix = target;
  splitPrefix.value = String(target);
  renderSplit();
});

containsInput.addEventListener("input", renderContains);
rangeStart.addEventListener("input", renderRange);
rangeEnd.addEventListener("input", renderRange);

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === state.view) return;
    applyView(button.dataset.view);
    window.DevToolsMain.writeHashState(state.view);
  });
});

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState((value) => applyView(value));

applyView(window.DevToolsMain.readHashState());
// Seed the block so the tool explains itself on arrival.
cidrInput.value = SAMPLE;
rangeStart.value = "10.0.0.5";
rangeEnd.value = "10.0.0.20";
run();
renderRange();
