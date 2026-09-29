import { expect, test } from '@playwright/test';
import { openTool, lastCopied } from '../helpers.js';

const TOOL = 'keyboard-event-inspector';
const latest = async (page) => JSON.parse(await page.locator('#output').inputValue());
const chip = (page, name) => page.locator(`[data-modifier="${name}"]`);

test.describe('keyboard-event-inspector', () => {
  test('loads focused, with styled empty states and no errors', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator('h1.app-title')).toHaveText('Keyboard Event Inspector');
    await expect(page.locator('.app-subtitle')).toHaveCount(0);
    // No click needed: the capture area has focus on arrival.
    await expect(page.locator('#capture')).toBeFocused();
    await expect(page.locator('#listenPill')).toHaveText('Listening');
    await expect(page.locator('#keycap')).toHaveClass(/is-empty/);
    await expect(page.locator('#keyDisplay')).toHaveText('Press a key');
    await expect(page.locator('#historyEmpty')).toBeVisible();
    await expect(page.locator('#tableWrap')).toBeHidden();
    await expect(page.locator('#historyCount')).toHaveText(/0 \/ 30 events/i);
    // No legacy shared-utility dependencies.
    const refs = await page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')]
      .map((node) => node.getAttribute('src') || node.getAttribute('href')));
    expect(refs.some((ref) => /utility-/.test(ref))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('shows an explicit hint when the capture area loses focus', async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator('#capture').evaluate((node) => node.blur());
    await expect(page.locator('#listenPill')).toHaveText('Not focused');
    await expect(page.locator('#captureHint')).toHaveText(/Click here/);
    await page.locator('#keycap').click();
    await expect(page.locator('#capture')).toBeFocused();
    await expect(page.locator('#listenPill')).toHaveText('Listening');
  });

  test('Shift+A reports key, code, Shift and standard location', async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.keyboard.press('Shift+A');
    // After Shift+A the last keydown was "A"; the Shift keyup must not replace it.
    const entry = await latest(page);
    expect(entry.key).toBe('A');
    expect(entry.code).toBe('KeyA');
    expect(entry.modifiers.Shift).toBe(true);
    expect(entry.location).toBe(0);
    expect(entry.type).toBe('keydown');
    await expect(page.locator('#keyDisplay')).toHaveText('A');
    await expect(page.locator('#codeDisplay')).toHaveText('KeyA');
    await expect(page.locator('[data-prop="key"]')).toHaveText('"A"');
    await expect(page.locator('[data-prop="code"]')).toHaveText('"KeyA"');
    await expect(page.locator('[data-prop="keyCode"]')).toHaveText('65');
    await expect(page.locator('[data-prop="which"]')).toHaveText('65');
    await expect(page.locator('[data-prop="location"]')).toHaveText('0 · Standard');
    await expect(page.locator('[data-prop="repeat"]')).toHaveText('false');
    await expect(page.locator('[data-prop="isComposing"]')).toHaveText('false');
    await expect(page.locator('#shortcutText')).toHaveText('Shift+A');
    await expect(page.locator('#conditionText')).toHaveText('e.shiftKey && e.key.toLowerCase() === "a"');
    expect(errors).toEqual([]);
  });

  test('location is named and repeat is recorded from a dispatched event', async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator('#capture').dispatchEvent('keydown', {
      key: 'a', code: 'KeyA', repeat: true, location: 2,
    });
    const entry = await latest(page);
    expect(entry.repeat).toBe(true);
    expect(entry.location).toBe(2);
    await expect(page.locator('[data-prop="location"]')).toHaveText('2 · Right');
    await expect(page.locator('[data-prop="repeat"]')).toHaveText('true');
    const row = page.locator('#history tr').first();
    await expect(row).toContainText('Right');
    await expect(row.locator('.badge')).toHaveText(/repeat/i);

    for (const [location, name] of [[0, 'Standard'], [1, 'Left'], [3, 'Numpad']]) {
      await page.locator('#capture').dispatchEvent('keydown', { key: 'x', code: 'KeyX', location });
      await expect(page.locator('[data-prop="location"]')).toHaveText(`${location} · ${name}`);
    }
  });

  test('named keys: Space, Enter and dead keys', async ({ page }) => {
    await openTool(page, TOOL);
    await page.keyboard.press('Space');
    await expect(page.locator('#keyDisplay')).toHaveText('Space');
    await expect(page.locator('#shortcutText')).toHaveText('Space');
    await expect(page.locator('#conditionText')).toHaveText('e.key === " "');
    await page.keyboard.press('Enter');
    await expect(page.locator('#keyDisplay')).toHaveText('Enter');
    await page.locator('#capture').dispatchEvent('keydown', { key: 'Dead', code: 'Quote' });
    await expect(page.locator('#keyDisplay')).toHaveText('Dead');
    await expect(page.locator('#codeDisplay')).toHaveText('Quote');
  });

  test('modifier chips light on keydown and release on keyup, including AltGr', async ({ page }) => {
    await openTool(page, TOOL);
    await expect(page.locator('[data-modifier]')).toHaveText(['Ctrl', 'Shift', 'Alt', 'Meta', 'AltGr', 'CapsLock', 'NumLock']);
    await page.keyboard.down('Shift');
    await expect(chip(page, 'Shift')).toHaveClass(/is-active/);
    await expect(page.locator('[data-prop="type"]')).toHaveText('keydown');
    await expect(page.locator('#heldCount')).toHaveText(/1 held/i);
    await page.keyboard.up('Shift');
    await expect(chip(page, 'Shift')).not.toHaveClass(/is-active/);
    await expect(page.locator('[data-prop="type"]')).toHaveText('keyup');
    await expect(page.locator('#heldCount')).toHaveText(/0 held/i);

    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await expect(chip(page, 'Control')).toHaveClass(/is-active/);
    await expect(chip(page, 'Alt')).toHaveClass(/is-active/);
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    await expect(page.locator('.chip.is-active')).toHaveCount(0);

    await page.locator('#capture').dispatchEvent('keydown', {
      key: '@', code: 'KeyQ', modifierAltGraph: true,
    });
    await expect(chip(page, 'AltGraph')).toHaveClass(/is-active/);
    expect((await latest(page)).modifiers.AltGraph).toBe(true);
    await expect(page.locator('#shortcutText')).toHaveText('AltGr+Q');
  });

  test('blur releases held modifiers', async ({ page }) => {
    await openTool(page, TOOL);
    await page.keyboard.down('Shift');
    await expect(chip(page, 'Shift')).toHaveClass(/is-active/);
    await page.locator('#capture').evaluate((node) => node.blur());
    await expect(chip(page, 'Shift')).not.toHaveClass(/is-active/);
    await page.keyboard.up('Shift');
  });

  test('shortcut string and condition, key- and code-based, with copy', async ({ page }) => {
    await openTool(page, TOOL);
    await page.keyboard.press('Control+Shift+KeyK');
    await expect(page.locator('#shortcutText')).toHaveText('Ctrl+Shift+K');
    await expect(page.locator('#conditionText')).toHaveText('e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "k"');

    await page.getByRole('button', { name: 'Copy shortcut' }).click();
    expect(await lastCopied(page)).toBe('Ctrl+Shift+K');
    await page.getByRole('button', { name: 'Copy JS condition' }).click();
    expect(await lastCopied(page)).toBe('e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "k"');
    // A mouse click on a control hands focus back to the capture area.
    await expect(page.locator('#capture')).toBeFocused();

    await page.locator('#matchSwitch [data-match="code"]').click();
    await expect(page.locator('#matchSwitch [data-match="code"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#conditionText')).toHaveText('e.ctrlKey && e.shiftKey && e.code === "KeyK"');
    expect(await page.evaluate(() => location.hash)).toBe('#code');

    // The combo names the physical key, so Shift+1 is not "Shift+!".
    await page.keyboard.press('Shift+Digit1');
    await expect(page.locator('#shortcutText')).toHaveText('Shift+1');
    await expect(page.locator('#conditionText')).toHaveText('e.shiftKey && e.code === "Digit1"');
    await page.locator('#matchSwitch [data-match="key"]').click();
    await expect(page.locator('#conditionText')).toHaveText('e.shiftKey && e.key === "!"');
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('code matching survives a reload through the hash', async ({ page }) => {
    await openTool(page, TOOL);
    await page.goto(`/tools/${TOOL}/#code`);
    await expect(page.locator('#matchSwitch [data-match="code"]')).toHaveClass(/active/);
  });

  test('copy latest event JSON from the capture header', async ({ page }) => {
    await openTool(page, TOOL);
    await page.getByRole('button', { name: 'Copy latest event as JSON' }).click();
    await expect(page.locator('.toast').last()).toContainText(/nothing to copy/i);
    await page.keyboard.press('KeyZ');
    await page.getByRole('button', { name: 'Copy latest event as JSON' }).click();
    const copied = JSON.parse(await lastCopied(page));
    expect(copied).toEqual(await latest(page));
    expect(copied.key).toBe('z');
  });

  test('history: newest first, capped at 30, row and bulk copy, clear', async ({ page }) => {
    await openTool(page, TOOL);
    await page.keyboard.press('KeyA');
    await page.keyboard.press('KeyB');
    const rows = page.locator('#history tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('.cell-key')).toHaveText('b');
    await expect(rows.first().locator('.cell-code')).toHaveText('KeyB');
    await expect(page.locator('.history-table thead th')).toHaveText(['Key', 'Code', 'keyCode', 'Location', 'Modifiers', 'Repeat', 'Copy']);

    await page.keyboard.press('Control+Shift+KeyM');
    await expect(rows.first().locator('.cell-mods')).toHaveText('Ctrl+Shift');

    await rows.nth(1).getByRole('button').click();
    expect(JSON.parse(await lastCopied(page)).code).toBe('ShiftLeft');

    await page.getByRole('button', { name: 'Copy history as JSON' }).click();
    const all = JSON.parse(await lastCopied(page));
    expect(Array.isArray(all)).toBe(true);
    expect(all[0].code).toBe('KeyM');
    expect(all.at(-1).code).toBe('KeyA');

    for (let i = 0; i < 35; i += 1) {
      await page.locator('#capture').dispatchEvent('keydown', { key: 'x', code: 'KeyX' });
    }
    await expect(rows).toHaveCount(30);
    await expect(page.locator('#historyCount')).toHaveText(/30 \/ 30 events/i);

    await page.locator('#clear').click();
    await expect(page.locator('#history')).toBeEmpty();
    await expect(page.locator('#historyEmpty')).toBeVisible();
    await page.getByRole('button', { name: 'Copy history as JSON' }).click();
    await expect(page.locator('.toast').last()).toContainText(/nothing to copy/i);
  });

  test('ignore repeats keeps repeats out of history but still shows them', async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator('#ignoreRepeats').check();
    await page.locator('#capture').focus();
    await page.locator('#capture').dispatchEvent('keydown', { key: 'j', code: 'KeyJ' });
    await page.locator('#capture').dispatchEvent('keydown', { key: 'j', code: 'KeyJ', repeat: true });
    await page.locator('#capture').dispatchEvent('keydown', { key: 'j', code: 'KeyJ', repeat: true });
    await expect(page.locator('#history tr')).toHaveCount(1);
    expect((await latest(page)).repeat).toBe(true);
    await expect(page.locator('#historyStatus')).toContainText('2 repeats ignored');
  });

  test('Tab, Escape and Ctrl/Meta combos are not prevented; other keys are', async ({ page }) => {
    await openTool(page, TOOL);
    const prevented = (init) => page.locator('#capture').evaluate((node, eventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    }, init);
    expect(await prevented({ key: 'Tab', code: 'Tab' })).toBe(false);
    expect(await prevented({ key: 'Escape', code: 'Escape' })).toBe(false);
    expect(await prevented({ key: 'c', code: 'KeyC', ctrlKey: true })).toBe(false);
    expect(await prevented({ key: 'r', code: 'KeyR', metaKey: true })).toBe(false);
    expect(await prevented({ key: ' ', code: 'Space' })).toBe(true);
    expect(await prevented({ key: 'ArrowDown', code: 'ArrowDown' })).toBe(true);

    // Tab really moves focus out of the capture area.
    await page.locator('#capture').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#capture')).not.toBeFocused();
  });

  test('help modal explains the pass-through keys', async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator('#helpBtn').click();
    const modal = page.locator('#helpModal');
    await expect(modal).toHaveClass(/is-open/);
    await expect(modal).toContainText('Tab and Escape are not intercepted');
    await expect(modal).toContainText('Ctrl and Meta combinations are not blocked');
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/is-open/);
  });

  test('fills the viewport on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTool(page, TOOL);
    const box = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('.main-content > .panel')].map((panel) => panel.getBoundingClientRect());
      return { bottoms: panels.map((rect) => Math.round(rect.bottom)), scroll: document.documentElement.scrollHeight, inner: innerHeight };
    });
    for (const bottom of box.bottoms) expect(bottom).toBeGreaterThan(box.inner - 40);
    expect(box.scroll).toBeLessThanOrEqual(box.inner);
  });

  test('no horizontal overflow at 390×844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = await openTool(page, TOOL);
    await page.keyboard.press('Control+Shift+KeyK');
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
