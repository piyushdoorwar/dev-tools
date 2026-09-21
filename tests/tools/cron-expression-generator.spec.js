import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

// The tool renders next runs against the wall clock, so the browser's own zone
// has to be pinned: CI is UTC, developer machines are not.
test.use({ timezoneId: 'UTC' });

const setExpression = (page, value) => typeInto(page, '#cron-input', value);
const runTimes = (page) => page.locator('#runs .run-row .result-value').allTextContents();

test('loads with a working default expression and no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'cron-expression-generator');

  await expect(page.locator('#cron-input')).toHaveValue('*/5 9-17 * * MON-FRI');
  await expect(page.locator('#detected')).toHaveText('Standard 5-field cron');
  await expect(page.locator('#summary')).toContainText('Every 5 minutes');
  await expect(page.locator('#summary')).toContainText('Monday through Friday');
  expect((await runTimes(page)).length).toBe(10);
  expect(errors).toEqual([]);
});

test('explains the common schedules in plain English', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  const CASES = [
    ['* * * * *', 'Every minute.'],
    ['*/15 * * * *', 'Every 15 minutes.'],
    ['0 * * * *', 'Every hour at minute 00.'],
    ['30 9 * * *', 'At 09:30.'],
    ['0 0 1 * *', 'At 00:00, on the 1st of the month.'],
    ['0 6 1 1,4,7,10 *', 'At 06:00, on the 1st of the month, in January, April, July and October.'],
  ];

  for (const [expression, expected] of CASES) {
    await setExpression(page, expression);
    await expect(page.locator('#summary')).toHaveText(expected);
  }
});

test('day-of-week names, ranges and hour windows read naturally', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 9 * * MON-FRI');
  await expect(page.locator('#summary')).toHaveText('At 09:00, on Monday through Friday.');

  await setExpression(page, '*/30 9-17 * * 1,5');
  await expect(page.locator('#summary'))
    .toHaveText('Every 30 minutes between 09:00 and 17:59, on Monday and Friday.');

  // Sunday is both 0 and 7.
  await setExpression(page, '0 3 * * 7');
  await expect(page.locator('#summary')).toHaveText('At 03:00, on Sunday.');
});

test('computes the next run times on the selected time zone wall clock', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 9 * * *');
  const utcRuns = await runTimes(page);
  expect(utcRuns).toHaveLength(10);
  for (const run of utcRuns) expect(run).toContain('09:00:00');

  // Consecutive days, one run each.
  const days = utcRuns.map((run) => run.slice(0, 10));
  expect(new Set(days).size).toBe(10);

  await page.click('#tz-trigger');
  await page.fill('.tz-search', 'kolkata');
  await page.click('.dd__option[data-value="Asia/Kolkata"]');
  await expect(page.locator('#tz-value')).toHaveText('Asia/Kolkata');

  // Same wall-clock hour, a different instant — the listing is the local hour.
  for (const run of await runTimes(page)) expect(run).toContain('09:00:00');
});

test('a day-of-month and day-of-week pair matches either field', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 0 1 * MON');
  await expect(page.locator('#summary')).toContainText('cron ORs the two day fields');

  // Every listed run is either the 1st or a Monday.
  for (const run of await runTimes(page)) {
    const isFirst = run.slice(8, 10) === '01';
    const isMonday = run.endsWith('Mon');
    expect(isFirst || isMonday, `${run} matches neither day field`).toBe(true);
  }
});

test('accepts a six-field expression with seconds', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '*/30 * * * * *');
  await expect(page.locator('#detected')).toHaveText('6-field cron (with seconds)');
  await expect(page.locator('#summary')).toHaveText('Every minute, every 30 seconds.');
  await expect(page.locator('#field-grid .field-cell')).toHaveCount(6);
  await expect(page.locator('#f-second')).toHaveValue('*/30');

  const runs = await runTimes(page);
  expect(runs.length).toBe(10);
  for (const run of runs) expect(run).toMatch(/:(00|30) /);
});

test('expands macros and flags @reboot as having no clock schedule', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '@daily');
  await expect(page.locator('#detected')).toHaveText('Macro @daily → 0 0 * * *');
  await expect(page.locator('#summary')).toHaveText('At 00:00.');
  expect((await runTimes(page)).length).toBe(10);

  await setExpression(page, '@reboot');
  await expect(page.locator('#summary')).toContainText('Once at every boot');
  await expect(page.locator('#runs')).toContainText('fires once when the machine starts');

  await setExpression(page, '@nope');
  await expect(page.locator('#error')).toContainText('Unknown macro "@nope"');
});

test('reports bad input precisely and marks the offending field', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 9 * *');
  await expect(page.locator('#error')).toContainText('Expected 5 fields (or 6 with seconds), found 4.');
  await expect(page.locator('#detected')).toHaveText('Invalid');

  await setExpression(page, '99 * * * *');
  await expect(page.locator('#error')).toContainText('Minute: "99" is not a value in 0-59.');
  await expect(page.locator('.field-cell[data-key="minute"]')).toHaveClass(/is-invalid/);

  await setExpression(page, '0 0 * * FUNDAY');
  await expect(page.locator('#error')).toContainText('Day of week:');

  await setExpression(page, '*/0 * * * *');
  await expect(page.locator('#error')).toContainText('must be a positive whole number');

  // Quartz extensions are rejected by name rather than as a mystery token.
  await setExpression(page, '0 0 L * *');
  await expect(page.locator('#error')).toContainText('Quartz extensions');

  // Recovering clears the error.
  await setExpression(page, '0 0 * * *');
  await expect(page.locator('#error')).toBeHidden();
});

test('the per-field editor and the expression stay in sync', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 9 * * MON');
  await expect(page.locator('#f-minute')).toHaveValue('0');
  await expect(page.locator('#f-hour')).toHaveValue('9');
  await expect(page.locator('#f-dow')).toHaveValue('MON');

  await typeInto(page, '#f-hour', '18');
  await expect(page.locator('#cron-input')).toHaveValue('0 18 * * MON');
  await expect(page.locator('#summary')).toHaveText('At 18:00, on Monday.');
});

test('a preset fills the expression and explains itself', async ({ page }) => {
  const { errors } = await openTool(page, 'cron-expression-generator');

  await page.click('#preset-trigger');
  await expect(page.locator('#preset-dropdown')).toHaveClass(/is-open/);
  await page.click('.dd__option[data-value="0 0 1 1 *"]');

  await expect(page.locator('#cron-input')).toHaveValue('0 0 1 1 *');
  await expect(page.locator('#summary')).toHaveText('At 00:00, on the 1st of the month, in January.');
  expect(errors).toEqual([]);
});

test('breakdown lists the resolved values of every field', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setExpression(page, '0 9 * * MON-WED');
  const rows = page.locator('#breakdown .result-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('Minute');
  await expect(rows.nth(3)).toContainText('every value');
  await expect(rows.nth(4)).toContainText('Mon, Tue, Wed');
});

test('copies the expression and the next runs', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');
  await setExpression(page, '0 9 * * *');

  await page.click('[data-action="copy-expression"]');
  expect(await lastCopied(page)).toBe('0 9 * * *');

  await page.click('[data-action="copy-runs"]');
  const copied = await lastCopied(page);
  expect(copied).toContain('0 9 * * * — At 09:00.');
  expect(copied).toContain('Time zone: UTC');
  expect(copied.split('\n')).toHaveLength(12);

  await page.locator('#runs .run-row').first().hover();
  await page.locator('#runs .run-row .result-copy').first().click();
  expect(await lastCopied(page)).toContain('09:00:00');
});

test('paste and clear drive the expression', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  await setClipboardText(page, '  15 2 * * SUN  ');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#cron-input')).toHaveValue('15 2 * * SUN');
  await expect(page.locator('#summary')).toHaveText('At 02:15, on Sunday.');

  await page.click('[data-action="clear"]');
  await expect(page.locator('#cron-input')).toHaveValue('');
  await expect(page.locator('#detected')).toHaveText('Waiting for input');
  await expect(page.locator('#field-grid')).toBeEmpty();
  await expect(page.locator('#runs')).toContainText('Next runs appear once the expression parses');
});

test('daylight saving keeps the wall-clock hour and skips the spring gap', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  // 2027-03-14 02:30 does not exist in New York, so the job simply does not
  // run that day — and the surrounding runs keep their 02:30 local hour while
  // the underlying instant shifts by an hour.
  const schedule = await page.evaluate(() => nextRuns(parseCron('30 2 * * *'), 'America/New_York',
    Date.UTC(2027, 2, 12, 12, 0, 0), 3).map((run) => ({
    day: `${run.wall.year}-${run.wall.month}-${run.wall.day}`,
    hour: `${run.wall.hour}:${run.wall.minute}`,
    iso: new Date(run.ms).toISOString(),
  })));

  expect(schedule.map((run) => run.day)).toEqual(['2027-3-13', '2027-3-15', '2027-3-16']);
  expect(new Set(schedule.map((run) => run.hour))).toEqual(new Set(['2:30']));
  expect(schedule[0].iso).toBe('2027-03-13T07:30:00.000Z');  // UTC-5
  expect(schedule[1].iso).toBe('2027-03-15T06:30:00.000Z');  // UTC-4

  // The autumn repeat must not double up either.
  const fallBack = await page.evaluate(() => nextRuns(parseCron('30 1 * * *'), 'America/New_York',
    Date.UTC(2027, 10, 6, 12, 0, 0), 3).map((run) => `${run.wall.month}/${run.wall.day} ${run.wall.hour}:${run.wall.minute}`));
  expect(fallBack).toEqual(['11/7 1:30', '11/8 1:30', '11/9 1:30']);
});

test('a schedule with no upcoming run says so instead of hanging', async ({ page }) => {
  await openTool(page, 'cron-expression-generator');

  // 30 February never comes round.
  await setExpression(page, '0 0 30 2 *');
  await expect(page.locator('#runs')).toContainText('No run found');
  await expect(page.locator('#summary')).toContainText('in February');
});
