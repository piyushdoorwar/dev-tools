import { expect, test } from '@playwright/test';
import { openTool, lastCopied, setClipboardText } from '../helpers.js';

// 2026-09-18T00:00:00Z — a fixed instant used throughout.
const EPOCH_S = 1789689600;

const rows = (page) => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.result-row')].map((r) => [
    r.querySelector('.result-label').textContent,
    r.querySelector('.result-value').textContent,
  ])));

const setZone = (page, zone) => page.evaluate((z) =>
  DevToolsMain.selectDropdownValue(document.getElementById('tz-dropdown'), z), zone);

async function enter(page, value) {
  await page.fill('#ts-input', value);
  await page.locator('#ts-input').dispatchEvent('input');
  await expect(page.locator('#detected')).not.toHaveText('Waiting for input');
}

test('the unit of a bare number is detected from its digit count', async ({ page }) => {
  const { errors } = await openTool(page, 'timestamp-converter');

  for (const [value, unit] of [
    [String(EPOCH_S), 'Unix seconds'],
    [String(EPOCH_S * 1000), 'Unix milliseconds'],
    [`${EPOCH_S}000000`, 'Unix microseconds'],
  ]) {
    await enter(page, value);
    await expect(page.locator('#detected')).toHaveText(`Detected: ${unit}`);
    // Every unit must resolve to the same instant.
    const r = await rows(page);
    expect(r['Unix seconds']).toBe(String(EPOCH_S));
    expect(r['ISO 8601 (UTC)']).toBe('2026-09-18T00:00:00.000Z');
  }
  expect(errors).toEqual([]);
});

test('ISO and date strings are parsed back to the same instant', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  for (const value of ['2026-09-18T00:00:00Z', '2026-09-18', '2026-09-18T05:30:00+05:30']) {
    await enter(page, value);
    expect((await rows(page))['Unix seconds'], `${value} parsed wrong`).toBe(String(EPOCH_S));
  }
});

test('sub-millisecond epochs keep exact boundaries before and after 1970', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  for (const [input, expected] of [
    ['1789689600123999999', '1789689600123'],
    ['-1789689600123000001', '-1789689600124'],
    ['99999999999999999', '99999999999999'],
    ['-99999999999999001', '-100000000000000'],
  ]) {
    await enter(page, input);
    expect((await rows(page))['Unix milliseconds'], input).toBe(expected);
  }
});

test('unparseable input reports an error and shows no conversions', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await enter(page, 'not a timestamp');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#detected')).toHaveText('Unrecognised');
  expect(await page.locator('.result-row').count()).toBe(0);
});

test('a value beyond the representable date range is rejected, not thrown', async ({ page }) => {
  // new Date(ms).toISOString() throws a RangeError past ±8.64e15, so the
  // guard has to catch it before rendering.
  const { errors } = await openTool(page, 'timestamp-converter');
  await enter(page, '9'.repeat(25));
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText(/out of range/i);
  expect(errors, 'an out-of-range value must not throw').toEqual([]);

  // A far-future but representable value is still converted rather than
  // refused — the digit heuristic keeps it inside Date's range.
  await enter(page, '99999999999999');
  await expect(page.locator('#error')).toBeHidden();
  expect((await rows(page))['ISO 8601 (UTC)']).toMatch(/^5138-/);
});

test('conversions follow the selected time zone, including DST', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await setZone(page, 'America/New_York');

  // January is EST (-05:00), July is EDT (-04:00).
  await enter(page, '1767225600');
  expect((await rows(page))['UTC offset (America/New_York)']).toBe('UTC-05:00');

  await enter(page, '1783296000');
  expect((await rows(page))['UTC offset (America/New_York)']).toBe('UTC-04:00');
});

test('the picker round-trips through a DST zone without drift', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await setZone(page, 'America/New_York');
  await enter(page, '1783296000');

  const shown = await page.inputValue('#date-picker');
  // Writing the same wall-clock reading back must yield the same instant.
  await page.fill('#date-picker', shown);
  await page.locator('#date-picker').dispatchEvent('input');
  await expect.poll(async () => (await rows(page))['Unix seconds']).toBe('1783296000');
});

test('renamed IANA zones are offered under their modern names', async ({ page }) => {
  // Engines still report Asia/Calcutta and Europe/Kiev.
  await openTool(page, 'timestamp-converter');
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('#tz-menu .dd__option')].map((o) => o.dataset.value));

  expect(names).toContain('Asia/Kolkata');
  expect(names).not.toContain('Asia/Calcutta');
  expect(names).toContain('Europe/Kyiv');
  expect(names).not.toContain('Europe/Kiev');

  // And the modern name still formats correctly.
  await setZone(page, 'Asia/Kolkata');
  await enter(page, String(EPOCH_S));
  expect((await rows(page))['UTC offset (Asia/Kolkata)']).toBe('UTC+05:30');
});

test('the zone list can be filtered', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await page.click('#tz-trigger');
  await page.fill('.tz-search', 'kolkata');

  // Assert what the user sees, not the `hidden` property: author styles beat
  // the UA's [hidden] rule, so the attribute can be set with no visual effect.
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('#tz-menu .dd__option')]
      .filter((o) => o.getClientRects().length > 0)
      .map((o) => o.dataset.value));
  expect(shown).toEqual(['Asia/Kolkata']);

  // Clearing the filter brings the full list back.
  await page.fill('.tz-search', '');
  const restored = await page.evaluate(() =>
    [...document.querySelectorAll('#tz-menu .dd__option')]
      .filter((o) => o.getClientRects().length > 0).length);
  expect(restored).toBeGreaterThan(100);
});

test('"use current time" fills the input with now', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  const before = Math.floor(Date.now() / 1000);
  await page.click('[data-action="now"]');
  const value = Number(await page.inputValue('#ts-input'));
  expect(Math.abs(value - before)).toBeLessThan(5);
});

test('copy all puts every conversion on the clipboard', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await enter(page, String(EPOCH_S));
  await page.click('[data-action="copy-all"]');
  const copied = await lastCopied(page);
  expect(copied).toContain('Unix seconds: 1789689600');
  expect(copied).toContain('ISO 8601 (UTC): 2026-09-18T00:00:00.000Z');
});

test('paste reads the clipboard and converts', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await setClipboardText(page, String(EPOCH_S));
  await page.click('[data-action="paste"]');
  await expect.poll(async () => (await rows(page))['Unix seconds']).toBe(String(EPOCH_S));
});

test('clear resets the input and the conversions', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await enter(page, String(EPOCH_S));
  await page.click('[data-action="clear"]');
  await expect(page.locator('#ts-input')).toHaveValue('');
  await expect(page.locator('#detected')).toHaveText('Waiting for input');
  expect(await page.locator('.result-row').count()).toBe(0);
});

test('no duplicate rows when the zone equals UTC or local', async ({ page }) => {
  await openTool(page, 'timestamp-converter');
  await enter(page, String(EPOCH_S));
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.result-label')].map((n) => n.textContent));
  expect(new Set(labels).size, 'a conversion is listed twice').toBe(labels.length);
});

test('the date picker button is legible on a dark field', async ({ page }) => {
  // Chromium inverts ::-webkit-calendar-picker-indicator under
  // color-scheme: dark, which flipped our light glyph back to near-black.
  // getComputedStyle does not expose this UA pseudo-element's background, so
  // assert the declarations that produce it instead — the rendered contrast
  // itself was checked by pixel-sampling a screenshot.
  await openTool(page, 'timestamp-converter');

  const rule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const scan = (list) => {
        for (const r of list) {
          if (r.cssRules) { const hit = scan(r.cssRules); if (hit) return hit; }
          if (r.selectorText?.includes('-webkit-calendar-picker-indicator')
              && !r.selectorText.includes(':hover')) return r.style.cssText;
        }
        return null;
      };
      const hit = scan(rules);
      if (hit) return hit;
    }
    return null;
  });

  expect(rule, 'no styling for the calendar indicator').toBeTruthy();
  expect(rule, 'the UA invert must be neutralised').toContain('filter: none');
  expect(rule, 'the indicator should use our own glyph').toContain('--date-picker-icon');
});

test('fractional seconds and microseconds give whole milliseconds', async ({ page }) => {
  await openTool(page, 'timestamp-converter');

  // 1789689600.123 * 1000 is 1789689600123.0002 in floating point.
  await enter(page, `${EPOCH_S}.123`);
  expect((await rows(page))['Unix milliseconds']).toBe(`${EPOCH_S}123`);

  await enter(page, `${EPOCH_S}123456`);
  expect((await rows(page))['Unix milliseconds']).toBe(`${EPOCH_S}123`);

  await enter(page, `${EPOCH_S}000000000`);
  expect((await rows(page))['Unix milliseconds']).toBe(`${EPOCH_S}000`);
});

test('the two panel headers line up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, 'timestamp-converter');
  const heights = await page.locator('.panel-header').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1);
});

test('stacked panels sit together rather than splitting the spare height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1400 });
  await openTool(page, 'timestamp-converter');
  const gap = await page.evaluate(() => {
    const a = document.querySelector('.input-panel').getBoundingClientRect();
    const b = document.querySelector('.output-panel').getBoundingClientRect();
    return b.top - a.bottom;
  });
  expect(gap).toBeLessThan(40);
});
