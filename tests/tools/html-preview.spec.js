import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText } from '../helpers.js';

const frame = (page) => page.frameLocator('#preview-iframe');

/** The three panes are CodeMirror instances, so write through their API. */
async function setCode(page, pane, code) {
  await page.evaluate(({ target, value }) => {
    const editor = { html: htmlEditor, css: cssEditor, script: scriptEditor }[target];
    editor.setValue(value);
  }, { target: pane, value: code });
}

test('HTML renders into the preview frame', async ({ page }) => {
  await openTool(page, 'html-preview');
  await setCode(page, 'html', '<h1 id="greeting">Hello preview</h1>');

  await expect(frame(page).locator('#greeting')).toHaveText('Hello preview');
});

test('CSS from the style pane is applied', async ({ page }) => {
  await openTool(page, 'html-preview');
  await setCode(page, 'html', '<p id="target">styled</p>');
  await setCode(page, 'css', '#target { color: rgb(255, 0, 0); }');

  await expect(frame(page).locator('#target')).toHaveCSS('color', 'rgb(255, 0, 0)');
});

test('JavaScript from the script pane runs in the preview', async ({ page }) => {
  await openTool(page, 'html-preview');
  await setCode(page, 'html', '<div id="out"></div>');
  await setCode(page, 'script', 'document.getElementById("out").textContent = 2 + 3;');

  await expect(frame(page).locator('#out')).toHaveText('5');
});

test('switching panes changes which editor is active', async ({ page }) => {
  await openTool(page, 'html-preview');

  // CodeMirror hides the original <textarea>, so ask the app which editor is live.
  for (const pane of ['css', 'script', 'html']) {
    await page.locator(`[data-target="${pane}"]`).click();
    await expect(page.locator(`[data-target="${pane}"]`)).toHaveClass(/active/);
    const isCurrent = await page.evaluate((target) => {
      const expected = { html: htmlEditor, css: cssEditor, script: scriptEditor }[target];
      return getCurrentEditor() === expected;
    }, pane);
    expect(isCurrent, `${pane} pane should be current`).toBe(true);
  }
});

test('the sample loads content into all three panes', async ({ page }) => {
  await openTool(page, 'html-preview');

  await page.locator('#load-sample-btn').click();
  const lengths = await page.evaluate(() => ({
    html: htmlEditor.getValue().length,
    css: cssEditor.getValue().length,
    script: scriptEditor.getValue().length,
  }));

  expect(lengths.html).toBeGreaterThan(0);
  expect(lengths.css).toBeGreaterThan(0);
  expect(lengths.script).toBeGreaterThan(0);
});

test('the export wraps a fragment in a full document linking the sibling assets', async ({ page }) => {
  await openTool(page, 'html-preview');

  const exported = await page.evaluate(() => buildExportHtml('<h1>Bundled</h1>'));
  expect(exported).toContain('<!DOCTYPE html>');
  expect(exported).toContain('<h1>Bundled</h1>');
  expect(exported).toContain('href="styles.css"');
  expect(exported).toContain('src="script.js"');
});

test('the export preserves a document that already has html and head tags', async ({ page }) => {
  await openTool(page, 'html-preview');

  const exported = await page.evaluate(
    () => buildExportHtml('<html><head><title>Mine</title></head><body><p>Body</p></body></html>'),
  );
  expect(exported).toContain('<title>Mine</title>');
  expect(exported).toContain('href="styles.css"');
  expect(exported).toContain('src="script.js"');
  // The wrapper must not be added twice.
  expect(exported.match(/<html/gi)).toHaveLength(1);
});

test('a ZIP export is produced', async ({ page }) => {
  await openTool(page, 'html-preview');
  await page.locator('#load-sample-btn').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-zip').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test('copy exports the active pane and paste fills it', async ({ page }) => {
  await openTool(page, 'html-preview');
  await setCode(page, 'html', '<p>copy this</p>');

  await page.locator('#copy-btn').click();
  expect(await lastCopied(page)).toContain('copy this');

  await setClipboardText(page, '<p>pasted</p>');
  await page.locator('#paste-btn').click();
  await expect.poll(() => page.evaluate(() => htmlEditor.getValue())).toContain('pasted');
});

test('clear empties the active pane and undo brings it back', async ({ page }) => {
  await openTool(page, 'html-preview');
  await setCode(page, 'html', '<p>keep me</p>');

  await page.locator('#clear-btn').click();
  await expect.poll(() => page.evaluate(() => htmlEditor.getValue())).toBe('');

  await page.locator('#undo-btn').click();
  await expect.poll(() => page.evaluate(() => htmlEditor.getValue())).toContain('keep me');
});

test('the theme toggle swaps the light and dark indicators', async ({ page }) => {
  await openTool(page, 'html-preview');

  const iconState = () => page.evaluate(() => {
    const toggle = document.getElementById('theme-toggle');
    return {
      sun: toggle.querySelector('.sun-icon').classList.contains('hidden'),
      moon: toggle.querySelector('.moon-icon').classList.contains('hidden'),
    };
  });

  const before = await iconState();
  await page.locator('#theme-toggle').click();
  await expect.poll(iconState).not.toEqual(before);

  await page.locator('#theme-toggle').click();
  await expect.poll(iconState).toEqual(before);
});

test('the preview is sandboxed away from the host page', async ({ page }) => {
  await openTool(page, 'html-preview');

  const sandbox = await page.locator('#preview-iframe').getAttribute('sandbox');
  expect(sandbox).toBeTruthy();
  expect(sandbox).not.toContain('allow-same-origin');
});
