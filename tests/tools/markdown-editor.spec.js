import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

const preview = (page) => page.locator('#preview');

async function write(page, markdown) {
  await typeInto(page, '#editor', markdown);
  await expect(preview(page)).not.toBeEmpty();
}

test('markdown renders to formatted HTML', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await write(page, '# Title\n\nSome **bold** and _italic_ text.\n\n- one\n- two\n');

  await expect(preview(page).locator('h1')).toHaveText('Title');
  await expect(preview(page).locator('strong')).toHaveText('bold');
  await expect(preview(page).locator('em')).toHaveText('italic');
  await expect(preview(page).locator('li')).toHaveCount(2);
});

test('tables, quotes, and task lists render', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await write(page, [
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '> quoted',
    '',
    '- [x] done',
    '- [ ] todo',
  ].join('\n'));

  await expect(preview(page).locator('table')).toHaveCount(1);
  await expect(preview(page).locator('blockquote')).toContainText('quoted');
  await expect(preview(page).locator('input[type="checkbox"]')).toHaveCount(2);
});

test('fenced code blocks are highlighted, not executed', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await write(page, '```js\nconst answer = 42;\n```\n');

  await expect(preview(page).locator('pre code')).toContainText('const answer = 42;');
});

test('executable HTML is stripped from the preview', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await write(page, '<img src=x onerror="window.__xss = true">\n\n<script>window.__xss = true;<\/script>\n\nsafe text');

  await expect(preview(page)).toContainText('safe text');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(preview(page).locator('script')).toHaveCount(0);
});

test('toolbar actions wrap the selection', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await typeInto(page, '#editor', 'word');

  await page.locator('#editor').selectText();
  await page.locator('[data-action="bold"]').click();
  await expect(page.locator('#editor')).toHaveValue('**word**');

  await page.locator('#editor').selectText();
  await page.locator('[data-action="italic"]').click();
  await expect(page.locator('#editor')).toHaveValue(/\*\*word\*\*/);
});

test('block actions insert their markdown', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await typeInto(page, '#editor', '');

  await page.locator('[data-action="hr"]').click();
  await expect(page.locator('#editor')).toHaveValue(/---/);

  await page.locator('[data-action="ul"]').click();
  await expect(page.locator('#editor')).toHaveValue(/-\s/);
});

test('the table modal inserts a grid of the requested size', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  await page.locator('[data-action="table"]').click();
  await expect(page.locator('#tableModal')).toBeVisible();

  await page.locator('#tableRows').fill('3');
  await page.locator('#tableCols').fill('2');
  await page.locator('#tableModal button', { hasText: 'Add Table' }).click();

  const value = await page.locator('#editor').inputValue();
  expect(value).toContain('|');
  expect(value.split('\n').filter((line) => line.includes('|')).length).toBeGreaterThanOrEqual(4);
});

test('the link modal inserts markdown link syntax', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  // The link button is gated on having a selection.
  await typeInto(page, '#editor', 'Anthropic');
  await page.locator('#editor').selectText();
  await page.locator('[data-action="link"]').click();
  await expect(page.locator('#linkModal')).toBeVisible();

  await page.locator('#linkText').fill('Anthropic');
  await page.locator('#linkUrl').fill('https://example.com');
  await page.locator('#linkModal button', { hasText: 'Add Link' }).click();

  await expect(page.locator('#editor')).toHaveValue(/\[Anthropic\]\(https:\/\/example\.com\)/);
});

test('the code block modal inserts a fenced block with the chosen language', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  await page.locator('[data-action="codeblock"]').click();
  await expect(page.locator('#codeBlockModal')).toBeVisible();

  await page.locator('#codeLanguage').selectOption('python');
  await page.locator('#codeContent').fill('print("hi")');
  await page.locator('#codeBlockModal button', { hasText: 'Add Code Block' }).click();

  await expect(page.locator('#editor')).toHaveValue(/```python[\s\S]*print\("hi"\)[\s\S]*```/);
});

test('opening a local markdown file loads its contents', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  await page.locator('#markdownFileInput').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# From a file\n\nloaded body'),
  });

  await expect(page.locator('#editor')).toHaveValue(/# From a file/);
  await expect(preview(page).locator('h1')).toHaveText('From a file');
});

test('the sample loads and copy and download export the document', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  await page.locator('[data-action="loadSample"]').click();
  await expect(page.locator('#editor')).not.toHaveValue('');

  await page.locator('[data-action="copy"]').click();
  expect(await lastCopied(page)).toBeTruthy();

  const download = await captureDownload(page, () => page.locator('[data-action="download"]').click());
  expect((await downloadText(download)).length).toBeGreaterThan(0);
});

test('undo and redo step through edits', async ({ page }) => {
  await openTool(page, 'markdown-editor');

  await page.locator('#editor').click();
  await page.keyboard.type('first');
  await expect(page.locator('#editor')).toHaveValue('first');

  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#editor')).not.toHaveValue('first');
});

test('line numbers follow the document length', async ({ page }) => {
  await openTool(page, 'markdown-editor');
  await write(page, 'one\ntwo\nthree\nfour');

  await expect.poll(() => page.locator('#line-numbers').innerText()).toMatch(/1[\s\S]*4/);
});
