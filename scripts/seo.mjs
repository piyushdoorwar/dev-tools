import '../tool-catalog.js';

export const SITE_URL = 'https://piyushdoorwar.github.io/dev-tools/';
export const SITE_NAME = 'Dev Tools';
export const HOME_TITLE = 'Dev Tools — Fast, Private Browser Utilities';
export const HOME_DESCRIPTION = 'Use fast, free developer tools for formatting, conversion, testing, generation, and file processing directly in your browser.';
export const TOOL_CATALOG = globalThis.DEV_TOOLS_CATALOG;

if (!Array.isArray(TOOL_CATALOG) || TOOL_CATALOG.length === 0) {
  throw new Error('Dev Tools SEO catalog failed to load.');
}

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const escapeXml = escapeHtml;

export function toolURL(tool) {
  return new URL(`${tool.route}/`, SITE_URL).href;
}

export function toolTitle(tool) {
  return `${tool.name} — Free Online Developer Tool | Dev Tools`;
}

export function structuredData(tool = null) {
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: HOME_DESCRIPTION,
  };

  if (!tool) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        website,
        {
          '@type': 'ItemList',
          name: 'Free browser developer tools',
          itemListElement: TOOL_CATALOG.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            url: toolURL(item),
          })),
        },
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      website,
      {
        '@type': 'WebApplication',
        '@id': `${toolURL(tool)}#app`,
        name: tool.name,
        url: toolURL(tool),
        description: tool.description,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern browser with JavaScript enabled.',
        featureList: tool.capabilities,
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        isPartOf: { '@id': `${SITE_URL}#website` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: tool.name, item: toolURL(tool) },
        ],
      },
    ],
  };
}

function renderToolLinks() {
  return TOOL_CATALOG.map((tool) =>
    `<a class="seo-tool-link" data-tool-id="${escapeHtml(tool.id)}" href="./${escapeHtml(tool.route)}/">${escapeHtml(tool.name)}</a>`,
  ).join('\n                  ');
}

function renderToolAbout(tool) {
  const capabilities = tool.capabilities.map((capability) => `<li>${escapeHtml(capability)}</li>`).join('');
  return `<!-- SEO_TOOL_ABOUT_START -->
            <section class="modal__tool-about" id="toolAbout" aria-labelledby="toolAboutTitle">
              <p class="modal__tool-about-label">About <span id="toolAboutLabel">${escapeHtml(tool.name)}</span></p>
              <h3 class="modal__tool-about-title" id="toolAboutTitle">${escapeHtml(tool.name)}</h3>
              <p class="modal__tool-about-description" id="toolAboutDescription">${escapeHtml(tool.description)}</p>
              <ul class="modal__tool-about-capabilities" id="toolAboutCapabilities">${capabilities}</ul>
              <p class="modal__tool-about-privacy">Your input is processed locally in your browser and is not uploaded by Dev Tools.</p>
            </section>
          <!-- SEO_TOOL_ABOUT_END -->`;
}

function replaceStructuredData(html, data) {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c');
  return html.replace(
    /(<script id="seoStructuredData" type="application\/ld\+json">)[\s\S]*?(<\/script>)/,
    `$1${json}$2`,
  );
}

export function renderHomePage(template) {
  return replaceStructuredData(
    template.replace('<!-- SEO_TOOL_LINKS -->', renderToolLinks()),
    structuredData(),
  );
}

export function renderToolRoutePage(homePage, tool) {
  let html = homePage.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <base href="../" />');
  const title = toolTitle(tool);
  const url = toolURL(tool);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /(<meta name="description" content=")[^"]*(" \/>)/,
    `$1${escapeHtml(tool.description)}$2`,
  );
  html = html.replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(title)}$2`);
  html = html.replace(
    /(<meta property="og:description" content=")[^"]*(" \/>)/,
    `$1${escapeHtml(tool.description)}$2`,
  );
  html = html.replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, `$1${escapeHtml(url)}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(title)}$2`);
  html = html.replace(
    /(<meta name="twitter:description" content=")[^"]*(" \/>)/,
    `$1${escapeHtml(tool.description)}$2`,
  );
  html = html.replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${escapeHtml(url)}$2`);
  html = html.replace(
    /<!-- SEO_TOOL_ABOUT_START -->[\s\S]*?<!-- SEO_TOOL_ABOUT_END -->/,
    renderToolAbout(tool),
  );
  return replaceStructuredData(html, structuredData(tool));
}

export function markInternalToolPage(html, canonicalTool) {
  const tags = `    <meta name="robots" content="noindex, follow" />\n    <link rel="canonical" href="${escapeHtml(toolURL(canonicalTool))}" />\n`;
  return html.replace(/(<meta name="viewport"[^>]*>\s*)/i, `$1${tags}`);
}

export function renderSitemap() {
  const urls = [SITE_URL, ...TOOL_CATALOG.map(toolURL)];
  const entries = urls.map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function renderRobots() {
  return `User-agent: *\nAllow: /dev-tools/\n\nUser-agent: OAI-SearchBot\nAllow: /dev-tools/\n\nSitemap: ${SITE_URL}sitemap.xml\n`;
}

export function renderLlms() {
  const tools = TOOL_CATALOG.map((tool) => `- [${tool.name}](${toolURL(tool)}): ${tool.description}`).join('\n');
  return `# Dev Tools\n\n> Fast, free developer utilities that run directly in the browser. Tool inputs are processed locally and are not uploaded by Dev Tools.\n\n## Tools\n\n${tools}\n\n## Additional resources\n\n- [Homepage](${SITE_URL}): Browse and search the complete tool collection.\n- [Sitemap](${SITE_URL}sitemap.xml): Canonical index of all public tool routes.\n- [Source code](https://github.com/piyushdoorwar/dev-tools): Project source and documentation.\n`;
}

export function renderLlmsFull() {
  const sections = TOOL_CATALOG.map((tool) => [
    `## ${tool.name}`,
    '',
    `Canonical URL: ${toolURL(tool)}`,
    '',
    tool.description,
    '',
    'Capabilities:',
    ...tool.capabilities.map((capability) => `- ${capability}`),
    '',
    'Privacy: Inputs are processed locally in the browser and are not uploaded by Dev Tools.',
  ].join('\n')).join('\n\n');
  return `# Dev Tools — Complete Tool Guide\n\n${HOME_DESCRIPTION}\n\nAll listed tools are free to use and require a modern browser with JavaScript enabled.\n\n${sections}\n`;
}
