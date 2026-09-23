import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

test('converts a mixed identifier into all six cases with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'text-case-converter');

  await page.fill('#input', 'some-variable_name');
  await expect(page.locator('#out-camel')).toHaveValue('someVariableName');
  await expect(page.locator('#out-pascal')).toHaveValue('SomeVariableName');
  await expect(page.locator('#out-snake')).toHaveValue('some_variable_name');
  await expect(page.locator('#out-kebab')).toHaveValue('some-variable-name');
  await expect(page.locator('#out-constant')).toHaveValue('SOME_VARIABLE_NAME');
  await expect(page.locator('#out-title')).toHaveValue('Some Variable Name');
  expect(errors).toEqual([]);
});

test('splits camelCase, PascalCase and acronym runs on their own', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.fill('#input', 'fooBar');
  await expect(page.locator('#out-snake')).toHaveValue('foo_bar');

  await page.fill('#input', 'SomeClassName');
  await expect(page.locator('#out-snake')).toHaveValue('some_class_name');

  // XMLParser: the acronym run splits before the last capital (XML / Parser).
  await page.fill('#input', 'XMLParser');
  await expect(page.locator('#out-snake')).toHaveValue('xml_parser');
  await expect(page.locator('#out-title')).toHaveValue('Xml Parser');
});

test('an empty input produces empty output for every case', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.fill('#input', 'hello world');
  await expect(page.locator('#out-camel')).toHaveValue('helloWorld');

  await page.fill('#input', '');
  for (const id of ['#out-camel', '#out-pascal', '#out-snake', '#out-kebab', '#out-constant', '#out-title']) {
    await expect(page.locator(id)).toHaveValue('');
  }
});

test('line by line is the default mode, and whole text treats line breaks as boundaries in one identifier', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await expect(page.locator('[data-bulk="true"]')).toHaveClass(/active/);
  await expect(page.locator('[data-bulk="true"]')).toHaveAttribute('aria-pressed', 'true');

  await page.click('[data-bulk="false"]');
  await page.fill('#input', 'first line\nsecond line');
  await expect(page.locator('#out-camel')).toHaveValue('firstLineSecondLine');
  await expect(page.locator('#out-snake')).toHaveValue('first_line_second_line');
});

test('line by line mode converts each line independently and preserves order', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.fill('#input', 'first phrase\nSecondPhrase\nthird_phrase');

  await expect(page.locator('#out-camel')).toHaveValue('firstPhrase\nsecondPhrase\nthirdPhrase');
  await expect(page.locator('#out-snake')).toHaveValue('first_phrase\nsecond_phrase\nthird_phrase');
  await expect(page.locator('#out-constant')).toHaveValue('FIRST_PHRASE\nSECOND_PHRASE\nTHIRD_PHRASE');

  // Switching to whole-text mode collapses it into a single identifier.
  await page.click('[data-bulk="false"]');
  await expect(page.locator('#out-camel')).toHaveValue('firstPhraseSecondPhraseThirdPhrase');
});

test('a blank line in bulk mode produces a blank line in every output, keeping counts aligned', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.fill('#input', 'alpha\n\nbeta');
  await expect(page.locator('#out-camel')).toHaveValue('alpha\n\nbeta');
});

test('copying a single case and copying all cases both work', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.fill('#input', 'ready to ship');
  await page.click('[data-action="copy-case"][data-case="kebab"]');
  expect(await lastCopied(page)).toBe('ready-to-ship');

  await page.click('[data-action="copy-all"]');
  expect(await lastCopied(page)).toContain('kebab-case: ready-to-ship');
  expect(await lastCopied(page)).toContain('Title Case: Ready To Ship');
});

test('sample and clear actions work', async ({ page }) => {
  await openTool(page, 'text-case-converter');

  await page.click('[data-action="sample"]');
  await expect(page.locator('#input')).not.toHaveValue('');
  await expect(page.locator('#out-camel')).not.toHaveValue('');

  await page.click('[data-action="clear"]');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#out-camel')).toHaveValue('');
});
