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

async function decode(page, value) {
  await page.locator('#decode-input').fill(value);
  await page.locator('#decode-input').dispatchEvent('input');
  return page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.decoded-field')].map((f) => [f.dataset.field, f.querySelector('input').value]),
  ));
}

test('the decoder accepts nil, max, v8 and wrapped UUIDs', async ({ page }) => {
  await openTool(page, 'id-generator');

  // These all used to fall through to a row of dashes.
  expect((await decode(page, '00000000-0000-0000-0000-000000000000')).version).toBe('Nil UUID');
  expect((await decode(page, 'ffffffff-ffff-ffff-ffff-ffffffffffff')).version).toBe('Max UUID');
  expect((await decode(page, '320c3d4d-cc00-875b-8ec9-32d5f69181c0')).version).toBe('8 (custom)');

  const wrapped = await decode(page, '{6BA7B810-9DAD-11D1-80B4-00C04FD430C8}');
  expect(wrapped.standard).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');

  const bare = await decode(page, '6ba7b8109dad11d180b400c04fd430c8');
  expect(bare.standard).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  expect(bare.version).toMatch(/^1 /);
});

test('a non-RFC variant is named and no timestamp is invented for it', async ({ page }) => {
  await openTool(page, 'id-generator');
  const fields = await decode(page, '6ba7b810-9dad-11d1-c0b4-00c04fd430c8');
  expect(fields.variant).toBe('Reserved (Microsoft GUID)');
  expect(fields.time).toBe('—');
});

test('invalid decoder input is marked, and an overflowing ULID is rejected', async ({ page }) => {
  await openTool(page, 'id-generator');

  await decode(page, 'not-an-id');
  await expect(page.locator('#decode-input')).toHaveClass(/is-invalid/);

  // 26 Crockford characters starting above 7 exceed 128 bits.
  await decode(page, '8ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  await expect(page.locator('#decode-input')).toHaveClass(/is-invalid/);

  await decode(page, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
  await expect(page.locator('#decode-input')).not.toHaveClass(/is-invalid/);

  await page.locator('#clear-decode-btn').click();
  await expect(page.locator('#decode-input')).not.toHaveClass(/is-invalid/);
});

test('copy and download report when there is no output', async ({ page }) => {
  await openTool(page, 'id-generator');
  await page.locator('#clear-output-btn').click();

  await page.locator('#copy-output-btn').click();
  await expect(page.locator('.toast', { hasText: 'Nothing to copy' })).toBeVisible();
  await page.locator('#download-btn').click();
  await expect(page.locator('.toast', { hasText: 'Nothing to download' })).toBeVisible();
});

test('no horizontal scroll between the stack point and wide desktop', async ({ page }) => {
  for (const width of [960, 1024, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await openTool(page, 'id-generator');
    // Two 500px column floors used to force ~1140px of width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `at ${width}px`).toBe(true);
  }
});

test('the output editor grows with a tall viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openTool(page, 'id-generator');
  const height = await page.locator('.editor-wrapper').evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(600);
});
