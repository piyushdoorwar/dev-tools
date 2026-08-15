import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

test('JSON converts to well-formed XML', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const result = await page.evaluate(() => {
    const xml = jsonToXML({ user: { name: 'ada', active: true, scores: [1, 2] } });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return { xml, error: Boolean(doc.querySelector('parsererror')) };
  });

  expect(result.error).toBe(false);
  expect(result.xml).toContain('ada');
});

test('XML converts back to the original JSON shape', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const roundTrip = await page.evaluate(() => {
    const source = { user: { name: 'ada', city: 'London' } };
    const xml = jsonToXML(source);
    return xmlToJSON(xml);
  });

  expect(JSON.stringify(roundTrip)).toContain('ada');
  expect(JSON.stringify(roundTrip)).toContain('London');
});

test('keys that are not valid XML names are made safe', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const result = await page.evaluate(() => {
    const xml = jsonToXML([{ 'not valid': 'one' }, { '1st': 'two' }]);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return { xml, error: Boolean(doc.querySelector('parsererror')) };
  });

  expect(result.error).toBe(false);
});

test('typing JSON converts live into the XML pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"greeting":"hi"}');

  await expect(page.locator('#right-editor')).toHaveValue(/hi/);
  await expect(page.locator('#left-status')).toContainText('Valid JSON');
});

test('switching to XML to JSON mode converts the other direction', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await page.locator('.mode-btn[data-mode="xml-json"]').click();
  await expect(page.locator('#left-title')).toContainText('XML');

  await typeInto(page, '#left-editor', '<root><greeting>hi</greeting></root>');

  await expect(page.locator('#right-editor')).not.toHaveValue('');
  const output = await page.locator('#right-editor').inputValue();
  expect(JSON.stringify(JSON.parse(output))).toContain('hi');
});

test('invalid input is reported rather than silently converted', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"broken":');
  await expect(page.locator('#left-status')).not.toContainText('Valid JSON');
});

test('beautify reformats the JSON pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"a":{"b":1}}');
  await page.locator('[data-action="beautify-left"]').click();
  const value = await page.locator('#left-editor').inputValue();

  expect(value).toContain('\n');
  expect(JSON.parse(value)).toEqual({ a: { b: 1 } });
});

test('key casing can be converted', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const converted = await page.evaluate(() => convertObjectCasing({ first_name: 'ada', last_name: 'l' }, 'camel'));
  expect(Object.keys(converted)).toEqual(['firstName', 'lastName']);
});

test('the sample loads and converts', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await page.locator('[data-action="load-sample"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('');
});

test('copy, paste, clear, and download act on the right pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await typeInto(page, '#left-editor', '{"a":1}');

  await page.locator('[data-action="copy-left"]').click();
  expect(await lastCopied(page)).toBe('{"a":1}');

  const download = await captureDownload(page, () => page.locator('[data-action="download-left"]').click());
  expect(await downloadText(download)).toContain('"a"');

  await setClipboardText(page, '{"pasted":1}');
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"pasted":1}');

  await page.locator('[data-action="clear-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
});
