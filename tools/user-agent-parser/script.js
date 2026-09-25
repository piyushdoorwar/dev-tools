// User-Agent Parser — a hand-written UA sniffer plus a live read-out of the
// current browser's User-Agent Client Hints.
//
// A UA string is a pile of compatibility lies: every Chromium browser claims
// to be Chrome and Safari, every WebKit browser claims to be Gecko, and every
// modern browser claims to be Mozilla. So detection is order-sensitive: the
// most specific product token must win before the generic ones it imitates.
// Each rule below is ordered deliberately; moving one changes results.

const uaInput = document.getElementById("ua-input");
const tokensView = document.getElementById("tokens");
const statusBar = document.getElementById("status");
const statusText = statusBar.querySelector(".status-msg");
const details = document.getElementById("details");
const notesList = document.getElementById("notes");
const verdict = document.getElementById("verdict");
const samplesRow = document.getElementById("samples");
const hintsBody = document.getElementById("hints");
const hintsNote = document.getElementById("hints-note");

const SAMPLES = [
  { label: "Chrome · Windows", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" },
  { label: "Edge · Windows", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79" },
  { label: "Firefox · macOS", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0" },
  { label: "Safari · macOS", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" },
  { label: "Safari · iPhone", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1" },
  { label: "Chrome · iPad", ua: "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1" },
  { label: "Samsung · Android", ua: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36" },
  { label: "Chrome · Android", ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" },
  { label: "Firefox · Android", ua: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" },
  { label: "Instagram · iOS", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 342.0.0.33.103 (iPhone15,3; iOS 17_5; en_US; en; scale=3.00; 1290x2796; 627400398)" },
  { label: "IE 11", ua: "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko" },
  { label: "PlayStation 5", ua: "Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15" },
  { label: "Googlebot", ua: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { label: "GPTBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot" },
  { label: "curl", ua: "curl/8.7.1" },
  { label: "python-requests", ua: "python-requests/2.32.3" },
];

/* --- Tokenizer ------------------------------------------------------------ */

// RFC 9110 §10.1.5: product *( RWS ( product / comment ) ), where a comment is
// parenthesised and may nest (Opera Mini puts one comment inside another).
// Anything that doesn't fit is kept as a product token so the highlighted
// view always reproduces the input exactly.
function tokenizeUA(ua) {
  const tokens = [];
  let i = 0;
  while (i < ua.length) {
    if (/\s/.test(ua[i])) {
      let j = i;
      while (j < ua.length && /\s/.test(ua[j])) j++;
      tokens.push({ kind: "space", text: ua.slice(i, j) });
      i = j;
      continue;
    }
    if (ua[i] === "(") {
      let depth = 0;
      let j = i;
      for (; j < ua.length; j++) {
        if (ua[j] === "(") depth++;
        else if (ua[j] === ")" && --depth === 0) { j++; break; }
      }
      const text = ua.slice(i, j);
      tokens.push({ kind: "comment", text, items: text.replace(/^\(|\)$/g, "").split(";").map((s) => s.trim()).filter(Boolean) });
      i = j;
      continue;
    }
    let j = i;
    while (j < ua.length && !/[\s(]/.test(ua[j])) j++;
    const text = ua.slice(i, j);
    const slash = text.indexOf("/");
    tokens.push({
      kind: "product",
      text,
      name: slash >= 0 ? text.slice(0, slash) : text,
      version: slash >= 0 ? text.slice(slash + 1) : "",
    });
    i = j;
  }
  return tokens;
}

/* --- Helpers -------------------------------------------------------------- */

function dotted(version) {
  return version ? version.replace(/_/g, ".").replace(/\.+$/, "") : null;
}

function majorOf(version) {
  const match = /^(\d+)/.exec(version || "");
  return match ? Number(match[1]) : null;
}

/* --- Bots ----------------------------------------------------------------- */

// Checked before anything else because many crawlers wrap a real browser UA
// (Googlebot smartphone is a full Chrome-on-Android string plus a suffix).
const BOT_RULES = [
  [/Googlebot-(Image|News|Video)\/?([\d.]*)/, (m) => `Googlebot-${m[1]}`, "search crawler"],
  [/Googlebot\/([\d.]+)/, "Googlebot", "search crawler"],
  [/Google-InspectionTool\/([\d.]+)/, "Google-InspectionTool", "search crawler"],
  [/Storebot-Google\/([\d.]+)/, "Storebot-Google", "search crawler"],
  [/AdsBot-Google(?:-Mobile)?/, "AdsBot-Google", "ads crawler"],
  [/Mediapartners-Google/, "Mediapartners-Google (AdSense)", "ads crawler"],
  [/GoogleOther/, "GoogleOther", "search crawler"],
  [/APIs-Google/, "APIs-Google", "service fetcher"],
  [/FeedFetcher-Google/, "FeedFetcher-Google", "feed fetcher"],
  [/bingbot\/([\d.]+)/i, "Bingbot", "search crawler"],
  [/BingPreview\/([\d.]+)/, "BingPreview", "link preview"],
  [/adidxbot\/([\d.]+)/i, "AdIdxBot (Bing Ads)", "ads crawler"],
  [/Yahoo! Slurp/, "Yahoo! Slurp", "search crawler"],
  [/DuckDuckBot(?:-Https)?\/([\d.]+)/, "DuckDuckBot", "search crawler"],
  [/Baiduspider(?:-render)?\/([\d.]+)/, "Baiduspider", "search crawler"],
  [/YandexBot\/([\d.]+)/, "YandexBot", "search crawler"],
  [/Applebot\/([\d.]+)/, "Applebot", "search crawler"],
  [/Applebot-Extended/, "Applebot-Extended", "AI crawler"],
  [/SeznamBot\/([\d.]+)/, "SeznamBot", "search crawler"],
  [/PetalBot/, "PetalBot", "search crawler"],
  [/Sogou web spider\/([\d.]+)/, "Sogou Spider", "search crawler"],
  [/GPTBot\/([\d.]+)/, "GPTBot", "AI crawler"],
  [/ChatGPT-User\/([\d.]+)/, "ChatGPT-User", "AI assistant fetcher"],
  [/OAI-SearchBot\/([\d.]+)/, "OAI-SearchBot", "AI search crawler"],
  [/ClaudeBot\/([\d.]+)/, "ClaudeBot", "AI crawler"],
  [/Claude-User\/([\d.]+)/, "Claude-User", "AI assistant fetcher"],
  [/Claude-SearchBot\/([\d.]+)/, "Claude-SearchBot", "AI search crawler"],
  [/anthropic-ai/, "anthropic-ai", "AI crawler"],
  [/PerplexityBot\/([\d.]+)/, "PerplexityBot", "AI search crawler"],
  [/Perplexity-User\/([\d.]+)/, "Perplexity-User", "AI assistant fetcher"],
  [/CCBot\/([\d.]+)/, "CCBot (Common Crawl)", "AI crawler"],
  [/Bytespider/, "Bytespider", "AI crawler"],
  [/Amazonbot\/([\d.]+)/, "Amazonbot", "AI crawler"],
  [/meta-externalagent\/([\d.]+)/, "Meta-ExternalAgent", "AI crawler"],
  [/cohere-ai/, "cohere-ai", "AI crawler"],
  [/Diffbot\/([\d.]+)/, "Diffbot", "scraper"],
  [/facebookexternalhit\/([\d.]+)/, "facebookexternalhit", "link preview"],
  [/Facebot/, "Facebot", "link preview"],
  [/Twitterbot\/([\d.]+)/, "Twitterbot", "link preview"],
  [/LinkedInBot\/([\d.]+)/, "LinkedInBot", "link preview"],
  [/Slackbot(?:-LinkExpanding)?\s?([\d.]*)/, "Slackbot", "link preview"],
  [/Discordbot\/([\d.]+)/, "Discordbot", "link preview"],
  [/TelegramBot/, "TelegramBot", "link preview"],
  [/WhatsApp\/([\d.]+)/, "WhatsApp", "link preview"],
  [/Pinterestbot\/([\d.]+)/, "Pinterestbot", "link preview"],
  [/redditbot\/([\d.]+)/, "redditbot", "link preview"],
  [/AhrefsBot\/([\d.]+)/, "AhrefsBot", "SEO crawler"],
  [/SemrushBot\/?([\d.~a-z]*)/, "SemrushBot", "SEO crawler"],
  [/MJ12bot\/v?([\d.]+)/, "MJ12bot (Majestic)", "SEO crawler"],
  [/DotBot\/([\d.]+)/, "DotBot (Moz)", "SEO crawler"],
  [/Screaming Frog SEO Spider\/([\d.]+)/, "Screaming Frog", "SEO crawler"],
  [/archive\.org_bot|ia_archiver/, "Internet Archive", "archiver"],
  [/UptimeRobot\/([\d.]+)/, "UptimeRobot", "uptime monitor"],
  [/Pingdom\.com_bot_version_([\d.]+)/, "Pingdom", "uptime monitor"],
  [/StatusCake/, "StatusCake", "uptime monitor"],
  [/Chrome-Lighthouse/, "Lighthouse", "audit tool"],
  [/HeadlessChrome\/([\d.]+)/, "Headless Chrome", "headless browser"],
  [/PhantomJS\/([\d.]+)/, "PhantomJS", "headless browser"],
  [/Electron\/[\d.]+.*\bjsdom|jsdom\/([\d.]+)/, "jsdom", "headless browser"],
  [/^curl\/([\d.]+)/, "curl", "HTTP client"],
  [/^Wget\/([\d.]+)/i, "Wget", "HTTP client"],
  [/python-requests\/([\d.]+)/, "python-requests", "HTTP client"],
  [/Python-urllib\/([\d.]+)/, "Python urllib", "HTTP client"],
  [/python-httpx\/([\d.]+)/, "HTTPX", "HTTP client"],
  [/aiohttp\/([\d.]+)/, "aiohttp", "HTTP client"],
  [/Scrapy\/([\d.]+)/, "Scrapy", "scraper"],
  [/Go-http-client\/([\d.]+)/, "Go-http-client", "HTTP client"],
  [/okhttp\/([\d.]+)/, "OkHttp", "HTTP client"],
  [/Apache-HttpClient\/([\d.]+)/, "Apache HttpClient", "HTTP client"],
  [/^Java\/([\d._]+)/, "Java HttpURLConnection", "HTTP client"],
  [/^axios\/([\d.]+)/, "axios", "HTTP client"],
  [/node-fetch(?:\/([\d.]+))?/, "node-fetch", "HTTP client"],
  [/^undici|^node$/, "Node.js fetch (undici)", "HTTP client"],
  [/PostmanRuntime\/([\d.]+)/, "Postman", "HTTP client"],
  [/insomnia\/([\d.]+)/, "Insomnia", "HTTP client"],
  [/^HTTPie\/([\d.]+)/, "HTTPie", "HTTP client"],
  [/libwww-perl\/([\d.]+)/, "libwww-perl", "HTTP client"],
  [/^Dart\/([\d.]+)/, "Dart HttpClient", "HTTP client"],
  [/^Ruby|Faraday v([\d.]+)/, "Ruby HTTP", "HTTP client"],
  [/^GuzzleHttp\/([\d.]+)/, "Guzzle", "HTTP client"],
  [/^Deno\/([\d.]+)/, "Deno", "HTTP client"],
  [/^Bun\/([\d.]+)/, "Bun", "HTTP client"],
];

// Last resort for crawlers not in the list. Case-sensitive on purpose: a
// case-insensitive `bot\b` flags the CUBOT phone brand.
const GENERIC_BOT = /(?:[a-z]bot|Bot|crawler|Crawler|[Ss]pider)\b|\bcrawl/;

function detectBot(ua) {
  for (const [re, name, category] of BOT_RULES) {
    const m = re.exec(ua);
    if (m) {
      const label = typeof name === "function" ? name(m) : name;
      const version = m.slice(1).reverse().find((v) => v && /^[\d.~_a-z]+$/i.test(v) && /\d/.test(v)) || null;
      return { name: label, version: version ? dotted(version) : null, category, token: m[0].split(/[/\s]/)[0] };
    }
  }
  const m = GENERIC_BOT.exec(ua);
  if (m) {
    // Name it after the product token that contains the match.
    const token = ua.split(/[\s;()]+/).find((part) => part.includes(m[0])) || m[0];
    const [name, version] = token.replace(/^\+/, "").split("/");
    return { name: name || "Unknown bot", version: version ? dotted(version) : null, category: "crawler", token: name };
  }
  return null;
}

/* --- Browsers ------------------------------------------------------------- */

// [regex, name, token, extra]. First match wins, so in-app and rebadged
// Chromium browsers come before Chrome, Chrome before Safari (Chrome's UA
// ends in "Safari/537.36"), and iOS browsers before everything they mimic.
const BROWSER_RULES = [
  // In-app browsers append their own token to the platform WebView's UA.
  [/\bInstagram[ /]([\d.]+)/, "Instagram in-app browser", "Instagram", { inApp: true }],
  [/\bFBAV\/([\d.]+)/, "Facebook in-app browser", "FBAV", { inApp: true }],
  [/\b(?:FBAN|FB_IAB|FBIOS)\//, "Facebook in-app browser", "FBAN", { inApp: true }],
  [/\bMessenger(?:Lite)?ForiOS|\bOrca-Android/, "Messenger in-app browser", "FBAN", { inApp: true }],
  [/\bLine\/([\d.]+)/i, "LINE in-app browser", "Line", { inApp: true }],
  [/\bMicroMessenger\/([\d.]+)/, "WeChat in-app browser", "MicroMessenger", { inApp: true }],
  [/\bmusical_ly_([\d.]+)|\bBytedanceWebview|\bTikTok[ /]([\d.]+)/, "TikTok in-app browser", "musical_ly", { inApp: true }],
  [/\bSnapchat\/([\d.]+)/, "Snapchat in-app browser", "Snapchat", { inApp: true }],
  [/\bLinkedInApp(?:\/([\d.]+))?/, "LinkedIn in-app browser", "LinkedInApp", { inApp: true }],
  [/\bTwitter for iPhone|\bTwitterAndroid/, "X (Twitter) in-app browser", "Twitter", { inApp: true }],
  [/\bGSA\/([\d.]+)/, "Google app", "GSA", { inApp: true }],
  // Edge: Edg/ on desktop, EdgA/ on Android, EdgiOS/ on iOS. Plain Edge/ is
  // the pre-2020 EdgeHTML browser.
  [/\bEdgiOS\/([\d.]+)/, "Microsoft Edge for iOS", "EdgiOS"],
  [/\bEdgA\/([\d.]+)/, "Microsoft Edge", "EdgA"],
  [/\bEdg\/([\d.]+)/, "Microsoft Edge", "Edg"],
  [/\bEdge\/([\d.]+)/, "Microsoft Edge (Legacy)", "Edge", { legacyEdge: true }],
  // Opera: OPR/ on Chromium builds, OPiOS/OPT on iOS, Opera/…Version/ on Presto.
  [/\bOPiOS\/([\d.]+)/, "Opera for iOS", "OPiOS"],
  [/\bOPT\/([\d.]+)/, "Opera Touch", "OPT"],
  [/\bOPR\/([\d.]+)/, "Opera", "OPR"],
  [/\bOpera Mini\/([\d.]+)/, "Opera Mini", "Opera Mini"],
  [/\bOpera\b.*\bVersion\/([\d.]+)/, "Opera", "Opera", { versionToken: true }],
  [/\bOpera[ /]([\d.]+)/, "Opera", "Opera"],
  [/\bSamsungBrowser\/([\d.]+)/, "Samsung Internet", "SamsungBrowser"],
  [/\bYaBrowser\/([\d.]+)/, "Yandex Browser", "YaBrowser"],
  [/\bVivaldi\/([\d.]+)/, "Vivaldi", "Vivaldi"],
  [/\bBrave(?:\/([\d.]+))?/, "Brave", "Brave"],
  [/\bUCBrowser\/([\d.]+)/, "UC Browser", "UCBrowser"],
  [/\bWhale\/([\d.]+)/, "Naver Whale", "Whale"],
  [/\b(?:DuckDuckGo|Ddg)\/([\d.]+)/, "DuckDuckGo", "DuckDuckGo"],
  [/\bSilk\/([\d.]+)/, "Amazon Silk", "Silk"],
  [/\bHuaweiBrowser\/([\d.]+)/, "Huawei Browser", "HuaweiBrowser"],
  [/\bMiuiBrowser\/([\d.]+)/, "MIUI Browser", "MiuiBrowser"],
  // iOS builds of desktop browsers are WebKit underneath (App Store rule).
  [/\bFxiOS\/([\d.]+)/, "Firefox for iOS", "FxiOS"],
  [/\bCriOS\/([\d.]+)/, "Chrome for iOS", "CriOS"],
  [/\bSeaMonkey\/([\d.]+)/, "SeaMonkey", "SeaMonkey"],
  [/\bWaterfox\/([\d.]+)/, "Waterfox", "Waterfox"],
  [/\bPaleMoon\/([\d.]+)/, "Pale Moon", "PaleMoon"],
  [/\bFirefox\/([\d.]+)/, "Firefox", "Firefox"],
  [/\bHeadlessChrome\/([\d.]+)/, "Headless Chrome", "HeadlessChrome"],
  // Desktop apps (VS Code, Slack…) render in Chromium but add Electron/.
  [/\bElectron\/([\d.]+)/, "Electron", "Electron"],
  [/\bChromium\/([\d.]+)/, "Chromium", "Chromium"],
  // Android System WebView: "; wv)" in the platform comment, or the legacy
  // "Version/4.0 Chrome/…" shape from before Android 5.
  [/; wv\).*\bChrome\/([\d.]+)|\bVersion\/[\d.]+ Chrome\/([\d.]+)/, "Android WebView", "Chrome", { inApp: true }],
  [/\bChrome\/([\d.]+)/, "Chrome", "Chrome"],
  // Pre-Chrome Android stock browser: Version/ + Safari/ with no Chrome/.
  [/\bAndroid\b.*\bVersion\/([\d.]+).*\bSafari\//, "Android Browser", "Version", { versionToken: true }],
  // Safari's own version lives in Version/; Safari/ is the WebKit build.
  [/\bVersion\/([\d.]+).*\bSafari\//, "Safari", "Version", { versionToken: true, safari: true }],
  [/\bMSIE ([\d.]+)/, "Internet Explorer", "MSIE", { ie: true }],
  [/\bTrident\/[\d.]+.*\brv:([\d.]+)/, "Internet Explorer", "Trident", { ie: true }],
  [/\bKonqueror\/([\d.]+)/, "Konqueror", "Konqueror"],
];

function detectBrowser(ua) {
  for (const [re, name, token, extra = {}] of BROWSER_RULES) {
    const m = re.exec(ua);
    if (m) {
      const version = m.slice(1).find(Boolean) || null;
      return { name, version, token, ...extra };
    }
  }
  // iOS app WebViews (WKWebView) keep AppleWebKit/ and Mobile/ but drop
  // Version/ and Safari/, so their absence is the tell.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && /AppleWebKit\//.test(ua) && !/Safari\//.test(ua)) {
    return { name: "iOS WebView (WKWebView)", version: null, token: "Mobile", inApp: true, webview: true };
  }
  if (/Tizen/.test(ua)) return { name: "Samsung TV browser (Tizen)", version: null, token: "Tizen" };
  return null;
}

/* --- Engines -------------------------------------------------------------- */

function detectEngine(ua, browser, isIOS) {
  const webkit = /AppleWebKit\/([\d.]+)/.exec(ua);
  // Every iOS browser must use WebKit (App Store Review Guideline 2.5.6), so
  // CriOS/FxiOS/EdgiOS are WebKit whatever brand they carry.
  if (isIOS) return { name: "WebKit", version: webkit ? webkit[1] : null };
  if (browser?.legacyEdge) return { name: "EdgeHTML", version: /Edge\/([\d.]+)/.exec(ua)[1] };
  const trident = /Trident\/([\d.]+)/.exec(ua);
  if (trident) return { name: "Trident", version: trident[1] };
  if (/\bMSIE\b/.test(ua)) return { name: "Trident", version: null };
  const presto = /Presto\/([\d.]+)/.exec(ua);
  if (presto) return { name: "Presto", version: presto[1] };
  // Blink forked from WebKit at Chrome 28 and froze AppleWebKit at 537.36;
  // since then the Blink version is the Chromium version.
  const chrome = /(?:HeadlessChrome|Chromium|Chrome)\/([\d.]+)/.exec(ua);
  if (chrome && webkit) {
    return majorOf(chrome[1]) >= 28 ? { name: "Blink", version: chrome[1] } : { name: "WebKit", version: webkit[1] };
  }
  if (webkit) return { name: "WebKit", version: webkit[1] };
  const gecko = /\brv:([\d.]+)\)\s*Gecko\/[\d.]+/.exec(ua);
  if (gecko) return { name: "Gecko", version: gecko[1] };
  if (/\bGoanna\//.test(ua)) return { name: "Goanna", version: /Goanna\/([\d.]+)/.exec(ua)[1] };
  const khtml = /KHTML\/([\d.]+)/.exec(ua);
  if (khtml) return { name: "KHTML", version: khtml[1] };
  return null;
}

/* --- Operating systems ---------------------------------------------------- */

const WINDOWS_NT = {
  "10.0": "10/11",
  "6.4": "10 Technical Preview",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
  "6.0": "Vista",
  "5.2": "XP x64 / Server 2003",
  "5.1": "XP",
  "5.01": "2000 SP1",
  "5.0": "2000",
  "4.0": "NT 4.0",
};

const MACOS_NAMES = {
  "10.4": "Tiger", "10.5": "Leopard", "10.6": "Snow Leopard", "10.7": "Lion", "10.8": "Mountain Lion",
  "10.9": "Mavericks", "10.10": "Yosemite", "10.11": "El Capitan", "10.12": "Sierra", "10.13": "High Sierra",
  "10.14": "Mojave", "10.15": "Catalina", 11: "Big Sur", 12: "Monterey", 13: "Ventura", 14: "Sonoma", 15: "Sequoia", 26: "Tahoe",
};

const LINUX_DISTROS = /\b(Ubuntu|Kubuntu|Xubuntu|Lubuntu|Linux Mint|Mint|Fedora|Debian|Arch Linux|Manjaro|openSUSE|SUSE|CentOS|Red Hat|Gentoo|Slackware|Mageia|Raspbian|elementary OS|Pop!_OS|Kali)\b(?:[ /]([\d.]+))?/i;

function detectOS(ua, notes) {
  let m;
  if ((m = /Windows Phone(?: OS)? ([\d.]+)/.exec(ua))) return { name: "Windows Phone", version: m[1] };
  if (/Xbox/.test(ua)) return { name: "Xbox OS", version: null };
  if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
    const version = WINDOWS_NT[m[1]] || `NT ${m[1]}`;
    if (m[1] === "10.0") {
      notes.push("Windows 11 still reports \"Windows NT 10.0\", so the UA cannot tell Windows 10 from 11. Client Hints platformVersion 13 or higher means Windows 11.");
    }
    return { name: "Windows", version, raw: `NT ${m[1]}` };
  }
  if ((m = /Win 9x 4\.90|Windows ME/.exec(ua))) return { name: "Windows", version: "ME" };
  if ((m = /Windows (98|95|CE)|Win(98|95)/.exec(ua))) return { name: "Windows", version: m[1] || m[2] };
  if ((m = /\b(iPhone|iPad|iPod)\b(?:.*?\bOS ([\d_]+))?/.exec(ua))) {
    const version = dotted(m[2]);
    const name = m[1] === "iPad" && (majorOf(version) || 13) >= 13 ? "iPadOS" : "iOS";
    const safari = /Version\/(\d+)/.exec(ua);
    // Safari 26 froze the OS version in its UA at 18_6, the way macOS is
    // frozen at 10_15_7, so a Version/26 Safari on "OS 18_6" is iOS 26+.
    if (version === "18.6" && safari && Number(safari[1]) >= 26) {
      notes.push(`Safari ${safari[1]} freezes the ${name} version in its UA at 18.6; the device is most likely running ${name} ${safari[1]} or later.`);
    }
    return { name, version };
  }
  if ((m = /\bKAIOS\/([\d.]+)/i.exec(ua))) return { name: "KaiOS", version: m[1] };
  if ((m = /\b(?:HarmonyOS|OpenHarmony)[ /]?([\d.]*)/.exec(ua))) return { name: "HarmonyOS", version: m[1] || null };
  if ((m = /\bAndroid[ /]?([\d.]*)/.exec(ua))) {
    if (/Android 10; K\)/.test(ua)) {
      notes.push("\"Android 10; K\" is Chrome's reduced UA: since Chrome 110 the real Android version and device model are replaced by these placeholders. Client Hints (platformVersion, model) carry the real values.");
    }
    return { name: "Android", version: m[1] || null };
  }
  if ((m = /\bCrOS (\S+) ([\d.]+)/.exec(ua))) {
    notes.push("The number after CrOS is the ChromeOS platform build, not the Chrome version; reduced UAs freeze it to 14541.0.0.");
    return { name: "ChromeOS", version: m[2] };
  }
  if ((m = /\bPlayStation (\d+|Vita|Portable)(?:[ /]([\d.]+))?/.exec(ua))) return { name: `PlayStation ${m[1]}`, version: m[2] || null };
  if (/Nintendo (Switch|WiiU|Wii|3DS)/.test(ua)) return { name: `Nintendo ${/Nintendo (\w+)/.exec(ua)[1]}`, version: null };
  if ((m = /\bTizen[ /]?([\d.]*)/.exec(ua))) return { name: "Tizen", version: m[1] || null };
  if (/\bWeb0S\b|\bwebOS\b/i.test(ua)) return { name: "webOS", version: (/webOS(?:TV)?[ /]([\d.]+)/i.exec(ua) || [])[1] || null };
  if ((m = /\bMac OS X ([\d_.]+)/.exec(ua)) || /\bMacintosh\b/.test(ua)) {
    const version = m ? dotted(m[1]) : null;
    const os = { name: "macOS", version };
    // Safari, Chrome and Edge freeze macOS at 10_15_7 and Firefox at 10.15,
    // so from Big Sur onwards every Mac reports the same thing.
    if (version === "10.15.7" || (version === "10.15" && /Firefox\//.test(ua))) {
      os.frozen = true;
      notes.push(`macOS ${version} is a frozen value: browsers stopped updating it after Catalina, so this could be any macOS from 10.15 to the latest. Client Hints platformVersion has the real version.`);
    } else if (version) {
      const [maj, min] = version.split(".");
      os.codename = MACOS_NAMES[maj === "10" ? `10.${min}` : maj] || null;
    }
    if (/Version\/[\d.]+.*Safari\//.test(ua) && !/Mobile\//.test(ua)) {
      notes.push("iPadOS 13+ Safari requests desktop sites with this same Mac UA, so this could also be an iPad.");
    }
    return os;
  }
  if ((m = /\b(FreeBSD|OpenBSD|NetBSD|DragonFly)\b/.exec(ua))) return { name: m[1], version: null };
  if ((m = /\b(BlackBerry|BB10)\b(?:.*?Version\/([\d.]+))?/.exec(ua))) return { name: "BlackBerry", version: m[2] || null };
  if ((m = /\bSymbian(?:OS)?\/?([\d.]*)/.exec(ua))) return { name: "Symbian", version: m[1] || null };
  if (/\bFuchsia\b/.test(ua)) return { name: "Fuchsia", version: null };
  if ((m = /\b(SunOS|AIX|HP-UX)\b/.exec(ua))) return { name: m[1], version: null };
  if (/\bLinux\b|\bX11\b/.test(ua)) {
    const distro = LINUX_DISTROS.exec(ua);
    return { name: "Linux", version: null, distro: distro ? distro[1] : null, distroVersion: distro?.[2] || null };
  }
  return null;
}

/* --- Devices -------------------------------------------------------------- */

const ANDROID_VENDORS = [
  [/^(SAMSUNG|SM-|GT-|SCH-|SGH-|SHV-|SC-\d)/i, "Samsung"],
  [/^(Pixel|Nexus)/i, "Google"],
  [/^(Redmi|POCO|Mi |MI |Xiaomi|M2\d{3}|2\d{5,}[A-Z]{1,3}\b)/i, "Xiaomi"],
  [/^(ONEPLUS|OnePlus)/, "OnePlus"],
  [/^(OPPO|CPH\d)/i, "OPPO"],
  [/^(RMX|realme)/i, "realme"],
  [/^(vivo|V2\d{3})/i, "vivo"],
  [/^(moto|motorola|XT\d{4})/i, "Motorola"],
  [/^(HUAWEI|HONOR|[A-Z]{3}-(?:L|AL|TL|LX|NX)\d)/, "Huawei"],
  [/^(Nokia|TA-\d)/i, "Nokia"],
  [/^(LG|LM-)/i, "LG"],
  [/^(Lenovo|TB-)/i, "Lenovo"],
  [/^(Xperia|SO-\d|XQ-)/i, "Sony"],
  [/^(KF[A-Z]{2,}|AFT)/, "Amazon"],
  [/^(ASUS|ZenFone)/i, "ASUS"],
  [/^(TECNO|Infinix|itel)/i, null],
  [/^(Nothing|A0\d{2})/, "Nothing"],
  [/^(Fairphone|FP\d)/, "Fairphone"],
];

function androidModel(ua) {
  const comment = /\(([^()]*Android[^()]*)\)/.exec(ua);
  if (!comment) return null;
  const items = comment[1].split(";").map((s) => s.trim()).filter(Boolean);
  let model = items.find((s) => /\sBuild\//.test(s) || /^Build\//.test(s));
  if (model) {
    model = model.replace(/\s*Build\/.*$/, "");
  } else {
    // Reduced and modern UAs drop "Build/"; the model is the item right
    // after "Android x" once language tags and flags are skipped.
    const at = items.findIndex((s) => /^Android\b/.test(s));
    model = items.slice(at + 1).find((s) => !/^(U|I|N|wv|Mobile|Tablet|TV|K|rv:.*|[a-z]{2}(?:[-_][a-zA-Z]{2})?|Linux|arm.*|aarch64|x86.*)$/.test(s));
  }
  if (!model || /^Build\//.test(model)) return null;
  return model;
}

function vendorFor(model) {
  for (const [re, vendor] of ANDROID_VENDORS) {
    const m = re.exec(model);
    if (m) return vendor || m[1];
  }
  return null;
}

const TV_RE = /SmartTV|SMART-TV|Smart-TV|\bTizen\b.*\bTV\b|\bWeb0S\b|webOS.*TV|HbbTV|AppleTV|GoogleTV|Android TV|\bAFT[A-Z]|BRAVIA|\bRoku\b|\bCrKey\b|NetCast|Viera|\bTV Safari\b/i;
const CONSOLE_RE = /PlayStation|Xbox|Nintendo/;
const WEARABLE_RE = /\bWatch\b|Wear ?OS|wearable|SM-R\d{3}/i;

function detectDevice(ua, os, bot, notes) {
  const device = { type: "unknown", vendor: null, model: null };
  if (TV_RE.test(ua)) device.type = "smart-tv";
  else if (CONSOLE_RE.test(ua)) device.type = "console";
  else if (WEARABLE_RE.test(ua)) device.type = "wearable";
  // Chrome's convention: Android tablets omit "Mobile" from the UA. Firefox
  // says "Tablet" explicitly.
  else if (/\biPad\b|\bTablet\b|\bKindle\b|\bKF[A-Z]{2,}\b|\bSilk\b|PlayBook/.test(ua) || (os?.name === "Android" && !/Mobile/.test(ua))) device.type = "tablet";
  else if (/\b(iPhone|iPod)\b|\bMobi|Windows Phone|Opera Mini|KAIOS|BlackBerry|BB10|Symbian|IEMobile/i.test(ua)) device.type = "mobile";
  else if (os && /^(Windows|macOS|Linux|ChromeOS|FreeBSD|OpenBSD|NetBSD|DragonFly|SunOS|AIX|HP-UX|Fuchsia)$/.test(os.name)) device.type = "desktop";

  let m;
  if ((m = /\b(iPhone|iPad|iPod)\b/.exec(ua))) {
    device.vendor = "Apple";
    // Apps such as Instagram add the hardware identifier (iPhone15,3);
    // Safari never does, so the exact model is usually unknowable.
    const hw = /\b((?:iPhone|iPad|iPod)\d+,\d+)\b/.exec(ua);
    device.model = hw ? hw[1] : m[1] === "iPod" ? "iPod touch" : m[1];
  } else if (os?.name === "macOS") {
    device.vendor = "Apple";
    device.model = "Mac";
  } else if (os?.name === "Android" || os?.name === "HarmonyOS") {
    const model = androidModel(ua);
    if (model) {
      device.vendor = vendorFor(model);
      device.model = device.vendor === "Samsung" ? model.replace(/^SAMSUNG[\s-]/i, "") : model;
    }
  } else if ((m = /Windows Phone[^;)]*;[^)]*?\b(NOKIA|Microsoft|HTC|SAMSUNG|LG)[;\s]+([^;)]+)/i.exec(ua))) {
    device.vendor = m[1];
    device.model = m[2].trim();
  } else if (/Xbox/.test(ua)) {
    device.vendor = "Microsoft";
    device.model = (/Xbox (One|Series [XS])/.exec(ua) || [])[0] || "Xbox";
  } else if ((m = /PlayStation (\d+|Vita|Portable)/.exec(ua))) {
    device.vendor = "Sony";
    device.model = `PlayStation ${m[1]}`;
  } else if ((m = /Nintendo (\w+)/.exec(ua))) {
    device.vendor = "Nintendo";
    device.model = m[1];
  }
  if (device.type === "smart-tv" && !device.vendor) {
    if (/Tizen|SMART-TV|SmartTV.*Samsung/i.test(ua)) device.vendor = "Samsung";
    else if (/Web0S|webOS|NetCast|\bLG\b/i.test(ua)) device.vendor = "LG";
    else if (/BRAVIA/.test(ua)) device.vendor = "Sony";
    else if (/AppleTV/.test(ua)) device.vendor = "Apple";
    else if (/CrKey|GoogleTV/.test(ua)) device.vendor = "Google";
    else if (/Roku/.test(ua)) device.vendor = "Roku";
    else if (/AFT[A-Z]/.test(ua)) device.vendor = "Amazon";
  }
  if (bot) {
    // Keep what the bot claims to render as — Googlebot smartphone crawls
    // as a Nexus 5X — but classify the client itself as a bot.
    if (device.type !== "unknown") notes.push(`${bot.name} identifies as a ${device.type} client for rendering; it is still an automated agent.`);
    device.type = "bot";
  }
  return device;
}

/* --- CPU ------------------------------------------------------------------ */

function detectCPU(ua, os, notes) {
  let arch = null;
  if (/\bWOW64\b/.test(ua)) {
    arch = "x86_64";
    notes.push("WOW64 means a 32-bit browser running on 64-bit Windows.");
  } else if (/\b(x86_64|x86-64|Win64|x64|amd64|AMD64)\b/.test(ua)) arch = "x86_64";
  else if (/\b(aarch64|arm64|ARM64)\b/.test(ua)) arch = "arm64";
  else if (/\barmv8l\b/.test(ua)) arch = "arm (32-bit on arm64)";
  else if (/\barm(?:v\d+[a-z]*)?\b|\bARM\b/.test(ua)) arch = "arm";
  else if (/\b(i[3-6]86|x86)\b/.test(ua)) arch = "x86";
  else if (/\bppc64le\b/.test(ua)) arch = "ppc64le";
  else if (/\b(ppc64|PPC64)\b/.test(ua)) arch = "ppc64";
  else if (/\b(PPC|PowerPC|ppc)\b/.test(ua)) arch = "ppc";
  else if (/\briscv64\b/.test(ua)) arch = "riscv64";
  else if (/\bmips\w*\b/i.test(ua)) arch = "mips";
  else if (/\bsparc\w*\b/i.test(ua)) arch = "sparc";
  if (!arch && os?.name === "macOS" && /Intel Mac OS X/.test(ua)) {
    notes.push("Mac UAs say \"Intel\" even on Apple Silicon, so the CPU can't be read from the UA. Client Hints architecture says \"arm\" or \"x86\".");
  }
  return { architecture: arch };
}

/* --- Parse ---------------------------------------------------------------- */

function parseUA(input) {
  const ua = String(input || "").trim();
  const notes = [];
  const bot = detectBot(ua);
  const os = detectOS(ua, notes);
  const isIOS = os?.name === "iOS" || os?.name === "iPadOS";
  let browser = detectBrowser(ua);
  const engine = detectEngine(ua, browser, isIOS);
  const device = detectDevice(ua, os, bot, notes);
  const cpu = detectCPU(ua, os, notes);

  if (browser?.safari) {
    if (device.type === "console") {
      browser = { ...browser, name: `${device.model || "Console"} browser`, safari: false };
    } else {
      if (isIOS) browser = { ...browser, name: "Mobile Safari" };
      notes.push("Safari's release number is the Version/ token. Safari/ is the WebKit build and has been frozen (605.1.15, or 604.1 on iOS) since Safari 11.");
    }
  }
  if (!browser && bot) browser = { name: bot.name, version: bot.version, token: bot.token };

  if (browser?.name === "Chrome" || browser?.name === "Chromium") {
    notes.push("Brave, Arc and (on desktop) Vivaldi send exactly Chrome's UA, so this could be any of them. Only Client Hints brands or navigator.brave can tell them apart.");
  }
  if (/\b(?:HeadlessChrome|Chrome|CriOS|Edg|EdgA|OPR|SamsungBrowser)\/\d+\.0\.0\.0\b/.test(ua)) {
    notes.push("Chromium's UA reduction (Chrome 101–113) fixes the minor, build and patch numbers at 0.0.0. Client Hints fullVersionList carries the full version.");
  }
  if (isIOS && browser && /Chrome|Firefox|Edge|Opera/.test(browser.name)) {
    notes.push(`${browser.name} runs on Apple's WebKit, not ${/Firefox/.test(browser.name) ? "Gecko" : "Blink"}: every browser on ${os.name} must use the system engine.`);
  }
  if (browser?.inApp) {
    notes.push(`${browser.name.replace(/ in-app browser$/, "")} opens pages in an app's embedded WebView, so cookies, storage and some features differ from the user's default browser.`);
  }
  if (browser?.ie) {
    const msie = /MSIE (\d+)/.exec(ua);
    const trident = /Trident\/(\d+)/.exec(ua);
    if (msie && trident && Number(trident[1]) + 4 > Number(msie[1])) {
      // Trident/N shipped with IE N+4, so a lower MSIE token means a newer
      // IE pretending to be an old one (Compatibility View).
      notes.push(`MSIE ${msie[1]} with Trident/${trident[1]} is Internet Explorer ${Number(trident[1]) + 4} in Compatibility View.`);
      browser = { ...browser, version: `${Number(trident[1]) + 4}.0`, compatView: true };
    }
    if (!msie) notes.push("IE 11 dropped the MSIE token; it is identified by Trident/7.0 plus rv:11.0.");
  }
  if (browser?.legacyEdge) notes.push("Edge/ (without the \"g\") is the discontinued EdgeHTML-based Edge; Chromium Edge uses Edg/.");
  if (bot) notes.unshift(`Automated client: ${bot.name} (${bot.category}). UA strings are trivially spoofed — verify crawlers with reverse DNS or their published IP ranges.`);

  return {
    ua,
    browser: browser ? { name: browser.name, version: browser.version || null, major: majorOf(browser.version) } : null,
    engine,
    os: os ? { name: os.name, version: os.version || null, ...(os.distro ? { distro: os.distro, distroVersion: os.distroVersion } : {}), ...(os.codename ? { codename: os.codename } : {}), ...(os.frozen ? { frozen: true } : {}) } : null,
    device,
    cpu,
    bot: bot ? { isBot: true, name: bot.name, version: bot.version, category: bot.category } : { isBot: false },
    notes,
    _tokens: { browser: browser?.token || null, bot: bot?.token || null, engine: engine?.name || null },
  };
}

function resultJSON(result) {
  const { _tokens, ...rest } = result;
  return JSON.stringify(rest, null, 2);
}

/* --- Formatting ----------------------------------------------------------- */

function browserText(b) {
  return b ? `${b.name}${b.version ? ` ${b.version}` : ""}` : "Unknown";
}

function engineText(e) {
  return e ? `${e.name}${e.version ? ` ${e.version}` : ""}` : "Unknown";
}

function osText(os) {
  if (!os) return "Unknown";
  let text = os.name;
  if (os.version) text += ` ${os.version}`;
  if (os.codename) text += ` ${os.codename}`;
  if (os.frozen) text += " (frozen)";
  if (os.distro) text += ` · ${os.distro}${os.distroVersion ? ` ${os.distroVersion}` : ""}`;
  return text;
}

const DEVICE_LABELS = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  "smart-tv": "Smart TV",
  console: "Console",
  wearable: "Wearable",
  bot: "Bot",
  unknown: "Unknown",
};

/* --- Token highlighting --------------------------------------------------- */

const ROLE_TITLES = {
  browser: "Browser",
  engine: "Rendering engine",
  platform: "Platform (OS, device, CPU)",
  device: "Device hint",
  bot: "Bot / automated client",
  compat: "Compatibility token — kept so old sniffers don't break",
  other: "Other token",
};

const ENGINE_TOKENS = { Blink: ["AppleWebKit"], WebKit: ["AppleWebKit"], Gecko: ["Gecko"], Trident: ["Trident"], Presto: ["Presto"], EdgeHTML: ["Edge"], KHTML: ["KHTML"], Goanna: ["Goanna"] };

function tokenRole(token, result, index, tokens) {
  const t = result._tokens;
  if (token.kind === "comment") {
    if (t.bot && token.text.includes(t.bot)) return "bot";
    if (/^\(KHTML, like Gecko\)$/.test(token.text)) return "compat";
    const firstComment = tokens.findIndex((x) => x.kind === "comment");
    return index === firstComment ? "platform" : "other";
  }
  const name = token.name.replace(/[;,]$/, "");
  if (t.bot && (name === t.bot || token.text.startsWith(t.bot))) return "bot";
  if (t.browser && (name === t.browser || (t.browser === "Opera Mini" && name === "Opera"))) return "browser";
  if (/^[\d._]+$/.test(name)) {
    // A space-separated version ("Instagram 342.0…") belongs to its product.
    for (let k = index - 1; k >= 0; k--) {
      if (tokens[k].kind === "product") return tokenRole(tokens[k], result, k, tokens);
      if (tokens[k].kind === "comment") break;
    }
  }
  if ((ENGINE_TOKENS[t.engine] || []).includes(name)) return "engine";
  if (name === "Mobile") return "device";
  if (["Mozilla", "Safari", "Chrome", "Version", "like", "Gecko", "KHTML,"].includes(name)) return "compat";
  return "other";
}

function renderTokens(result) {
  tokensView.replaceChildren();
  if (!result.ua) return;
  const tokens = tokenizeUA(result.ua);
  tokens.forEach((token, index) => {
    if (token.kind === "space") {
      tokensView.append(document.createTextNode(" "));
      return;
    }
    const role = tokenRole(token, result, index, tokens);
    const span = document.createElement("span");
    span.className = `tok tok-${role}`;
    span.dataset.role = role;
    span.title = ROLE_TITLES[role];
    span.textContent = token.text;
    tokensView.append(span);
  });
}

/* --- Rendering: details --------------------------------------------------- */

function detailRow(list, term, value, { copy = value, mono = false, key } = {}) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (key) dd.dataset.key = key;
  if (copy) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `copy-value${mono ? " is-mono" : ""}`;
    button.dataset.copy = copy;
    button.dataset.label = term;
    button.title = `Copy ${term.toLowerCase()}`;
    button.textContent = value;
    dd.append(button);
  } else {
    dd.textContent = value;
    dd.classList.add("is-empty");
  }
  list.append(dt, dd);
}

function badge(text, kind) {
  const span = document.createElement("span");
  span.className = `badge${kind ? ` ${kind}` : ""}`;
  span.textContent = text;
  return span;
}

function renderResult(result) {
  details.replaceChildren();
  notesList.replaceChildren();
  verdict.replaceChildren();
  if (!result.ua) return;

  const { browser, engine, os, device, cpu, bot } = result;
  verdict.append(badge(DEVICE_LABELS[device.type], device.type === "bot" ? "warning" : "info"));
  if (bot.isBot) verdict.append(badge(bot.category, "warning"));
  if (/in-app|WebView/.test(browser?.name || "")) verdict.append(badge("in-app / WebView", ""));

  detailRow(details, "Browser", browserText(browser), { copy: browser ? browserText(browser) : null, key: "browser" });
  detailRow(details, "Engine", engineText(engine), { copy: engine ? engineText(engine) : null, key: "engine" });
  detailRow(details, "OS", osText(os), { copy: os ? osText(os) : null, key: "os" });
  detailRow(details, "Device type", DEVICE_LABELS[device.type], { key: "device" });
  detailRow(details, "Vendor", device.vendor || "Not stated", { copy: device.vendor, key: "vendor" });
  detailRow(details, "Model", device.model || "Not stated", { copy: device.model, mono: true, key: "model" });
  detailRow(details, "CPU", cpu.architecture || "Not stated", { copy: cpu.architecture, mono: true, key: "cpu" });
  detailRow(details, "Bot", bot.isBot ? `Yes — ${bot.name}${bot.version ? ` ${bot.version}` : ""}` : "No", { copy: bot.isBot ? bot.name : null, key: "bot" });

  for (const note of result.notes) {
    const li = document.createElement("li");
    li.textContent = note;
    notesList.append(li);
  }
}

function setStatus(message, kind) {
  statusText.textContent = message;
  statusBar.className = `status-bar${kind ? ` is-${kind}` : ""}`;
}

let current = parseUA("");

function run() {
  current = parseUA(uaInput.value);
  renderTokens(current);
  renderResult(current);
  const { browser, os, device, bot, engine } = current;
  if (!current.ua) {
    setStatus("Paste a User-Agent string, or pick a sample below", "");
  } else if (bot.isBot) {
    setStatus(`Bot detected: ${bot.name} (${bot.category})`, "warning");
  } else if (!browser && !os && !engine) {
    setStatus("No known browser, engine or platform tokens found", "error");
  } else {
    const parts = [browser ? browserText({ name: browser.name, version: browser.major != null ? String(browser.major) : null }) : "Unknown browser"];
    if (os) parts.push(`on ${os.name}${os.version && !os.frozen ? ` ${os.version}` : ""}`);
    setStatus(`${parts.join(" ")} · ${DEVICE_LABELS[device.type].toLowerCase()}`, "success");
  }
}

/* --- Client Hints (this browser only) ------------------------------------- */

// GREASE brands (Chromium's "Not A;Brand", "Not)A;Brand"…) are deliberately
// nonsense entries that stop sites from hard-coding the brand list.
function isGrease(brand) {
  return /Not.?A.?Brand/i.test(brand);
}

function brandsText(list) {
  return (list || []).map((b) => `${b.brand} ${b.version}${isGrease(b.brand) ? " (GREASE)" : ""}`).join(", ");
}

// Microsoft's documented mapping for Sec-CH-UA-Platform-Version on Windows:
// 13+ is Windows 11, 1–10 is Windows 10, 0 is 7/8/8.1.
function windowsFromPlatformVersion(version) {
  const major = majorOf(version);
  if (major == null) return null;
  if (major >= 13) return "Windows 11";
  if (major > 0) return "Windows 10";
  return "Windows 7, 8 or 8.1";
}

async function renderHints() {
  hintsBody.replaceChildren();
  const data = navigator.userAgentData;
  if (!data) {
    hintsNote.textContent = "navigator.userAgentData is not available here. Firefox and Safari don't implement User-Agent Client Hints, so for this browser the UA string above is all there is.";
    hintsNote.classList.add("is-absent");
    return;
  }
  hintsNote.textContent = "Reported by navigator.userAgentData. Low-entropy values are sent to every site; high-entropy values need getHighEntropyValues() here, or an Accept-CH opt-in on the server.";
  hintsNote.classList.remove("is-absent");

  detailRow(hintsBody, "Brands", brandsText(data.brands) || "None", { key: "brands" });
  detailRow(hintsBody, "Mobile", data.mobile ? "true" : "false", { mono: true, key: "mobile" });
  detailRow(hintsBody, "Platform", data.platform || "(empty)", { mono: true, key: "platform" });
  if (navigator.brave) detailRow(hintsBody, "Brave", "navigator.brave is present — this is Brave", { copy: null, key: "brave" });

  if (typeof data.getHighEntropyValues !== "function") return;
  let high;
  try {
    high = await data.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "fullVersionList", "uaFullVersion", "wow64", "formFactors"]);
  } catch (error) {
    // Permissions Policy can block high-entropy hints (e.g. inside an iframe
    // without `ch-ua-*` allowed); low-entropy values still stand.
    detailRow(hintsBody, "High entropy", `Refused: ${error.message || error.name}`, { copy: null, key: "high-error" });
    return;
  }
  if (high.platformVersion !== undefined) {
    const win = (data.platform || high.platform) === "Windows" ? windowsFromPlatformVersion(high.platformVersion) : null;
    detailRow(hintsBody, "Platform version", `${high.platformVersion || "(empty)"}${win ? ` → ${win}` : ""}`, { copy: high.platformVersion || null, mono: true, key: "platformVersion" });
  }
  if (high.architecture !== undefined) {
    const arch = [high.architecture, high.bitness ? `${high.bitness}-bit` : ""].filter(Boolean).join(", ");
    detailRow(hintsBody, "Architecture", arch || "(empty)", { copy: arch || null, mono: true, key: "architecture" });
  }
  if (high.model !== undefined) detailRow(hintsBody, "Model", high.model || "(empty — desktop browsers send none)", { copy: high.model || null, mono: true, key: "model" });
  if (high.fullVersionList) detailRow(hintsBody, "Full versions", brandsText(high.fullVersionList), { key: "fullVersionList" });
  if (high.wow64) detailRow(hintsBody, "WoW64", "true", { mono: true, key: "wow64" });
  if (Array.isArray(high.formFactors) && high.formFactors.length) detailRow(hintsBody, "Form factors", high.formFactors.join(", "), { key: "formFactors" });
}

/* --- Actions -------------------------------------------------------------- */

function copy(value, label) {
  if (!value) {
    window.DevToolsMain.showToast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => window.DevToolsMain.showToast(`${label} copied`, "success"))
    .catch(() => window.DevToolsMain.showToast("Copy failed", "error"));
}

function renderSamples() {
  SAMPLES.forEach((sample, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sample-chip";
    chip.dataset.sample = String(index);
    chip.textContent = sample.label;
    chip.title = sample.ua;
    samplesRow.append(chip);
  });
}

function markSample() {
  samplesRow.querySelectorAll(".sample-chip").forEach((chip) => {
    const active = SAMPLES[Number(chip.dataset.sample)].ua === uaInput.value.trim();
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

const ACTIONS = {
  mine() {
    uaInput.value = navigator.userAgent;
    run();
    markSample();
    window.DevToolsMain.showToast("Loaded this browser's User-Agent", "info");
  },
  async paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        window.DevToolsMain.showToast("Clipboard is empty", "warning");
        return;
      }
      uaInput.value = text.trim();
      run();
      markSample();
    } catch {
      window.DevToolsMain.showToast("Clipboard access was denied", "error");
    }
  },
  clear() {
    uaInput.value = "";
    run();
    markSample();
    uaInput.focus();
  },
  "copy-ua"() {
    copy(uaInput.value.trim(), "User-Agent");
  },
  "copy-json"() {
    copy(current.ua ? resultJSON(current) : "", "JSON");
  },
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    ACTIONS[action.dataset.action]?.();
    return;
  }
  const sample = event.target.closest(".sample-chip");
  if (sample) {
    uaInput.value = SAMPLES[Number(sample.dataset.sample)].ua;
    run();
    markSample();
    return;
  }
  const value = event.target.closest(".copy-value");
  if (value) copy(value.dataset.copy, value.dataset.label);
});

uaInput.addEventListener("input", () => {
  run();
  markSample();
});

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

renderSamples();
// Seed with the visitor's own UA: the most useful thing to parse on arrival.
uaInput.value = navigator.userAgent;
run();
markSample();
renderHints();
