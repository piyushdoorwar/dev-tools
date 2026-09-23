import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

/** Build a small solid-colour image of the requested type, in the page. */
async function makeImage(page, { type = 'image/png', width = 6, height = 4 } = {}) {
  return page.evaluate(async ({ mime, w, h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    context.fillStyle = '#3366ff';
    context.fillRect(0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes: Array.from(bytes), type: blob.type };
  }, { mime: type, w: width, h: height });
}

/** The format list is built from the source image, so pick by label at runtime. */
async function selectFormat(page, pattern) {
  const value = await page.locator('#outputFormat option').evaluateAll(
    (options, source) => options.find((option) => new RegExp(source, 'i')
      .test(`${option.value} ${option.textContent}`))?.value,
    pattern.source,
  );
  expect(value, `no output format matching ${pattern}`).toBeTruthy();
  await page.locator('#outputFormat').selectOption(value);
  await page.locator('#outputFormat').dispatchEvent('change');
  return value;
}

async function loadImage(page, name, image) {
  await page.locator('#fileInput').setInputFiles({
    name,
    mimeType: image.type,
    buffer: Buffer.from(image.bytes),
  });
  await expect(page.locator('#sourceStatus')).not.toBeEmpty();
}

test('dropping an image reports its format, dimensions, and size', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page, { width: 6, height: 4 }));

  await expect(page.locator('#fileName')).toHaveText(/sample\.png/);
  await expect(page.locator('#sourceFormat')).toContainText(/png/i);
  await expect(page.locator('#sourceDimensions')).toContainText('6');
  await expect(page.locator('#sourceDimensions')).toContainText('4');
  await expect(page.locator('#sourceSize')).not.toBeEmpty();
});

test('the settings panel appears only once an image is loaded', async ({ page }) => {
  await openTool(page, 'image-toolkit');

  await expect(page.locator('#emptySettings')).toBeVisible();
  await loadImage(page, 'sample.png', await makeImage(page));
  await expect(page.locator('#settings')).toBeVisible();
});

test('converting to every supported format produces a result', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  const formats = await page.locator('#outputFormat option').evaluateAll(
    (options) => options.map((option) => option.value),
  );
  expect(formats.length).toBeGreaterThan(1);

  for (const format of formats) {
    await page.locator('#outputFormat').selectOption(format);
    await page.locator('#convertBtn').click();

    await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#resultFormat')).not.toBeEmpty();
    await expect(page.locator('#resultSize')).not.toBeEmpty();
    await expect(page.locator('#downloadBtn')).toBeEnabled();
  }
});

test('the converted file keeps the source dimensions', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page, { width: 8, height: 5 }));

  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultDimensions')).toContainText('8');
  await expect(page.locator('#resultDimensions')).toContainText('5');
});

test('the quality slider is offered for lossy formats only', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  await selectFormat(page, /jpe?g/i);
  await expect(page.locator('#qualityGroup')).toBeVisible();

  await selectFormat(page, /png/i);
  await expect(page.locator('#qualityGroup')).toBeHidden();
});

test('a background colour is offered when flattening transparency', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  await selectFormat(page, /jpe?g/i);
  await expect(page.locator('#backgroundGroup')).toBeVisible();
  await expect(page.locator('#backgroundPicker .swatch')).toBeVisible();
  await expect(page.locator('#backgroundText')).toHaveValue(/^#[0-9A-F]{6}$/i);
});

test('clearing the source resets the workspace', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  await page.locator('#clearBtn').click();
  await expect(page.locator('#dropZone')).toBeVisible();
  await expect(page.locator('#emptySettings')).toBeVisible();
});

test('animated GIFs are rejected rather than silently flattened', async ({ page }) => {
  await openTool(page, 'image-toolkit');

  // Minimal two-frame animated GIF.
  const gif = 'R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAQABAAACAkQBACH5BAkKAAAALAAAAAABAAEAAAICRAEAOw==';
  await page.locator('#fileInput').setInputFiles({
    name: 'animated.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(gif, 'base64'),
  });

  await expect(page.locator('#toast-container .toast-message')).toContainText(/animated|not supported|unsupported/i);
});

test('metadata stripping is offered and can be toggled', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  const strip = page.locator('#stripMetadata');
  await expect(strip).toBeAttached();

  await strip.uncheck({ force: true });
  await expect(strip).not.toBeChecked();

  await strip.check({ force: true });
  await expect(strip).toBeChecked();
});

test('the download button offers the converted file', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  await selectFormat(page, /jpe?g/i);
  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#downloadBtn').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.(jpe?g)$/i);
});

test('the info modal opens and closes', async ({ page }) => {
  await openTool(page, 'image-toolkit');

  await page.locator('#infoBtn').click();
  await expect(page.locator('#infoModal')).toBeVisible();

  await page.locator('#closeInfoBtn').click();
  await expect(page.locator('#infoModal')).toBeHidden();
});

/* --- Shared colour picker ------------------------------------------------ */

test('the JPEG background uses the shared picker, not a native colour input', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));
  await selectFormat(page, /jpe?g/i);

  await expect(page.locator('#backgroundGroup input[type="color"]')).toHaveCount(0);

  await page.locator('#backgroundPicker .swatch').click();
  await expect(page.locator('#backgroundPicker .picker__panel')).toBeVisible();

  // The opacity rail is meaningless for a canvas fill, so it is opted out of.
  await expect(page.locator('#backgroundPicker .slider--hue')).toBeVisible();
  await expect(page.locator('#backgroundPicker .slider--alpha')).toHaveCount(0);

  await page.locator('#backgroundPicker .preset[data-value="#FFD700"]').click();
  await expect(page.locator('#backgroundText')).toHaveValue('#FFD700');

  await page.keyboard.press('Escape');
  await expect(page.locator('#backgroundPicker .picker__panel')).toBeHidden();
});

test('typing a hex into the background field drives the picker', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));
  await selectFormat(page, /jpe?g/i);

  await page.locator('#backgroundText').fill('#00d09c');
  await page.locator('#backgroundText').dispatchEvent('change');
  await expect(page.locator('#backgroundText')).toHaveValue('#00D09C');

  await page.locator('#backgroundText').fill('nonsense');
  await page.locator('#backgroundText').dispatchEvent('change');
  await expect(page.locator('#backgroundText')).toHaveValue('#00D09C');
  await expect(page.locator('#toast-container .toast-message')).toContainText(/hex/i);
});

/* --- Favicon and app-icon pack ------------------------------------------- */

test('the icon mode renders every selected size from the source image', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'logo.png', await makeImage(page, { width: 64, height: 64 }));

  await page.locator('#modeIcons').click();
  await expect(page.locator('#iconPanel')).toBeVisible();
  await expect(page.locator('#convertPanel')).toBeHidden();

  const sizes = page.locator('#iconSizes input[type="checkbox"]');
  expect(await sizes.count()).toBeGreaterThan(4);

  await page.locator('#iconBtn').click();
  await expect(page.locator('#iconResultPanel')).toBeVisible({ timeout: 30_000 });
  expect(await page.locator('#iconGrid .icon-card').count()).toBe(await sizes.count());
  await expect(page.locator('#iconGrid .icon-name').first()).toContainText(/\.png$/);
});

test('the icon pack ships a head snippet and a manifest link', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'logo.png', await makeImage(page, { width: 64, height: 64 }));

  await page.locator('#modeIcons').click();
  await page.locator('#iconBtn').click();
  await expect(page.locator('#iconResultPanel')).toBeVisible({ timeout: 30_000 });

  const snippet = await page.locator('#iconSnippet').inputValue();
  expect(snippet).toMatch(/rel="icon"/);
  expect(snippet).toMatch(/apple-touch-icon/);
  expect(snippet).toMatch(/site\.webmanifest/);

  await page.locator('#iconCopyBtn').click();
  expect(await page.evaluate(() => window.__copied.at(-1))).toContain('site.webmanifest');
});

test('the icon pack downloads as a ZIP', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'logo.png', await makeImage(page, { width: 64, height: 64 }));

  await page.locator('#modeIcons').click();
  await page.locator('#iconBtn').click();
  await expect(page.locator('#iconResultPanel')).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#iconDownloadBtn').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  // A stored ZIP still has to start with a local file header and end with the
  // end-of-central-directory signature, or no unzipper will open it.
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  expect(bytes.subarray(-22, -18).toString('hex')).toBe('504b0506');
  expect(bytes.toString('latin1')).toContain('favicon.ico');
  expect(bytes.toString('latin1')).toContain('site.webmanifest');
});

test('deselecting every icon size is refused', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'logo.png', await makeImage(page, { width: 64, height: 64 }));

  await page.locator('#modeIcons').click();
  const boxes = page.locator('#iconSizes input[type="checkbox"]');
  const count = await boxes.count();
  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).uncheck({ force: true });
  }

  await page.locator('#iconBtn').click();
  await expect(page.locator('#toast-container .toast-message')).toContainText(/at least one/i);
  await expect(page.locator('#iconResultPanel')).toBeHidden();
});

test('the icon background uses the shared picker', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'logo.png', await makeImage(page, { width: 64, height: 64 }));

  await page.locator('#modeIcons').click();
  await page.locator('#iconBackgroundPicker .swatch').click();
  await expect(page.locator('#iconBackgroundPicker .picker__panel')).toBeVisible();
  await page.locator('#iconBackgroundPicker .preset[data-value="#00D09C"]').click();
  await expect(page.locator('#iconBackgroundText')).toHaveValue('#00D09C');
});

/* --- SVG optimizer -------------------------------------------------------- */

const MESSY_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by a drawing app -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="24" height="24" viewBox="0 0 24 24" inkscape:version="1.1">
  <metadata>some rdf</metadata>
  <g inkscape:label="Layer 1">
    <path d="M4.123456 12.987654 L 19.111111 12.987654" stroke="#000"/>
  </g>
  <g></g>
</svg>`;

test('optimizing an SVG strips editor cruft and reports the saving', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();
  await expect(page.locator('#svgPanel')).toBeVisible();
  await expect(page.locator('#sourcePanel')).toBeHidden();

  await page.locator('#svgInput').fill(MESSY_SVG);
  await expect(page.locator('#svgStatus')).toHaveText(/optimized/i);

  const output = await page.locator('#svgOutput').inputValue();
  expect(output).not.toMatch(/inkscape/i);
  expect(output).not.toMatch(/<metadata>/);
  expect(output).not.toMatch(/<!--/);
  expect(output).toMatch(/<path/);
  expect(output.length).toBeLessThan(MESSY_SVG.length);

  await expect(page.locator('#svgSavings')).toContainText('%');
  await expect(page.locator('#svgBefore')).not.toHaveText('—');
  await expect(page.locator('#svgAfter')).not.toHaveText('—');
});

test('the precision slider controls coordinate rounding', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();
  await page.locator('#svgInput').fill(MESSY_SVG);
  await expect(page.locator('#svgOutput')).not.toHaveValue('');

  await page.locator('#svgPrecision').fill('1');
  await page.locator('#svgPrecision').dispatchEvent('input');
  expect(await page.locator('#svgOutput').inputValue()).toContain('4.1');

  await page.locator('#svgPrecision').fill('3');
  await page.locator('#svgPrecision').dispatchEvent('input');
  expect(await page.locator('#svgOutput').inputValue()).toContain('4.123');
});

test('scripts and handlers are removed from an SVG when asked', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  await page.locator('#svgInput').fill(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
    + '<script>alert(1)</script><rect width="10" height="10" onclick="alert(2)"/></svg>',
  );
  await expect(page.locator('#svgOutput')).not.toHaveValue('');

  const output = await page.locator('#svgOutput').inputValue();
  expect(output).not.toMatch(/<script/i);
  expect(output).not.toMatch(/onclick/i);
  expect(output).toMatch(/<rect/);
});

test('the optimized SVG can be copied and downloaded', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();
  await page.locator('#svgInput').fill(MESSY_SVG);
  await expect(page.locator('#svgOutput')).not.toHaveValue('');

  await page.locator('#svgCopyBtn').click();
  expect(await page.evaluate(() => window.__copied.at(-1))).toMatch(/<svg/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#svgDownloadBtn').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('invalid SVG markup is reported instead of emitting broken output', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  await page.locator('#svgInput').fill('<svg><path d="M0 0"');
  await expect(page.locator('#svgStatus')).toHaveText(/invalid/i);
  await expect(page.locator('#svgOutput')).toHaveValue('');

  await page.locator('#svgClearBtn').click();
  await expect(page.locator('#svgStatus')).toHaveText(/waiting/i);
});

test('switching modes keeps the loaded image', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page));

  await page.locator('#modeIcons').click();
  await expect(page.locator('#iconSettings')).toBeVisible();

  await page.locator('#modeSvg').click();
  await expect(page.locator('#sourcePanel')).toBeHidden();

  await page.locator('#modeConvert').click();
  await expect(page.locator('#fileName')).toHaveText(/sample\.png/);
  await expect(page.locator('#settings')).toBeVisible();
});

test('both panes render so the optimization can be compared visually', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  await expect(page.locator('#svgSourceEmpty')).toBeVisible();
  await expect(page.locator('#svgOutputEmpty')).toBeVisible();

  await page.locator('#svgInput').fill(MESSY_SVG);
  await expect(page.locator('#svgOutput')).not.toHaveValue('');

  for (const id of ['#svgSourceImage', '#svgOutputImage']) {
    await expect(page.locator(id)).toBeVisible();
    await expect(page.locator(id)).toHaveAttribute('src', /^blob:/);
    expect(await page.locator(id).evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  }

  await page.locator('#svgClearBtn').click();
  await expect(page.locator('#svgSourceImage')).toBeHidden();
  await expect(page.locator('#svgOutputEmpty')).toBeVisible();
});

/* --- Output size ---------------------------------------------------------- */

const SQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">'
  + '<circle cx="75" cy="75" r="70" fill="#8B5CF6"/></svg>';

async function loadSvg(page, markup = SQUARE_SVG) {
  await page.locator('#fileInput').setInputFiles({
    name: 'favicon.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(markup),
  });
  await expect(page.locator('#sourceStatus')).toHaveText(/loaded/i);
}

test('a vector source offers higher output resolutions and defaults above 1x', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadSvg(page);

  const labels = await page.locator('#outputScale option').allTextContents();
  expect(labels.join(' ')).toMatch(/1x/);
  expect(labels.join(' ')).toMatch(/300 × 300/);
  expect(labels.join(' ')).toMatch(/600 × 600/);
  expect(labels.join(' ')).toMatch(/custom/i);

  // An SVG at its declared 150 px is what made conversions look low-res.
  await expect(page.locator('#outputScale')).toHaveValue('2');
  await expect(page.locator('#formatHelp')).toContainText('300 × 300');
});

test('the chosen output size is what gets rendered', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'image-toolkit');
  await loadSvg(page);

  await page.locator('#outputScale').selectOption('4');
  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultDimensions')).toHaveText('600 × 600');

  const decoded = await page.locator('#resultImage').evaluate((img) => new Promise((resolve) => {
    if (img.naturalWidth) resolve(img.naturalWidth);
    else img.onload = () => resolve(img.naturalWidth);
  }));
  expect(decoded).toBe(600);
});

test('a custom width drives the height from the source aspect ratio', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'wide.png', await makeImage(page, { width: 8, height: 4 }));

  await page.locator('#outputScale').selectOption('custom');
  await expect(page.locator('#customSizeRow')).toBeVisible();

  await page.locator('#customWidth').fill('400');
  await page.locator('#customWidth').dispatchEvent('input');
  await expect(page.locator('#customHeight')).toHaveText('200');

  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultDimensions')).toHaveText('400 × 200');
});

test('a raster source keeps its own size by default', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await loadImage(page, 'sample.png', await makeImage(page, { width: 6, height: 4 }));

  await expect(page.locator('#outputScale')).toHaveValue('1');
  await expect(page.locator('#sizeHelp')).toContainText(/6 × 4/);
});

test('icon sizes are rasterized from the vector, not from its declared size', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-toolkit');
  await loadSvg(page);

  await page.locator('#modeIcons').click();
  await page.locator('#iconBtn').click();
  await expect(page.locator('#iconResultPanel')).toBeVisible({ timeout: 30_000 });

  const widths = await page.locator('#iconGrid img').evaluateAll(
    (images) => Promise.all(images.map((img) => (img.naturalWidth
      ? img.naturalWidth
      : new Promise((resolve) => { img.onload = () => resolve(img.naturalWidth); })))),
  );
  expect(Math.max(...widths)).toBe(512);
});

test('a viewBox-only SVG still fits inside both preview frames', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  // No width/height, so the <img> has no intrinsic size and used to fall back
  // to 300x150 and overflow the frame.
  await page.locator('#svgInput').fill(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    + '<circle cx="50" cy="50" r="46" fill="#8B5CF6"/></svg>',
  );
  await expect(page.locator('#svgOutput')).not.toHaveValue('');

  for (const id of ['#svgSourceImage', '#svgOutputImage']) {
    const fits = await page.locator(id).evaluate((img) => {
      const frame = img.parentElement.getBoundingClientRect();
      const box = img.getBoundingClientRect();
      return box.width > 0
        && box.left >= frame.left - 1 && box.right <= frame.right + 1
        && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
    });
    expect(fits, `${id} overflows its preview frame`).toBe(true);
  }
});

/* --- Deep-linkable tabs --------------------------------------------------- */

test('each mode has its own hash and switching tabs updates it', async ({ page }) => {
  await openTool(page, 'image-toolkit');

  // No hash until a tab is chosen, so the default URL stays clean.
  expect(new URL(page.url()).hash).toBe('');

  await page.locator('#modeIcons').click();
  await expect(page).toHaveURL(/#icons$/);

  await page.locator('#modeSvg').click();
  await expect(page).toHaveURL(/#svg$/);

  await page.locator('#modeConvert').click();
  await expect(page).toHaveURL(/#convert$/);
});

test('opening a mode hash directly starts on that tab', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.goto('/tools/image-toolkit/#svg');

  await expect(page.locator('#svgPanel')).toBeVisible();
  await expect(page.locator('#convertPanel')).toBeHidden();
  await expect(page.locator('#modeSvg')).toHaveAttribute('aria-selected', 'true');
});

test('a reload returns to the tab the hash names', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeIcons').click();

  await page.reload();
  await expect(page.locator('#iconPanel')).toBeVisible();
  await expect(page.locator('#modeIcons')).toHaveAttribute('aria-selected', 'true');
});

test('an unknown hash falls back to the default tab', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.goto('/tools/image-toolkit/#nonsense');

  await expect(page.locator('#convertPanel')).toBeVisible();
  await expect(page.locator('#modeConvert')).toHaveAttribute('aria-selected', 'true');
});

/* --- SVG editor chrome ---------------------------------------------------- */

test('the empty SVG panel shows no broken-image placeholder', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  // An <img> with no src paints the browser's broken-image mark and its alt
  // text, which is what used to sit in the corner of both frames.
  for (const id of ['#svgSourceImage', '#svgOutputImage']) {
    await expect(page.locator(id)).toBeHidden();
    expect(await page.locator(id).evaluate((img) => img.hasAttribute('src'))).toBe(false);
  }
  await expect(page.locator('#svgSourceEmpty')).toBeVisible();
  await expect(page.locator('#svgOutputEmpty')).toBeVisible();
});

test('the SVG editors carry monospace type and a focus ring', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  const idle = await page.locator('#svgInput').evaluate((node) => {
    const style = getComputedStyle(node);
    return { font: style.fontFamily, shadow: style.boxShadow };
  });
  expect(idle.font).toMatch(/mono/i);
  expect(idle.shadow).toBe('none');

  await page.locator('#svgInput').focus();
  const focused = await page.locator('#svgInput').evaluate((node) => getComputedStyle(node).boxShadow);
  expect(focused).not.toBe('none');
});

test('the output editor reads as a result until it has one', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  await expect(page.locator('#svgOutput')).toHaveCSS('border-style', 'dashed');
  await page.locator('#svgInput').fill(MESSY_SVG);
  await expect(page.locator('#svgOutput')).not.toHaveValue('');
  await expect(page.locator('#svgOutput')).toHaveCSS('border-style', 'solid');
});

test('the two SVG columns line up at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  const top = async (selector) => (await page.locator(selector).boundingBox()).y;

  // The header buttons differ per column, so without a shared row height they
  // pushed one column's editor down.
  expect(await top('#svgInput')).toBeCloseTo(await top('#svgOutput'), 0);
  expect(await top('#svgSourcePreview')).toBeCloseTo(await top('#svgOutputPreview'), 0);

  // The numbers and the options read before the rendered comparison.
  const order = ['#svgOutput', '.svg-facts', '.svg-options', '#svgOutputPreview'];
  const tops = [];
  for (const selector of order) tops.push(await top(selector));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  // And it reads as a toolbar action, not a primary button.
  const button = await page.locator('#svgOpenBtn').boundingBox();
  expect(button.height).toBeLessThan(36);
});

test('the SVG actions are icon buttons with tooltips', async ({ page }) => {
  await openTool(page, 'image-toolkit');
  await page.locator('#modeSvg').click();

  for (const [id, label] of [
    ['#svgOpenBtn', /open/i],
    ['#svgClearBtn', /clear/i],
    ['#svgCopyBtn', /copy/i],
    ['#svgDownloadBtn', /download/i],
  ]) {
    const button = page.locator(id);
    // Icon only: the label lives in the tooltip, and main.js mirrors it into
    // aria-label so the button is still announced.
    await expect(button).toHaveText('');
    await expect(button).toHaveAttribute('data-tooltip', label);
    await expect(button).toHaveAttribute('aria-label', label);
    await expect(button.locator('svg')).toHaveCount(1);

    const box = await button.boundingBox();
    expect(box.width).toBeLessThan(44);
  }

  const tooltipVisibility = () => page.locator('#svgCopyBtn')
    .evaluate((node) => getComputedStyle(node, '::after').visibility);

  expect(await tooltipVisibility()).toBe('hidden');
  await page.locator('#svgCopyBtn').hover();
  // visibility is part of the reveal transition, so it flips when it finishes.
  await expect.poll(tooltipVisibility).toBe('visible');
});
