import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool } from '../helpers.js';

/** Replace the schema with the given fields and generate records. */
async function generate(page, fields, count = 5) {
  await page.evaluate(({ schema, total }) => {
    clearFields();
    schema.forEach((field) => addFieldRow(field, { focusNew: false }));
    document.getElementById('record-count').value = String(total);
    generateOutput();
  }, { schema: fields, total: count });

  await expect(page.locator('#output-editor')).not.toHaveValue('');
  return JSON.parse(await page.locator('#output-editor').inputValue());
}

test('the sample schema generates the requested number of records', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('[data-action="load-sample"]').click();
  await page.locator('#record-count').fill('7');
  await page.locator('[data-action="generate"]').click();

  await expect(page.locator('#output-editor')).not.toHaveValue('');
  const records = JSON.parse(await page.locator('#output-editor').inputValue());
  expect(records).toHaveLength(7);
  expect(records[0]).toHaveProperty('email');
});

test('each field type produces a value of the right shape', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  const records = await generate(page, [
    { name: 'name', type: 'full_name' },
    { name: 'email', type: 'email' },
    { name: 'uuid', type: 'uuid' },
    { name: 'ulid', type: 'ulid' },
    { name: 'flag', type: 'boolean' },
    { name: 'count', type: 'number' },
    { name: 'when', type: 'date' },
    { name: 'site', type: 'url' },
    { name: 'ip', type: 'ipv4' },
  ], 10);

  expect(records).toHaveLength(10);
  for (const record of records) {
    expect(record.name).toMatch(/\S/);
    expect(record.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(record.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(record.ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(typeof record.flag).toBe('boolean');
    expect(Number.isFinite(record.count)).toBe(true);
    expect(Number.isNaN(Date.parse(record.when))).toBe(false);
    expect(record.site).toMatch(/^https?:\/\//);
    expect(record.ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  }
});

test('generated values vary between records', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  const records = await generate(page, [{ name: 'id', type: 'uuid' }], 20);
  expect(new Set(records.map((record) => record.id)).size).toBe(20);
});

test('nested mode builds objects from dotted field names', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('[data-structure="nested"]').click();
  const records = await generate(page, [
    { name: 'user.name', type: 'full_name' },
    { name: 'user.address.city', type: 'city' },
    { name: 'meta.created', type: 'date' },
  ], 3);

  for (const record of records) {
    expect(typeof record.user).toBe('object');
    expect(typeof record.user.address).toBe('object');
    expect(record.user.address.city).toMatch(/\S/);
    expect(record.meta.created).toBeTruthy();
  }
});

test('flat mode keeps dotted names as literal keys', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('[data-structure="flat"]').click();
  const records = await generate(page, [{ name: 'user.name', type: 'full_name' }], 2);

  for (const record of records) {
    expect(Object.keys(record)).toContain('user.name');
  }
});

test('nested field names cannot pollute Object.prototype', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('[data-structure="nested"]').click();
  await generate(page, [{ name: '__proto__.polluted', type: 'full_name' }], 1);

  const polluted = await page.evaluate(() => ({}).polluted);
  expect(polluted).toBeUndefined();
});

test('the record count is reflected in the output', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  expect(await generate(page, [{ name: 'id', type: 'uuid' }], 1)).toHaveLength(1);
  expect(await generate(page, [{ name: 'id', type: 'uuid' }], 100)).toHaveLength(100);
});

test('an empty schema shows the empty state instead of records', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('[data-action="clear-fields"]').click();
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('adding and clearing fields updates the schema list', async ({ page }) => {
  await openTool(page, 'fake-data-generator');
  await page.locator('[data-action="clear-fields"]').click();

  await page.locator('[data-action="add-field"]').click();
  await expect(page.locator('#field-list .field-row')).toHaveCount(1);

  await page.locator('[data-action="add-field"]').click();
  await expect(page.locator('#field-list .field-row')).toHaveCount(2);

  await page.locator('[data-action="clear-fields"]').click();
  await expect(page.locator('#field-list .field-row')).toHaveCount(0);
});

test('copy, download, and clear act on the generated output', async ({ page }) => {
  await openTool(page, 'fake-data-generator');
  await generate(page, [{ name: 'id', type: 'uuid' }], 3);

  await page.locator('[data-action="copy-output"]').click();
  expect(JSON.parse(await lastCopied(page))).toHaveLength(3);

  const download = await captureDownload(page, () => page.locator('[data-action="download-output"]').click());
  expect(JSON.parse(await downloadText(download))).toHaveLength(3);

  await page.locator('[data-action="clear-output"]').click();
  await expect(page.locator('#output-editor')).toHaveValue('');
});

test('the schema help modal opens and closes', async ({ page }) => {
  await openTool(page, 'fake-data-generator');

  await page.locator('#schemaHelpBtn').click();
  await expect(page.locator('#schemaHelpModal')).toBeVisible();

  await page.locator('#schemaHelpCloseBtn').click();
  await expect(page.locator('#schemaHelpModal')).toBeHidden();
});
