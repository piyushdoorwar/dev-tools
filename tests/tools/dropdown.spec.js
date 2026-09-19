import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

test('unit-converter precision dropdown', async ({ page }) => {
  const { errors } = await openTool(page, 'unit-converter');
  const dd = page.locator('#precision-dropdown');
  await expect(dd).not.toHaveClass(/is-open/);
  await page.click('#precision-trigger');
  await expect(dd).toHaveClass(/is-open/);
  await expect(page.locator('#precision-trigger')).toHaveAttribute('aria-expanded', 'true');

  await page.click('.dd__option[data-value="6"]');
  await expect(dd).not.toHaveClass(/is-open/);
  await expect(page.locator('#precision-value')).toHaveText('6');
  await expect(page.locator('.dd__option[data-value="6"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.dd__option[data-value="4"]')).not.toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => selectedPrecision)).toBe(6);

  // Outside click closes.
  await page.click('#precision-trigger');
  await expect(dd).toHaveClass(/is-open/);
  await page.locator('h1').first().click();
  await expect(dd).not.toHaveClass(/is-open/);

  // Escape closes and returns focus.
  await page.click('#precision-trigger');
  await page.keyboard.press('Escape');
  await expect(dd).not.toHaveClass(/is-open/);
  expect(errors).toEqual([]);
});

test('unit-converter keyboard nav', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await page.click('#precision-trigger');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#precision-value')).not.toHaveText('4');
});

test('id-generator type dropdown drives the hidden select', async ({ page }) => {
  const { errors } = await openTool(page, 'id-generator');
  await page.click('#id-type-trigger');
  await page.click('.dd__option[data-value="ulid"]');
  await expect(page.locator('#id-type-value')).toHaveText('ULID');
  expect(await page.locator('#id-type').inputValue()).toBe('ulid');

  // Driving the native select must still sync the visible dropdown.
  await page.selectOption('#id-type', 'nanoid');
  await expect(page.locator('#id-type-value')).toHaveText('Nano ID');
  await expect(page.locator('.dd__option[data-value="nanoid"]')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('json-xml case menu still applies casing', async ({ page }) => {
  const { errors } = await openTool(page, 'json-xml-converter');
  await page.locator('#left-editor').fill('{"user_name":"x"}');
  await page.locator('#left-editor').dispatchEvent('input');
  await page.click('.dd--menu .dd__trigger');
  await expect(page.locator('.dd--menu')).toHaveClass(/is-open/);
  await page.click('.dd__option[data-value="camel"]');
  await expect(page.locator('#left-editor')).toHaveValue(/userName/);
  await expect(page.locator('.dd--menu')).not.toHaveClass(/is-open/);
  expect(errors).toEqual([]);
});
