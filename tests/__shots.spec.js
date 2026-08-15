import { test } from '@playwright/test';
const OUT = '/tmp/claude-1000/-home-piyush-Documents-repos-dev-tools/b5ab9b66-a0b4-448d-a19d-48fbcc686dc9/scratchpad/shots';

const MODALS = {
  'base-converter': ['#schemaHelpBtn', '#schemaHelpModal'],
  'crypto-generator': ['#securityInfoBtn', '#securityInfoModal'],
  'fake-data-generator': ['#schemaHelpBtn', '#schemaHelpModal'],
  'file-compressor': ['#infoBtn', '#infoModal'],
  'image-converter': ['#infoBtn', '#infoModal'],
  'json-diff': ['#diffLegendBtn', '#diffLegendModal'],
  'json-toon-converter': ['[data-action="open-settings"]', '.settings-modal'],
  'jwt-debugger': ['.eye-btn', '#datetimeModal'],
  'markdown-editor': ['[data-action="table"]', '#tableModal'],
  'qr-generator': ['#settingsBtn', '#designModal'],
  'regex-tester': ['#openCheatSheetBtn', '#cheatSheetModal'],
  'sql-formatter': ['[data-tooltip="Settings"]', '#settingsModal'],
  'text-diff': ['#diffLegendBtn', '#diffLegendModal'],
};

test('shoot modals', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [tool, [opener, modal]] of Object.entries(MODALS)) {
    await page.goto(`/tools/${tool}/`);
    await page.waitForLoadState('load');
    try { await page.locator(opener).first().click({ timeout: 4000 }); } catch {}
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.activeElement?.blur(); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${tool}.png` });
  }
});
