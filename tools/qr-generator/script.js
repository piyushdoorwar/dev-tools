const qrSize = 260;

const elements = {
  toastContainer: document.getElementById("toast-container"),
  qrContainer: document.getElementById("qr-preview"),
  qrFrame: document.getElementById("qr-frame"),
  frameLabel: document.getElementById("frameLabel"),
  emptyState: document.getElementById("qr-empty"),
  statusPill: document.getElementById("qr-status"),
  meta: document.getElementById("qr-meta"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  designModal: document.getElementById("designModal"),
  designModalClose: document.getElementById("designModalClose"),
  infoBtn: document.getElementById("infoBtn"),
  tipsModal: document.getElementById("tipsModal"),
  tipsModalClose: document.getElementById("tipsModalClose"),
  frameText: document.getElementById("frameText"),
  frameColor: document.getElementById("frameColor"),
  frameColorText: document.getElementById("frameColorText"),
  dotColor: document.getElementById("dotColor"),
  dotColorText: document.getElementById("dotColorText"),
  bgColor: document.getElementById("bgColor"),
  bgColorText: document.getElementById("bgColorText"),
  textMessage: document.getElementById("textMessage"),
  websiteUrl: document.getElementById("websiteUrl"),
  emailAddress: document.getElementById("emailAddress"),
  phoneCode: document.getElementById("phoneCode"),
  phoneNumber: document.getElementById("phoneNumber"),
  waCode: document.getElementById("waCode"),
  waNumber: document.getElementById("waNumber"),
  wifiSsid: document.getElementById("wifiSsid"),
  wifiPassword: document.getElementById("wifiPassword"),
  wifiSecurity: document.getElementById("wifiSecurity"),
  wifiHidden: document.getElementById("wifiHidden"),
  upiId: document.getElementById("upiId"),
  upiName: document.getElementById("upiName"),
  upiAmount: document.getElementById("upiAmount"),
  upiNote: document.getElementById("upiNote"),
  contactPrefix: document.getElementById("contactPrefix"),
  contactFirstName: document.getElementById("contactFirstName"),
  contactMiddleName: document.getElementById("contactMiddleName"),
  contactLastName: document.getElementById("contactLastName"),
  contactNickname: document.getElementById("contactNickname"),
  contactCompany: document.getElementById("contactCompany"),
  contactJobTitle: document.getElementById("contactJobTitle"),
  contactDepartment: document.getElementById("contactDepartment"),
  contactEmail: document.getElementById("contactEmail"),
  contactEmailAlt: document.getElementById("contactEmailAlt"),
  contactBirthday: document.getElementById("contactBirthday"),
  contactPhoneCode: document.getElementById("contactPhoneCode"),
  contactPhoneNumber: document.getElementById("contactPhoneNumber"),
  contactPhoneLabel: document.getElementById("contactPhoneLabel"),
  contactAltPhoneCode1: document.getElementById("contactAltPhoneCode1"),
  contactAltPhoneNumber1: document.getElementById("contactAltPhoneNumber1"),
  contactAltPhoneLabel1: document.getElementById("contactAltPhoneLabel1"),
  addContactPhoneBtn: document.getElementById("addContactPhoneBtn"),
  removeContactPhoneBtn: document.getElementById("removeContactPhoneBtn"),
  contactExtraPhoneBlock: document.getElementById("contactExtraPhoneBlock"),
  contactAddressLine1: document.getElementById("contactAddressLine1"),
  contactAddressLine2: document.getElementById("contactAddressLine2"),
  contactAddressCity: document.getElementById("contactAddressCity"),
  contactAddressRegion: document.getElementById("contactAddressRegion"),
  contactAddressPostal: document.getElementById("contactAddressPostal"),
  contactAddressCountry: document.getElementById("contactAddressCountry"),
  addContactAddressBtn: document.getElementById("addContactAddressBtn"),
  removeContactAddressBtn: document.getElementById("removeContactAddressBtn"),
  contactAddressBlock: document.getElementById("contactAddressBlock"),
  phoneFlag: document.getElementById("phoneFlag"),
  waFlag: document.getElementById("waFlag"),
  contactPhoneFlag: document.getElementById("contactPhoneFlag"),
  contactAltPhoneFlag1: document.getElementById("contactAltPhoneFlag1")
};

const defaultState = {
  contentType: "text",
  frame: "soft",
  shape: "rounded",
  level: "Q",
  dotColor: "#1f1530",
  bgColor: "#ffffff",
  frameColor: "#ffffff",
  frameText: "Scan me",
  logo: null
};

const state = { ...defaultState };
let isSyncingHash = false;

const logoLibrary = {
  phone: "assets/phone.svg",
  email: "assets/email.svg",
  contact: "assets/contact.svg",
  link: "assets/link.svg",
  whatsapp: "assets/whatsapp.svg",
  wifi: "assets/wifi.svg",
  upi: "assets/upi.svg"
};

const framePresets = {
  none: { pad: 0, radius: 0, stroke: "none", strokeWidth: 0, label: false },
  soft: { pad: 18, radius: 22, stroke: "#e7e2f2", strokeWidth: 1, label: false },
  badge: { pad: 18, radius: 22, stroke: "#e7e2f2", strokeWidth: 1, label: true, labelHeight: 36, labelGap: 10, labelRadius: 999 },
  ticket: { pad: 20, radius: 20, stroke: "#dcd6eb", strokeWidth: 2, label: true, labelHeight: 40, labelGap: 12, labelRadius: 12, dash: "6 6" }
};

const shapeMap = {
  rounded: { dots: "rounded", cornersSquare: "extra-rounded", cornersDot: "dot" },
  square: { dots: "square", cornersSquare: "square", cornersDot: "square" },
  dots: { dots: "dots", cornersSquare: "dot", cornersDot: "dot" },
  classy: { dots: "classy", cornersSquare: "extra-rounded", cornersDot: "dot" },
  "classy-rounded": { dots: "classy-rounded", cornersSquare: "extra-rounded", cornersDot: "dot" },
  "extra-rounded": { dots: "extra-rounded", cornersSquare: "extra-rounded", cornersDot: "dot" }
};

let qrCode;

function showToast(message, type = "success") {
  if (!elements.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function setStatus(message, tone) {
  elements.statusPill.textContent = message;
  elements.statusPill.classList.toggle("is-warning", tone === "warning");
}

function setActionsEnabled(enabled) {
  elements.copyBtn.disabled = !enabled;
  elements.downloadBtn.disabled = !enabled;
}

function setActive(elementsList, activeEl) {
  elementsList.forEach((el) => el.classList.remove("active"));
  if (activeEl) activeEl.classList.add("active");
}

function updateContentForm() {
  document.querySelectorAll("[data-content-form]").forEach((form) => {
    const isActive = form.dataset.contentForm === state.contentType;
    form.hidden = !isActive;
    form.classList.toggle("is-active", isActive);
    form.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
}

function updateDesignTabs(tab) {
  document.querySelectorAll("[data-design-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.designTab === tab);
  });
  document.querySelectorAll("[data-design-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.designPanel === tab);
  });
}

function setRouteHash(contentType) {
  if (isSyncingHash) return;
  const hashValue = `#${contentType}`;
  if (window.location.hash === hashValue) return;
  isSyncingHash = true;
  window.location.hash = hashValue;
  setTimeout(() => {
    isSyncingHash = false;
  }, 0);
}

function applyContentType(contentType) {
  state.contentType = contentType;
  const activeBtn = document.querySelector(`[data-content-type='${contentType}']`);
  setActive(document.querySelectorAll("[data-content-type]"), activeBtn);
  updateContentForm();
  updateQrCode();
}

function applyContentTypeFromHash() {
  const raw = window.location.hash.replace("#", "").trim();
  if (!raw) return;
  const target = document.querySelector(`[data-content-type='${raw}']`);
  if (!target) return;
  applyContentType(raw);
}

function openDesignModal() {
  if (!elements.designModal) return;
  elements.designModal.classList.add("is-open");
  elements.designModal.setAttribute("aria-hidden", "false");
}

function closeDesignModal() {
  if (!elements.designModal) return;
  elements.designModal.classList.remove("is-open");
  elements.designModal.setAttribute("aria-hidden", "true");
}

function openTipsModal() {
  if (!elements.tipsModal) return;
  elements.tipsModal.classList.add("is-open");
  elements.tipsModal.setAttribute("aria-hidden", "false");
}

function closeTipsModal() {
  if (!elements.tipsModal) return;
  elements.tipsModal.classList.remove("is-open");
  elements.tipsModal.setAttribute("aria-hidden", "true");
}

function normalizeHex(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return null;
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  return `#${full.toLowerCase()}`;
}

function bindColorPair(colorInput, textInput, callback) {
  const applyColor = (value) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    colorInput.value = hex;
    textInput.value = hex;
    callback(hex);
  };

  colorInput.addEventListener("input", (event) => {
    applyColor(event.target.value);
  });

  textInput.addEventListener("input", (event) => {
    const hex = normalizeHex(event.target.value);
    if (!hex) return;
    colorInput.value = hex;
    textInput.value = hex;
    callback(hex);
  });

  textInput.addEventListener("blur", () => {
    textInput.value = colorInput.value;
  });
}

function normalizeUrl(value) {
  if (!value) return "";
  let trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    return new URL(trimmed).toString();
  } catch {
    return "";
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePhone(code, number) {
  const combined = `${code || ""}${number || ""}`;
  const digits = combined.replace(/\D/g, "");
  return digits;
}

function normalizePhoneWithNumber(code, number) {
  const numberDigits = (number || "").replace(/\D/g, "");
  if (!numberDigits) return "";
  const codeDigits = (code || "").replace(/\D/g, "");
  return `${codeDigits}${numberDigits}`;
}

const dialCodeCache = new Map();
let dialCodeLoadPromise = null;
const dialCodeTimers = new Map();
const flagRenderTokens = new Map();
const regionDisplayNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function normalizeDialCode(value) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length > 5) return "";
  return digits;
}

function setFlagImage(imgEl, flagUrl, iso2) {
  if (!imgEl) return;
  const slot = imgEl.closest(".flag-slot");
  if (!slot) return;
  if (!flagUrl) {
    const previousUrl = imgEl.dataset.objectUrl;
    if (previousUrl && previousUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previousUrl);
    }
    imgEl.removeAttribute("src");
    imgEl.dataset.objectUrl = "";
    imgEl.alt = "";
    slot.classList.remove("is-visible");
    return;
  }
  if (iso2 && regionDisplayNames) {
    const regionLabel = regionDisplayNames.of(iso2.toUpperCase());
    imgEl.alt = regionLabel ? `${regionLabel} flag` : "Country flag";
  } else {
    imgEl.alt = "Country flag";
  }
  const nextToken = (flagRenderTokens.get(imgEl) || 0) + 1;
  flagRenderTokens.set(imgEl, nextToken);

  resolveFlagSource(flagUrl)
    .then((src) => {
      if (flagRenderTokens.get(imgEl) !== nextToken) {
        if (src && src.startsWith("blob:")) {
          URL.revokeObjectURL(src);
        }
        return;
      }
      const previousUrl = imgEl.dataset.objectUrl;
      if (previousUrl && previousUrl.startsWith("blob:") && previousUrl !== src) {
        URL.revokeObjectURL(previousUrl);
      }
      imgEl.src = src || flagUrl;
      imgEl.dataset.objectUrl = src && src.startsWith("blob:") ? src : "";
      slot.classList.add("is-visible");
    })
    .catch(() => {
      if (flagRenderTokens.get(imgEl) !== nextToken) return;
      imgEl.src = flagUrl;
      imgEl.dataset.objectUrl = "";
      slot.classList.add("is-visible");
    });
}

async function resolveFlagSource(flagUrl) {
  if (!flagUrl) return "";
  if (!("caches" in window)) return flagUrl;
  try {
    const cache = await caches.open("qr-flag-cache-v1");
    const cached = await cache.match(flagUrl);
    if (cached) {
      const blob = await cached.blob();
      return URL.createObjectURL(blob);
    }
    const response = await fetch(flagUrl, { mode: "cors" });
    if (!response.ok) return flagUrl;
    await cache.put(flagUrl, response.clone());
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return flagUrl;
  }
}

function buildDialCodeCache(countries) {
  countries.forEach((country) => {
    if (!country || !country.idd || !country.flags) return;
    const root = typeof country.idd.root === "string" ? country.idd.root : "";
    const suffixes = Array.isArray(country.idd.suffixes) ? country.idd.suffixes : [];
    const flagUrl = country.flags.svg || country.flags.png || "";
    const iso2 = country.cca2 || "";
    const rootDigits = root.replace(/\D/g, "");
    if (!rootDigits || !flagUrl) return;

    if (suffixes.length === 0) {
      if (!dialCodeCache.has(rootDigits)) {
        dialCodeCache.set(rootDigits, { flagUrl, iso2 });
      }
      return;
    }

    suffixes.forEach((suffix) => {
      const suffixDigits = typeof suffix === "string" ? suffix.replace(/\D/g, "") : "";
      const fullCode = `${rootDigits}${suffixDigits}`;
      if (!fullCode) return;
      if (!dialCodeCache.has(fullCode)) {
        dialCodeCache.set(fullCode, { flagUrl, iso2 });
      }
    });
  });
}

async function ensureDialCodeCache() {
  if (dialCodeLoadPromise) return dialCodeLoadPromise;
  dialCodeLoadPromise = fetch("https://restcountries.com/v3.1/all?fields=idd,flags,cca2")
    .then((response) => {
      if (!response.ok) return [];
      return response.json();
    })
    .then((data) => {
      if (Array.isArray(data)) {
        buildDialCodeCache(data);
      }
      return dialCodeCache;
    })
    .catch(() => dialCodeCache);
  return dialCodeLoadPromise;
}

function updateFlagForCodeInput(inputEl, imgEl) {
  if (!inputEl || !imgEl) return;
  const code = normalizeDialCode(inputEl.value);
  if (!code) {
    setFlagImage(imgEl, "");
    return;
  }
  ensureDialCodeCache().then((cache) => {
    if (normalizeDialCode(inputEl.value) !== code) return;
    const cached = cache.get(code);
    if (!cached) {
      setFlagImage(imgEl, "");
      return;
    }
    setFlagImage(imgEl, cached.flagUrl, cached.iso2);
  });
}

function scheduleFlagUpdate(inputEl, imgEl) {
  if (!inputEl || !imgEl) return;
  const key = imgEl.id || inputEl.id;
  if (dialCodeTimers.has(key)) {
    clearTimeout(dialCodeTimers.get(key));
  }
  const timer = setTimeout(() => {
    dialCodeTimers.delete(key);
    updateFlagForCodeInput(inputEl, imgEl);
  }, 250);
  dialCodeTimers.set(key, timer);
}

function bindDialCodeFlag(inputEl, imgEl) {
  if (!inputEl || !imgEl) return;
  const handler = () => scheduleFlagUpdate(inputEl, imgEl);
  inputEl.addEventListener("input", handler);
  inputEl.addEventListener("blur", handler);
  scheduleFlagUpdate(inputEl, imgEl);
}

function normalizeAmount(value) {
  if (!value) return "";
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return parsed.toFixed(2);
}

function escapeWifiValue(value) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function escapeVCardValue(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatVCardType(label, fallback = "OTHER") {
  const raw = (label || "").trim();
  if (!raw) return fallback;
  const upper = raw.toUpperCase();
  const aliasMap = new Map([
    ["MOBILE", "CELL"],
    ["MOB", "CELL"],
    ["CELL", "CELL"],
    ["PHONE", "VOICE"],
    ["VOICE", "VOICE"],
    ["WORK", "WORK"],
    ["HOME", "HOME"],
    ["MAIN", "MAIN"],
    ["OTHER", "OTHER"],
    ["FAX", "FAX"]
  ]);
  if (aliasMap.has(upper)) {
    return aliasMap.get(upper);
  }
  const cleaned = upper.replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!cleaned) return fallback;
  const allowed = new Set(["HOME", "WORK", "CELL", "OTHER", "MAIN", "FAX", "VOICE"]);
  if (allowed.has(cleaned)) return cleaned;
  return `X-${cleaned}`;
}

function updateWifiPasswordState() {
  if (!elements.wifiSecurity || !elements.wifiPassword) return;
  const isOpen = elements.wifiSecurity.value === "nopass";
  elements.wifiPassword.disabled = isOpen;
  if (isOpen) {
    elements.wifiPassword.value = "";
  }
}

function setContactExtraVisible(visible) {
  if (!elements.contactExtraPhoneBlock) return;
  elements.contactExtraPhoneBlock.hidden = !visible;
  if (elements.addContactPhoneBtn) {
    elements.addContactPhoneBtn.hidden = visible;
  }
  if (elements.removeContactPhoneBtn) {
    elements.removeContactPhoneBtn.hidden = !visible;
  }
  if (!visible) {
    if (elements.contactAltPhoneCode1) elements.contactAltPhoneCode1.value = "+1";
    if (elements.contactAltPhoneNumber1) elements.contactAltPhoneNumber1.value = "";
    if (elements.contactAltPhoneLabel1) elements.contactAltPhoneLabel1.value = "";
    scheduleFlagUpdate(elements.contactAltPhoneCode1, elements.contactAltPhoneFlag1);
  } else {
    scheduleFlagUpdate(elements.contactAltPhoneCode1, elements.contactAltPhoneFlag1);
  }
}

function setContactAddressVisible(visible) {
  if (!elements.contactAddressBlock) return;
  elements.contactAddressBlock.hidden = !visible;
  if (elements.addContactAddressBtn) {
    elements.addContactAddressBtn.hidden = visible;
  }
  if (elements.removeContactAddressBtn) {
    elements.removeContactAddressBtn.hidden = !visible;
  }
  if (!visible) {
    if (elements.contactAddressLine1) elements.contactAddressLine1.value = "";
    if (elements.contactAddressLine2) elements.contactAddressLine2.value = "";
    if (elements.contactAddressCity) elements.contactAddressCity.value = "";
    if (elements.contactAddressRegion) elements.contactAddressRegion.value = "";
    if (elements.contactAddressPostal) elements.contactAddressPostal.value = "";
    if (elements.contactAddressCountry) elements.contactAddressCountry.value = "";
  }
}

function buildQrData() {
  switch (state.contentType) {
    case "text":
      return elements.textMessage.value.trim();
    case "website": {
      const url = normalizeUrl(elements.websiteUrl.value);
      if (!url) return "";
      return url;
    }
    case "email": {
      const address = elements.emailAddress.value.trim();
      if (!isValidEmail(address)) return "";
      return `mailto:${address}`;
    }
    case "phone": {
      const digits = normalizePhone(elements.phoneCode.value, elements.phoneNumber.value);
      if (!digits) return "";
      return `tel:+${digits}`;
    }
    case "whatsapp": {
      const digits = normalizePhone(elements.waCode.value, elements.waNumber.value);
      if (!digits) return "";
      return `https://wa.me/${digits}`;
    }
    case "wifi": {
      const ssid = elements.wifiSsid.value.trim();
      const security = elements.wifiSecurity.value;
      const password = elements.wifiPassword.value;
      const hidden = elements.wifiHidden.checked;

      if (!ssid) return "";
      if (security !== "nopass" && !password) return "";

      const parts = [
        `T:${security}`,
        `S:${escapeWifiValue(ssid)}`
      ];

      if (security !== "nopass") {
        parts.push(`P:${escapeWifiValue(password)}`);
      }

      if (hidden) {
        parts.push("H:true");
      }

      return `WIFI:${parts.join(";")};;`;
    }
    case "upi": {
      const upiId = elements.upiId.value.trim();
      if (!upiId) return "";
      const name = elements.upiName.value.trim();
      const amount = normalizeAmount(elements.upiAmount.value);
      const note = elements.upiNote.value.trim();
      const params = [];
      params.push(`pa=${encodeURIComponent(upiId)}`);
      params.push("cu=INR");
      if (name) params.push(`pn=${encodeURIComponent(name)}`);
      if (amount) params.push(`am=${encodeURIComponent(amount)}`);
      if (note) params.push(`tn=${encodeURIComponent(note)}`);
      return `upi://pay?${params.join("&")}`;
    }
    case "contact": {
      const prefix = elements.contactPrefix.value.trim();
      const first = elements.contactFirstName.value.trim();
      const middle = elements.contactMiddleName.value.trim();
      const last = elements.contactLastName.value.trim();
      const nickname = elements.contactNickname.value.trim();
      const company = elements.contactCompany.value.trim();
      const jobTitle = elements.contactJobTitle.value.trim();
      const department = elements.contactDepartment.value.trim();
      const email = elements.contactEmail.value.trim();
      const altEmail = elements.contactEmailAlt.value.trim();
      const birthday = elements.contactBirthday.value.trim();
      const phoneDigits = normalizePhoneWithNumber(elements.contactPhoneCode.value, elements.contactPhoneNumber.value);
      const isExtraVisible = elements.contactExtraPhoneBlock && !elements.contactExtraPhoneBlock.hidden;
      const altPhoneDigits1 = isExtraVisible
        ? normalizePhoneWithNumber(elements.contactAltPhoneCode1.value, elements.contactAltPhoneNumber1.value)
        : "";
      const isAddressVisible = elements.contactAddressBlock && !elements.contactAddressBlock.hidden;
      const addressLine1 = isAddressVisible ? elements.contactAddressLine1.value.trim() : "";
      const addressLine2 = isAddressVisible ? elements.contactAddressLine2.value.trim() : "";
      const addressCity = isAddressVisible ? elements.contactAddressCity.value.trim() : "";
      const addressRegion = isAddressVisible ? elements.contactAddressRegion.value.trim() : "";
      const addressPostal = isAddressVisible ? elements.contactAddressPostal.value.trim() : "";
      const addressCountry = isAddressVisible ? elements.contactAddressCountry.value.trim() : "";
      const validEmail = isValidEmail(email) ? email : "";
      const validAltEmail = isValidEmail(altEmail) ? altEmail : "";
      const hasAddress = Boolean(
        isAddressVisible && (addressLine1 || addressLine2 || addressCity || addressRegion || addressPostal || addressCountry)
      );

      const hasData = Boolean(
        prefix || first || middle || last || nickname || company || jobTitle || department ||
        validEmail || validAltEmail ||
        phoneDigits || altPhoneDigits1 ||
        hasAddress
      );
      if (!hasData) return "";

      const nameParts = [first, middle, last].filter(Boolean);
      const fullName = [prefix, ...nameParts].filter(Boolean).join(" ").trim();
      const fallbackName = company || jobTitle || validEmail || validAltEmail || (phoneDigits ? `+${phoneDigits}` : "");
      const displayName = fullName || fallbackName || "Contact";

      const lines = ["BEGIN:VCARD", "VERSION:3.0"];
      if (prefix || first || middle || last) {
        lines.push(`N:${escapeVCardValue(last)};${escapeVCardValue(first)};${escapeVCardValue(middle)};${escapeVCardValue(prefix)};`);
      }
      lines.push(`FN:${escapeVCardValue(displayName)}`);

      if (nickname) {
        lines.push(`NICKNAME:${escapeVCardValue(nickname)}`);
      }

      if (jobTitle) {
        lines.push(`TITLE:${escapeVCardValue(jobTitle)}`);
      }

      if (company || department) {
        const orgParts = [];
        if (company) orgParts.push(escapeVCardValue(company));
        if (department) orgParts.push(escapeVCardValue(department));
        lines.push(`ORG:${orgParts.join(";")}`);
      }

      if (phoneDigits) {
        const primaryLabel = formatVCardType(elements.contactPhoneLabel.value, "CELL");
        lines.push(`TEL;TYPE=${primaryLabel}:+${phoneDigits}`);
      }

      if (altPhoneDigits1) {
        const altLabel = formatVCardType(elements.contactAltPhoneLabel1.value, "OTHER");
        lines.push(`TEL;TYPE=${altLabel}:+${altPhoneDigits1}`);
      }

      if (validEmail) {
        lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(validEmail)}`);
      }

      if (validAltEmail) {
        lines.push(`EMAIL;TYPE=WORK:${escapeVCardValue(validAltEmail)}`);
      }

      if (hasAddress) {
        const streetRaw = [addressLine1, addressLine2].filter(Boolean).join("\n");
        const adrValues = [
          "",
          "",
          streetRaw,
          addressCity,
          addressRegion,
          addressPostal,
          addressCountry
        ].map((value) => escapeVCardValue(value || ""));
        lines.push(`ADR;TYPE=WORK:${adrValues.join(";")}`);
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        lines.push(`BDAY:${birthday}`);
      }

      lines.push("END:VCARD");
      return lines.join("\n");
    }
    default:
      return "";
  }
}

function getContrastColor(hex) {
  const normalized = normalizeHex(hex) || "#000000";
  const color = normalized.slice(1);
  const r = parseInt(color.slice(0, 2), 16) / 255;
  const g = parseInt(color.slice(2, 4), 16) / 255;
  const b = parseInt(color.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#1b1233" : "#ffffff";
}

function updateFramePreview() {
  elements.qrFrame.className = `qr-frame frame-${state.frame}`;
  elements.qrFrame.style.setProperty("--frame-bg", state.frameColor);
  elements.qrFrame.style.setProperty("--frame-accent", state.dotColor);
  const showLabel = state.frame === "badge" || state.frame === "ticket";
  elements.frameLabel.style.display = showLabel ? "inline-flex" : "none";
  elements.frameLabel.textContent = state.frameText || defaultState.frameText;
  elements.frameLabel.style.color = getContrastColor(state.dotColor);
}

function updateMeta(data) {
  const labels = {
    text: "Text",
    website: "Website",
    email: "Email",
    phone: "Mobile",
    whatsapp: "WhatsApp",
    wifi: "WiFi",
    upi: "UPI",
    contact: "Contact"
  };
  const label = labels[state.contentType] || "QR";
  elements.meta.textContent = `${qrSize} x ${qrSize} - SVG - ${label}`;
  setStatus(data ? "Ready" : "Missing", data ? "ready" : "warning");
}

function updateQrCode() {
  const data = buildQrData();
  updateMeta(data);

  if (!data) {
    elements.emptyState.hidden = false;
    setActionsEnabled(false);
    return;
  }

  elements.emptyState.hidden = true;
  setActionsEnabled(true);

  const shape = shapeMap[state.shape] || shapeMap.rounded;

  qrCode.update({
    data,
    dotsOptions: { color: state.dotColor, type: shape.dots },
    cornersSquareOptions: { color: state.dotColor, type: shape.cornersSquare },
    cornersDotOptions: { color: state.dotColor, type: shape.cornersDot },
    backgroundOptions: { color: state.bgColor },
    image: state.logo,
    qrOptions: { errorCorrectionLevel: state.level }
  });
}

function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function buildExportSvg() {
  if (!qrCode) return null;
  const data = buildQrData();
  if (!data) return null;
  const raw = await qrCode.getRawData("svg");
  if (!raw) return null;
  const rawSvg = await raw.text();
  return applyFrameToSvg(rawSvg);
}

function applyFrameToSvg(rawSvg) {
  const preset = framePresets[state.frame] || framePresets.none;
  if (preset === framePresets.none) {
    return rawSvg;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, "image/svg+xml");
  const svgEl = doc.documentElement;
  const qrInner = svgEl.innerHTML;

  const pad = preset.pad || 0;
  const labelHeight = preset.label ? preset.labelHeight : 0;
  const labelGap = preset.label ? preset.labelGap : 0;
  const totalWidth = qrSize + pad * 2;
  const totalHeight = qrSize + pad * 2 + labelGap + labelHeight;
  const labelText = preset.label ? (state.frameText || defaultState.frameText) : "";
  const labelWidth = Math.min(totalWidth - pad * 2, qrSize * 0.9);
  const labelX = (totalWidth - labelWidth) / 2;
  const labelY = pad + qrSize + labelGap;
  const labelRadius = preset.labelRadius ?? 999;
  const labelColor = state.dotColor;
  const labelTextColor = getContrastColor(state.dotColor);

  const stroke = preset.stroke !== "none" ? ` stroke=\"${preset.stroke}\" stroke-width=\"${preset.strokeWidth}\"` : "";
  const dash = preset.dash ? ` stroke-dasharray=\"${preset.dash}\"` : "";

  const labelMarkup = preset.label
    ? `\n  <rect x=\"${labelX}\" y=\"${labelY}\" width=\"${labelWidth}\" height=\"${labelHeight}\" rx=\"${labelRadius}\" fill=\"${labelColor}\" />\n  <text x=\"${totalWidth / 2}\" y=\"${labelY + labelHeight / 2}\" text-anchor=\"middle\" dominant-baseline=\"middle\" font-family=\"Plus Jakarta Sans, Arial, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"${labelTextColor}\">${escapeXml(labelText)}</text>`
    : "";

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${totalWidth}\" height=\"${totalHeight}\" viewBox=\"0 0 ${totalWidth} ${totalHeight}\">\n  <rect x=\"0\" y=\"0\" width=\"${totalWidth}\" height=\"${totalHeight}\" rx=\"${preset.radius}\" fill=\"${state.frameColor}\"${stroke}${dash} />\n  <g transform=\"translate(${pad}, ${pad})\">${qrInner}</g>${labelMarkup}\n</svg>`;
}

async function copySvg(silent = false) {
  const svgString = await buildExportSvg();
  if (!svgString) {
    if (!silent) {
      showToast("Add content before copying", "error");
    }
    return false;
  }

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      await navigator.clipboard.write([new ClipboardItem({ "image/svg+xml": blob })]);
      if (!silent) {
        showToast("SVG copied to clipboard", "success");
      }
      return true;
    }
    await navigator.clipboard.writeText(svgString);
    if (!silent) {
      showToast("SVG code copied", "success");
    }
    return true;
  } catch {
    if (!silent) {
      showToast("Clipboard copy failed", "error");
    }
    return false;
  }
}

async function shareQr() {
  const svgString = await buildExportSvg();
  if (!svgString) {
    showToast("Add content before sharing", "error");
    return;
  }

  const file = new File([svgString], "qr-code.svg", { type: "image/svg+xml" });

  if (navigator.share) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "QR Code",
          text: "QR code from QR Generator"
        });
        showToast("Share dialog opened", "success");
        return;
      }

      await navigator.share({
        title: "QR Code",
        text: "QR code from QR Generator",
        url: window.location.href
      });
      showToast("Share dialog opened", "success");
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      const copied = await copySvg(true);
      if (copied) {
        showToast("Share failed, copied instead", "success");
      } else {
        showToast("Share failed and copy failed", "error");
      }
      return;
    }
  } else {
    const copied = await copySvg(true);
    if (copied) {
      showToast("Share not supported, copied instead", "success");
    } else {
      showToast("Share not supported and copy failed", "error");
    }
    return;
  }
}

async function downloadSvg() {
  const svgString = await buildExportSvg();
  if (!svgString) {
    showToast("Add content before downloading", "error");
    return;
  }
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "qr-code.svg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("SVG downloaded", "success");
}

function resetApp() {
  Object.assign(state, defaultState);
  elements.textMessage.value = "";
  elements.websiteUrl.value = "";
  elements.emailAddress.value = "";
  elements.phoneCode.value = "+1";
  elements.phoneNumber.value = "";
  elements.waCode.value = "+91";
  elements.waNumber.value = "";
  elements.wifiSsid.value = "";
  elements.wifiPassword.value = "";
  elements.wifiSecurity.value = "WPA";
  elements.wifiHidden.checked = false;
  updateWifiPasswordState();
  elements.upiId.value = "";
  elements.upiName.value = "";
  elements.upiAmount.value = "";
  elements.upiNote.value = "";
  elements.contactPrefix.value = "";
  elements.contactFirstName.value = "";
  elements.contactMiddleName.value = "";
  elements.contactLastName.value = "";
  elements.contactNickname.value = "";
  elements.contactCompany.value = "";
  elements.contactJobTitle.value = "";
  elements.contactDepartment.value = "";
  elements.contactEmail.value = "";
  elements.contactEmailAlt.value = "";
  elements.contactBirthday.value = "";
  elements.contactPhoneCode.value = "+1";
  elements.contactPhoneNumber.value = "";
  elements.contactPhoneLabel.value = "";
  elements.contactAltPhoneCode1.value = "+1";
  elements.contactAltPhoneNumber1.value = "";
  elements.contactAltPhoneLabel1.value = "";
  setContactExtraVisible(false);
  setContactAddressVisible(false);
  elements.frameText.value = defaultState.frameText;
  elements.frameColor.value = defaultState.frameColor;
  elements.frameColorText.value = defaultState.frameColor;
  elements.dotColor.value = defaultState.dotColor;
  elements.dotColorText.value = defaultState.dotColor;
  elements.bgColor.value = defaultState.bgColor;
  elements.bgColorText.value = defaultState.bgColor;
  setActive(document.querySelectorAll("[data-content-type]"), document.querySelector("[data-content-type='text']"));
  updateContentForm();
  setActive(document.querySelectorAll("[data-frame]"), document.querySelector("[data-frame='none']"));
  setActive(document.querySelectorAll("[data-shape]"), document.querySelector("[data-shape='rounded']"));
  setActive(document.querySelectorAll("[data-logo]"), document.querySelector("[data-logo='none']"));
  setActive(document.querySelectorAll("[data-level]"), document.querySelector("[data-level='Q']"));
  updateFramePreview();
  updateQrCode();
  scheduleFlagUpdate(elements.phoneCode, elements.phoneFlag);
  scheduleFlagUpdate(elements.waCode, elements.waFlag);
  scheduleFlagUpdate(elements.contactPhoneCode, elements.contactPhoneFlag);
  scheduleFlagUpdate(elements.contactAltPhoneCode1, elements.contactAltPhoneFlag1);
}

function bindEvents() {
  document.querySelectorAll("[data-content-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyContentType(btn.dataset.contentType);
      setRouteHash(btn.dataset.contentType);
    });
  });

  document.querySelectorAll("[data-design-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateDesignTabs(btn.dataset.designTab);
    });
  });

  document.querySelectorAll("[data-frame]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.frame = btn.dataset.frame;
      setActive(document.querySelectorAll("[data-frame]"), btn);
      updateFramePreview();
      updateQrCode();
    });
  });

  document.querySelectorAll("[data-shape]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.shape = btn.dataset.shape;
      setActive(document.querySelectorAll("[data-shape]"), btn);
      updateQrCode();
    });
  });

  document.querySelectorAll("[data-logo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.logo;
      state.logo = key === "none" ? null : logoLibrary[key];
      setActive(document.querySelectorAll("[data-logo]"), btn);
      updateQrCode();
    });
  });

  document.querySelectorAll("[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.level = btn.dataset.level;
      setActive(document.querySelectorAll("[data-level]"), btn);
      updateQrCode();
    });
  });

  const textInputs = [
    elements.textMessage,
    elements.websiteUrl,
    elements.emailAddress,
    elements.phoneCode,
    elements.phoneNumber,
    elements.waCode,
    elements.waNumber,
    elements.wifiSsid,
    elements.wifiPassword,
    elements.upiId,
    elements.upiName,
    elements.upiAmount,
    elements.upiNote,
    elements.contactPrefix,
    elements.contactFirstName,
    elements.contactMiddleName,
    elements.contactLastName,
    elements.contactNickname,
    elements.contactCompany,
    elements.contactJobTitle,
    elements.contactDepartment,
    elements.contactEmail,
    elements.contactEmailAlt,
    elements.contactBirthday,
    elements.contactPhoneCode,
    elements.contactPhoneNumber,
    elements.contactPhoneLabel,
    elements.contactAltPhoneCode1,
    elements.contactAltPhoneNumber1,
    elements.contactAltPhoneLabel1,
    elements.contactAddressLine1,
    elements.contactAddressLine2,
    elements.contactAddressCity,
    elements.contactAddressRegion,
    elements.contactAddressPostal,
    elements.contactAddressCountry,
    elements.frameText
  ];

  textInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (input === elements.frameText) {
        state.frameText = elements.frameText.value;
        updateFramePreview();
      }
      updateQrCode();
    });
  });

  bindDialCodeFlag(elements.phoneCode, elements.phoneFlag);
  bindDialCodeFlag(elements.waCode, elements.waFlag);
  bindDialCodeFlag(elements.contactPhoneCode, elements.contactPhoneFlag);
  bindDialCodeFlag(elements.contactAltPhoneCode1, elements.contactAltPhoneFlag1);

  bindColorPair(elements.frameColor, elements.frameColorText, (value) => {
    state.frameColor = value;
    updateFramePreview();
  });

  bindColorPair(elements.dotColor, elements.dotColorText, (value) => {
    state.dotColor = value;
    updateFramePreview();
    updateQrCode();
  });

  bindColorPair(elements.bgColor, elements.bgColorText, (value) => {
    state.bgColor = value;
    updateQrCode();
  });

  if (elements.wifiSecurity) {
    elements.wifiSecurity.addEventListener("change", () => {
      updateWifiPasswordState();
      updateQrCode();
    });
  }

  if (elements.wifiHidden) {
    elements.wifiHidden.addEventListener("change", () => {
      updateQrCode();
    });
  }

  if (elements.addContactPhoneBtn) {
    elements.addContactPhoneBtn.addEventListener("click", () => {
      setContactExtraVisible(true);
      updateQrCode();
    });
  }

  if (elements.removeContactPhoneBtn) {
    elements.removeContactPhoneBtn.addEventListener("click", () => {
      setContactExtraVisible(false);
      updateQrCode();
    });
  }

  if (elements.addContactAddressBtn) {
    elements.addContactAddressBtn.addEventListener("click", () => {
      setContactAddressVisible(true);
      updateQrCode();
    });
  }

  if (elements.removeContactAddressBtn) {
    elements.removeContactAddressBtn.addEventListener("click", () => {
      setContactAddressVisible(false);
      updateQrCode();
    });
  }

  elements.copyBtn.addEventListener("click", shareQr);
  elements.downloadBtn.addEventListener("click", downloadSvg);

  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener("click", openDesignModal);
  }

  if (elements.designModalClose) {
    elements.designModalClose.addEventListener("click", closeDesignModal);
  }

  if (elements.designModal) {
    elements.designModal.addEventListener("click", (event) => {
      if (event.target === elements.designModal) {
        closeDesignModal();
      }
    });
  }

  if (elements.infoBtn) {
    elements.infoBtn.addEventListener("click", openTipsModal);
  }

  if (elements.tipsModalClose) {
    elements.tipsModalClose.addEventListener("click", closeTipsModal);
  }

  if (elements.tipsModal) {
    elements.tipsModal.addEventListener("click", (event) => {
      if (event.target === elements.tipsModal) {
        closeTipsModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDesignModal();
      closeTipsModal();
    }
  });
}

function init() {
  if (!window.QRCodeStyling) {
    showToast("QR library failed to load", "error");
    return;
  }

  qrCode = new QRCodeStyling({
    width: qrSize,
    height: qrSize,
    type: "svg",
    data: " ",
    margin: 0,
    qrOptions: { errorCorrectionLevel: state.level },
    dotsOptions: { color: state.dotColor, type: "rounded" },
    backgroundOptions: { color: state.bgColor },
    cornersSquareOptions: { color: state.dotColor, type: "extra-rounded" },
    cornersDotOptions: { color: state.dotColor, type: "dot" },
    imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.28 }
  });

  qrCode.append(elements.qrContainer);

  elements.frameText.value = state.frameText;
  elements.frameColor.value = state.frameColor;
  elements.frameColorText.value = state.frameColor;
  elements.dotColor.value = state.dotColor;
  elements.dotColorText.value = state.dotColor;
  elements.bgColor.value = state.bgColor;
  elements.bgColorText.value = state.bgColor;
  updateWifiPasswordState();
  setContactExtraVisible(false);

  updateContentForm();
  updateFramePreview();
  updateQrCode();
  bindEvents();

  applyContentTypeFromHash();
  window.addEventListener("hashchange", () => {
    if (isSyncingHash) return;
    applyContentTypeFromHash();
  });
}

init();
