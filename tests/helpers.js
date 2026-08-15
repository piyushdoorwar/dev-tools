/**
 * Shared helpers for the per-tool feature suites in tests/tools/.
 *
 * The regression suite (tests/regression.spec.js) pins specific past bugs.
 * These helpers back the feature suites, which walk each tool's advertised
 * capabilities so a removed or broken feature fails loudly.
 */

/**
 * Every tool page must be opened through this so analytics and the service
 * worker stay out of the way, clipboard writes are observable, and any page
 * error fails the test instead of silently passing.
 *
 * Returns a handle whose `errors` array collects console errors and uncaught
 * exceptions seen since navigation.
 */
export async function openTool(page, tool) {
  const errors = [];

  await page.addInitScript(() => {
    window.__DEV_TOOLS_DISABLE_ANALYTICS__ = true;
    window.__DEV_TOOLS_DISABLE_SERVICE_WORKER__ = true;

    // Record clipboard writes rather than depending on a real system clipboard,
    // which is unavailable in headless runs.
    window.__copied = [];
    window.__clipboardText = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copied.push(String(text));
          return Promise.resolve();
        },
        readText: () => Promise.resolve(window.__clipboardText),
      },
    });

    // Several tools fall back to execCommand('copy'); make that observable too.
    document.addEventListener('DOMContentLoaded', () => {
      const original = document.execCommand?.bind(document);
      document.execCommand = (command, ...rest) => {
        if (command === 'copy') {
          const active = document.activeElement;
          const value = active && 'value' in active ? active.value : String(document.getSelection() || '');
          window.__copied.push(String(value));
          return true;
        }
        return original ? original(command, ...rest) : false;
      };
    });
  });

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/tools/${tool}/`);
  await page.waitForLoadState('load');

  return { errors };
}

/** Text the page most recently asked to put on the clipboard. */
export function lastCopied(page) {
  return page.evaluate(() => window.__copied.at(-1) ?? null);
}

/** Seed what a "paste" action will read back. */
export function setClipboardText(page, text) {
  return page.evaluate((value) => { window.__clipboardText = value; }, text);
}

/**
 * Fill a plain <textarea>/<input> editor and fire the `input` event the tools
 * listen on. `fill()` alone dispatches input, but several editors also need a
 * settle tick for their debounced re-render.
 */
export async function typeInto(page, selector, value) {
  const field = page.locator(selector);
  await field.fill(value);
  await field.dispatchEvent('input');
}

/** Click something and return the download it produced. */
export async function captureDownload(page, action) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  return download;
}

/** Read a download's body as a string. */
export async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Ignore console noise that is expected for a tool (e.g. a deliberate
 * invalid-input probe) while still failing on anything else.
 */
export function unexpectedErrors(errors, allowed = []) {
  return errors.filter((message) => !allowed.some((pattern) => pattern.test(message)));
}
