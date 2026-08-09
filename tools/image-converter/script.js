(function () {
  'use strict';

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MAX_PIXELS = 80_000_000;
  const MAX_DIMENSION = 16_384;
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

  const $ = (selector) => document.querySelector(selector);
  const el = {
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    sourcePreview: $('#sourcePreview'),
    sourceImage: $('#sourceImage'),
    sourceStatus: $('#sourceStatus'),
    fileName: $('#fileName'),
    fileNote: $('#fileNote'),
    sourceFormat: $('#sourceFormat'),
    sourceDimensions: $('#sourceDimensions'),
    sourceSize: $('#sourceSize'),
    clearBtn: $('#clearBtn'),
    settings: $('#settings'),
    emptySettings: $('#emptySettings'),
    outputFormat: $('#outputFormat'),
    outputStatus: $('#outputStatus'),
    formatHelp: $('#formatHelp'),
    qualityGroup: $('#qualityGroup'),
    quality: $('#quality'),
    qualityValue: $('#qualityValue'),
    backgroundGroup: $('#backgroundGroup'),
    backgroundColor: $('#backgroundColor'),
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
    infoBtn: $('#infoBtn'),
    infoModal: $('#infoModal'),
    closeInfoBtn: $('#closeInfoBtn'),
    toast: $('#toast'),
  };

  const state = {
    file: null,
    format: null,
    sourceBlob: null,
    sourceUrl: null,
    image: null,
    width: 0,
    height: 0,
    resultBlob: null,
    resultUrl: null,
    resultFilename: '',
  };
  let toastTimer = null;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  function showToast(message, type = 'info') {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = `toast ${type} is-visible`;
    toastTimer = setTimeout(() => { el.toast.className = 'toast'; }, 4200);
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

  function clearResult() {
    revokeUrl('resultUrl');
    state.resultBlob = null;
    state.resultFilename = '';
    el.resultImage.removeAttribute('src');
    el.resultPanel.classList.add('hidden');
    if (state.file) setStatus(el.outputStatus, 'Ready', 'loaded');
  }

  function clearAll() {
    clearResult();
    revokeUrl('sourceUrl');
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
    el.stripMetadata.checked = true;
    el.quality.value = '92';
    el.qualityValue.value = '92%';
    el.qualityValue.textContent = '92%';
    el.backgroundColor.value = '#ffffff';
    el.backgroundText.value = '#FFFFFF';
    setStatus(el.sourceStatus, 'Waiting', 'idle');
    setStatus(el.outputStatus, 'Not ready', 'idle');
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
      .replace(/^\uFEFF/, '')
      .trimStart();
    if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype\s+svg[\s\S]*?>\s*)?<svg(?:\s|>)/i.test(text)) return 'svg';
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
    if (format !== 'svg') return file;
    return new Blob([sanitizeSvg(await file.text())], { type: FORMATS.svg.mime });
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

    if (preserving) {
      el.formatHelp.textContent = 'Same-format output will preserve the original file bytes because metadata stripping is off.';
      el.privacyHelp.textContent = 'Disabled: same-format output preserves the original file and its embedded metadata.';
      el.metadataNotice.textContent = 'The original bytes will be downloaded unchanged. Quality and background controls do not apply.';
    } else if (el.stripMetadata.checked) {
      el.formatHelp.textContent = `${FORMATS[output].label} will be created locally at ${state.width} × ${state.height}.`;
      el.privacyHelp.textContent = 'Re-encode pixels without embedded EXIF, GPS, XMP, IPTC, or comments.';
      el.metadataNotice.textContent = "Metadata cleanup removes embedded fields, but cannot guarantee that an image's origin is undetectable.";
    } else {
      el.formatHelp.textContent = `${FORMATS[output].label} will be created locally at ${state.width} × ${state.height}.`;
      el.privacyHelp.textContent = 'Disabled: compatible metadata is preserved only when the original file bytes can be reused.';
      el.metadataNotice.textContent = 'Cross-format browser conversion re-encodes pixels, so source metadata will not be carried into this output.';
    }
    clearResult();
  }

  async function selectFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('Choose an image smaller than 50 MB.', 'error');
      return;
    }

    setStatus(el.sourceStatus, 'Detecting', 'working');
    setStatus(el.outputStatus, 'Not ready', 'idle');
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
      el.settings.disabled = false;
      el.settings.classList.remove('hidden');
      el.emptySettings.classList.add('hidden');
      setStatus(el.sourceStatus, 'Loaded', 'loaded');
      setStatus(el.outputStatus, 'Ready', 'loaded');
      updateSettings();
    } catch (error) {
      clearAll();
      showToast(error.message || 'The image could not be opened.', 'error');
    }
  }

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

  function makeOutputName(filename, format) {
    const base = (filename || 'image')
      .replace(/\.[^.]*$/, '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'image';
    return `${base}-converted.${FORMATS[format].extension}`;
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
      let blob;
      if (preserving) {
        blob = state.file;
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = state.width;
        canvas.height = state.height;
        const context = canvas.getContext('2d', { alpha: output !== 'jpeg' });
        if (!context) throw new Error('Canvas conversion is unavailable in this browser.');
        if (output === 'jpeg') {
          context.fillStyle = el.backgroundColor.value;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(state.image, 0, 0, state.width, state.height);
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
      el.resultDimensions.textContent = `${state.width} × ${state.height}`;
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

  function downloadResult() {
    if (!state.resultBlob || !state.resultUrl) return;
    const link = document.createElement('a');
    link.href = state.resultUrl;
    link.download = state.resultFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function syncColorFromPicker() {
    el.backgroundText.value = el.backgroundColor.value.toUpperCase();
    clearResult();
  }

  function syncColorFromText() {
    const value = el.backgroundText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      el.backgroundColor.value = value;
      el.backgroundText.value = value.toUpperCase();
      clearResult();
    } else {
      el.backgroundText.value = el.backgroundColor.value.toUpperCase();
      showToast('Enter a six-digit hex color such as #FFFFFF.', 'error');
    }
  }

  function openInfo() {
    window.DevToolsMain?.openModal(el.infoModal);
    el.closeInfoBtn.focus();
  }

  function closeInfo() {
    window.DevToolsMain?.closeModal(el.infoModal);
    el.infoBtn.focus();
  }

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
  el.backgroundColor.addEventListener('input', syncColorFromPicker);
  el.backgroundText.addEventListener('change', syncColorFromText);
  el.convertBtn.addEventListener('click', convertImage);
  el.downloadBtn.addEventListener('click', downloadResult);
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

  clearAll();
})();
