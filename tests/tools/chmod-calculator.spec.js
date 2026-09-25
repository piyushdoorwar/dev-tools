import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

const cell = (page, klass, perm) => page.locator(`[data-perm="${klass}-${perm}"]`);
const commandFor = (page, label) => page.locator('#commands .command', { hasText: label }).locator('.command-text');

test('loads on 644 with every notation agreeing and no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'chmod-calculator');

  await expect(page.locator('#out-octal')).toHaveText('0644');
  await expect(page.locator('#out-symbolic')).toHaveText('rw-r--r--');
  await expect(page.locator('#out-ls')).toHaveText('-rw-r--r--');
  await expect(page.locator('#octal')).toHaveValue('644');
  await expect(page.locator('#symbolic')).toHaveValue('rw-r--r--');
  await expect(page.locator('[data-digit="owner"]')).toHaveText('6');
  await expect(page.locator('[data-digit="group"]')).toHaveText('4');
  await expect(page.locator('[data-digit="other"]')).toHaveText('4');
  expect(errors).toEqual([]);
});

test('toggling a cell updates the octal, the symbolic form and the digits', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await cell(page, 'owner', 'x').check();
  await expect(page.locator('#out-octal')).toHaveText('0744');
  await expect(page.locator('#out-symbolic')).toHaveText('rwxr--r--');
  await expect(page.locator('[data-digit="owner"]')).toHaveText('7');

  await cell(page, 'other', 'r').uncheck();
  await expect(page.locator('#out-octal')).toHaveText('0740');
  await expect(page.locator('[data-digit="other"]')).toHaveText('0');
});

test('typing an octal mode drives the grid, and a bad one is refused', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#octal', '755');
  await expect(page.locator('#out-symbolic')).toHaveText('rwxr-xr-x');
  await expect(cell(page, 'group', 'x')).toBeChecked();
  await expect(cell(page, 'group', 'w')).not.toBeChecked();

  // 8 and 9 are not octal digits; the last good mode must survive.
  await page.fill('#octal', '789');
  await expect(page.locator('#entry-error')).toBeVisible();
  await expect(page.locator('#out-octal')).toHaveText('0755');

  await page.fill('#octal', '640');
  await expect(page.locator('#entry-error')).toBeHidden();
  await expect(page.locator('#out-symbolic')).toHaveText('rw-r-----');
});

test('typing a symbolic mode is accepted, including the ls -l form', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#symbolic', 'rwxr-x---');
  await expect(page.locator('#out-octal')).toHaveText('0750');
  await expect(page.locator('#octal')).toHaveValue('750');

  // The ten-character listing form drops its leading type character.
  await page.fill('#symbolic', 'drwxrwxr-x');
  await expect(page.locator('#out-octal')).toHaveText('0775');

  await page.fill('#symbolic', 'rwxrwx');
  await expect(page.locator('#entry-error')).toBeVisible();
  await expect(page.locator('#out-octal')).toHaveText('0775');
});

test('special bits produce the fourth digit and the s/t letters', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '755');

  await page.locator('[data-special="setuid"]').check();
  await expect(page.locator('#out-octal')).toHaveText('4755');
  await expect(page.locator('#out-symbolic')).toHaveText('rwsr-xr-x');

  // Clearing owner execute leaves the bit set but inert, which is the capital S.
  await cell(page, 'owner', 'x').uncheck();
  await expect(page.locator('#out-octal')).toHaveText('4655');
  await expect(page.locator('#out-symbolic')).toHaveText('rwSr-xr-x');
  await expect(page.locator('.notice-warn')).toContainText('does nothing');

  await page.fill('#octal', '1777');
  await expect(page.locator('#out-symbolic')).toHaveText('rwxrwxrwt');
  await expect(page.locator('[data-special="sticky"]')).toBeChecked();
});

test('the symbolic form round-trips through the parser for every special bit', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  for (const octal of ['4755', '2755', '1777', '4644', '2644', '1666', '7777', '0']) {
    await page.fill('#octal', octal);
    const symbolic = await page.locator('#out-symbolic').textContent();
    await page.fill('#symbolic', symbolic);
    await expect(page.locator('#out-octal')).toHaveText((parseInt(octal, 8) & 0o7777).toString(8).padStart(4, '0'));
  }
});

test('the chmod commands are runnable, and the S case avoids a wrong u=rws', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '755');

  await expect(commandFor(page, 'Numeric')).toHaveText('chmod 755 path/to/file');
  await expect(commandFor(page, 'Symbolic')).toHaveText('chmod u=rwx,g=rx,o=rx path/to/file');

  // `u=rws` would grant execute as a side effect, so an inert setuid bit has
  // to be applied by its own clause.
  await page.fill('#octal', '4655');
  await expect(commandFor(page, 'Symbolic')).toHaveText('chmod u=rw,g=rx,o=rx,u+s path/to/file');

  await page.fill('#octal', '4755');
  await expect(commandFor(page, 'Symbolic')).toHaveText('chmod u=rwxs,g=rx,o=rx path/to/file');

  await page.fill('#octal', '1777');
  await expect(commandFor(page, 'Symbolic')).toHaveText('chmod u=rwx,g=rwx,o=rwxt path/to/file');
});

test('the path and the recursive flag reach both commands, with shell quoting', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '644');

  await page.fill('#target', 'src/app.js');
  await expect(commandFor(page, 'Numeric')).toHaveText('chmod 644 src/app.js');

  // A space would split the command, so the path has to be quoted.
  await page.fill('#target', 'my notes.txt');
  await expect(commandFor(page, 'Numeric')).toHaveText("chmod 644 'my notes.txt'");

  await page.check('#recursive');
  await expect(commandFor(page, 'Numeric')).toHaveText("chmod -R 644 'my notes.txt'");
  await expect(commandFor(page, 'Symbolic')).toContainText('chmod -R u=rw,g=r,o=r');
});

test('execute is explained differently for a file and a directory', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '755');

  await expect(page.locator('#meaning')).toContainText('run it as a program');
  await expect(page.locator('#out-ls')).toHaveText('-rwxr-xr-x');

  await page.click('[data-type="dir"]');
  await expect(page.locator('#meaning')).toContainText('enter it and reach what is inside');
  await expect(page.locator('#meaning')).toContainText('list its contents');
  await expect(page.locator('#out-ls')).toHaveText('drwxr-xr-x');
  await expect(page.locator('#target')).toHaveAttribute('placeholder', 'path/to/dir');
  await expect(commandFor(page, 'Numeric')).toHaveText('chmod 755 path/to/dir');
});

test('a class with nothing granted is stated, not omitted', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '600');

  const items = page.locator('.meaning-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(2)).toContainText('Everyone else gets nothing at all');
  await expect(items.nth(2)).toHaveClass(/is-empty/);
});

test('the dangerous modes raise warnings the octal alone would not', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#octal', '777');
  await expect(page.locator('#notices')).toContainText('777 gives every user');

  await page.fill('#octal', '1777');
  await page.click('[data-type="dir"]');
  // Sticky is what makes 1777 acceptable for /tmp, so it must not be warned about.
  await expect(page.locator('#notices')).not.toContainText('sticky bit lets any user delete');

  await page.fill('#octal', '777');
  await expect(page.locator('#notices')).toContainText('sticky bit lets any user delete');

  await page.click('[data-type="file"]');
  await page.fill('#octal', '4777');
  await expect(page.locator('#notices')).toContainText('privilege escalation');
  await expect(page.locator('#notices')).toContainText('can be replaced by whoever can write it');

  // setgid on a directory is a normal, useful thing — a note, not a warning.
  await page.fill('#octal', '2775');
  await page.click('[data-type="dir"]');
  const setgid = page.locator('.notice', { hasText: 'new files and subdirectories inherit' });
  await expect(setgid).toHaveAttribute('data-level', 'note');
});

test('presets set both the mode and the kind of thing it is for', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.click('[data-preset="700"]');
  await expect(page.locator('#out-octal')).toHaveText('0700');
  await expect(page.locator('#out-ls')).toHaveText('drwx------');
  await expect(page.locator('[data-preset="700"]')).toHaveClass(/is-active/);

  await page.click('[data-preset="4755"]');
  await expect(page.locator('#out-octal')).toHaveText('4755');
  await expect(page.locator('#out-ls')).toHaveText('-rwsr-xr-x');
  await expect(page.locator('[data-preset="700"]')).not.toHaveClass(/is-active/);
});

test('every preset is a valid mode that renders as itself', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  const bad = await page.evaluate(() => globalThis.CHMOD_DATA.presets
    .filter((preset) => !/^[0-7]{3,4}$/.test(preset.octal) || !preset.label || !preset.note)
    .map((preset) => preset.octal));
  expect(bad).toEqual([]);

  for (const octal of await page.evaluate(() => globalThis.CHMOD_DATA.presets.map((p) => p.octal))) {
    await page.click(`[data-preset="${octal}"]`);
    await expect(page.locator('#octal')).toHaveValue(octal);
  }
});

test('umask mode turns a mask into the defaults it produces', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.click('#tab-umask');

  await expect(page.locator('#umask-file-octal')).toHaveText('644');
  await expect(page.locator('#umask-dir-octal')).toHaveText('755');
  await expect(page.locator('#umask-file-symbolic')).toHaveText('rw-r--r--');
  await expect(page.locator('#umask-dir-symbolic')).toHaveText('rwxr-xr-x');

  await page.fill('#umask', '077');
  await expect(page.locator('#umask-file-octal')).toHaveText('600');
  await expect(page.locator('#umask-dir-octal')).toHaveText('700');

  await page.fill('#umask', '002');
  await expect(page.locator('#umask-file-octal')).toHaveText('664');
  await expect(page.locator('#umask-dir-octal')).toHaveText('775');

  // `umask -S` prints what is allowed — the inverse of the number.
  await expect(page.locator('#umask-commands')).toContainText('umask 002');
  await expect(page.locator('#umask-commands')).toContainText('umask -S u=rwx,g=rwx,o=rx');
});

test('the umask presets match the defaults they claim', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.click('#tab-umask');

  for (const [octal, file, dir] of [['022', '644', '755'], ['002', '664', '775'], ['027', '640', '750'], ['077', '600', '700']]) {
    await page.click(`#umask-preset-grid [data-preset="${octal}"]`);
    await expect(page.locator('#umask-file-octal')).toHaveText(file);
    await expect(page.locator('#umask-dir-octal')).toHaveText(dir);
  }
});

test('the hash is a shareable deep link for a mode and for a mask', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#octal', '2775');
  await expect(page).toHaveURL(/#2775$/);
  await expect(page).toHaveTitle('chmod 2775 — Chmod Calculator');

  await page.goto('/tools/chmod-calculator/#600');
  await expect(page.locator('#out-octal')).toHaveText('0600');
  await expect(page.locator('#out-symbolic')).toHaveText('rw-------');

  await page.goto('/tools/chmod-calculator/#umask=027');
  await expect(page.locator('#umask-panel')).toBeVisible();
  await expect(page.locator('#mode-panel')).toBeHidden();
  await expect(page.locator('#umask')).toHaveValue('027');
  await expect(page.locator('#umask-file-octal')).toHaveText('640');
});

test('copies the link and the reset button returns to 644', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#octal', '750');
  await page.click('[data-action="copy-link"]');
  expect(await lastCopied(page)).toMatch(/\/tools\/chmod-calculator\/#750$/);

  await page.click('[data-action="reset"]');
  await expect(page.locator('#out-octal')).toHaveText('0644');
  await expect(page.locator('[data-type="file"]')).toHaveAttribute('aria-pressed', 'true');
});

test('copying a command yields exactly what the row shows', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  await page.fill('#octal', '755');
  await page.fill('#target', 'bin/deploy.sh');

  await page.locator('#commands .command', { hasText: 'Numeric' }).locator('button').click();
  expect(await lastCopied(page)).toBe('chmod 755 bin/deploy.sh');

  await page.locator('#commands .command', { hasText: 'Symbolic' }).locator('button').click();
  expect(await lastCopied(page)).toBe('chmod u=rwx,g=rx,o=rx bin/deploy.sh');
});

test('common-mode cards are compact rows, not squares', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, 'chmod-calculator');

  // main.css's colour-picker `.preset` (aspect-ratio: 1, padding: 0) used to
  // match these cards and blow each one up to a ~210px square.
  const preset = page.locator('#preset-grid [data-preset="644"]');
  const card = await preset.boundingBox();
  expect(card.height).toBeLessThan(card.width / 2);
  expect(card.height).toBeLessThan(110);
  expect(parseFloat(await preset.evaluate((el) => getComputedStyle(el).paddingLeft))).toBeGreaterThan(0);
});

test('editing the mode replaces the hash instead of stacking history entries', async ({ page }) => {
  await openTool(page, 'chmod-calculator');
  const before = await page.evaluate(() => history.length);

  await cell(page, 'owner', 'x').check();
  await page.click('[data-preset="700"]');
  await page.fill('#octal', '750');
  await expect(page).toHaveURL(/#750$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('ls -l output with an SELinux or ACL marker is accepted', async ({ page }) => {
  await openTool(page, 'chmod-calculator');

  await page.fill('#symbolic', '-rwxr-x---.');
  await expect(page.locator('#out-octal')).toHaveText('0750');
  await page.fill('#symbolic', 'drwxrwxr-t+');
  await expect(page.locator('#out-octal')).toHaveText('1775');
  await expect(page.locator('#entry-error')).toBeHidden();
});
