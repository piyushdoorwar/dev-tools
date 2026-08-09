import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HOME_DESCRIPTION, SITE_URL, TOOL_CATALOG, toolTitle, toolURL } from '../scripts/seo.mjs';

const readDist = (asset) => readFile(new URL(`../dist/${asset}`, import.meta.url), 'utf8');

test('SEO catalog has unique logical routes with complete metadata', () => {
  assert.equal(TOOL_CATALOG.length, 19);
  assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.id)).size, TOOL_CATALOG.length);
  assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.route)).size, TOOL_CATALOG.length);
  for (const tool of TOOL_CATALOG) {
    assert.ok(tool.description.length >= 70, `${tool.id} needs a useful description`);
    assert.ok(tool.capabilities.length >= 3, `${tool.id} needs capability details`);
  }
});

test('homepage and every tool route have indexable, unique server-rendered SEO data', async () => {
  const home = await readDist('index.html');
  assert.match(home, new RegExp(HOME_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(home, new RegExp(`<link rel="canonical" href="${SITE_URL}"`));
  assert.equal((home.match(/class="seo-tool-link"/g) || []).length, TOOL_CATALOG.length);
  assert.doesNotThrow(() => JSON.parse(home.match(/<script id="seoStructuredData" type="application\/ld\+json">([^<]+)<\/script>/)?.[1]));

  const titles = new Set();
  const descriptions = new Set();
  for (const tool of TOOL_CATALOG) {
    const html = await readDist(`${tool.route}/index.html`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
    assert.equal(title, toolTitle(tool));
    assert.equal(description, tool.description.replaceAll('&', '&amp;').replaceAll('"', '&quot;'));
    assert.match(html, new RegExp(`<link rel="canonical" href="${toolURL(tool)}"`));
    assert.match(html, /<meta name="robots" content="index, follow,/);
    assert.match(html, new RegExp(`<h1 id="toolAboutTitle">${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    const json = html.match(/<script id="seoStructuredData" type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    const data = JSON.parse(json);
    assert.ok(data['@graph'].some((item) => item['@type'] === 'WebApplication' && item.url === toolURL(tool)));
    assert.ok(!titles.has(title), `duplicate title: ${title}`);
    assert.ok(!descriptions.has(description), `duplicate description: ${description}`);
    titles.add(title);
    descriptions.add(description);
  }
});

test('sitemap, robots, and LLM indexes include every canonical route', async () => {
  const [sitemap, robots, llms, llmsFull] = await Promise.all([
    readDist('sitemap.xml'),
    readDist('robots.txt'),
    readDist('llms.txt'),
    readDist('llms-full.txt'),
  ]);
  assert.match(robots, new RegExp(`Sitemap: ${SITE_URL}sitemap\\.xml`));
  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \/dev-tools\//);
  for (const tool of TOOL_CATALOG) {
    const url = toolURL(tool);
    assert.match(sitemap, new RegExp(`<loc>${url}</loc>`));
    assert.match(llms, new RegExp(`\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\)`));
    assert.match(llmsFull, new RegExp(`Canonical URL: ${url}`));
  }
});

test('internal iframe pages are excluded in favor of clean canonical routes', async () => {
  const seenPaths = new Set();
  for (const tool of TOOL_CATALOG) {
    if (seenPaths.has(tool.toolPath)) continue;
    seenPaths.add(tool.toolPath);
    const html = await readDist(`tools/${tool.toolPath}/index.html`);
    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/piyushdoorwar\.github\.io\/dev-tools\//);
  }
});

test('social preview is a 1200 by 630 PNG', async () => {
  const image = await readFile(new URL('../social-preview.png', import.meta.url));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
