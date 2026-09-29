import { expect, test } from '@playwright/test';
import { openTool, lastCopied, setClipboardText } from '../helpers.js';

const TOOL = 'math-evaluator';

async function type(page, expression) {
  await page.locator('#expression').fill(expression);
}

async function evaluateInPage(page, source, options) {
  return page.evaluate(([s, o]) => {
    try {
      const value = window.MathEvaluator.evaluate(s, o);
      return { ok: window.MathEvaluator.format(value) };
    } catch (error) {
      return { error: error.message, position: error.position };
    }
  }, [source, options]);
}

test.describe('math-evaluator', () => {
  test('loads with a live sample result, no subtitle and no console errors', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator('h1.app-title')).toHaveText('Math / Expression Evaluator');
    await expect(page.locator('.app-subtitle')).toHaveCount(0);
    await expect(page.locator('#expression')).toHaveValue('sqrt(81) + 0xff');
    await expect(page.locator('#result')).toHaveText('264');
    // No Evaluate button: everything is live.
    await expect(page.getByRole('button', { name: /^evaluate$/i })).toHaveCount(0);
    await expect(page.locator('#historyEmpty')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps the grammar guarantees, evaluated live as you type', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    for (const [input, result] of [
      ['sqrt(81) + 0xff', '264'],
      ['log10(1000) + max(2, 5)', '8'],
      ['2^3^2', '512'],
      ['-2^2', '-4'],
      ['9007199254740993n + 0b10n', '9007199254740995n'],
      ['log(e) + sin(pi / 2)', '2'],
    ]) {
      await type(page, input);
      await expect(page.locator('#result'), input).toHaveText(result);
      await expect(page.locator('#exprStatus')).not.toHaveClass(/error/);
    }
    expect(errors).toEqual([]);
  });

  test('rejects unsafe and invalid input inline with no result', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    for (const input of ['alert(1)', '1/0', '1n+1', 'sqrt(-1)', '2n^20001n', 'constructor', '(1 + 2', '2 3']) {
      await type(page, input);
      await expect(page.locator('#exprStatus'), input).toHaveClass(/error/);
      await expect(page.locator('#exprStatus'), input).toContainText(/Col \d+:/);
      await expect(page.locator('#result'), input).toHaveText('');
      await expect(page.locator('#copyResult')).toBeDisabled();
      await expect(page.locator('#base-hex')).toHaveText('');
    }
    await type(page, 'alert(1)');
    await expect(page.locator('#exprStatus')).toContainText('Col 1: Unknown name');
    // An error is not committed to history.
    await page.locator('#expression').press('Enter');
    await expect(page.locator('#history li')).toHaveCount(0);
    // The status is pink, not the muted default.
    const colour = await page.locator('#exprStatus').evaluate((el) => getComputedStyle(el).color);
    expect(colour).toBe('rgb(255, 107, 157)');
    expect(errors).toEqual([]);
  });

  test('parser stays bounded', async ({ page }) => {
    await openTool(page, TOOL);
    expect((await evaluateInPage(page, '('.repeat(150) + '1' + ')'.repeat(150))).error).toMatch(/nested/);
    expect((await evaluateInPage(page, '1+'.repeat(1001) + '1')).error).toMatch(/2,000/);
    expect((await evaluateInPage(page, '171!')).error).toMatch(/170/);
    expect((await evaluateInPage(page, '2001n!')).error).toMatch(/2000n/);
    expect((await evaluateInPage(page, '__proto__')).error).toMatch(/Unknown/);
    expect((await evaluateInPage(page, 'Math.PI')).error).toMatch(/Unexpected character/);
  });

  test('cleans float noise and keeps the exact value copyable', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await type(page, '0.1+0.2');
    await expect(page.locator('#result')).toHaveText('0.3');
    await expect(page.locator('#exactRow')).toBeVisible();
    await expect(page.locator('#exactValue')).toHaveText('0.30000000000000004');
    await page.locator('#copyExact').click();
    expect(await lastCopied(page)).toBe('0.30000000000000004');
    await page.locator('#copyResult').click();
    expect(await lastCopied(page)).toBe('0.3');
    await type(page, '1/3');
    await expect(page.locator('#result')).toHaveText('0.333333333333333');
    expect(errors).toEqual([]);
  });

  test('DEG/RAD switch changes trig input and inverse output', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await type(page, 'sin(90)');
    await expect(page.locator('#result')).not.toHaveText('1');
    await page.locator('#angleSwitch [data-angle="deg"]').click();
    await expect(page.locator('#angleSwitch [data-angle="deg"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#result')).toHaveText('1');
    for (const [input, result] of [['cos(90)', '0'], ['asin(1)', '90'], ['atan2(1, 1)', '45'], ['sin(30)', '0.5']]) {
      await type(page, input);
      await expect(page.locator('#result'), input).toHaveText(result);
    }
    await type(page, 'tan(90)');
    await expect(page.locator('#exprStatus')).toContainText('undefined');
    await expect(page.locator('#result')).toHaveText('');
    await page.locator('#angleSwitch [data-angle="rad"]').click();
    await type(page, 'log(e) + sin(pi / 2)');
    await expect(page.locator('#result')).toHaveText('2');
    expect(errors).toEqual([]);
  });

  test('new functions, constants and factorial', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    for (const [input, result] of [
      ['exp(0) + ln(e)', '2'],
      ['cbrt(27)', '3'],
      ['trunc(-2.7)', '-2'],
      ['sign(-5) + sign(3)', '0'],
      ['hypot(3, 4)', '5'],
      ['pow(2, 10)', '1024'],
      ['tau / pi', '2'],
      ['atan(1) * 4', '3.14159265358979'],
      ['acos(1)', '0'],
      ['log2(8)', '3'],
      ['5!', '120'],
      ['-3!', '-6'],
      ['2^3!', '64'],
      ['25n!', '15511210043330985984000000n'],
      ['abs(-5n)', '5n'],
      ['0o17', '15'],
    ]) {
      await type(page, input);
      await expect(page.locator('#result'), input).toHaveText(result);
    }
    await type(page, '2.5!');
    await expect(page.locator('#exprStatus')).toContainText('non-negative integer');
    await type(page, '2pi');
    await expect(page.locator('#exprStatus')).toHaveClass(/error/);
    expect(errors).toEqual([]);
  });

  test('integer results show copyable hex, octal and binary rows', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await type(page, '255');
    await expect(page.locator('#base-hex')).toHaveText('0xff');
    await expect(page.locator('#base-octal')).toHaveText('0o377');
    await expect(page.locator('#base-binary')).toHaveText('0b11111111');
    await page.locator('#copy-hex').click();
    expect(await lastCopied(page)).toBe('0xff');
    await page.locator('#copy-binary').click();
    expect(await lastCopied(page)).toBe('0b11111111');
    await type(page, '-10');
    await expect(page.locator('#base-hex')).toHaveText('-0xa');
    await type(page, '2n^64n - 1n');
    await expect(page.locator('#base-hex')).toHaveText('0xffffffffffffffff');
    await type(page, '0.5');
    await expect(page.locator('#base-hex')).toHaveText('');
    await expect(page.locator('#copy-hex')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('palette chips insert at the cursor and wrap a selection', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await type(page, '1 + ');
    await page.locator('.chip[data-insert="sqrt"]').click();
    await expect(page.locator('#expression')).toHaveValue('1 + sqrt()');
    await page.keyboard.type('16');
    await expect(page.locator('#result')).toHaveText('5');
    // Wrap a selection.
    await type(page, '2 * 9');
    await page.locator('#expression').evaluate((el) => el.setSelectionRange(4, 5));
    await page.locator('.chip[data-insert="sqrt"]').click();
    await expect(page.locator('#expression')).toHaveValue('2 * sqrt(9)');
    await expect(page.locator('#result')).toHaveText('6');
    // Constants and operators insert as-is at the caret.
    await type(page, '2');
    await page.locator('.chip[data-insert="^"]').click();
    await page.keyboard.type('3');
    await expect(page.locator('#expression')).toHaveValue('2^3');
    await page.locator('.chip[data-insert="!"]').click();
    await expect(page.locator('#result')).toHaveText('64');
    await type(page, '');
    await page.locator('.chip[data-insert="pi"]').click();
    await expect(page.locator('#result')).toHaveText('3.14159265358979');
    expect(errors).toEqual([]);
  });

  test('sample, paste and clear', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator('[data-action="clear"]').click();
    await expect(page.locator('#expression')).toHaveValue('');
    await expect(page.locator('#result')).toHaveText('');
    await page.locator('[data-action="sample"]').click();
    await expect(page.locator('#expression')).not.toHaveValue('');
    await expect(page.locator('#result')).not.toHaveText('');
    await setClipboardText(page, '6 * 7\n');
    await page.locator('[data-action="paste"]').click();
    await expect(page.locator('#expression')).toHaveValue('6 * 7');
    await expect(page.locator('#result')).toHaveText('42');
    expect(errors).toEqual([]);
  });

  test('Enter commits to history; entries load back, copy and clear', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await type(page, '2^10');
    await page.locator('#expression').press('Enter');
    await page.locator('#angleSwitch [data-angle="deg"]').click();
    await type(page, 'sin(90) * 3');
    await page.locator('#expression').press('Enter');
    // Pressing Enter again on the same result does not duplicate it.
    await page.locator('#expression').press('Enter');
    const entries = page.locator('#history .history-entry');
    await expect(entries).toHaveCount(2);
    await expect(page.locator('#historyEmpty')).toBeHidden();
    await expect(entries.nth(0).locator('.history-expr')).toContainText('sin(90) * 3');
    await expect(entries.nth(0).locator('.history-tag')).toHaveText('DEG');
    await expect(entries.nth(0).locator('.history-result')).toHaveText('= 3');
    await expect(entries.nth(1).locator('.history-result')).toHaveText('= 1024');
    await expect(page.locator('#historyCount')).toHaveText('2 / 50');

    // Loading an entry puts the expression back and restores its angle unit.
    await page.locator('#angleSwitch [data-angle="rad"]').click();
    await type(page, '');
    await entries.nth(0).locator('.history-load').click();
    await expect(page.locator('#expression')).toHaveValue('sin(90) * 3');
    await expect(page.locator('#angleSwitch [data-angle="deg"]')).toHaveClass(/active/);
    await expect(page.locator('#result')).toHaveText('3');
    await expect(page.locator('#expression')).toBeFocused();
    await entries.nth(1).locator('.history-load').click();
    await expect(page.locator('#expression')).toHaveValue('2^10');
    await expect(page.locator('#result')).toHaveText('1024');

    await entries.nth(1).locator('.action-btn').click();
    expect(await lastCopied(page)).toBe('1024');

    await page.locator('#clearHistory').click();
    await expect(entries).toHaveCount(0);
    await expect(page.locator('#historyEmpty')).toBeVisible();
    await expect(page.locator('#clearHistory')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('history is capped at 50 entries and not persisted', async ({ page }) => {
    await openTool(page, TOOL);
    for (let i = 1; i <= 53; i += 1) {
      await type(page, `${i} * 2`);
      await page.locator('#expression').press('Enter');
    }
    await expect(page.locator('#history .history-entry')).toHaveCount(50);
    await expect(page.locator('#history .history-entry').first().locator('.history-result')).toHaveText('= 106');
    await expect(page.locator('#history .history-entry').last().locator('.history-result')).toHaveText('= 8');
    await page.reload();
    await expect(page.locator('#history .history-entry')).toHaveCount(0);
  });

  test('Shift+Enter adds a line instead of committing', async ({ page }) => {
    await openTool(page, TOOL);
    await type(page, '1 +');
    await page.locator('#expression').press('Shift+Enter');
    await page.keyboard.type('2');
    await expect(page.locator('#expression')).toHaveValue('1 +\n2');
    await expect(page.locator('#result')).toHaveText('3');
    await expect(page.locator('#history .history-entry')).toHaveCount(0);
  });

  test('percentage calculators answer live, copy, and keep to history', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.getByRole('tab', { name: 'Percentage' }).click();
    await expect(page).toHaveURL(/#percentage$/);
    await expect(page.locator('#percentagePanel')).toBeVisible();
    await expect(page.locator('#expressionPanel')).toBeHidden();

    await page.locator('#pct-ratio-a').fill('25');
    await page.locator('#pct-ratio-b').fill('100');
    await expect(page.locator('#pct-ratio-value')).toHaveText('25%');

    await page.locator('#pct-change-a').fill('25');
    await page.locator('#pct-change-b').fill('100');
    await expect(page.locator('#pct-change-value')).toHaveText('300%');
    await expect(page.locator('[data-calc="change"] .calc-note')).toContainText('Increase of 75');

    await page.locator('#pct-of-a').fill('15');
    await page.locator('#pct-of-b').fill('80');
    await expect(page.locator('#pct-of-value')).toHaveText('12');

    await page.locator('#pct-adjust-b').fill('80');
    await page.locator('#pct-adjust-a').fill('15');
    await expect(page.locator('#pct-adjust-value')).toHaveText('92');
    await page.locator('#pct-adjust-down').click();
    await expect(page.locator('#pct-adjust-value')).toHaveText('68');

    // Fields accept expressions and clean float noise.
    await page.locator('#pct-of-a').fill('10');
    await page.locator('#pct-of-b').fill('0.1 + 0.2');
    await expect(page.locator('#pct-of-value')).toHaveText('0.03');

    await page.locator('#pct-change-copy').click();
    expect(await lastCopied(page)).toBe('300%');

    await page.locator('#pct-ratio-b').press('Enter');
    await page.locator('#pct-change-keep').click();
    const entries = page.locator('#history .history-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).locator('.history-result')).toHaveText('= 300%');
    await expect(entries.nth(1).locator('.history-expr')).toHaveText('25 is what % of 100');
    await expect(entries.nth(1).locator('.history-result')).toHaveText('= 25%');

    // Loading a percentage entry restores its fields.
    await page.locator('#pct-ratio-a').fill('1');
    await entries.nth(1).locator('.history-load').click();
    await expect(page.locator('#pct-ratio-a')).toHaveValue('25');
    await expect(page.locator('#pct-ratio-value')).toHaveText('25%');
    expect(errors).toEqual([]);
  });

  test('percentage zero baselines explain the problem inline', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.goto('/tools/math-evaluator/#percentage');
    await page.locator('#pct-change-a').fill('0');
    await expect(page.locator('#pct-change-error')).toContainText('zero');
    await expect(page.locator('#pct-change-value')).toHaveText('');
    await page.locator('#pct-change-keep').click();
    await expect(page.locator('#pctStatus')).toHaveClass(/error/);
    await expect(page.locator('#history .history-entry')).toHaveCount(0);
    await page.locator('#pct-ratio-b').fill('0');
    await expect(page.locator('#pct-ratio-error')).toContainText('zero');
    await page.locator('#pct-ratio-b').fill('');
    await expect(page.locator('#pct-ratio-error')).toHaveText('');
    await expect(page.locator('[data-calc="ratio"] .calc-note')).toHaveText('Enter both values');
    await page.locator('#pct-ratio-b').fill('abc');
    await expect(page.locator('#pct-ratio-error')).not.toHaveText('');
    await page.locator('[data-action="pct-reset"]').click();
    await expect(page.locator('#pct-ratio-value')).toHaveText('25%');
    await expect(page.locator('#pct-change-value')).toHaveText('300%');
    expect(errors).toEqual([]);
  });

  test('mode lives in the hash and the tabs are arrow-key operable', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.goto('/tools/math-evaluator/#percentage');
    await expect(page.getByRole('tab', { name: 'Percentage' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#percentagePanel')).toBeVisible();
    await page.getByRole('tab', { name: 'Percentage' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Expression' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Expression' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#expression$/);
    await expect(page.locator('#expressionPanel')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/#percentage$/);
    await page.goto('/tools/math-evaluator/#nonsense');
    await expect(page.locator('#expressionPanel')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('help modal documents precedence, BigInt, literals, functions and limits', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator('#helpBtn').click();
    const modal = page.locator('#helpModal');
    await expect(modal).toHaveClass(/is-open/);
    for (const text of ['right-associative', '-2^2', 'BigInt', '0xff', '0b1010', 'atan2', 'hypot', 'tau', '20,000', '2000n!']) {
      await expect(modal).toContainText(text);
    }
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/is-open/);
    expect(errors).toEqual([]);
  });

  test('fills the viewport on desktop and never scrolls sideways at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { errors } = await openTool(page, TOOL);
    const layout = await page.evaluate(() => {
      const history = document.querySelector('.history-panel').getBoundingClientRect();
      const work = document.querySelector('#expressionPanel').getBoundingClientRect();
      return { historyBottom: history.bottom, workBottom: work.bottom, vh: innerHeight };
    });
    expect(layout.vh - layout.historyBottom).toBeLessThan(40);
    expect(Math.abs(layout.workBottom - layout.historyBottom)).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await type(page, '2n^9000n');
    for (const hash of ['#expression', '#percentage']) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), hash).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
