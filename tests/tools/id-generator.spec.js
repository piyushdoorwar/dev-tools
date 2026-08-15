import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool } from '../helpers.js';

const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function generate(page, type, count = 1) {
  await page.evaluate(({ idType, total }) => {
    setIdType(idType);
    document.getElementById('count-input').value = String(total);
  }, { idType: type, total: count });
  await page.locator('#generate-btn').click();
  const text = await page.locator('#output-area').innerText();
  return text.trim().split('\n').map((line) => line.trim()).filter(Boolean);
}

test('UUID v4 output is well formed and unique', async ({ page }) => {
  await openTool(page, 'id-generator');

  const ids = await generate(page, 'uuid-v4', 25);
  expect(ids).toHaveLength(25);
  expect(new Set(ids).size).toBe(25);
  for (const id of ids) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
});

test('UUID v7 is time-ordered', async ({ page }) => {
  await openTool(page, 'id-generator');

  const ids = await generate(page, 'uuid-v7', 10);
  expect(ids).toHaveLength(10);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // The 48-bit prefix is the creation time; the remaining bits are random, so
  // only the timestamp portion is guaranteed to be non-decreasing.
  const timestamps = ids.map((id) => id.replace(/-/g, '').slice(0, 12));
  expect([...timestamps].sort()).toEqual(timestamps);
});

test('name-based UUIDs match the RFC test vectors', async ({ page }) => {
  await openTool(page, 'id-generator');

  const vectors = await page.evaluate(async () => {
    const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    return {
      v3: generateUUIDv3(dns, 'www.widgets.com'),
      v5: await generateUUIDv5(dns, 'www.widgets.com'),
    };
  });

  expect(vectors.v3).toBe('3d813cbb-47fb-32ba-91df-831e1593ac29');
  expect(vectors.v5).toBe('21f7f8de-8051-5b89-8680-0195ef798b6a');
});

test('name-based UUIDs are stable and namespace-sensitive', async ({ page }) => {
  await openTool(page, 'id-generator');

  const result = await page.evaluate(async () => {
    const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const url = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
    return {
      repeat: [generateUUIDv3(dns, 'example'), generateUUIDv3(dns, 'example')],
      otherNamespace: generateUUIDv3(url, 'example'),
      v5repeat: [await generateUUIDv5(dns, 'example'), await generateUUIDv5(dns, 'example')],
    };
  });

  expect(result.repeat[0]).toBe(result.repeat[1]);
  expect(result.v5repeat[0]).toBe(result.v5repeat[1]);
  expect(result.otherNamespace).not.toBe(result.repeat[0]);
});

test('ULID, ObjectId, and NanoID match their formats', async ({ page }) => {
  await openTool(page, 'id-generator');

  const ulids = await generate(page, 'ulid', 5);
  for (const id of ulids) expect(id.toUpperCase()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  // ULID sorts lexicographically by its timestamp prefix.
  const ulidTimes = ulids.map((id) => id.slice(0, 10));
  expect([...ulidTimes].sort()).toEqual(ulidTimes);

  const objectIds = await generate(page, 'objectid', 5);
  for (const id of objectIds) expect(id).toMatch(/^[0-9a-f]{24}$/i);

  const nanoIds = await generate(page, 'nanoid', 5);
  for (const id of nanoIds) expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  expect(new Set(nanoIds).size).toBe(5);
});

test('UUID v1 is produced in the right version and variant', async ({ page }) => {
  await openTool(page, 'id-generator');

  const ids = await generate(page, 'uuid-v1', 3);
  for (const id of ids) {
    expect(id).toMatch(UUID_ANY);
    expect(id[14]).toBe('1');
  }
});

test('decoding a v7 UUID and a ULID recovers the creation time', async ({ page }) => {
  await openTool(page, 'id-generator');

  const decoded = await page.evaluate(() => {
    const readTime = () => document.querySelector('[data-field="time"] input')?.value;
    const uuid = generateUUIDv7();
    decodeValue(uuid);
    const uuidTime = readTime();
    const ulid = generateUlid();
    decodeValue(ulid);
    return { uuidTime, ulidTime: readTime(), now: Date.now() };
  });

  expect(Math.abs(Date.parse(decoded.uuidTime) - decoded.now)).toBeLessThan(5_000);
  expect(Math.abs(Date.parse(decoded.ulidTime) - decoded.now)).toBeLessThan(5_000);
});

test('decoding reports the version and variant of a UUID', async ({ page }) => {
  await openTool(page, 'id-generator');

  await page.locator('#decode-input').fill('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  await page.locator('#decode-input').dispatchEvent('input');

  await expect(page.locator('[data-field="version"] input')).toHaveValue(/1/);
  await expect(page.locator('[data-field="standard"] input')).not.toHaveValue('');
});

test('the case toggle rewrites the generated output', async ({ page }) => {
  await openTool(page, 'id-generator');
  await generate(page, 'uuid-v4', 3);

  await page.locator('[data-case="upper"]').click();
  const upper = await page.locator('#output-area').innerText();
  expect(upper).toBe(upper.toUpperCase());

  await page.locator('[data-case="lower"]').click();
  const lower = await page.locator('#output-area').innerText();
  expect(lower).toBe(lower.toLowerCase());
});

test('the count field controls how many IDs are produced', async ({ page }) => {
  await openTool(page, 'id-generator');

  expect(await generate(page, 'uuid-v4', 1)).toHaveLength(1);
  expect(await generate(page, 'uuid-v4', 50)).toHaveLength(50);
});

test('copy, download, and clear act on the generated output', async ({ page }) => {
  await openTool(page, 'id-generator');
  const ids = await generate(page, 'uuid-v4', 3);

  await page.locator('#copy-output-btn').click();
  expect(await lastCopied(page)).toContain(ids[0]);

  const download = await captureDownload(page, () => page.locator('#download-btn').click());
  expect(await downloadText(download)).toContain(ids[0]);

  await page.locator('#clear-output-btn').click();
  await expect(page.locator('#output-area')).toHaveText('');
});

test('the sample button fills the decoder', async ({ page }) => {
  await openTool(page, 'id-generator');

  await page.locator('#sample-btn').click();
  await expect(page.locator('#decode-input')).not.toHaveValue('');

  await page.locator('#clear-decode-btn').click();
  await expect(page.locator('#decode-input')).toHaveValue('');
});
