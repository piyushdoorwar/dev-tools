import { expect, test } from '@playwright/test';
import { openTool, lastCopied, captureDownload, downloadText } from '../helpers.js';

const TOOL = 'svg-placeholder-generator';

const output = (page) => page.locator('#output').inputValue();
const format = (page, value) => page.locator(`#formatSwitch [data-value="${value}"]`).click();
const fontSizeInSvg = async (page) => Number((await output(page)).match(/font-size="(\d+)"/)[1]);

async function downloadBytes(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function chooseDownload(page, value) {
  await page.locator('#downloadBtn').click();
  return captureDownload(page, () => page.locator(`#downloadDd .dd__option[data-value="${value}"]`).click());
}

async function choosePreset(page, id) {
  await page.locator('#presetDd .dd__trigger').click();
  await page.locator(`#presetDd .dd__option[data-value="${id}"]`).click();
}

test.describe('svg-placeholder-generator', () => {
  test('opens with a live sample image, no console errors and no subtitle', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator('h1.app-title')).toHaveText('SVG Placeholder Generator');
    await expect(page.locator('.app-subtitle')).toHaveCount(0);
    const svg = await output(page);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="640" height="360"/);
    expect(svg).toContain('>640 × 360</text>');
    await expect(page.locator('#previewImg')).toBeVisible();
    await expect(page.locator('#meta')).toHaveText(/640 × 360 · \d+ B SVG/);
    // No "Build" button: this tool is live.
    await expect(page.getByRole('button', { name: /^(build|generate)/i })).toHaveCount(0);
    // Help modal opens from the info button.
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpModal')).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#helpModal')).not.toHaveClass(/is-open/);
    expect(errors).toEqual([]);
  });

  test('escapes text, the data URI decodes to the markup and the SVG download matches', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator('#text').fill('<script>& "Hi"');
    const svg = await output(page);
    expect(svg).toContain('&lt;script&gt;&amp; &quot;Hi&quot;');
    expect(svg).not.toContain('<script>');

    await format(page, 'uri');
    const uri = await output(page);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1])).toBe(svg);

    const download = await chooseDownload(page, 'svg');
    expect(download.suggestedFilename()).toBe('placeholder-640x360.svg');
    expect(await downloadText(download)).toBe(svg);
    expect(errors).toEqual([]);
  });

  test('every output format encodes the same SVG and copy uses the active one', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator('#text').fill('Héllo ✓');
    const svg = await output(page);

    await format(page, 'base64');
    const b64 = await output(page);
    expect(b64.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(b64.split(',')[1], 'base64').toString('utf8')).toBe(svg);
    await expect(page.locator('#outputStatus')).toHaveText('Base64 data URI');

    await format(page, 'img');
    const img = await output(page);
    const src = img.match(/^<img src="([^"]+)" width="640" height="360" alt="Héllo ✓">$/);
    expect(src).not.toBeNull();
    expect(decodeURIComponent(src[1].split(',')[1])).toBe(svg);

    await format(page, 'css');
    const css = await output(page);
    const url = css.match(/^background-image: url\("([^"]+)"\);$/);
    expect(url).not.toBeNull();
    expect(decodeURIComponent(url[1].split(',')[1])).toBe(svg);

    await page.locator('#copyBtn').click();
    expect(await lastCopied(page)).toBe(css);

    // The chosen format is linkable.
    expect(new URL(page.url()).hash).toBe('#css');
    await page.reload();
    await expect(page.locator('#formatSwitch [data-value="css"]')).toHaveAttribute('aria-checked', 'true');

    // Arrow keys move through the format segment.
    await page.locator('#formatSwitch [data-value="css"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#formatSwitch [data-value="img"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#formatSwitch [data-value="img"]')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('size presets fill the dimensions and swap flips them', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator('#presetValue')).toHaveText('Custom');

    await choosePreset(page, 'og');
    await expect(page.locator('#width')).toHaveValue('1200');
    await expect(page.locator('#height')).toHaveValue('630');
    expect(await output(page)).toContain('width="1200" height="630" viewBox="0 0 1200 630"');
    await expect(page.locator('#presetValue')).toContainText('Open Graph');

    await choosePreset(page, 'leader');
    await expect(page.locator('#width')).toHaveValue('728');
    await expect(page.locator('#height')).toHaveValue('90');

    // Swapping to 90 × 728 matches no preset.
    await page.locator('#swapSizeBtn').click();
    await expect(page.locator('#width')).toHaveValue('90');
    await expect(page.locator('#height')).toHaveValue('728');
    await expect(page.locator('#presetValue')).toHaveText('Custom');

    // Typing a preset's size selects it.
    await page.locator('#width').fill('150');
    await page.locator('#height').fill('150');
    await expect(page.locator('#presetValue')).toContainText('Avatar');
    expect(errors).toEqual([]);
  });

  test('auto font size scales with the image and a manual size overrides it', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator('#fontSizeMode [data-value="auto"]')).toHaveAttribute('aria-checked', 'true');
    expect(await fontSizeInSvg(page)).toBe(64); // min(640/10, 360/4)

    await page.locator('#width').fill('100');
    await page.locator('#height').fill('40');
    const tiny = await fontSizeInSvg(page);
    expect(tiny).toBeLessThanOrEqual(10);
    expect(tiny).toBeGreaterThanOrEqual(1);

    await page.locator('#width').fill('1920');
    await page.locator('#height').fill('1080');
    const large = await fontSizeInSvg(page);
    expect(large).toBeGreaterThan(150);

    // Long text shrinks so it stays inside the width (≈0.6em per glyph).
    await page.locator('#text').fill('A much longer placeholder label than the default');
    const long = await fontSizeInSvg(page);
    expect(long).toBeLessThan(large);
    expect(long * 0.6 * 48).toBeLessThanOrEqual(1920);

    // The field shows the auto size; typing into it switches to Custom.
    await expect(page.locator('#fontSize')).toHaveValue(String(long));
    await page.locator('#fontSize').fill('20');
    await expect(page.locator('#fontSizeMode [data-value="custom"]')).toHaveAttribute('aria-checked', 'true');
    expect(await fontSizeInSvg(page)).toBe(20);
    await page.locator('#width').fill('800');
    expect(await fontSizeInSvg(page)).toBe(20);

    await page.locator('#fontSizeMode [data-value="auto"]').click();
    expect(await fontSizeInSvg(page)).not.toBe(20);
    expect(errors).toEqual([]);
  });

  test('weight, family, radius and colours reach the markup', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator('#fontWeight [data-value="700"]').click();
    expect(await output(page)).toContain('font-weight="700"');

    await page.locator('#familyDd .dd__trigger').click();
    await page.locator('#familyDd .dd__option[data-value="monospace"]').click();
    expect(await output(page)).toContain('font-family="monospace"');

    await page.locator('#radius').fill('24');
    expect(await output(page)).toContain('rx="24"');
    await expect(page.locator('#radiusRange')).toHaveValue('24');

    await page.locator('#background').fill('#123');
    await page.locator('#foreground').fill('#abcdef');
    let svg = await output(page);
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('fill="#ABCDEF"');

    await page.locator('#swapColorsBtn').click();
    await expect(page.locator('#background')).toHaveValue('#ABCDEF');
    svg = await output(page);
    expect(svg).toMatch(/<rect[^>]*fill="#ABCDEF"/);

    await page.locator('#shuffleBtn').click();
    const bg = await page.locator('#background').inputValue();
    expect(bg).toMatch(/^#[0-9A-F]{6}$/);
    expect(await output(page)).toContain(`fill="${bg}"`);

    await page.locator('#resetBtn').click();
    svg = await output(page);
    expect(svg).toContain('fill="#6739B7"');
    expect(svg).not.toContain('rx=');
    expect(svg).not.toContain('font-weight');
    expect(errors).toEqual([]);
  });

  test('typing a hex value syncs the picker swatch without blurring', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    const field = page.locator('#background');
    await field.click();
    await field.fill('#00d09c');
    await expect(field).toBeFocused();
    const picked = await page.evaluate(() => document.getElementById('backgroundPicker')._colorPicker.getColor());
    expect(picked).toBe('#00D09C');
    await expect(page.locator('#backgroundPicker .swatch__fill')).toHaveCSS('background-color', 'rgb(0, 208, 156)');

    // And the reverse: the picker drives the field.
    await page.evaluate(() => {
      const node = document.getElementById('foregroundPicker');
      node._colorPicker.setColor('#FF6B9D');
      node.dispatchEvent(new CustomEvent('picker:change', { detail: { hex: '#FF6B9D' } }));
    });
    await expect(page.locator('#foreground')).toHaveValue('#FF6B9D');
    expect(await output(page)).toContain('fill="#FF6B9D"');
    expect(errors).toEqual([]);
  });

  test('PNG download is a real PNG at 1× and 2×', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await choosePreset(page, 'mrec');
    const one = await chooseDownload(page, 'png');
    expect(one.suggestedFilename()).toBe('placeholder-300x250.png');
    const bytes = await downloadBytes(one);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(300); // IHDR width
    expect(bytes.readUInt32BE(20)).toBe(250); // IHDR height

    const two = await chooseDownload(page, 'png2');
    expect(two.suggestedFilename()).toBe('placeholder-300x250@2x.png');
    const bytes2 = await downloadBytes(two);
    expect(bytes2.readUInt32BE(16)).toBe(600);
    expect(bytes2.readUInt32BE(20)).toBe(500);
    expect(errors).toEqual([]);
  });

  test('an invalid field is flagged inline and the last good image stays', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    const good = await output(page);

    await page.locator('#width').fill('0');
    await expect(page.locator('#width')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#widthError')).toBeVisible();
    await expect(page.locator('#widthError')).toContainText('1 to 10,000');
    await expect(page.locator('#status')).toHaveClass(/error/);
    // Last valid result is kept (dimmed), not blanked.
    await expect(page.locator('#output')).toHaveValue(good);
    await expect(page.locator('#previewImg')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/is-stale/);
    // Other fields are not blamed.
    await expect(page.locator('#height')).not.toHaveAttribute('aria-invalid', 'true');

    // Export is refused while invalid.
    await page.evaluate(() => { window.__copied.length = 0; });
    await page.locator('#copyBtn').click();
    expect(await lastCopied(page)).toBeNull();
    await expect(page.locator('#toast-container')).toContainText('Fix the highlighted field');

    await page.locator('#width').fill('10001');
    await expect(page.locator('#widthError')).toBeVisible();
    await page.locator('#width').fill('12.5');
    await expect(page.locator('#widthError')).toBeVisible();

    await page.locator('#width').fill('320');
    await expect(page.locator('#width')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#widthError')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/is-stale/);
    expect(await output(page)).toContain('width="320"');

    // Bad colour and a custom font size of 0 are each flagged at their field.
    await page.locator('#background').fill('#12345');
    await expect(page.locator('#backgroundError')).toBeVisible();
    await page.locator('#background').fill('#123456');
    await expect(page.locator('#backgroundError')).toBeHidden();
    await page.locator('#fontSize').fill('0');
    await expect(page.locator('#fontSizeError')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('rejects text XML cannot represent', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    const good = await output(page);
    await page.locator('#text').fill('bell\u0007');
    await expect(page.locator('#textError')).toBeVisible();
    await expect(page.locator('#text')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#output')).toHaveValue(good);
    await page.locator('#text').fill('ok');
    await expect(page.locator('#textError')).toBeHidden();
    expect(await output(page)).toContain('>ok</text>');
    expect(errors).toEqual([]);
  });

  test('preview is fitted, never distorted, and the layout fills the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { errors } = await openTool(page, TOOL);
    await choosePreset(page, 'fhd');
    const fit = await page.evaluate(() => {
      const img = document.getElementById('previewImg');
      const stage = document.getElementById('stage').getBoundingClientRect();
      const box = img.getBoundingClientRect();
      return { ratio: box.width / box.height, inside: box.width <= stage.width && box.height <= stage.height };
    });
    expect(fit.inside).toBe(true);
    expect(Math.abs(fit.ratio - 1920 / 1080)).toBeLessThan(0.02);
    await expect(page.locator('#status')).toContainText('shown at');

    const layout = await page.evaluate(() => {
      const settings = document.querySelector('.settings-panel').getBoundingClientRect();
      const output = document.querySelector('.output-panel').getBoundingClientRect();
      return { settingsBottom: settings.bottom, outputBottom: output.bottom, pageScrolls: document.documentElement.scrollHeight > innerHeight };
    });
    expect(layout.pageScrolls).toBe(false);
    expect(Math.abs(layout.settingsBottom - layout.outputBottom)).toBeLessThan(2);
    expect(layout.settingsBottom).toBeGreaterThan(900 - 40);
    expect(errors).toEqual([]);
  });

  test('uses shared icons and fits a 390px screen', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    const missing = await page.evaluate(() => [...document.querySelectorAll('use')]
      .map((use) => use.getAttribute('href').slice(1))
      .filter((id) => !document.getElementById(id)));
    expect(missing).toEqual([]);
    const info = await page.locator('#helpBtn').boundingBox();
    expect(Math.round(info.width)).toBe(38);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#previewImg')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
