import { expect, test } from '@playwright/test';
import { openTool, lastCopied, setClipboardText } from '../helpers.js';

const formats = (page) => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#formats .result-row')].map((r) => [
    r.querySelector('.result-label').textContent,
    r.querySelector('.result-value').textContent,
  ])));

const checks = (page) => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.check')].map((c) => [
    c.dataset.check,
    c.querySelector('.check-verdict').textContent,
  ])));

// Press inside the pad, then move to the target before releasing: the pad
// tracks with pointer capture, so the release may land outside it.
async function drag(page, box, x, y) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.up();
}

async function enter(page, field, value) {
  await page.fill(`#${field}-input`, value);
  await page.locator(`#${field}-input`).dispatchEvent('input');
}

test('every notation for one colour resolves to the same value', async ({ page }) => {
  const { errors } = await openTool(page, 'color-converter');

  // Every one of these is tomato, #FF6347.
  for (const notation of [
    '#FF6347',
    '#ff6347',
    'rgb(255 99 71)',
    'rgb(255, 99, 71)',
    'hsl(9.13 100% 63.92%)',
    'tomato',
  ]) {
    await enter(page, 'fg', notation);
    const f = await formats(page);
    expect(f.HEX, `${notation} did not resolve to #FF6347`).toBe('#FF6347');
    expect(f.RGB).toBe('rgb(255 99 71)');
  }
  expect(errors).toEqual([]);
});

test('shorthand hex expands by digit doubling', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#f63');
  expect((await formats(page)).HEX).toBe('#FF6633');
});

test('OKLCH round-trips through sRGB without drifting a channel', async ({ page }) => {
  await openTool(page, 'color-converter');

  for (const hex of ['#FF6347', '#6739B7', '#00D09C', '#123456', '#FFFFFF', '#000000']) {
    await enter(page, 'fg', hex);
    const oklch = (await formats(page)).OKLCH;
    await enter(page, 'fg', oklch);
    expect((await formats(page)).HEX, `${hex} → ${oklch} lost precision`).toBe(hex);
  }
});

test('OKLCH lightness is perceptual, not the sRGB channel value', async ({ page }) => {
  // Mid-grey #777777 sits near 0.47 of the 0–255 range but around 0.55 in
  // OKLCH. A tool that just scaled the channel would report the former.
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#777777');
  const [, L] = (await formats(page)).OKLCH.match(/oklch\(([\d.]+)/);
  expect(Number(L)).toBeGreaterThan(0.53);
  expect(Number(L)).toBeLessThan(0.58);
});

test('an out-of-gamut oklch() is flagged and keeps what was typed', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', 'oklch(0.7 0.35 150)');

  await expect(page.locator('#gamut-note')).toBeVisible();
  const f = await formats(page);
  // The clipped rows are still displayable...
  expect(f.HEX).toMatch(/^#[0-9A-F]{6}$/);
  // ...but the OKLCH row must not have been rewritten to the clipped colour.
  expect(f.OKLCH).toBe('oklch(0.7 0.35 150)');

  await enter(page, 'fg', '#00D09C');
  await expect(page.locator('#gamut-note')).toBeHidden();
});

test('alpha survives every format and is composited for contrast', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'bg', '#000000');
  await enter(page, 'fg', '#FFFFFF80');

  const f = await formats(page);
  expect(f.HEX).toBe('#FFFFFF80');
  expect(f.RGB).toMatch(/rgb\(255 255 255 \/ 50\.2%\)/);

  // White at ~50% over black is mid-grey, not white: the ratio must be well
  // below the 21:1 an uncomposited comparison would report.
  const ratio = Number((await page.locator('#ratio').textContent()).replace(':1', ''));
  expect(ratio).toBeGreaterThan(4);
  expect(ratio).toBeLessThan(11);
  await expect(page.locator('#ratio-note')).toContainText('composited');
});

test('contrast ratios match the WCAG reference values', async ({ page }) => {
  const { errors } = await openTool(page, 'color-converter');

  for (const [fg, bg, expected] of [
    ['#000000', '#FFFFFF', '21.00:1'],
    ['#FFFFFF', '#FFFFFF', '1.00:1'],
    ['#777777', '#FFFFFF', '4.47:1'],
    ['#767676', '#FFFFFF', '4.54:1'],
  ]) {
    await enter(page, 'fg', fg);
    await enter(page, 'bg', bg);
    await expect(page.locator('#ratio')).toHaveText(expected);
  }
  expect(errors).toEqual([]);
});

test('the pass/fail badges follow the WCAG thresholds', async ({ page }) => {
  await openTool(page, 'color-converter');

  // 4.47:1 — clears large-text AA (3) but misses normal-text AA (4.5).
  await enter(page, 'fg', '#777777');
  await enter(page, 'bg', '#FFFFFF');
  expect(await checks(page)).toEqual({
    'Normal text AA': 'Fail',
    'Normal text AAA': 'Fail',
    'Large text AA': 'Pass',
    'Large text AAA': 'Fail',
    'UI & graphics AA': 'Pass',
  });

  await enter(page, 'fg', '#000000');
  const all = await checks(page);
  expect(Object.values(all).every((verdict) => verdict === 'Pass')).toBe(true);
});

test('a ratio just under a threshold is not rounded into a pass', async ({ page }) => {
  // #0080AA on white is 4.4986:1. Rounding to 2dp would display 4.50, which
  // reads as a pass at the 4.5 threshold it actually misses.
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#0080AA');
  await enter(page, 'bg', '#FFFFFF');
  await expect(page.locator('#ratio')).toHaveText('4.49:1');
  expect((await checks(page))['Normal text AA']).toBe('Fail');
});

test('nudge to AA moves lightness only, and actually passes', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#8B5CF6');
  await enter(page, 'bg', '#FFFFFF');
  expect((await checks(page))['Normal text AA']).toBe('Fail');

  // Filling the background field focused it, which points the conversion list
  // at the background; the assertions below are about the foreground.
  await page.click('.pill[data-target="fg"]');
  const before = (await formats(page)).OKLCH.match(/oklch\([\d.]+ ([\d.]+) ([\d.]+)\)/);
  await page.click('[data-action="fix-aa"]');

  await expect.poll(async () => (await checks(page))['Normal text AA']).toBe('Pass');
  const after = (await formats(page)).OKLCH.match(/oklch\([\d.]+ ([\d.]+) ([\d.]+)\)/);
  expect(after[1], 'chroma must not move').toBe(before[1]);
  expect(after[2], 'hue must not move').toBe(before[2]);
});

test('nudge to AA reports rather than churns when it cannot help', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#000000');
  await enter(page, 'bg', '#FFFFFF');
  await page.click('[data-action="fix-aa"]');
  await expect(page.locator('.toast')).toContainText('Already passes AA');
});

test('an unparseable colour reports an error and clears the conversions', async ({ page }) => {
  const { errors } = await openTool(page, 'color-converter');
  await enter(page, 'fg', 'not-a-colour');

  await expect(page.locator('#fg-error')).toBeVisible();
  expect(await page.locator('#formats .result-row').count()).toBe(0);
  await expect(page.locator('#ratio')).toHaveText('—');
  expect(errors, 'a bad colour must not throw').toEqual([]);

  await enter(page, 'fg', '#fff');
  await expect(page.locator('#fg-error')).toBeHidden();
});

test('the pills switch which colour is being converted', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF6347');
  await enter(page, 'bg', '#6739B7');

  await page.click('.pill[data-target="fg"]');
  expect((await formats(page)).HEX).toBe('#FF6347');
  await page.click('.pill[data-target="bg"]');
  expect((await formats(page)).HEX).toBe('#6739B7');
  await expect(page.locator('.pill[data-target="bg"]')).toHaveAttribute('aria-selected', 'true');
});

test('swap exchanges the two colours', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF6347');
  await enter(page, 'bg', '#6739B7');
  await page.click('[data-action="swap"]');

  await expect(page.locator('#fg-input')).toHaveValue('#6739B7');
  await expect(page.locator('#bg-input')).toHaveValue('#FF6347');
});

test('the swatch reflects the field, alpha included', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', 'rebeccapurple');
  const fill = page.locator('#fg-picker .swatch__fill');
  await expect(fill).toHaveCSS('background-color', 'rgb(102, 51, 153)');

  await enter(page, 'fg', '#66339980');
  await expect(fill).toHaveCSS('background-color', 'rgba(102, 51, 153, 0.5)');
});

test('the picker opens as an in-page popover, not the OS dialog', async ({ page }) => {
  const { errors } = await openTool(page, 'color-converter');
  const panel = page.locator('#fg-picker .picker__panel');
  await expect(panel).toBeHidden();

  await page.click('#fg-swatch');
  await expect(panel).toBeVisible();
  await expect(page.locator('#fg-swatch')).toHaveAttribute('aria-expanded', 'true');

  // Escape dismisses and hands focus back to the trigger.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#fg-swatch')).toBeFocused();

  // So does a click anywhere outside it.
  await page.click('#fg-swatch');
  await expect(panel).toBeVisible();
  await page.locator('h1').first().click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('only one picker is open at a time', async ({ page }) => {
  // The open panel overlaps the background field, so reach its trigger the way
  // a keyboard user would rather than clicking through the popover.
  await openTool(page, 'color-converter');
  await page.click('#fg-swatch');
  await page.locator('#bg-swatch').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fg-picker .picker__panel')).toBeHidden();
  await expect(page.locator('#bg-picker .picker__panel')).toBeVisible();
});

test('dragging the saturation pad writes a colour back to the field', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF0000');
  await page.click('#fg-swatch');

  // Top-right of the pad is full saturation and brightness: the pure hue.
  const pad = page.locator('#fg-picker .sv');
  const box = await pad.boundingBox();
  await drag(page, box, box.width, 0);
  await expect(page.locator('#fg-input')).toHaveValue('#FF0000');

  // The bottom edge is black wherever it sits horizontally.
  await drag(page, box, box.width / 2, box.height);
  await expect(page.locator('#fg-input')).toHaveValue('#000000');
});

test('the hue rail keeps its position when the colour drags to black', async ({ page }) => {
  // RGB cannot carry a hue at zero brightness, so a picker that re-derived
  // everything from the field would snap the rail back to red.
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#00D09C');
  await page.click('#fg-swatch');

  const hue = page.locator('#fg-picker .slider--hue');
  const before = await hue.inputValue();
  expect(Number(before)).toBeGreaterThan(100);

  const box = await page.locator('#fg-picker .sv').boundingBox();
  await drag(page, box, box.width / 2, box.height);

  await expect(page.locator('#fg-input')).toHaveValue('#000000');
  expect(await hue.inputValue(), 'the hue rail lost its place').toBe(before);
});

test('the pad is operable from the keyboard', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF0000');
  await page.click('#fg-swatch');
  await expect(page.locator('#fg-picker .sv')).toBeFocused();

  // Left reduces saturation, which lifts the other two channels off zero.
  await page.keyboard.press('ArrowLeft');
  const value = await page.inputValue('#fg-input');
  expect(value).not.toBe('#FF0000');
  expect(value).toMatch(/^#FF0[0-9A-F]{3}$/);

  // Home takes saturation all the way out: full brightness, no hue, is white.
  await page.keyboard.press('Home');
  await expect(page.locator('#fg-input')).toHaveValue('#FFFFFF');
});

test('the hue and opacity rails drive the field', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF0000');
  await page.click('#fg-swatch');

  await page.locator('#fg-picker .slider--hue').fill('120');
  await expect(page.locator('#fg-input')).toHaveValue('#00FF00');

  await page.locator('#fg-picker .slider--alpha').fill('50');
  await expect(page.locator('#fg-input')).toHaveValue('#00FF0080');
  expect((await formats(page)).RGB).toContain('/ 50.2%');
});

test('a preset applies its colour and keeps the current opacity', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF000080');
  await page.click('#fg-swatch');
  await page.click('#fg-picker .preset[data-value="#00D09C"]');
  await expect(page.locator('#fg-input')).toHaveValue('#00D09C80');
});

test('copy all puts every format on the clipboard', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF6347');
  await page.click('[data-action="copy-all"]');

  const copied = await lastCopied(page);
  expect(copied).toContain('HEX: #FF6347');
  expect(copied).toContain('RGB: rgb(255 99 71)');
  expect(copied).toContain('OKLCH: oklch(');
});

test('paste fills the selected colour', async ({ page }) => {
  await openTool(page, 'color-converter');
  await page.click('.pill[data-target="bg"]');
  await setClipboardText(page, '#00D09C');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#bg-input')).toHaveValue('#00D09C');
});

test('reset restores both defaults', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#000000');
  await enter(page, 'bg', '#000000');
  await page.click('[data-action="clear"]');

  await expect(page.locator('#fg-input')).toHaveValue('#FFFFFF');
  await expect(page.locator('#bg-input')).toHaveValue('#6739B7');
});

test('the preview is painted with the chosen pair', async ({ page }) => {
  await openTool(page, 'color-converter');
  await enter(page, 'fg', '#FF6347');
  await enter(page, 'bg', '#000000');

  const painted = await page.evaluate(() => {
    const c = getComputedStyle(document.getElementById('preview'));
    return { color: c.color, background: c.backgroundColor };
  });
  expect(painted.color).toBe('rgb(255, 99, 71)');
  expect(painted.background).toBe('rgb(0, 0, 0)');
});
