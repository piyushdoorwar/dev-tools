import { expect, test } from '@playwright/test';
import { lastCopied, openTool, typeInto } from '../helpers.js';

const detail = (page, term) => page.locator('#details dt', { hasText: new RegExp(`^${term}$`) }).locator('xpath=following-sibling::dd[1]');
const status = (page) => page.locator('#status .status-msg');

async function enter(page, value) {
  await typeInto(page, '#cidr-input', value);
}

test('breaks an IPv4 block into network, broadcast, masks and usable hosts with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'subnet-calculator');

  await enter(page, '192.168.10.77/26');
  await expect(detail(page, 'Network')).toHaveText('192.168.10.64/26');
  await expect(detail(page, 'Netmask')).toHaveText('255.255.255.192');
  await expect(detail(page, 'Wildcard')).toHaveText('0.0.0.63');
  await expect(detail(page, 'Broadcast')).toHaveText('192.168.10.127');
  await expect(detail(page, 'Usable range')).toHaveText('192.168.10.65 – 192.168.10.126');
  await expect(detail(page, 'Usable hosts')).toHaveText('62');
  await expect(detail(page, 'Type')).toHaveText('Private (RFC 1918)');
  await expect(detail(page, 'Integer')).toHaveText('3232238157');
  await expect(detail(page, 'Reverse zone')).toHaveText('10.168.192.in-addr.arpa');
  await expect(detail(page, 'Next block')).toHaveText('192.168.10.128/26');
  // Host bits were set, so the status says which network it belongs to.
  await expect(status(page)).toContainText('host bits set — the network is 192.168.10.64/26');
  await expect(page.locator('#bits .bit.is-net')).toHaveCount(26);
  await expect(page.locator('#bits .bit.is-host')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('accepts dotted netmasks and refuses ambiguous or invalid input', async ({ page }) => {
  await openTool(page, 'subnet-calculator');

  await enter(page, '10.1.2.3 255.255.0.0');
  await expect(detail(page, 'Network')).toHaveText('10.1.0.0/16');
  await enter(page, '10.1.2.3/255.255.240.0');
  await expect(detail(page, 'Network')).toHaveText('10.1.0.0/20');

  await enter(page, '10.1.2.3/255.0.255.0');
  await expect(status(page)).toHaveText('255.0.255.0 is not a contiguous netmask');
  await expect(page.locator('#cidr-input')).toHaveClass(/is-invalid/);

  await enter(page, '010.0.0.1/8');
  await expect(status(page)).toContainText('leading zero');
  await enter(page, '8.8.8.8/33');
  await expect(status(page)).toContainText('/33 is too long');

  // A bare address is read as a single host and says so.
  await enter(page, '8.8.8.8');
  await expect(detail(page, 'Network')).toHaveText('8.8.8.8/32');
  await expect(status(page)).toContainText('no prefix given');
  await expect(detail(page, 'Type')).toHaveText('Public, globally routable');
});

test('handles the /31 and /32 edge cases', async ({ page }) => {
  await openTool(page, 'subnet-calculator');

  await enter(page, '10.0.0.0/31');
  await expect(detail(page, 'Usable hosts')).toHaveText('2');
  await expect(detail(page, 'Usable range')).toHaveText('10.0.0.0 – 10.0.0.1');
  await expect(detail(page, 'Broadcast')).toHaveText('None');
  await expect(page.locator('#details')).toContainText('RFC 3021');

  await enter(page, '10.0.0.7/32');
  await expect(detail(page, 'Usable hosts')).toHaveText('1');
  await expect(page.locator('#split-summary')).toHaveText('A single address cannot be split.');
});

test('calculates IPv6 blocks with canonical formatting and nibble reverse zones', async ({ page }) => {
  await openTool(page, 'subnet-calculator');

  await enter(page, '2001:DB8:0:0:1::1/48');
  await expect(detail(page, 'Network')).toHaveText('2001:db8::/48');
  await expect(detail(page, 'Expanded')).toHaveText('2001:0db8:0000:0000:0001:0000:0000:0001');
  await expect(detail(page, 'Last address')).toHaveText('2001:db8:0:ffff:ffff:ffff:ffff:ffff');
  await expect(detail(page, 'Type')).toHaveText('Documentation (RFC 3849)');
  await expect(detail(page, '/64 subnets')).toHaveText('65,536');
  await expect(detail(page, 'Reverse zone')).toHaveText('0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
  await expect(status(page)).toContainText('IPv6');

  // RFC 5952: IPv4-mapped addresses keep the dotted quad.
  await enter(page, '::ffff:c000:0201');
  await expect(detail(page, 'Address')).toHaveText('::ffff:192.0.2.1');
  await expect(detail(page, 'Type')).toHaveText('IPv4-mapped (RFC 4291)');

  // Huge counts switch to scientific notation with the power of two.
  await enter(page, 'fd00::/8');
  await expect(detail(page, 'Addresses')).toContainText('(2^120)');
  await expect(detail(page, 'Type')).toHaveText('Unique local address, ULA (RFC 4193)');
});

test('splits a block by prefix or by hosts needed and copies the list', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await enter(page, '10.0.0.0/22');

  // The default split for an IPv4 block bigger than /24 is into /24s.
  await expect(page.locator('#split-prefix')).toHaveValue('24');
  await expect(page.locator('#split-summary')).toHaveText('4 × /24 — 254 usable hosts each');
  await expect(page.locator('#split-body tr')).toHaveCount(4);
  await expect(page.locator('#split-body tr').nth(3).locator('td').nth(1)).toHaveText('10.0.3.0/24');

  await typeInto(page, '#split-prefix', '26');
  await expect(page.locator('#split-body tr')).toHaveCount(16);
  await expect(page.locator('#split-body tr').nth(1).locator('td').nth(2)).toHaveText('10.0.0.65 – 10.0.0.126');

  // 50 hosts need 52 addresses, so /26 (62 usable) is the smallest fit.
  await typeInto(page, '#split-hosts', '50');
  await expect(page.locator('#split-prefix')).toHaveValue('26');
  await typeInto(page, '#split-hosts', '300');
  await expect(page.locator('#split-prefix')).toHaveValue('23');
  await expect(page.locator('#split-summary')).toContainText('2 × /23');

  await page.locator('[data-action="copy-split"]').click();
  expect(await lastCopied(page)).toBe('10.0.0.0/23\n10.0.2.0/23');
});

test('caps rendered subnets but says how many there are', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await enter(page, '10.0.0.0/8');
  await typeInto(page, '#split-prefix', '24');
  await expect(page.locator('#split-body tr')).toHaveCount(256);
  await expect(page.locator('#split-note')).toHaveText('Showing the first 256 of 65,536 subnets.');
});

test('checks whether an address or block falls inside the block', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await enter(page, '192.168.10.64/26');
  await page.click('[data-view="contains"]');
  await expect(page.locator('[data-pane="contains"]')).toBeVisible();
  await expect(page.locator('[data-pane="split"]')).toBeHidden();

  const result = page.locator('#contains-result');
  await typeInto(page, '#contains-input', '192.168.10.100');
  await expect(result).toHaveText('192.168.10.100 is inside 192.168.10.64/26, address #36 of the block.');
  await expect(result).toHaveClass(/is-success/);

  await typeInto(page, '#contains-input', '192.168.10.127');
  await expect(result).toContainText('broadcast address');
  await expect(result).toHaveClass(/is-warning/);

  await typeInto(page, '#contains-input', '192.168.10.200');
  await expect(result).toHaveText('192.168.10.200 is outside 192.168.10.64/26.');

  await typeInto(page, '#contains-input', '192.168.10.96/28');
  await expect(result).toHaveText('192.168.10.96/28 is a subnet of 192.168.10.64/26.');

  await typeInto(page, '#contains-input', '192.168.10.0/24');
  await expect(result).toContainText('overlaps');

  await typeInto(page, '#contains-input', '2001:db8::1');
  await expect(result).toContainText('That is an IPv6 address');
});

test('turns an address range into the smallest exact set of CIDR blocks', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await page.click('[data-view="range"]');

  await typeInto(page, '#range-start', '10.0.0.5');
  await typeInto(page, '#range-end', '10.0.0.20');
  const chips = page.locator('#range-list .cidr-chip');
  await expect(chips).toHaveText(['10.0.0.5/32', '10.0.0.6/31', '10.0.0.8/29', '10.0.0.16/30', '10.0.0.20/32']);
  await expect(page.locator('#range-result')).toHaveText('5 blocks covering 16 addresses.');

  await typeInto(page, '#range-start', '0.0.0.0');
  await typeInto(page, '#range-end', '255.255.255.255');
  await expect(chips).toHaveText(['0.0.0.0/0']);

  await page.locator('[data-action="copy-range"]').click();
  expect(await lastCopied(page)).toBe('0.0.0.0/0');

  // Clicking a block opens it in the calculator.
  await typeInto(page, '#range-start', '172.16.0.0');
  await typeInto(page, '#range-end', '172.16.3.255');
  await chips.first().click();
  await expect(page.locator('#cidr-input')).toHaveValue('172.16.0.0/22');
  await expect(detail(page, 'Usable hosts')).toHaveText('1,022');
});

test('clicking a detail value copies it', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await enter(page, '172.20.5.9/20');
  await detail(page, 'Netmask').locator('button').click();
  expect(await lastCopied(page)).toBe('255.255.240.0');
  await page.locator('[data-action="copy-cidr"]').click();
  expect(await lastCopied(page)).toBe('172.20.0.0/20');
});

test('the active tool tab is kept in the URL hash', async ({ page }) => {
  await openTool(page, 'subnet-calculator');
  await page.click('[data-view="range"]');
  await expect(page).toHaveURL(/#range$/);
  await page.reload();
  await expect(page.locator('[data-view="range"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pane="range"]')).toBeVisible();
});
