(function () {
  'use strict';

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_PIXELS = 80_000_000;
  const MAX_DIMENSION = 16_384;
  const MAX_SVG_TEXT = 4 * 1024 * 1024;
  const OUTPUTS = {
    png: ['jpeg', 'webp', 'png'],
    jpeg: ['png', 'webp', 'jpeg'],
    webp: ['png', 'jpeg', 'webp'],
    svg: ['png', 'jpeg', 'webp'],
    bmp: ['png', 'jpeg', 'webp'],
  };
  const FORMATS = {
    png: { label: 'PNG', mime: 'image/png', extension: 'png' },
    jpeg: { label: 'JPEG', mime: 'image/jpeg', extension: 'jpg' },
    webp: { label: 'WebP', mime: 'image/webp', extension: 'webp' },
    svg: { label: 'SVG', mime: 'image/svg+xml', extension: 'svg' },
    bmp: { label: 'BMP', mime: 'image/bmp', extension: 'bmp' },
  };

  /* The icon set a site actually needs, and why each one is here. `maskable`
     re-renders 512 with Android's safe area applied; `ico` members are folded
     into a single multi-resolution favicon.ico as well as shipping as PNGs. */
  const ICON_SPECS = [
    { id: 'favicon-16', size: 16, file: 'favicon-16x16.png', label: 'Browser tab', ico: true },
    { id: 'favicon-32', size: 32, file: 'favicon-32x32.png', label: 'Tab, retina', ico: true },
    { id: 'favicon-48', size: 48, file: 'favicon-48x48.png', label: 'Windows, bookmarks', ico: true },
    { id: 'apple-180', size: 180, file: 'apple-touch-icon.png', label: 'iOS home screen', opaque: true },
    { id: 'android-192', size: 192, file: 'icon-192.png', label: 'Android, PWA', manifest: 'any' },
    { id: 'android-512', size: 512, file: 'icon-512.png', label: 'PWA splash', manifest: 'any' },
    { id: 'maskable-512', size: 512, file: 'icon-maskable-512.png', label: 'Android adaptive', manifest: 'maskable', maskable: true },
  ];
  // Android crops a maskable icon to an arbitrary shape and only guarantees
  // the middle 80%, so the artwork is inset by a tenth on every side.
  const MASKABLE_INSET = 0.1;

  const $ = (selector) => document.querySelector(selector);
  const el = {
    body: document.body,
    modeTabs: Array.from(document.querySelectorAll('.mode-tab')),
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    sourcePanel: $('#sourcePanel'),
    sourcePreview: $('#sourcePreview'),
    sourceImage: $('#sourceImage'),
    sourceStatus: $('#sourceStatus'),
    fileName: $('#fileName'),
    fileNote: $('#fileNote'),
    sourceFormat: $('#sourceFormat'),
    sourceDimensions: $('#sourceDimensions'),
    sourceSize: $('#sourceSize'),
    clearBtn: $('#clearBtn'),

    convertPanel: $('#convertPanel'),
    settings: $('#settings'),
    emptySettings: $('#emptySettings'),
    outputFormat: $('#outputFormat'),
    outputStatus: $('#outputStatus'),
    formatHelp: $('#formatHelp'),
    scaleGroup: $('#scaleGroup'),
    outputScale: $('#outputScale'),
    customSizeRow: $('#customSizeRow'),
    customWidth: $('#customWidth'),
    customHeight: $('#customHeight'),
    sizeHelp: $('#sizeHelp'),
    qualityGroup: $('#qualityGroup'),
    quality: $('#quality'),
    qualityValue: $('#qualityValue'),
    backgroundGroup: $('#backgroundGroup'),
    backgroundPicker: $('#backgroundPicker'),
    backgroundText: $('#backgroundText'),
    stripMetadata: $('#stripMetadata'),
    privacyHelp: $('#privacyHelp'),
    metadataNotice: $('#metadataNotice'),
    convertBtn: $('#convertBtn'),
    resultPanel: $('#resultPanel'),
    resultImage: $('#resultImage'),
    resultName: $('#resultName'),
    resultFormat: $('#resultFormat'),
    resultDimensions: $('#resultDimensions'),
    resultSize: $('#resultSize'),
    resultMessage: $('#resultMessage'),
    downloadBtn: $('#downloadBtn'),

    iconPanel: $('#iconPanel'),
    iconSettings: $('#iconSettings'),
    iconEmpty: $('#iconEmpty'),
    iconStatus: $('#iconStatus'),
    iconSizes: $('#iconSizes'),
    iconTransparent: $('#iconTransparent'),
    iconBackgroundPicker: $('#iconBackgroundPicker'),
    iconBackgroundText: $('#iconBackgroundText'),
    iconPadding: $('#iconPadding'),
    iconPaddingValue: $('#iconPaddingValue'),
    iconAppName: $('#iconAppName'),
    iconBtn: $('#iconBtn'),
    iconResultPanel: $('#iconResultPanel'),
    iconGrid: $('#iconGrid'),
    iconMessage: $('#iconMessage'),
    iconSnippet: $('#iconSnippet'),
    iconDownloadBtn: $('#iconDownloadBtn'),
    iconCopyBtn: $('#iconCopyBtn'),

    svgPanel: $('#svgPanel'),
    svgStatus: $('#svgStatus'),
    svgInput: $('#svgInput'),
    svgOutput: $('#svgOutput'),
    svgOpenBtn: $('#svgOpenBtn'),
    svgFileInput: $('#svgFileInput'),
    svgSavings: $('#svgSavings'),
    svgBefore: $('#svgBefore'),
    svgAfter: $('#svgAfter'),
    svgRemoved: $('#svgRemoved'),
    svgPrecision: $('#svgPrecision'),
    svgPrecisionValue: $('#svgPrecisionValue'),
    svgStripScripts: $('#svgStripScripts'),
    svgStripTitles: $('#svgStripTitles'),
    svgPreferViewBox: $('#svgPreferViewBox'),
    svgSourceImage: $('#svgSourceImage'),
    svgSourceEmpty: $('#svgSourceEmpty'),
    svgOutputImage: $('#svgOutputImage'),
    svgOutputEmpty: $('#svgOutputEmpty'),
    svgCopyBtn: $('#svgCopyBtn'),
    svgDownloadBtn: $('#svgDownloadBtn'),
    svgClearBtn: $('#svgClearBtn'),

    infoBtn: $('#infoBtn'),
    infoModal: $('#infoModal'),
    closeInfoBtn: $('#closeInfoBtn'),
  };

  const state = {
    mode: 'convert',
    file: null,
    format: null,
    sourceBlob: null,
    sourceUrl: null,
    svgText: '',        // sanitized markup, re-rendered per output size
    svgCache: new Map(),
    image: null,
    width: 0,
    height: 0,
    resultBlob: null,
    resultUrl: null,
    resultFilename: '',
    icons: [],          // [{ spec, blob, url }]
    iconZip: null,
    svgOutput: '',
    svgSourcePreviewUrl: null,
    svgOutputPreviewUrl: null,
  };

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  function showToast(message, type = 'info') {
    window.DevToolsMain.showToast(message, type);
  }

  function setStatus(element, label, status) {
    element.textContent = label;
    element.dataset.state = status;
  }

  function revokeUrl(key) {
    if (state[key]) {
      URL.revokeObjectURL(state[key]);
      state[key] = null;
    }
  }

  /* --- Mode switching ------------------------------------------------------
     Convert and icons share one loaded image, so switching between them keeps
     the source panel and everything in it; only the step-two panel and its
     results swap. SVG optimization is a text workflow and hides the rest.

     The mode lives in the hash (#convert, #icons, #svg) so a tab is linkable
     and a reload lands where the user left off. The dashboard mirrors it into
     the address bar — see DevToolsMain.writeHashState. */

  const MODES = ['convert', 'icons', 'svg'];

  function modeFromHash() {
    const hash = window.DevToolsMain.readHashState();
    return MODES.includes(hash) ? hash : null;
  }

  function setMode(mode, { updateHash = true } = {}) {
    if (!MODES.includes(mode)) mode = 'convert';
    state.mode = mode;
    if (updateHash) window.DevToolsMain.writeHashState(mode);
    el.body.dataset.mode = mode;
    el.modeTabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    el.sourcePanel.classList.toggle('hidden', mode === 'svg');
    el.convertPanel.classList.toggle('hidden', mode !== 'convert');
    el.iconPanel.classList.toggle('hidden', mode !== 'icons');
    el.svgPanel.classList.toggle('hidden', mode !== 'svg');
    el.resultPanel.classList.toggle('hidden', mode !== 'convert' || !state.resultBlob);
    el.iconResultPanel.classList.toggle('hidden', mode !== 'icons' || !state.icons.length);
  }

  /* --- Source image --------------------------------------------------------
     Shared by conversion and icon generation. */

  function clearResult() {
    revokeUrl('resultUrl');
    state.resultBlob = null;
    state.resultFilename = '';
    el.resultImage.removeAttribute('src');
    el.resultPanel.classList.add('hidden');
    if (state.file) setStatus(el.outputStatus, 'Ready', 'loaded');
  }

  function clearIcons() {
    state.icons.forEach((icon) => URL.revokeObjectURL(icon.url));
    state.icons = [];
    state.iconZip = null;
    el.iconGrid.replaceChildren();
    el.iconSnippet.value = '';
    el.iconResultPanel.classList.add('hidden');
    if (state.file) setStatus(el.iconStatus, 'Ready', 'loaded');
  }

  function clearAll() {
    clearResult();
    clearIcons();
    revokeUrl('sourceUrl');
    state.svgCache.forEach((entry) => URL.revokeObjectURL(entry.url));
    state.svgCache.clear();
    state.svgText = '';
    state.file = null;
    state.format = null;
    state.sourceBlob = null;
    state.image = null;
    state.width = 0;
    state.height = 0;
    el.fileInput.value = '';
    el.sourceImage.removeAttribute('src');
    el.sourcePreview.classList.add('hidden');
    el.dropZone.classList.remove('hidden', 'drag-over');
    el.settings.disabled = true;
    el.settings.classList.add('hidden');
    el.emptySettings.classList.remove('hidden');
    el.iconSettings.disabled = true;
    el.iconSettings.classList.add('hidden');
    el.iconEmpty.classList.remove('hidden');
    el.stripMetadata.checked = true;
    el.quality.value = '92';
    el.qualityValue.value = '92%';
    el.qualityValue.textContent = '92%';
    setBackgroundColor('#FFFFFF');
    setStatus(el.sourceStatus, 'Waiting', 'idle');
    setStatus(el.outputStatus, 'Not ready', 'idle');
    setStatus(el.iconStatus, 'Not ready', 'idle');
  }

  function ascii(bytes, offset, length) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
  }

  function hasBytes(bytes, expected, offset = 0) {
    return expected.every((value, index) => bytes[offset + index] === value);
  }

  async function detectFormat(file) {
    const bytes = new Uint8Array(await file.slice(0, 131_072).arrayBuffer());
    if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
    if (ascii(bytes, 0, 2) === 'BM') return 'bmp';
    if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'gif';
    if (hasBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || hasBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';

    if (ascii(bytes, 4, 4) === 'ftyp') {
      const brand = ascii(bytes, 8, 4).toLowerCase();
      const compatibleBrands = ascii(bytes, 8, Math.min(bytes.length - 8, 40)).toLowerCase();
      if (['avif', 'avis'].includes(brand) || /avif|avis/.test(compatibleBrands)) return 'avif';
      if (/heic|heix|hevc|hevx|mif1|msf1/.test(`${brand}${compatibleBrands}`)) return 'heic';
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      .replace(/^﻿/, '')
      .trimStart();
    // The prolog may interleave comments and a doctype (Illustrator writes a
    // "<!-- Generator: ... -->" line before <svg>, and older exports carry a
    // doctype with an [internal subset] of entities); none of that may reject
    // the file.
    if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!doctype\s+svg[^[>]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg(?:\s|>)/i.test(text)) return 'svg';
    return 'unknown';
  }

  function unsupportedFormatMessage(format) {
    if (format === 'gif') return 'Animated GIFs are not supported because conversion would discard the animation.';
    if (format === 'avif') return 'AVIF input is not included in this version because browser decoding is not consistent enough.';
    if (format === 'heic') return 'HEIC input is not included in this version. Convert it to PNG or JPEG first.';
    if (format === 'tiff') return 'TIFF input is not included in this version. Convert it to PNG or JPEG first.';
    return 'That file is not a supported PNG, JPEG, WebP, SVG, or BMP image.';
  }

  function sanitizeSvg(text) {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror') || documentNode.documentElement.localName.toLowerCase() !== 'svg') {
      throw new Error('The SVG is malformed and could not be safely opened.');
    }

    documentNode.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, base').forEach((node) => node.remove());
    const unsafeCss = /(?:@import|javascript\s*:|url\s*\(\s*["']?\s*(?:https?:|\/\/|file:))/i;
    documentNode.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || /javascript\s*:/i.test(value)) {
          node.removeAttribute(attribute.name);
          return;
        }
        if ((name === 'href' || name.endsWith(':href'))
          && value
          && !value.startsWith('#')
          && !/^data:image\/(?:png|jpeg|webp|gif);/i.test(value)) {
          node.removeAttribute(attribute.name);
          return;
        }
        if (name === 'style' && unsafeCss.test(value)) node.removeAttribute(attribute.name);
      });
    });
    documentNode.querySelectorAll('style').forEach((style) => {
      if (unsafeCss.test(style.textContent || '')) style.remove();
    });
    documentNode.documentElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(documentNode.documentElement);
  }

  async function prepareSourceBlob(file, format) {
    if (format !== 'svg') {
      state.svgText = '';
      return file;
    }
    state.svgText = sanitizeSvg(await file.text());
    state.svgCache.forEach((entry) => URL.revokeObjectURL(entry.url));
    state.svgCache.clear();
    return new Blob([state.svgText], { type: FORMATS.svg.mime });
  }

  /* --- Output resolution ---------------------------------------------------
     A vector source has no "native" pixel size: an <svg> declaring 150×150
     rasterizes to 150×150 in an <img>, and scaling that up on the canvas is
     what made SVG conversions look soft. Re-parsing the markup with the target
     width and height instead makes the browser rasterize at full resolution,
     so a 4x output is genuinely 4x the detail rather than 4x the pixels.
     ---------------------------------------------------------------------- */

  async function sourceImageAt(width, height) {
    if (state.format !== 'svg' || !state.svgText) return state.image;

    const key = `${Math.round(width)}x${Math.round(height)}`;
    const cached = state.svgCache.get(key);
    if (cached) return cached.image;

    const document_ = new DOMParser().parseFromString(state.svgText, 'image/svg+xml');
    const svg = document_.documentElement;
    // Without a viewBox the new width and height would crop rather than scale.
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    }
    svg.setAttribute('width', String(Math.round(width)));
    svg.setAttribute('height', String(Math.round(height)));

    const markup = new XMLSerializer().serializeToString(svg);
    const loaded = await loadImage(new Blob([markup], { type: FORMATS.svg.mime }));
    state.svgCache.set(key, { image: loaded.image, url: loaded.url });
    return loaded.image;
  }

  /* Scale presets. Vector sources get the high multipliers (nothing is
     invented by rendering them larger); raster sources get a downscale and a
     modest upscale, because past that a browser resample only adds bytes. */
  const VECTOR_SCALES = [
    { value: '1', factor: 1, label: 'Original' },
    { value: '2', factor: 2, label: 'High' },
    { value: '3', factor: 3, label: 'Very high' },
    { value: '4', factor: 4, label: 'Maximum' },
  ];
  const RASTER_SCALES = [
    { value: '0.5', factor: 0.5, label: 'Half' },
    { value: '1', factor: 1, label: 'Original' },
    { value: '2', factor: 2, label: 'Upscaled 2x' },
    { value: '3', factor: 3, label: 'Upscaled 3x' },
  ];

  function scalePresets() {
    return state.format === 'svg' ? VECTOR_SCALES : RASTER_SCALES;
  }

  function dimensionsForFactor(factor) {
    return {
      width: Math.max(1, Math.round(state.width * factor)),
      height: Math.max(1, Math.round(state.height * factor)),
    };
  }

  function populateScales() {
    el.outputScale.replaceChildren();
    scalePresets().forEach((preset) => {
      const { width, height } = dimensionsForFactor(preset.factor);
      const option = document.createElement('option');
      option.value = preset.value;
      option.textContent = `${preset.factor}x · ${preset.label} — ${width} × ${height}`;
      option.disabled = width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS;
      el.outputScale.appendChild(option);
    });

    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom width…';
    el.outputScale.appendChild(custom);

    // A vector is worth rendering above its declared size by default; a raster
    // is not, so it stays at 1x unless asked.
    const preferred = state.format === 'svg' ? '2' : '1';
    const wanted = el.outputScale.querySelector(`option[value="${preferred}"]`);
    el.outputScale.value = wanted && !wanted.disabled ? preferred : '1';
    el.customWidth.value = String(dimensionsForFactor(1).width);
  }

  function targetSize() {
    if (el.outputScale.value === 'custom') {
      const width = Math.max(1, Math.min(MAX_DIMENSION, Math.round(Number(el.customWidth.value) || state.width)));
      const height = Math.max(1, Math.round(width * (state.height / state.width)));
      return { width, height, custom: true };
    }
    const factor = Number(el.outputScale.value) || 1;
    return { ...dimensionsForFactor(factor), factor };
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The browser could not decode this image. It may be damaged or unsupported.'));
      };
      image.src = url;
    });
  }

  function extensionFormat(filename) {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg' || extension === 'jpe') return 'jpeg';
    if (['png', 'webp', 'svg', 'bmp'].includes(extension)) return extension;
    return null;
  }

  function populateOutputs(format) {
    el.outputFormat.replaceChildren();
    OUTPUTS[format].forEach((output) => {
      const option = document.createElement('option');
      option.value = output;
      option.textContent = FORMATS[output].label;
      el.outputFormat.appendChild(option);
    });
  }

  function outputPreservesOriginal() {
    return Boolean(
      state.file
      && !el.stripMetadata.checked
      && el.outputFormat.value === state.format
      && ['png', 'jpeg', 'webp'].includes(state.format),
    );
  }

  function updateSettings() {
    const output = el.outputFormat.value;
    const lossy = output === 'jpeg' || output === 'webp';
    const preserving = outputPreservesOriginal();
    el.qualityGroup.classList.toggle('hidden', !lossy || preserving);
    el.backgroundGroup.classList.toggle('hidden', output !== 'jpeg' || preserving);
    el.scaleGroup.classList.toggle('hidden', preserving);
    el.customSizeRow.classList.toggle('hidden', el.outputScale.value !== 'custom');

    const target = targetSize();
    el.customHeight.value = String(target.height);
    el.customHeight.textContent = String(target.height);
    if (state.format === 'svg') {
      el.sizeHelp.textContent = target.width === state.width
        ? `Rendered at the size this SVG declares (${state.width} × ${state.height}). A vector loses nothing at a larger size — pick one for a higher-resolution raster.`
        : `Rasterized straight to ${target.width} × ${target.height} from the vector, so no detail is invented.`;
    } else if (target.width > state.width) {
      el.sizeHelp.textContent = `Upscaled from ${state.width} × ${state.height}; the browser interpolates, so this adds pixels rather than detail.`;
    } else if (target.width < state.width) {
      el.sizeHelp.textContent = `Downscaled from ${state.width} × ${state.height}.`;
    } else {
      el.sizeHelp.textContent = `Kept at the source size, ${state.width} × ${state.height}.`;
    }

    if (preserving) {
      el.formatHelp.textContent = 'Same-format output will preserve the original file bytes because metadata stripping is off.';
      el.privacyHelp.textContent = 'Disabled: same-format output preserves the original file and its embedded metadata.';
      el.metadataNotice.textContent = 'The original bytes will be downloaded unchanged. Quality and background controls do not apply.';
    } else if (el.stripMetadata.checked) {
      el.formatHelp.textContent = `${FORMATS[output].label} will be created locally at ${target.width} × ${target.height}.`;
      el.privacyHelp.textContent = 'Re-encode pixels without embedded EXIF, GPS, XMP, IPTC, or comments.';
      el.metadataNotice.textContent = "Metadata cleanup removes embedded fields, but cannot guarantee that an image's origin is undetectable.";
    } else {
      el.formatHelp.textContent = `${FORMATS[output].label} will be created locally at ${target.width} × ${target.height}.`;
      el.privacyHelp.textContent = 'Disabled: compatible metadata is preserved only when the original file bytes can be reused.';
      el.metadataNotice.textContent = 'Cross-format browser conversion re-encodes pixels, so source metadata will not be carried into this output.';
    }
    clearResult();
  }

  function describeIconSource() {
    const square = Math.abs(state.width - state.height) <= 1;
    const smallest = Math.min(state.width, state.height);
    const largest = ICON_SPECS.reduce((max, spec) => Math.max(max, spec.size), 0);
    const notes = [];
    if (!square) notes.push('the source is not square, so each icon is letterboxed onto a square canvas');
    if (state.format !== 'svg' && smallest < largest) notes.push(`the source is ${smallest} px, so sizes above that are upscaled`);
    return notes.length ? `Note: ${notes.join('; ')}.` : '';
  }

  async function selectFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('Choose an image smaller than 50 MB.', 'error');
      return;
    }

    setStatus(el.sourceStatus, 'Detecting', 'working');
    setStatus(el.outputStatus, 'Not ready', 'idle');
    setStatus(el.iconStatus, 'Not ready', 'idle');
    try {
      const format = await detectFormat(file);
      if (!FORMATS[format]) throw new Error(unsupportedFormatMessage(format));
      const sourceBlob = await prepareSourceBlob(file, format);
      const loaded = await loadImage(sourceBlob);
      const width = loaded.image.naturalWidth;
      const height = loaded.image.naturalHeight;
      if (!width || !height) {
        URL.revokeObjectURL(loaded.url);
        throw new Error('The image has no usable width or height.');
      }
      if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
        URL.revokeObjectURL(loaded.url);
        throw new Error(`This image is too large to convert safely (${width} × ${height}). The limit is 80 megapixels and 16,384 pixels per side.`);
      }

      clearResult();
      clearIcons();
      revokeUrl('sourceUrl');
      state.file = file;
      state.format = format;
      state.sourceBlob = sourceBlob;
      state.sourceUrl = loaded.url;
      state.image = loaded.image;
      state.width = width;
      state.height = height;

      el.sourceImage.src = state.sourceUrl;
      el.fileName.textContent = file.name || `image.${FORMATS[format].extension}`;
      const namedFormat = extensionFormat(file.name || '');
      if (format === 'svg') {
        el.fileNote.textContent = 'SVG sanitized before local preview';
      } else if (namedFormat && namedFormat !== format) {
        el.fileNote.textContent = `Filename suggested ${FORMATS[namedFormat].label}; file contents are ${FORMATS[format].label}`;
      } else {
        el.fileNote.textContent = 'Format verified from file contents';
      }
      el.sourceFormat.textContent = FORMATS[format].label;
      el.sourceDimensions.textContent = `${width} × ${height}`;
      el.sourceSize.textContent = formatBytes(file.size);
      el.dropZone.classList.add('hidden');
      el.sourcePreview.classList.remove('hidden');
      populateOutputs(format);
      populateScales();
      el.settings.disabled = false;
      el.settings.classList.remove('hidden');
      el.emptySettings.classList.add('hidden');
      el.iconSettings.disabled = false;
      el.iconSettings.classList.remove('hidden');
      el.iconEmpty.classList.add('hidden');
      setStatus(el.sourceStatus, 'Loaded', 'loaded');
      setStatus(el.outputStatus, 'Ready', 'loaded');
      setStatus(el.iconStatus, 'Ready', 'loaded');
      updateSettings();
    } catch (error) {
      clearAll();
      showToast(error.message || 'The image could not be opened.', 'error');
    }
  }

  /* --- Conversion --------------------------------------------------------- */

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The browser could not encode this output format.'));
          return;
        }
        if (blob.type !== type) {
          reject(new Error(`This browser cannot encode ${type.replace('image/', '').toUpperCase()} images.`));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function baseName(filename) {
    return (filename || 'image')
      .replace(/\.[^.]*$/, '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'image';
  }

  function makeOutputName(filename, format) {
    return `${baseName(filename)}-converted.${FORMATS[format].extension}`;
  }

  async function convertImage() {
    if (!state.file || !state.image) return;
    const output = el.outputFormat.value;
    const outputFormat = FORMATS[output];
    const preserving = outputPreservesOriginal();
    clearResult();
    el.convertBtn.disabled = true;
    el.convertBtn.querySelector('span').textContent = 'Converting…';
    setStatus(el.outputStatus, 'Converting', 'working');

    try {
      const target = targetSize();
      let blob;
      if (preserving) {
        blob = state.file;
      } else {
        if (target.width * target.height > MAX_PIXELS) {
          throw new Error('That output size is above the 80 megapixel limit. Choose a smaller one.');
        }
        // A custom width is clamped, but on a tall image the derived height is
        // not, and a canvas past the per-side limit silently fails to encode.
        if (target.width > MAX_DIMENSION || target.height > MAX_DIMENSION) {
          throw new Error('That output size is above the 16,384 pixel per side limit. Choose a smaller one.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const context = canvas.getContext('2d', { alpha: output !== 'jpeg' });
        if (!context) throw new Error('Canvas conversion is unavailable in this browser.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (output === 'jpeg') {
          context.fillStyle = backgroundColor();
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(await sourceImageAt(target.width, target.height), 0, 0, target.width, target.height);
        blob = await canvasToBlob(canvas, outputFormat.mime, Number(el.quality.value) / 100);
        canvas.width = 1;
        canvas.height = 1;
      }

      state.resultBlob = blob;
      state.resultUrl = URL.createObjectURL(blob);
      state.resultFilename = makeOutputName(state.file.name, output);
      el.resultImage.src = state.resultUrl;
      el.resultName.textContent = state.resultFilename;
      el.resultFormat.textContent = outputFormat.label;
      el.resultDimensions.textContent = preserving
        ? `${state.width} × ${state.height}`
        : `${target.width} × ${target.height}`;
      el.resultSize.textContent = formatBytes(blob.size);
      if (preserving) {
        el.resultMessage.textContent = 'Original bytes and embedded metadata were preserved because the source and output formats match.';
      } else if (el.stripMetadata.checked) {
        el.resultMessage.textContent = 'Freshly re-encoded without standard embedded metadata. Pixel content and other provenance signals may still remain.';
      } else {
        el.resultMessage.textContent = 'Cross-format conversion re-encoded the pixels; browser conversion does not carry source metadata into the new format.';
      }
      el.resultPanel.classList.remove('hidden');
      setStatus(el.outputStatus, 'Complete', 'ready');
      el.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setStatus(el.outputStatus, 'Failed', 'idle');
      showToast(error.message || 'Conversion failed.', 'error');
    } finally {
      el.convertBtn.disabled = false;
      el.convertBtn.querySelector('span').textContent = 'Convert image';
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function downloadResult() {
    if (!state.resultBlob || !state.resultUrl) return;
    const link = document.createElement('a');
    link.href = state.resultUrl;
    link.download = state.resultFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* --- Colour fields -------------------------------------------------------
     The popover is the shared component (DevToolsMain.createColorPicker); the
     text field next to it stays the exact-value control, as in the colour
     converter. */

  const colorUtil = window.DevToolsMain.color;

  function bindColorField(pickerNode, textNode, { onChange }) {
    // main.js has already built this picker from its data attributes, so the
    // change event — not a constructor callback — is what a tool hooks into.
    const picker = window.DevToolsMain.createColorPicker(pickerNode);
    pickerNode.addEventListener('picker:change', (event) => {
      textNode.value = event.detail.hex;
      onChange?.(event.detail.hex);
    });

    const readText = () => {
      const value = textNode.value.trim();
      const parsed = colorUtil.parseHex(value);
      if (!parsed || value.length > 7) {
        textNode.value = picker.getColor();
        showToast('Enter a six-digit hex color such as #FFFFFF.', 'error');
        return;
      }
      const hex = colorUtil.formatHex({ ...parsed, a: 1 });
      textNode.value = hex;
      picker.setColor(hex);
      onChange?.(hex);
    };

    textNode.addEventListener('change', readText);
    return {
      picker,
      set(hex) {
        textNode.value = hex;
        picker.setColor(hex);
      },
      get: () => picker.getColor(),
    };
  }

  const backgroundField = bindColorField(el.backgroundPicker, el.backgroundText, {
    onChange: clearResult,
  });
  const backgroundColor = () => backgroundField.get();
  const setBackgroundColor = (hex) => backgroundField.set(hex);

  const iconBackgroundField = bindColorField(el.iconBackgroundPicker, el.iconBackgroundText, {
    onChange: clearIcons,
  });

  /* --- Icon pack -----------------------------------------------------------
     Every size is drawn from the source image rather than downsampled from a
     larger icon, so a 16 px favicon never inherits two rounds of resampling.
     ---------------------------------------------------------------------- */

  function buildSizeControls() {
    ICON_SPECS.forEach((spec) => {
      const label = document.createElement('label');
      label.className = 'size-option';
      label.setAttribute('for', `size-${spec.id}`);

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `size-${spec.id}`;
      input.checked = true;
      input.dataset.iconId = spec.id;
      input.addEventListener('change', clearIcons);

      const text = document.createElement('span');
      const size = document.createElement('strong');
      size.textContent = spec.maskable ? `${spec.size} maskable` : `${spec.size}px`;
      const note = document.createElement('small');
      note.textContent = spec.label;
      text.append(size, note);

      label.append(input, text);
      el.iconSizes.appendChild(label);
    });
  }

  function selectedSpecs() {
    return ICON_SPECS.filter((spec) => $(`#size-${spec.id}`).checked);
  }

  async function renderIcon(spec) {
    const canvas = document.createElement('canvas');
    canvas.width = spec.size;
    canvas.height = spec.size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.imageSmoothingQuality = 'high';

    // Apple composites a transparent icon onto black, so that one is always
    // filled even when the rest of the pack keeps its transparency.
    const transparent = el.iconTransparent.checked && !spec.opaque;
    if (!transparent) {
      context.fillStyle = iconBackgroundField.get();
      context.fillRect(0, 0, spec.size, spec.size);
    }

    const padding = Number(el.iconPadding.value) / 100 + (spec.maskable ? MASKABLE_INSET : 0);
    const box = spec.size * (1 - padding * 2);
    const scale = Math.min(box / state.width, box / state.height);
    const width = state.width * scale;
    const height = state.height * scale;
    // A vector icon is re-rasterized at the size it will actually occupy, so a
    // 512 icon from a small SVG is sharp rather than an enlarged thumbnail.
    const drawable = await sourceImageAt(width, height);
    context.drawImage(drawable, (spec.size - width) / 2, (spec.size - height) / 2, width, height);

    return canvasToBlob(canvas, 'image/png');
  }

  function manifestFor(specs, name) {
    const icons = specs
      .filter((spec) => spec.manifest)
      .map((spec) => ({
        src: `/${spec.file}`,
        sizes: `${spec.size}x${spec.size}`,
        type: 'image/png',
        purpose: spec.manifest,
      }));
    return `${JSON.stringify({
      name,
      short_name: name,
      icons,
      theme_color: iconBackgroundField.get(),
      background_color: el.iconTransparent.checked ? '#ffffff' : iconBackgroundField.get(),
      display: 'standalone',
      start_url: '/',
    }, null, 2)}\n`;
  }

  function snippetFor(specs, hasIco) {
    const lines = [];
    if (hasIco) lines.push('<link rel="icon" href="/favicon.ico" sizes="32x32">');
    specs.filter((spec) => spec.id.startsWith('favicon') && spec.size !== 48).forEach((spec) => {
      lines.push(`<link rel="icon" type="image/png" sizes="${spec.size}x${spec.size}" href="/${spec.file}">`);
    });
    if (specs.some((spec) => spec.id === 'apple-180')) {
      lines.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    }
    if (specs.some((spec) => spec.manifest)) {
      lines.push('<link rel="manifest" href="/site.webmanifest">');
    }
    return lines.join('\n');
  }

  async function generateIcons() {
    if (!state.file || !state.image) return;
    const specs = selectedSpecs();
    if (!specs.length) {
      showToast('Select at least one icon size.', 'error');
      return;
    }

    clearIcons();
    el.iconBtn.disabled = true;
    el.iconBtn.querySelector('span').textContent = 'Rendering…';
    setStatus(el.iconStatus, 'Rendering', 'working');

    try {
      const rendered = [];
      for (const spec of specs) {
        const blob = await renderIcon(spec);
        rendered.push({ spec, blob, url: URL.createObjectURL(blob) });
      }
      state.icons = rendered;

      const files = rendered.map(({ spec, blob }) => ({ name: spec.file, blob }));
      const icoParts = rendered.filter(({ spec }) => spec.ico);
      if (icoParts.length) {
        files.unshift({
          name: 'favicon.ico',
          blob: await buildIco(icoParts.map((icon) => ({ size: icon.spec.size, blob: icon.blob }))),
        });
      }

      const name = el.iconAppName.value.trim() || 'My App';
      const snippet = snippetFor(specs, icoParts.length > 0);
      if (specs.some((spec) => spec.manifest)) {
        files.push({ name: 'site.webmanifest', blob: new Blob([manifestFor(specs, name)], { type: 'application/manifest+json' }) });
      }
      files.push({ name: 'head.html', blob: new Blob([`${snippet}\n`], { type: 'text/html' }) });

      state.iconZip = await buildZip(files);
      el.iconSnippet.value = snippet;

      el.iconGrid.replaceChildren();
      rendered.forEach(({ spec, blob, url }) => {
        const item = document.createElement('li');
        item.className = 'icon-card';

        const frame = document.createElement('div');
        frame.className = 'icon-frame checkerboard';
        const image = document.createElement('img');
        image.src = url;
        image.alt = `${spec.size} pixel icon preview`;
        image.width = Math.min(spec.size, 64);
        frame.appendChild(image);

        const caption = document.createElement('p');
        caption.className = 'icon-name';
        caption.textContent = spec.file;
        const meta = document.createElement('p');
        meta.className = 'icon-meta';
        meta.textContent = `${spec.size}×${spec.size} · ${formatBytes(blob.size)}`;

        item.append(frame, caption, meta);
        el.iconGrid.appendChild(item);
      });

      const total = files.reduce((sum, file) => sum + file.blob.size, 0);
      el.iconMessage.textContent = `${files.length} files · ${formatBytes(total)} before packing. ${describeIconSource()}`.trim();
      el.iconResultPanel.classList.remove('hidden');
      setStatus(el.iconStatus, 'Complete', 'ready');
      el.iconResultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setStatus(el.iconStatus, 'Failed', 'idle');
      showToast(error.message || 'Icon generation failed.', 'error');
    } finally {
      el.iconBtn.disabled = false;
      el.iconBtn.querySelector('span').textContent = 'Generate icon pack';
    }
  }

  /* --- ICO and ZIP containers ----------------------------------------------
     Both are written by hand: the payloads are already-compressed PNGs, so a
     stored (uncompressed) ZIP costs nothing, and an ICO is just a directory in
     front of the same PNG bytes. No library, no CDN dependency.
     ---------------------------------------------------------------------- */

  async function buildIco(entries) {
    const buffers = await Promise.all(entries.map(async (entry) => ({
      size: entry.size,
      bytes: new Uint8Array(await entry.blob.arrayBuffer()),
    })));

    const headerSize = 6 + buffers.length * 16;
    const total = buffers.reduce((sum, entry) => sum + entry.bytes.length, headerSize);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);

    view.setUint16(0, 0, true);                  // reserved
    view.setUint16(2, 1, true);                  // type: icon
    view.setUint16(4, buffers.length, true);

    let offset = headerSize;
    buffers.forEach((entry, index) => {
      const dir = 6 + index * 16;
      // 256 is encoded as 0 in a directory entry; nothing here is that large,
      // but the mask keeps the field honest.
      out[dir] = entry.size & 0xff;
      out[dir + 1] = entry.size & 0xff;
      out[dir + 2] = 0;                          // palette colours
      out[dir + 3] = 0;                          // reserved
      view.setUint16(dir + 4, 1, true);          // colour planes
      view.setUint16(dir + 6, 32, true);         // bits per pixel
      view.setUint32(dir + 8, entry.bytes.length, true);
      view.setUint32(dir + 12, offset, true);
      out.set(entry.bytes, offset);
      offset += entry.bytes.length;
    });

    return new Blob([out], { type: 'image/x-icon' });
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let bit = 0; bit < 8; bit += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function buildZip(files) {
    const encoder = new TextEncoder();
    const entries = await Promise.all(files.map(async (file) => {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      return { name: encoder.encode(file.name), bytes, crc: crc32(bytes) };
    }));

    const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.bytes.length, 0);
    const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
    const out = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(out.buffer);

    let offset = 0;
    const offsets = [];
    entries.forEach((entry) => {
      offsets.push(offset);
      view.setUint32(offset, 0x04034b50, true);        // local file header
      view.setUint16(offset + 4, 20, true);            // version needed
      view.setUint16(offset + 6, 0x0800, true);        // UTF-8 names
      view.setUint16(offset + 8, 0, true);             // stored, not deflated
      view.setUint16(offset + 10, 0, true);            // modified time
      view.setUint16(offset + 12, 0x21, true);         // modified date (1980-01-01)
      view.setUint32(offset + 14, entry.crc, true);
      view.setUint32(offset + 18, entry.bytes.length, true);
      view.setUint32(offset + 22, entry.bytes.length, true);
      view.setUint16(offset + 26, entry.name.length, true);
      view.setUint16(offset + 28, 0, true);            // extra field length
      out.set(entry.name, offset + 30);
      out.set(entry.bytes, offset + 30 + entry.name.length);
      offset += 30 + entry.name.length + entry.bytes.length;
    });

    const centralStart = offset;
    entries.forEach((entry, index) => {
      view.setUint32(offset, 0x02014b50, true);        // central directory header
      view.setUint16(offset + 4, 20, true);            // version made by
      view.setUint16(offset + 6, 20, true);            // version needed
      view.setUint16(offset + 8, 0x0800, true);
      view.setUint16(offset + 10, 0, true);
      view.setUint16(offset + 12, 0, true);
      view.setUint16(offset + 14, 0x21, true);
      view.setUint32(offset + 16, entry.crc, true);
      view.setUint32(offset + 20, entry.bytes.length, true);
      view.setUint32(offset + 24, entry.bytes.length, true);
      view.setUint16(offset + 28, entry.name.length, true);
      view.setUint32(offset + 42, offsets[index], true);
      out.set(entry.name, offset + 46);
      offset += 46 + entry.name.length;
    });

    view.setUint32(offset, 0x06054b50, true);          // end of central directory
    view.setUint16(offset + 8, entries.length, true);
    view.setUint16(offset + 10, entries.length, true);
    view.setUint32(offset + 12, offset - centralStart, true);
    view.setUint32(offset + 16, centralStart, true);

    return new Blob([out], { type: 'application/zip' });
  }

  /* --- SVG optimizer -------------------------------------------------------
     The document is parsed and re-serialized rather than regex-edited, so a
     comment inside a string or an attribute holding a `<` cannot corrupt the
     output. Everything removed here is either editor bookkeeping or precision
     no renderer can show.
     ---------------------------------------------------------------------- */

  const EDITOR_PREFIXES = ['inkscape', 'sodipodi', 'sketch', 'illustrator', 'graph', 'i', 'x', 'figma'];
  const EDITOR_NS = /(?:inkscape|sodipodi|sketch|bohemiancoding|adobe|figma)/i;
  // Attributes whose value is a list of numbers worth rounding. Anything not
  // listed keeps its value verbatim, because rounding an unknown attribute is
  // how an optimizer breaks a file.
  const NUMERIC_ATTRIBUTES = new Set([
    'd', 'points', 'transform', 'gradientTransform', 'patternTransform', 'viewBox',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'width', 'height', 'stroke-width', 'stroke-dashoffset', 'stroke-miterlimit',
    'opacity', 'fill-opacity', 'stroke-opacity', 'offset', 'fx', 'fy',
  ]);

  function roundNumbers(value, precision) {
    return value.replace(/-?\d*\.\d+(?:e[-+]?\d+)?/gi, (match) => {
      const number = Number(match);
      if (!Number.isFinite(number)) return match;
      const rounded = Number(number.toFixed(precision));
      // Leading zero on a fraction is a byte nobody needs: 0.5 -> .5
      return String(rounded).replace(/^(-?)0\./, '$1.');
    });
  }

  function optimizeSvg(text, options) {
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName.toLowerCase() !== 'svg') {
      throw new Error('That does not parse as an SVG document.');
    }
    const svg = parsed.documentElement;

    // Comments and editor bookkeeping first, so later passes walk less.
    const walker = parsed.createTreeWalker(svg, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((comment) => comment.remove());

    svg.querySelectorAll('metadata').forEach((node) => node.remove());
    if (options.stripTitles) {
      svg.querySelectorAll('title, desc').forEach((node) => node.remove());
    }
    if (options.stripScripts) {
      svg.querySelectorAll('script').forEach((node) => node.remove());
    }

    const elements = [svg, ...svg.querySelectorAll('*')];
    elements.forEach((node) => {
      if (node.prefix && EDITOR_PREFIXES.includes(node.prefix.toLowerCase()) && node !== svg) {
        node.remove();
        return;
      }
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name;
        const lower = name.toLowerCase();

        if (options.stripScripts && lower.startsWith('on')) {
          node.removeAttribute(name);
          return;
        }
        if (EDITOR_NS.test(lower) || EDITOR_NS.test(attribute.namespaceURI || '')) {
          node.removeAttribute(name);
          return;
        }
        if (!attribute.value.trim()) {
          node.removeAttribute(name);
          return;
        }

        let value = attribute.value.replace(/\s+/g, ' ').trim();
        if (NUMERIC_ATTRIBUTES.has(name)) {
          value = roundNumbers(value, options.precision)
            .replace(/\s*,\s*/g, ',')
            .replace(/\s+/g, ' ');
        }
        if (value !== attribute.value) node.setAttribute(name, value);
      });
    });

    // Empty containers are left behind by the passes above (and by every
    // editor); drop them innermost-first so a group of empty groups collapses.
    [...svg.querySelectorAll('g, defs')].reverse().forEach((node) => {
      if (!node.children.length && !(node.textContent || '').trim()) node.remove();
    });

    if (options.preferViewBox && svg.getAttribute('viewBox')) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
    }

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Indentation between tags is the last easy win, but only outside text
    // content: the space in <tspan>Hello</tspan> <tspan>World</tspan> is a
    // rendered glyph, and a blanket `>\s+<` regex fused the words together.
    const TEXT_CONTENT = new Set(['text', 'tspan', 'textpath', 'title', 'desc', 'style']);
    const whitespace = parsed.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
    const blanks = [];
    while (whitespace.nextNode()) {
      const node = whitespace.currentNode;
      if (node.nodeValue.trim()) continue;
      let inText = false;
      for (let parent = node.parentNode; parent && parent !== parsed; parent = parent.parentNode) {
        if (TEXT_CONTENT.has((parent.localName || '').toLowerCase())) { inText = true; break; }
      }
      if (inText) node.nodeValue = ' ';
      else blanks.push(node);
    }
    blanks.forEach((node) => node.remove());

    return new XMLSerializer()
      .serializeToString(svg)
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* Both panes render, so a heavy rounding or a dropped group is visible
     rather than inferred from the byte count. The markup goes through the same
     sanitizer used for uploads before it becomes an <img> source. */
  function renderSvgPreview(key, image, empty, markup) {
    if (state[key]) {
      URL.revokeObjectURL(state[key]);
      state[key] = null;
    }

    let safe = '';
    try {
      if (markup.trim()) safe = sanitizeSvg(markup);
    } catch {
      safe = '';
    }

    if (!safe) {
      image.removeAttribute('src');
      image.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    state[key] = URL.createObjectURL(new Blob([safe], { type: FORMATS.svg.mime }));
    image.src = state[key];
    image.classList.remove('hidden');
    empty.classList.add('hidden');
  }

  function renderSvgPreviews(input, output) {
    renderSvgPreview('svgSourcePreviewUrl', el.svgSourceImage, el.svgSourceEmpty, input);
    renderSvgPreview('svgOutputPreviewUrl', el.svgOutputImage, el.svgOutputEmpty, output);
  }

  function runSvgOptimize({ silent = false } = {}) {
    const input = el.svgInput.value.trim();
    if (!input) {
      el.svgOutput.value = '';
      state.svgOutput = '';
      el.svgSavings.textContent = '';
      el.svgBefore.textContent = '—';
      el.svgAfter.textContent = '—';
      el.svgRemoved.textContent = '—';
      renderSvgPreviews('', '');
      setStatus(el.svgStatus, 'Waiting', 'idle');
      return;
    }
    if (input.length > MAX_SVG_TEXT) {
      setStatus(el.svgStatus, 'Too large', 'idle');
      if (!silent) showToast('That SVG is larger than 4 MB. Optimize it with a build-time tool instead.', 'error');
      return;
    }

    try {
      const output = optimizeSvg(input, {
        precision: Number(el.svgPrecision.value),
        stripScripts: el.svgStripScripts.checked,
        stripTitles: el.svgStripTitles.checked,
        preferViewBox: el.svgPreferViewBox.checked,
      });
      state.svgOutput = output;
      el.svgOutput.value = output;

      const before = new Blob([input]).size;
      const after = new Blob([output]).size;
      const saved = before - after;
      el.svgBefore.textContent = formatBytes(before);
      el.svgAfter.textContent = formatBytes(after);
      el.svgRemoved.textContent = saved > 0 ? formatBytes(saved) : '0 B';
      el.svgSavings.textContent = saved > 0
        ? `−${Math.round((saved / before) * 100)}%`
        : 'already minimal';
      el.svgSavings.classList.toggle('is-positive', saved > 0);
      renderSvgPreviews(input, output);
      setStatus(el.svgStatus, 'Optimized', 'ready');
    } catch (error) {
      state.svgOutput = '';
      el.svgOutput.value = '';
      el.svgSavings.textContent = '';
      setStatus(el.svgStatus, 'Invalid', 'idle');
      // Half-typed markup is invalid by definition; only an explicit action
      // (opening a file, changing an option, asking for the output) toasts.
      el.svgSavings.textContent = 'not valid SVG yet';
      el.svgSavings.classList.remove('is-positive');
      renderSvgPreviews(input, '');
      if (!silent) showToast(error.message || 'The SVG could not be optimized.', 'error');
    }
  }

  let svgTimer = null;
  function scheduleSvgOptimize() {
    window.clearTimeout(svgTimer);
    svgTimer = window.setTimeout(() => runSvgOptimize({ silent: true }), 180);
  }

  async function openSvgFile(file) {
    if (!file) return;
    if (file.size > MAX_SVG_TEXT) {
      showToast('That SVG is larger than 4 MB. Optimize it with a build-time tool instead.', 'error');
      return;
    }
    el.svgInput.value = await file.text();
    el.svgFileInput.value = '';
    runSvgOptimize();
  }

  /* --- Wiring ------------------------------------------------------------- */

  function openInfo() {
    window.DevToolsMain?.openModal(el.infoModal);
    el.closeInfoBtn.focus();
  }

  function closeInfo() {
    window.DevToolsMain?.closeModal(el.infoModal);
    el.infoBtn.focus();
  }

  el.modeTabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  // Deep links and back/forward arrive as a hash change, not a reload.
  window.DevToolsMain.onHashState(() => setMode(modeFromHash() || 'convert', { updateHash: false }));
  el.dropZone.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => selectFile(el.fileInput.files[0]));
  el.clearBtn.addEventListener('click', clearAll);
  el.outputFormat.addEventListener('change', updateSettings);
  el.stripMetadata.addEventListener('change', updateSettings);
  el.quality.addEventListener('input', () => {
    el.qualityValue.value = `${el.quality.value}%`;
    el.qualityValue.textContent = `${el.quality.value}%`;
    clearResult();
  });
  el.outputScale.addEventListener('change', updateSettings);
  el.customWidth.addEventListener('input', updateSettings);
  el.convertBtn.addEventListener('click', convertImage);
  el.downloadBtn.addEventListener('click', downloadResult);

  el.iconTransparent.addEventListener('change', clearIcons);
  el.iconPadding.addEventListener('input', () => {
    el.iconPaddingValue.value = `${el.iconPadding.value}%`;
    el.iconPaddingValue.textContent = `${el.iconPadding.value}%`;
    clearIcons();
  });
  el.iconAppName.addEventListener('input', clearIcons);
  el.iconBtn.addEventListener('click', generateIcons);
  el.iconDownloadBtn.addEventListener('click', () => {
    if (!state.iconZip) return;
    downloadBlob(state.iconZip, `${baseName(el.iconAppName.value || 'icons')}-icons.zip`);
  });
  el.iconCopyBtn.addEventListener('click', async () => {
    if (!el.iconSnippet.value) return;
    await window.DevToolsMain.copyText(el.iconSnippet.value);
    showToast('Head snippet copied', 'success');
  });

  el.svgInput.addEventListener('input', scheduleSvgOptimize);
  el.svgPrecision.addEventListener('input', () => {
    el.svgPrecisionValue.value = el.svgPrecision.value;
    el.svgPrecisionValue.textContent = el.svgPrecision.value;
    runSvgOptimize();
  });
  [el.svgStripScripts, el.svgStripTitles, el.svgPreferViewBox]
    .forEach((toggle) => toggle.addEventListener('change', runSvgOptimize));
  el.svgOpenBtn.addEventListener('click', () => el.svgFileInput.click());
  el.svgFileInput.addEventListener('change', () => openSvgFile(el.svgFileInput.files[0]));
  el.svgCopyBtn.addEventListener('click', async () => {
    if (!state.svgOutput) {
      showToast('Nothing to copy yet.', 'error');
      return;
    }
    await window.DevToolsMain.copyText(state.svgOutput);
    showToast('Optimized SVG copied', 'success');
  });
  el.svgDownloadBtn.addEventListener('click', () => {
    if (!state.svgOutput) {
      showToast('Nothing to download yet.', 'error');
      return;
    }
    downloadBlob(new Blob([state.svgOutput], { type: FORMATS.svg.mime }), 'optimized.svg');
  });
  el.svgClearBtn.addEventListener('click', () => {
    el.svgInput.value = '';
    runSvgOptimize();
    el.svgInput.focus();
  });

  el.infoBtn.addEventListener('click', openInfo);
  el.closeInfoBtn.addEventListener('click', closeInfo);
  el.infoModal.addEventListener('click', (event) => { if (event.target === el.infoModal) closeInfo(); });

  ['dragenter', 'dragover'].forEach((eventName) => {
    el.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      el.dropZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    el.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      el.dropZone.classList.remove('drag-over');
    });
  });
  el.dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el.infoModal.classList.contains('is-open')) closeInfo();
  });

  buildSizeControls();
  // An <img> with no src renders the browser's broken-image mark and its alt
  // text, so the empty state has to be established before anything is typed.
  renderSvgPreviews('', '');
  clearAll();
  setMode(modeFromHash() || 'convert', { updateHash: Boolean(modeFromHash()) });
})();
