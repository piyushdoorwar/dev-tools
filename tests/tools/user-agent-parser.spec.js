import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const field = (page, key) => page.locator(`#details dd[data-key="${key}"]`);
const hint = (page, key) => page.locator(`#hints dd[data-key="${key}"]`);
const status = (page) => page.locator('#status .status-msg');
const notes = (page) => page.locator('#notes');

async function parse(page, ua) {
  await typeInto(page, '#ua-input', ua);
}

// Asserts every listed field; keys match the data-key on each <dd>.
async function expectParsed(page, ua, expected) {
  await parse(page, ua);
  for (const [key, value] of Object.entries(expected)) {
    await expect(field(page, key), `${key} for ${ua}`).toHaveText(value);
  }
}

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79',
  edgeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.2792.84',
  edgeIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15',
  edgeLegacy: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
  operaPresto: 'Opera/9.80 (Windows NT 6.1; U; en) Presto/2.12.388 Version/12.16',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariMojave: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  safariIPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  safari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeIPad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  firefoxIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/129.0 Mobile/15E148 Safari/605.1.15',
  wkwebview: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chromeAndroidReduced: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 11; Pixel 5 Build/RQ3A.210805.001.A1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/92.0.4515.159 Mobile Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 342.0.0.33.103 (iPhone15,3; iOS 17_5; en_US; en; scale=3.00; 1290x2796; 627400398)',
  facebook: 'Mozilla/5.0 (Linux; Android 14; SM-G991B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.70 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.54.108;]',
  facebookIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.108;FBBV/123;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]',
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.12.0',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko',
  ieCompat: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E)',
  ie6: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
  ubuntu: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  chromeOS: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  linuxArm: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  tizenTV: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36',
  webOSTV: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager',
  ps5: 'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15',
  xbox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79',
  galaxyWatch: 'Mozilla/5.0 (Linux; Tizen 5.5; SAMSUNG SM-R890) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.0 Chrome/69.0.3497.106 Mobile Safari/537.36 Watch',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  claudebot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  headless: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36',
};

test('seeds with the visitor\'s own UA and "Use my browser" restores it, with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'user-agent-parser');
  const own = await page.evaluate(() => navigator.userAgent);
  await expect(page.locator('#ua-input')).toHaveValue(own);
  await expect(field(page, 'browser')).not.toHaveText('Unknown');
  await expect(page.locator('#tokens .tok').first()).toBeVisible();

  await page.locator('[data-action="clear"]').click();
  await expect(page.locator('#ua-input')).toHaveValue('');
  await expect(status(page)).toContainText('Paste a User-Agent string');
  await expect(page.locator('#details dd')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use my browser' }).click();
  await expect(page.locator('#ua-input')).toHaveValue(own);
  expect(errors).toEqual([]);
});

test('Chrome on Windows: Blink, x86_64, Windows 10/11 ambiguity, frozen minor version and the Brave caveat', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.chromeWin, {
    browser: 'Chrome 129.0.0.0',
    engine: 'Blink 129.0.0.0',
    os: 'Windows 10/11',
    device: 'Desktop',
    cpu: 'x86_64',
    bot: 'No',
  });
  await expect(status(page)).toHaveText('Chrome 129 on Windows 10/11 · desktop');
  await expect(notes(page)).toContainText('cannot tell Windows 10 from 11');
  await expect(notes(page)).toContainText('platformVersion 13 or higher means Windows 11');
  await expect(notes(page)).toContainText('fixes the minor, build and patch numbers at 0.0.0');
  // Brave sends Chrome's UA verbatim, so the tool must say it can't tell.
  await expect(notes(page)).toContainText('Brave');
  await expect(notes(page)).toContainText('could be any of them');

  await expectParsed(page, UA.ie6, { os: 'Windows XP', browser: 'Internet Explorer 6.0', engine: 'Trident' });
  await expectParsed(page, UA.operaPresto, { os: 'Windows 7' });
});

test('Edge in all its spellings: Edg/, EdgA/, EdgiOS/ and legacy Edge/', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.edgeWin, { browser: 'Microsoft Edge 129.0.2792.79', engine: 'Blink 129.0.0.0', os: 'Windows 10/11' });
  // Edge isn't Chrome, so no Brave caveat.
  await expect(notes(page)).not.toContainText('Brave');

  await expectParsed(page, UA.edgeAndroid, { browser: 'Microsoft Edge 129.0.2792.84', engine: 'Blink 129.0.0.0', os: 'Android 10', device: 'Mobile' });

  await expectParsed(page, UA.edgeIOS, { browser: 'Microsoft Edge for iOS 129.0.2792.84', engine: 'WebKit 605.1.15', os: 'iOS 17.6', device: 'Mobile' });
  await expect(notes(page)).toContainText("runs on Apple's WebKit, not Blink");

  await expectParsed(page, UA.edgeLegacy, { browser: 'Microsoft Edge (Legacy) 18.19582', engine: 'EdgeHTML 18.19582' });
  await expect(notes(page)).toContainText('EdgeHTML-based Edge');
});

test('Opera (OPR/ and Presto) and Samsung Internet beat the Chrome token they carry', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.opera, { browser: 'Opera 114.0.0.0', engine: 'Blink 129.0.0.0' });
  await expectParsed(page, UA.operaPresto, { browser: 'Opera 12.16', engine: 'Presto 2.12.388' });

  await expectParsed(page, UA.samsung, {
    browser: 'Samsung Internet 26.0',
    engine: 'Blink 122.0.0.0',
    os: 'Android 14',
    device: 'Mobile',
    vendor: 'Samsung',
    model: 'SM-S928B',
  });
});

test('Safari: the version comes from Version/, not Safari/, and frozen macOS/iOS values are called out', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.safariMac, {
    browser: 'Safari 18.0',
    engine: 'WebKit 605.1.15',
    os: 'macOS 10.15.7 (frozen)',
    device: 'Desktop',
    vendor: 'Apple',
    model: 'Mac',
    cpu: 'Not stated',
  });
  await expect(notes(page)).toContainText('Version/ token');
  await expect(notes(page)).toContainText('frozen value');
  await expect(notes(page)).toContainText('could also be an iPad');
  // "Intel Mac OS X" is sent on Apple Silicon too, so no CPU is claimed.
  await expect(notes(page)).toContainText('even on Apple Silicon');

  // A pre-freeze macOS gets its real name.
  await expectParsed(page, UA.safariMojave, { os: 'macOS 10.14.6 Mojave', browser: 'Safari 14.1.2' });

  // Firefox freezes at 10.15 (dots, no patch).
  await expectParsed(page, UA.firefoxMac, { browser: 'Firefox 131.0', engine: 'Gecko 131.0', os: 'macOS 10.15 (frozen)' });

  await expectParsed(page, UA.safariIPhone, {
    browser: 'Mobile Safari 17.6',
    engine: 'WebKit 605.1.15',
    os: 'iOS 17.6.1',
    device: 'Mobile',
    vendor: 'Apple',
    model: 'iPhone',
  });

  await expectParsed(page, UA.safari26, { browser: 'Mobile Safari 26.0', os: 'iOS 18.6' });
  await expect(notes(page)).toContainText('freezes the iOS version in its UA at 18.6');
});

test('iOS browsers are all WebKit: Chrome (CriOS), Firefox (FxiOS), iPadOS and bare WKWebView', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.chromeIPad, {
    browser: 'Chrome for iOS 129.0.6668.69',
    engine: 'WebKit 605.1.15',
    os: 'iPadOS 17.6',
    device: 'Tablet',
    vendor: 'Apple',
    model: 'iPad',
  });
  await expect(notes(page)).toContainText("runs on Apple's WebKit, not Blink");
  await expect(notes(page)).not.toContainText('Brave');

  await expectParsed(page, UA.firefoxIOS, { browser: 'Firefox for iOS 129.0', engine: 'WebKit 605.1.15', os: 'iOS 17.6' });
  await expect(notes(page)).toContainText("runs on Apple's WebKit, not Gecko");

  // An app's WKWebView drops Version/ and Safari/.
  await expectParsed(page, UA.wkwebview, { browser: 'iOS WebView (WKWebView)', engine: 'WebKit 605.1.15' });
});

test('Android: reduced "Android 10; K", Build/ models, tablets without "Mobile", Firefox and WebView', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.chromeAndroidReduced, { browser: 'Chrome 129.0.0.0', os: 'Android 10', device: 'Mobile', vendor: 'Not stated', model: 'Not stated' });
  await expect(notes(page)).toContainText('"Android 10; K" is Chrome\'s reduced UA');

  // Chrome omits "Mobile" on Android tablets.
  await expectParsed(page, UA.chromeAndroidTablet, { device: 'Tablet', vendor: 'Samsung', model: 'SM-X710', os: 'Android 13' });

  await expectParsed(page, UA.firefoxAndroid, { browser: 'Firefox 131.0', engine: 'Gecko 131.0', os: 'Android 14', device: 'Mobile' });

  await expectParsed(page, UA.androidWebView, {
    browser: 'Android WebView 92.0.4515.159',
    engine: 'Blink 92.0.4515.159',
    os: 'Android 11',
    vendor: 'Google',
    model: 'Pixel 5',
  });
});

test('in-app browsers: Instagram, Facebook (FBAN/FBAV) and LINE', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.instagram, {
    browser: 'Instagram in-app browser 342.0.0.33.103',
    engine: 'WebKit 605.1.15',
    os: 'iOS 17.5',
    // Instagram leaks the hardware identifier Safari never sends.
    model: 'iPhone15,3',
  });
  await expect(page.locator('#verdict')).toContainText('in-app / WebView');
  await expect(notes(page)).toContainText("embedded WebView");

  await expectParsed(page, UA.facebook, {
    browser: 'Facebook in-app browser 483.0.0.54.108',
    engine: 'Blink 129.0.6668.70',
    vendor: 'Samsung',
    model: 'SM-G991B',
  });
  await expectParsed(page, UA.facebookIOS, { browser: 'Facebook in-app browser 480.0.0.40.108', os: 'iOS 17.6' });
  await expectParsed(page, UA.line, { browser: 'LINE in-app browser 14.12.0', os: 'iOS 17.6' });
});

test('legacy Internet Explorer: MSIE, Trident rv:11 and Compatibility View', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.ie11, { browser: 'Internet Explorer 11.0', engine: 'Trident 7.0', os: 'Windows 7', cpu: 'x86_64' });
  await expect(notes(page)).toContainText('IE 11 dropped the MSIE token');
  await expect(notes(page)).toContainText('WOW64 means a 32-bit browser');

  // MSIE 7 + Trident/7 is IE 11 pretending to be IE 7.
  await expectParsed(page, UA.ieCompat, { browser: 'Internet Explorer 11.0', os: 'Windows 10/11' });
  await expect(notes(page)).toContainText('Internet Explorer 11 in Compatibility View');

  await expectParsed(page, UA.ie6, { browser: 'Internet Explorer 6.0' });
});

test('Linux distros, ChromeOS and CPU architectures', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.ubuntu, { os: 'Linux · Ubuntu', cpu: 'x86_64', device: 'Desktop', browser: 'Firefox 131.0' });
  await expectParsed(page, UA.chromeOS, { os: 'ChromeOS 14541.0.0', cpu: 'x86_64', device: 'Desktop' });
  await expect(notes(page)).toContainText('ChromeOS platform build');
  await expectParsed(page, UA.linuxArm, { os: 'Linux', cpu: 'arm64' });
});

test('device types: smart TV, console and wearable', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await expectParsed(page, UA.tizenTV, { device: 'Smart TV', vendor: 'Samsung', os: 'Tizen 6.0' });
  await expectParsed(page, UA.webOSTV, { device: 'Smart TV', vendor: 'LG', os: 'webOS' });
  await expectParsed(page, UA.ps5, { device: 'Console', vendor: 'Sony', model: 'PlayStation 5', os: 'PlayStation 5 2.26', browser: 'PlayStation 5 browser 13.0' });
  await expectParsed(page, UA.xbox, { device: 'Console', vendor: 'Microsoft', model: 'Xbox Series X', os: 'Xbox OS', browser: 'Microsoft Edge 129.0.2792.79' });
  await expectParsed(page, UA.galaxyWatch, { device: 'Wearable' });
});

test('flags crawlers, AI bots, HTTP clients and headless browsers', async ({ page }) => {
  await openTool(page, 'user-agent-parser');

  // Googlebot smartphone wraps a real Chrome UA; it must still read as a bot.
  await expectParsed(page, UA.googlebot, { bot: 'Yes — Googlebot 2.1', device: 'Bot', vendor: 'Google', model: 'Nexus 5X', browser: 'Chrome 129.0.6668.70' });
  await expect(status(page)).toHaveText('Bot detected: Googlebot (search crawler)');
  await expect(page.locator('#status')).toHaveClass(/is-warning/);
  await expect(page.locator('#verdict')).toContainText('search crawler');
  await expect(notes(page)).toContainText('reverse DNS');
  await expect(page.locator('#tokens .tok-bot')).toContainText('Googlebot/2.1');

  const cases = [
    [UA.bingbot, 'Bingbot 2.0', 'search crawler'],
    [UA.gptbot, 'GPTBot 1.2', 'AI crawler'],
    [UA.claudebot, 'ClaudeBot 1.0', 'AI crawler'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)', 'ChatGPT-User 1.0', 'AI assistant fetcher'],
    ['Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'PerplexityBot 1.0', 'AI search crawler'],
    ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'facebookexternalhit 1.1', 'link preview'],
    ['curl/8.7.1', 'curl 8.7.1', 'HTTP client'],
    ['Wget/1.21.4', 'Wget 1.21.4', 'HTTP client'],
    ['python-requests/2.32.3', 'python-requests 2.32.3', 'HTTP client'],
    ['Go-http-client/2.0', 'Go-http-client 2.0', 'HTTP client'],
    ['okhttp/4.12.0', 'OkHttp 4.12.0', 'HTTP client'],
    ['PostmanRuntime/7.39.0', 'Postman 7.39.0', 'HTTP client'],
    [UA.headless, 'Headless Chrome 129.0.0.0', 'headless browser'],
    // Unknown crawlers are caught by the generic pattern.
    ['Mozilla/5.0 (compatible; SomeNewCrawler/3.1; +https://example.com)', 'SomeNewCrawler 3.1', 'crawler'],
  ];
  for (const [ua, name, category] of cases) {
    await parse(page, ua);
    await expect(field(page, 'bot'), ua).toHaveText(`Yes — ${name}`);
    await expect(field(page, 'device'), ua).toHaveText('Bot');
    await expect(status(page), ua).toContainText(`(${category})`);
  }

  // curl has no browser tokens: the client itself stands in as the browser.
  await expectParsed(page, 'curl/8.7.1', { browser: 'curl 8.7.1', engine: 'Unknown', os: 'Unknown' });
  await expectParsed(page, UA.headless, { browser: 'Headless Chrome 129.0.0.0', engine: 'Blink 129.0.0.0', os: 'Linux' });

  // A phone brand containing "bot" is not a bot.
  await expectParsed(page, 'Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', { bot: 'No', device: 'Mobile', model: 'CUBOT X50' });
});

test('segments the UA into highlighted tokens that reproduce the input exactly', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await parse(page, UA.edgeWin);
  await expect(page.locator('#tokens')).toHaveText(UA.edgeWin);
  await expect(page.locator('#tokens .tok-browser')).toHaveText('Edg/129.0.2792.79');
  await expect(page.locator('#tokens .tok-engine')).toHaveText('AppleWebKit/537.36');
  await expect(page.locator('#tokens .tok-platform')).toHaveText('(Windows NT 10.0; Win64; x64)');
  await expect(page.locator('#tokens .tok-compat', { hasText: 'Mozilla/5.0' })).toHaveCount(1);
  // On Edge, Chrome/ and Safari/ are only compatibility claims.
  await expect(page.locator('#tokens .tok-compat', { hasText: 'Chrome/129.0.0.0' })).toHaveCount(1);
  await expect(page.locator('#tokens .tok-compat', { hasText: 'Safari/537.36' })).toHaveCount(1);
  await expect(page.locator('#tokens .tok-browser')).toHaveAttribute('title', 'Browser');

  // Safari: Version/ is the browser token; Safari/ is compatibility.
  await parse(page, UA.safariMac);
  await expect(page.locator('#tokens .tok-browser')).toHaveText('Version/18.0');

  // Instagram's space-separated version belongs to it.
  await parse(page, UA.instagram);
  await expect(page.locator('#tokens .tok-browser')).toHaveText(['Instagram', '342.0.0.33.103']);

  // Nested comments (Opera Mini) stay one token and nothing is lost.
  const mini = 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54';
  await parse(page, mini);
  await expect(page.locator('#tokens')).toHaveText(mini);
  await expect(field(page, 'browser')).toHaveText('Opera Mini 9.80');
});

test('copies the parsed result as JSON and single values on click', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await parse(page, UA.samsung);
  await page.getByRole('button', { name: 'Copy JSON' }).click();
  const json = JSON.parse(await lastCopied(page));
  expect(json).toMatchObject({
    ua: UA.samsung,
    browser: { name: 'Samsung Internet', version: '26.0', major: 26 },
    engine: { name: 'Blink', version: '122.0.0.0' },
    os: { name: 'Android', version: '14' },
    device: { type: 'mobile', vendor: 'Samsung', model: 'SM-S928B' },
    cpu: { architecture: null },
    bot: { isBot: false },
  });
  expect(Array.isArray(json.notes)).toBe(true);
  expect(json).not.toHaveProperty('_tokens');

  await parse(page, UA.googlebot);
  await page.getByRole('button', { name: 'Copy JSON' }).click();
  expect(JSON.parse(await lastCopied(page)).bot).toEqual({ isBot: true, name: 'Googlebot', version: '2.1', category: 'search crawler' });

  await field(page, 'model').locator('.copy-value').click();
  expect(await lastCopied(page)).toBe('Nexus 5X');

  await page.locator('[data-action="copy-ua"]').click();
  expect(await lastCopied(page)).toBe(UA.googlebot);

  await page.locator('[data-action="clear"]').click();
  await page.getByRole('button', { name: 'Copy JSON' }).click();
  await expect(page.locator('#toast-container')).toContainText('Nothing to copy');
});

test('sample chips load and mark themselves; paste reads the clipboard', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  const chips = page.locator('#samples .sample-chip');
  expect(await chips.count()).toBeGreaterThanOrEqual(10);
  for (const label of ['Chrome · Windows', 'Safari · iPhone', 'Samsung · Android', 'Googlebot', 'curl']) {
    await expect(chips.filter({ hasText: label })).toHaveCount(1);
  }

  await chips.filter({ hasText: 'Safari · iPhone' }).click();
  await expect(field(page, 'browser')).toHaveText('Mobile Safari 17.6');
  await expect(chips.filter({ hasText: 'Safari · iPhone' })).toHaveClass(/is-active/);
  await expect(chips.filter({ hasText: 'Safari · iPhone' })).toHaveAttribute('aria-pressed', 'true');

  await chips.filter({ hasText: 'curl' }).click();
  await expect(field(page, 'bot')).toHaveText('Yes — curl 8.7.1');
  await expect(chips.filter({ hasText: 'Safari · iPhone' })).not.toHaveClass(/is-active/);

  // Every sample parses to something.
  const total = await chips.count();
  for (let i = 0; i < total; i++) {
    await chips.nth(i).click();
    await expect(field(page, 'browser')).not.toHaveText('Unknown');
  }

  await setClipboardText(page, `  ${UA.firefoxAndroid}\n`);
  await page.locator('[data-action="paste"]').click();
  await expect(page.locator('#ua-input')).toHaveValue(UA.firefoxAndroid);
  await expect(field(page, 'browser')).toHaveText('Firefox 131.0');

  await parse(page, 'hello world');
  await expect(status(page)).toHaveText('No known browser, engine or platform tokens found');
});

test('shows Client Hints for this browser, marking GREASE and inferring Windows 11', async ({ page }) => {
  await page.addInitScript(() => {
    const data = {
      brands: [
        { brand: 'Chromium', version: '129' },
        { brand: 'Not=A?Brand', version: '8' },
        { brand: 'Brave', version: '129' },
      ],
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        bitness: '64',
        model: '',
        fullVersionList: [
          { brand: 'Chromium', version: '129.0.6668.90' },
          { brand: 'Not=A?Brand', version: '8.0.0.0' },
          { brand: 'Brave', version: '129.1.70.123' },
        ],
        wow64: false,
        formFactors: ['Desktop'],
      }),
    };
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => data });
  });
  const { errors } = await openTool(page, 'user-agent-parser');

  await expect(page.locator('.hints-panel .badge')).toHaveText('This browser only');
  await expect(hint(page, 'brands')).toHaveText('Chromium 129, Not=A?Brand 8 (GREASE), Brave 129');
  await expect(hint(page, 'mobile')).toHaveText('false');
  await expect(hint(page, 'platform')).toHaveText('Windows');
  await expect(hint(page, 'platformVersion')).toHaveText('15.0.0 → Windows 11');
  await expect(hint(page, 'architecture')).toHaveText('x86, 64-bit');
  await expect(hint(page, 'model')).toContainText('(empty');
  await expect(hint(page, 'fullVersionList')).toHaveText('Chromium 129.0.6668.90, Not=A?Brand 8.0.0.0 (GREASE), Brave 129.1.70.123');
  await expect(hint(page, 'formFactors')).toHaveText('Desktop');

  // The hints describe this browser, not whatever string is pasted.
  await parse(page, UA.safariIPhone);
  await expect(hint(page, 'platform')).toHaveText('Windows');
  expect(errors).toEqual([]);
});

test('maps Windows 10 platform versions and survives a refused high-entropy request', async ({ page }) => {
  await page.addInitScript(() => {
    const data = {
      brands: [{ brand: 'Google Chrome', version: '129' }],
      mobile: true,
      platform: 'Android',
      getHighEntropyValues: () => Promise.reject(new DOMException('Blocked by permissions policy', 'NotAllowedError')),
    };
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => data });
  });
  const { errors } = await openTool(page, 'user-agent-parser');
  await expect(hint(page, 'mobile')).toHaveText('true');
  await expect(hint(page, 'high-error')).toContainText('Refused: Blocked by permissions policy');
  expect(await page.evaluate(() => [windowsFromPlatformVersion('10.0.0'), windowsFromPlatformVersion('0.3.0'), windowsFromPlatformVersion('13.0.0')]))
    .toEqual(['Windows 10', 'Windows 7, 8 or 8.1', 'Windows 11']);
  expect(errors).toEqual([]);
});

test('explains the absence of Client Hints in Firefox and Safari', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => undefined });
  });
  const { errors } = await openTool(page, 'user-agent-parser');
  await expect(page.locator('#hints-note')).toContainText("Firefox and Safari don't implement User-Agent Client Hints");
  await expect(page.locator('#hints-note')).toHaveClass(/is-absent/);
  await expect(page.locator('#hints dd')).toHaveCount(0);
  // The UA side still works.
  await expect(field(page, 'browser')).not.toHaveText('Unknown');
  expect(errors).toEqual([]);
});

test('help explains UA reduction, frozen versions and Client Hints', async ({ page }) => {
  await openTool(page, 'user-agent-parser');
  await page.locator('#helpBtn').click();
  const modal = page.locator('#helpModal');
  await expect(modal).toHaveClass(/is-open/);
  await expect(modal).toContainText('UA reduction and frozen values');
  await expect(modal).toContainText('10_15_7');
  await expect(modal).toContainText('Why Client Hints are more reliable');
  await expect(modal).toContainText('getHighEntropyValues()');
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/is-open/);
});
