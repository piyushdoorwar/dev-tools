import { expect, test } from '@playwright/test';
import { lastCopied, openTool, typeInto } from '../helpers.js';

const CATEGORIES = [
  'length', 'area', 'volume', 'weight', 'temperature', 'time',
  'speed', 'data', 'energy', 'power', 'angle', 'fuelEconomy',
];

test('every category converts through its base unit', async ({ page }) => {
  await openTool(page, 'unit-converter');

  const results = await page.evaluate((categories) => categories.map((key) => {
    const category = UNIT_CATEGORIES[key];
    const units = Object.keys(category.units);
    // Round-trip through every unit: value -> other -> back must return the input.
    const roundTrips = units.map((unit) => {
      const forward = convertValue(key, 100, units[0], unit);
      const back = convertValue(key, forward, unit, units[0]);
      return { unit, back };
    });
    return { key, unitCount: units.length, roundTrips };
  }), CATEGORIES);

  for (const category of results) {
    expect(category.unitCount, `${category.key} should expose units`).toBeGreaterThan(1);
    for (const trip of category.roundTrips) {
      expect(trip.back, `${category.key}/${trip.unit} round-trip`).toBeCloseTo(100, 6);
    }
  }
});

test('length, weight, and data conversions match known values', async ({ page }) => {
  await openTool(page, 'unit-converter');

  const values = await page.evaluate(() => ({
    kmToMi: convertValue('length', 1, 'km', 'mi'),
    inToCm: convertValue('length', 1, 'in', 'cm'),
    kgToLb: convertValue('weight', 1, 'kg', 'lb'),
    gibToMib: convertValue('data', 1, 'GiB', 'MiB'),
  }));

  expect(values.kmToMi).toBeCloseTo(0.621371, 5);
  expect(values.inToCm).toBeCloseTo(2.54, 10);
  expect(values.kgToLb).toBeCloseTo(2.20462, 4);
  expect(values.gibToMib).toBeCloseTo(1024, 6);
});

test('temperature uses offset math rather than a scale factor', async ({ page }) => {
  await openTool(page, 'unit-converter');

  const values = await page.evaluate(() => ({
    freezeCtoF: convertValue('temperature', 0, 'C', 'F'),
    boilCtoF: convertValue('temperature', 100, 'C', 'F'),
    absoluteZero: convertValue('temperature', -273.15, 'C', 'K'),
    fToC: convertValue('temperature', 98.6, 'F', 'C'),
  }));

  expect(values.freezeCtoF).toBeCloseTo(32, 10);
  expect(values.boilCtoF).toBeCloseTo(212, 10);
  expect(values.absoluteZero).toBeCloseTo(0, 10);
  expect(values.fToC).toBeCloseTo(37, 6);
});

test('fuel economy inverts between consumption and distance-per-volume', async ({ page }) => {
  await openTool(page, 'unit-converter');

  const values = await page.evaluate(() => ({
    kmplToL100km: convertValue('fuelEconomy', 10, 'kmpl', 'L100km'),
    mpgUsToL100km: convertValue('fuelEconomy', 30, 'mpgUS', 'L100km'),
    zero: convertValue('fuelEconomy', 0, 'kmpl', 'L100km'),
  }));

  expect(values.kmplToL100km).toBeCloseTo(10, 10);
  expect(values.mpgUsToL100km).toBeCloseTo(7.8405, 3);
  // 0 km/l is infinite consumption, not NaN.
  expect(values.zero).toBe(Infinity);
});

test('invalid input surfaces an error instead of a result', async ({ page }) => {
  await openTool(page, 'unit-converter');

  await typeInto(page, '#value-input', 'not a number');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#result')).toHaveText('-');

  await typeInto(page, '#value-input', '');
  await expect(page.locator('#error')).toHaveText('Enter a value to convert.');

  await typeInto(page, '#value-input', '12');
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#result')).not.toHaveText('-');
});

test('switching category repopulates units and reconverts', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await typeInto(page, '#value-input', '1');

  const lengthUnits = await page.locator('#from-unit-list .unit-btn').count();
  expect(lengthUnits).toBeGreaterThan(1);

  await page.locator('#category-list button', { hasText: 'Temperature' }).first().click();
  await expect(page.locator('#from-unit-list .unit-btn')).toHaveCount(3);
  await expect(page.locator('#result')).not.toHaveText('-');
});

test('swap exchanges the two units and the reading follows', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await typeInto(page, '#value-input', '1');

  const before = await page.evaluate(() => ({ from: selectedFromUnit, to: selectedToUnit }));
  await page.locator('#swap-units').click();
  const after = await page.evaluate(() => ({ from: selectedFromUnit, to: selectedToUnit }));

  expect(after.from).toBe(before.to);
  expect(after.to).toBe(before.from);
  await expect(page.locator('#from-unit-list .unit-btn.active')).toHaveCount(1);
});

test('precision setting controls the rendered decimals', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await typeInto(page, '#value-input', '1');
  await page.evaluate(() => { selectedFromUnit = 'km'; selectedToUnit = 'mi'; convertAndRender(); });

  await page.evaluate(() => setPrecision(2));
  await page.evaluate(() => convertAndRender());
  await expect(page.locator('#result')).toHaveText('0.62');

  await page.evaluate(() => setPrecision(6));
  await page.evaluate(() => convertAndRender());
  await expect(page.locator('#result')).toHaveText('0.621371');
});

test('the all-units panel lists every unit except the source', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await typeInto(page, '#value-input', '1');

  const counts = await page.evaluate(() => ({
    rows: document.querySelectorAll('#all-results .result-row').length,
    units: Object.keys(UNIT_CATEGORIES[selectedCategoryKey].units).length,
  }));

  expect(counts.rows).toBe(counts.units - 1);
});

test('copy puts the converted reading on the clipboard', async ({ page }) => {
  await openTool(page, 'unit-converter');
  await typeInto(page, '#value-input', '5');

  await page.locator('#copy-result').click();
  const copied = await lastCopied(page);
  expect(copied).toBeTruthy();
  expect(copied).not.toBe('-');
});
