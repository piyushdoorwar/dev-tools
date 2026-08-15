import { expect, test } from '@playwright/test';
import { openTool, typeInto } from '../helpers.js';

/** Switch content type and read back the encoded payload the tool would render. */
async function encoded(page, type, fill) {
  await page.locator(`[data-content-type="${type}"]`).click();
  await fill();
  return page.evaluate(() => buildQrData());
}

test('plain text is encoded verbatim', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const data = await encoded(page, 'text', () => typeInto(page, '#textMessage', 'hello world'));
  expect(data).toBe('hello world');
});

test('a website URL gains a scheme when one is missing', async ({ page }) => {
  await openTool(page, 'qr-generator');

  expect(await encoded(page, 'website', () => typeInto(page, '#websiteUrl', 'example.com')))
    .toMatch(/^https?:\/\/example\.com/);
  expect(await encoded(page, 'website', () => typeInto(page, '#websiteUrl', 'https://example.com')))
    .toMatch(/^https:\/\/example\.com\/?$/);
});

test('an email address becomes a mailto link and is validated', async ({ page }) => {
  await openTool(page, 'qr-generator');

  expect(await encoded(page, 'email', () => typeInto(page, '#emailAddress', 'ada@example.com')))
    .toBe('mailto:ada@example.com');
  // An incomplete address produces nothing rather than a broken code.
  expect(await encoded(page, 'email', () => typeInto(page, '#emailAddress', 'not-an-email')))
    .toBe('');
});

test('phone and WhatsApp numbers are normalised', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const tel = await encoded(page, 'phone', async () => {
    await typeInto(page, '#phoneCode', '91');
    await typeInto(page, '#phoneNumber', '98765 43210');
  });
  expect(tel).toBe('tel:+919876543210');

  const wa = await encoded(page, 'whatsapp', async () => {
    await typeInto(page, '#waCode', '1');
    await typeInto(page, '#waNumber', '(555) 010-1234');
  });
  expect(wa).toBe('https://wa.me/15550101234');
});

test('Wi-Fi credentials use the WIFI payload format', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const wifi = await encoded(page, 'wifi', async () => {
    await page.locator('#wifiSecurity').selectOption('WPA');
    await typeInto(page, '#wifiSsid', 'MyNetwork');
    await typeInto(page, '#wifiPassword', 'hunter2');
  });

  expect(wifi).toContain('T:WPA');
  expect(wifi).toContain('S:MyNetwork');
  expect(wifi).toContain('P:hunter2');
});

test('Wi-Fi special characters are escaped', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const wifi = await encoded(page, 'wifi', async () => {
    await page.locator('#wifiSecurity').selectOption('WPA');
    await typeInto(page, '#wifiSsid', 'Cafe;Wifi');
    await typeInto(page, '#wifiPassword', 'a:b\\c');
  });

  expect(wifi).toContain('\\;');
  expect(wifi).toContain('\\:');
});

test('an open network omits the password field', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const wifi = await encoded(page, 'wifi', async () => {
    await page.locator('#wifiSecurity').selectOption('nopass');
    await typeInto(page, '#wifiSsid', 'GuestWifi');
  });

  expect(wifi).toContain('T:nopass');
  expect(wifi).not.toContain('P:');
});

test('a hidden network is flagged', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const wifi = await encoded(page, 'wifi', async () => {
    await page.locator('#wifiSecurity').selectOption('nopass');
    await typeInto(page, '#wifiSsid', 'Hidden');
    await page.locator('#wifiHidden').check({ force: true });
  });

  expect(wifi).toContain('H:true');
});

test('a contact is encoded as a vCard', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const vcard = await encoded(page, 'contact', async () => {
    await typeInto(page, '#contactFirstName', 'Ada');
    await typeInto(page, '#contactLastName', 'Lovelace');
    await typeInto(page, '#contactEmail', 'ada@example.com');
  });

  expect(vcard).toContain('BEGIN:VCARD');
  expect(vcard).toContain('END:VCARD');
  expect(vcard).toContain('Lovelace');
  expect(vcard).toContain('ada@example.com');
});

test('a UPI payment encodes into a upi:// link', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const upi = await encoded(page, 'upi', async () => {
    await typeInto(page, '#upiId', 'ada@bank');
    await typeInto(page, '#upiName', 'Ada');
    await typeInto(page, '#upiAmount', '250.5');
  });

  expect(upi).toMatch(/^upi:\/\//);
  // The payee address is percent-encoded inside the query string.
  expect(decodeURIComponent(upi)).toContain('ada@bank');
  expect(upi).toContain('am=250.50');
  expect(upi).toContain('pn=Ada');
});

test('country flags render from bundled data with no network requests', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1') && !request.url().startsWith('http://localhost')) {
      external.push(request.url());
    }
  });

  await openTool(page, 'qr-generator');
  await page.locator('[data-content-type="phone"]').click();
  await typeInto(page, '#phoneCode', '91');

  await expect(page.locator('#phoneFlag')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  expect(external).toEqual([]);
});

test('the preview and actions enable once there is content', async ({ page }) => {
  await openTool(page, 'qr-generator');

  await expect(page.locator('#qr-empty')).toBeVisible();

  await page.locator('[data-content-type="text"]').click();
  await typeInto(page, '#textMessage', 'hello');

  await expect(page.locator('#downloadBtn')).toBeEnabled();
  await expect(page.locator('#copyBtn')).toBeEnabled();
});

test('colour settings normalise hex input', async ({ page }) => {
  await openTool(page, 'qr-generator');

  const normalised = await page.evaluate(() => ({
    short: normalizeHex('#abc'),
    noHash: normalizeHex('ff0000'),
    invalid: normalizeHex('nope'),
  }));

  expect(normalised.short.toLowerCase()).toBe('#aabbcc');
  expect(normalised.noHash.toLowerCase()).toBe('#ff0000');
  expect(normalised.invalid).toBeFalsy();
});

test('the design and tips modals open and close', async ({ page }) => {
  await openTool(page, 'qr-generator');

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#designModal')).toBeVisible();
  await page.locator('#designModalClose').click();
  await expect(page.locator('#designModal')).toBeHidden();

  await page.locator('#infoBtn').click();
  await expect(page.locator('#tipsModal')).toBeVisible();
  await page.locator('#tipsModalClose').click();
  await expect(page.locator('#tipsModal')).toBeHidden();
});
