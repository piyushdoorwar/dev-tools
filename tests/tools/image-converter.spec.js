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
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page, { width: 6, height: 4 }));

  await expect(page.locator('#fileName')).toHaveText(/sample\.png/);
  await expect(page.locator('#sourceFormat')).toContainText(/png/i);
  await expect(page.locator('#sourceDimensions')).toContainText('6');
  await expect(page.locator('#sourceDimensions')).toContainText('4');
  await expect(page.locator('#sourceSize')).not.toBeEmpty();
});

test('the settings panel appears only once an image is loaded', async ({ page }) => {
  await openTool(page, 'image-converter');

  await expect(page.locator('#emptySettings')).toBeVisible();
  await loadImage(page, 'sample.png', await makeImage(page));
  await expect(page.locator('#settings')).toBeVisible();
});

test('converting to every supported format produces a result', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'image-converter');
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
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page, { width: 8, height: 5 }));

  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultDimensions')).toContainText('8');
  await expect(page.locator('#resultDimensions')).toContainText('5');
});

test('the quality slider is offered for lossy formats only', async ({ page }) => {
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page));

  await selectFormat(page, /jpe?g/i);
  await expect(page.locator('#qualityGroup')).toBeVisible();

  await selectFormat(page, /png/i);
  await expect(page.locator('#qualityGroup')).toBeHidden();
});

test('a background colour is offered when flattening transparency', async ({ page }) => {
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page));

  await selectFormat(page, /jpe?g/i);
  await expect(page.locator('#backgroundGroup')).toBeVisible();
  await expect(page.locator('#backgroundColor')).toBeVisible();
});

test('clearing the source resets the workspace', async ({ page }) => {
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page));

  await page.locator('#clearBtn').click();
  await expect(page.locator('#dropZone')).toBeVisible();
  await expect(page.locator('#emptySettings')).toBeVisible();
});

test('animated GIFs are rejected rather than silently flattened', async ({ page }) => {
  await openTool(page, 'image-converter');

  // Minimal two-frame animated GIF.
  const gif = 'R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQJCgAAACwAAAAAAQABAAACAkQBACH5BAkKAAAALAAAAAABAAEAAAICRAEAOw==';
  await page.locator('#fileInput').setInputFiles({
    name: 'animated.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(gif, 'base64'),
  });

  await expect(page.locator('#toast')).toContainText(/animated|not supported|unsupported/i);
});

test('metadata stripping is offered and can be toggled', async ({ page }) => {
  await openTool(page, 'image-converter');
  await loadImage(page, 'sample.png', await makeImage(page));

  const strip = page.locator('#stripMetadata');
  await expect(strip).toBeAttached();

  await strip.uncheck({ force: true });
  await expect(strip).not.toBeChecked();

  await strip.check({ force: true });
  await expect(strip).toBeChecked();
});

test('the download button offers the converted file', async ({ page }) => {
  await openTool(page, 'image-converter');
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
  await openTool(page, 'image-converter');

  await page.locator('#infoBtn').click();
  await expect(page.locator('#infoModal')).toBeVisible();

  await page.locator('#closeInfoBtn').click();
  await expect(page.locator('#infoModal')).toBeHidden();
});
