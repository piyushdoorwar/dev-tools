import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

test('JSON converts to well-formed XML', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const result = await page.evaluate(() => {
    const xml = jsonToXML({ user: { name: 'ada', active: true, scores: [1, 2] } });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return { xml, error: Boolean(doc.querySelector('parsererror')) };
  });

  expect(result.error).toBe(false);
  expect(result.xml).toContain('ada');
});

test('XML converts back to the original JSON shape', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const roundTrip = await page.evaluate(() => {
    const source = { user: { name: 'ada', city: 'London' } };
    const xml = jsonToXML(source);
    return xmlToJSON(xml);
  });

  expect(JSON.stringify(roundTrip)).toContain('ada');
  expect(JSON.stringify(roundTrip)).toContain('London');
});

test('XML preserves prototype-named keys, attributes, and repeated empty text', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  const result = await page.evaluate(() => JSON.stringify(xmlToJSON(
    '<root __proto__="attribute"><__proto__>data</__proto__><constructor>value</constructor>' +
    '<toString>text</toString><item><![CDATA[]]></item><item>second</item></root>'
  )));
  expect(JSON.parse(result)).toEqual(JSON.parse('{"root":{"@attributes":{"__proto__":"attribute"},"__proto__":"data","constructor":"value","toString":"text","item":["","second"]}}'));
});

test('an empty JSON property name survives the XML round trip', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  expect(await page.evaluate(() => xmlToJSON(jsonToXML({ '': 'value' })))).toEqual({ root: { '': 'value' } });
});

test('keys that are not valid XML names are made safe', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const result = await page.evaluate(() => {
    const xml = jsonToXML([{ 'not valid': 'one' }, { '1st': 'two' }]);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return { xml, error: Boolean(doc.querySelector('parsererror')) };
  });

  expect(result.error).toBe(false);
});

test('typing JSON converts live into the XML pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"greeting":"hi"}');

  await expect(page.locator('#right-editor')).toHaveValue(/hi/);
  await expect(page.locator('#left-status')).toContainText('Valid JSON');
});

test('switching to XML to JSON mode converts the other direction', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await page.locator('.mode-btn[data-mode="xml-json"]').click();
  await expect(page.locator('#left-title')).toContainText('XML');

  await typeInto(page, '#left-editor', '<root><greeting>hi</greeting></root>');

  await expect(page.locator('#right-editor')).not.toHaveValue('');
  const output = await page.locator('#right-editor').inputValue();
  expect(JSON.stringify(JSON.parse(output))).toContain('hi');
});

test('invalid input is reported rather than silently converted', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"broken":');
  await expect(page.locator('#left-status')).not.toContainText('Valid JSON');
});

test('beautify reformats the JSON pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await typeInto(page, '#left-editor', '{"a":{"b":1}}');
  await page.locator('[data-action="beautify-left"]').click();
  const value = await page.locator('#left-editor').inputValue();

  expect(value).toContain('\n');
  expect(JSON.parse(value)).toEqual({ a: { b: 1 } });
});

test('key casing can be converted', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  const converted = await page.evaluate(() => convertObjectCasing({ first_name: 'ada', last_name: 'l' }, 'camel'));
  expect(Object.keys(converted)).toEqual(['firstName', 'lastName']);
});

test('the sample loads and converts', async ({ page }) => {
  await openTool(page, 'json-xml-converter');

  await page.locator('[data-action="load-sample"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('');
});

test('copy, paste, clear, and download act on the right pane', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await typeInto(page, '#left-editor', '{"a":1}');

  await page.locator('[data-action="copy-left"]').click();
  expect(await lastCopied(page)).toBe('{"a":1}');

  const download = await captureDownload(page, () => page.locator('[data-action="download-left"]').click());
  expect(await downloadText(download)).toContain('"a"');

  await setClipboardText(page, '{"pasted":1}');
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"pasted":1}');

  await page.locator('[data-action="clear-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
});

/* ---------- XML Formatter mode (#xml-format) ---------- */

const MESSY = '<root><a x="1"><b>t</b></a><c/></root>';

async function openFormatter(page) {
  await openTool(page, 'json-xml-converter');
  await page.goto('/tools/json-xml-converter/#xml-format');
  await expect(page.locator('#right-title')).toHaveText('Formatted XML');
}

async function pickIndent(page, value) {
  await page.locator('#format-options .dd__trigger').click();
  await page.locator(`#format-options .dd__option[data-value="${value}"]`).click();
}

test('#xml-format deep-links to the formatter, seeded with a formatted sample', async ({ page }) => {
  await openFormatter(page);

  await expect(page.locator('.mode-btn[data-mode="xml-format"]')).toHaveClass(/active/);
  await expect(page).toHaveTitle('XML Formatter');
  await expect(page.locator('#format-options')).toBeVisible();
  await expect(page.locator('[data-action="sort-keys"]')).toBeHidden();
  await expect(page.locator('#left-status')).toContainText('Valid XML');
  await expect(page.locator('#right-editor')).toHaveValue(/\n  <book id="bk101" lang="en">\n    <dc:title>/);
});

test('switching modes writes the formatter hash and the options only show there', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await expect(page.locator('#format-options')).toBeHidden();

  await page.locator('.mode-btn[data-mode="xml-format"]').click();
  await expect(page).toHaveURL(/#xml-format$/);
  await expect(page.locator('#format-options')).toBeVisible();

  await page.locator('.mode-btn[data-mode="xml-json"]').click();
  await expect(page).toHaveURL(/#xml-json$/);
  await expect(page.locator('#format-options')).toBeHidden();
});

test('indent can be 2 spaces, 4 spaces, or a tab, and output can be minified', async ({ page }) => {
  await openFormatter(page);
  await typeInto(page, '#left-editor', MESSY);

  await expect(page.locator('#right-editor')).toHaveValue('<root>\n  <a x="1">\n    <b>t</b>\n  </a>\n  <c/>\n</root>');
  await expect(page.locator('#right-status')).toContainText('2-space indent');

  await pickIndent(page, '4');
  await expect(page.locator('#right-editor')).toHaveValue('<root>\n    <a x="1">\n        <b>t</b>\n    </a>\n    <c/>\n</root>');

  await pickIndent(page, 'tab');
  await expect(page.locator('#right-editor')).toHaveValue('<root>\n\t<a x="1">\n\t\t<b>t</b>\n\t</a>\n\t<c/>\n</root>');

  await typeInto(page, '#left-editor', '<?xml version="1.0"?>\n<root>\n  <a x="1">\n    <b>t</b>\n  </a>\n  <c/>\n</root>');
  await pickIndent(page, 'minify');
  await expect(page.locator('#right-editor')).toHaveValue('<?xml version="1.0"?><root><a x="1"><b>t</b></a><c/></root>');
  await expect(page.locator('#right-status')).toContainText('Minified');
});

test('mixed content keeps its inline spacing; only whitespace between elements collapses', async ({ page }) => {
  await openFormatter(page);

  const result = await page.evaluate(() => ({
    inline: formatXmlString('<doc>\n\n      <p>Hello <b>world</b>!</p>\n<p>  two  spaces  <i> in </i></p></doc>'),
    minified: formatXmlString('<doc>\n  <p>Hello <b>world</b> !</p>\n</doc>', { minify: true }),
    leafSpace: formatXmlString('<a>\n  <pad>   </pad>\n</a>'),
    preserve: formatXmlString('<a><pre xml:space="preserve">\n  <x/>\n</pre></a>'),
  }));

  expect(result.inline).toBe('<doc>\n  <p>Hello <b>world</b>!</p>\n  <p>  two  spaces  <i> in </i></p>\n</doc>');
  expect(result.minified).toBe('<doc><p>Hello <b>world</b> !</p></doc>');
  expect(result.leafSpace).toBe('<a>\n  <pad>   </pad>\n</a>');
  expect(result.preserve).toBe('<a>\n  <pre xml:space="preserve">\n  <x/>\n</pre>\n</a>');
});

test('declaration, doctype, comments, CDATA, PIs, namespaces and attribute order survive', async ({ page }) => {
  await openFormatter(page);

  const source = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<!DOCTYPE note [<!ELEMENT note ANY>]>',
    '<!-- top comment -->',
    '<?xml-stylesheet href="s.xsl" type="text/xsl"?>',
    '<n:note z="1" xmlns:n="urn:n" a="2" xmlns="urn:d"><!-- inner --><n:body><![CDATA[a < b && c]]></n:body><?render fast?></n:note>',
  ].join('');
  await typeInto(page, '#left-editor', source);

  await expect(page.locator('#right-editor')).toHaveValue([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<!DOCTYPE note [<!ELEMENT note ANY>]>',
    '<!-- top comment -->',
    '<?xml-stylesheet href="s.xsl" type="text/xsl"?>',
    // Source attribute order, even though the DOM lists xmlns first.
    '<n:note z="1" xmlns:n="urn:n" a="2" xmlns="urn:d">',
    '  <!-- inner -->',
    '  <n:body><![CDATA[a < b && c]]></n:body>',
    '  <?render fast?>',
    '</n:note>',
  ].join('\n'));
});

test('sort attributes and self-closing are toggles', async ({ page }) => {
  await openFormatter(page);
  await typeInto(page, '#left-editor', '<r xmlns:q="urn:q" z="1" b="2" a="3"><e></e><f/></r>');
  await expect(page.locator('#right-editor')).toHaveValue('<r xmlns:q="urn:q" z="1" b="2" a="3">\n  <e/>\n  <f/>\n</r>');

  await page.locator('#xml-sort-attrs').check();
  await expect(page.locator('#right-editor')).toHaveValue(/^<r xmlns:q="urn:q" a="3" b="2" z="1">/);

  await page.locator('#xml-self-close').uncheck();
  await expect(page.locator('#right-editor')).toHaveValue(/\n  <e><\/e>\n  <f><\/f>\n/);
});

test('text and attribute values are re-escaped correctly', async ({ page }) => {
  await openFormatter(page);

  const out = await page.evaluate(() => formatXmlString(
    '<a t="x &amp; &lt;y&gt; &quot;q&quot; \'s\' &#10;end">1 &lt; 2 &amp;&amp; 3 &gt; 2 "ok" \'fine\'</a>'));
  expect(out).toBe('<a t="x &amp; &lt;y> &quot;q&quot; \'s\' &#10;end">1 &lt; 2 &amp;&amp; 3 &gt; 2 "ok" \'fine\'</a>');

  // Round-trips to the same DOM values.
  const same = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [doc.documentElement.getAttribute('t'), doc.documentElement.textContent];
  }, out);
  expect(same).toEqual(['x & <y> "q" \'s\' \nend', '1 < 2 && 3 > 2 "ok" \'fine\'']);
});

test('invalid XML reports line and column in the status bar', async ({ page }) => {
  await openFormatter(page);

  await typeInto(page, '#left-editor', '<a>\n  <b>text</c>\n</a>');
  const status = page.locator('#left-status .status-text');
  await expect(status).toHaveClass(/error/);
  await expect(status).toContainText('Line 2, column');
  await expect(status).toContainText('mismatch');
  await expect(page.locator('#right-status')).toContainText('Waiting for valid XML');

  const error = await page.evaluate(() => {
    try { parseXmlDocument('<a x="1" x="2"/>'); } catch (e) { return { message: e.message, line: e.line, column: e.column }; }
    return null;
  });
  expect(error.line).toBe(1);
  expect(error.column).toBeGreaterThan(0);
  expect(error.message).toMatch(/^Line 1, column \d+: .*redefined/);
});

test('formatter validate and download treat both panes as XML', async ({ page }) => {
  await openFormatter(page);

  await page.locator('[data-action="validate-right"]').click();
  await expect(page.locator('#right-status')).toContainText('Valid XML');

  const download = await captureDownload(page, () => page.locator('[data-action="download-right"]').click());
  expect(download.suggestedFilename()).toBe('formatted.xml');
  expect(await downloadText(download)).toContain('<catalog');
});

test('emptying the input empties the output instead of leaving it stale', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await typeInto(page, '#left-editor', '{"a":1}');
  await expect(page.locator('#right-editor')).toHaveValue(/<a>1<\/a>/);

  await typeInto(page, '#left-editor', '');
  await expect(page.locator('#right-editor')).toHaveValue('');
  await expect(page.locator('#right-status .char-count')).toHaveText('0 characters');
});

test('nested and empty arrays survive the conversion to XML', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  const xml = await page.evaluate(() => jsonToXML({ grid: [[1, 2], [3]], none: [] }));
  expect(xml).toContain('<none />');
  // Each inner array is its own <grid> element, so [[1,2],[3]] is not flattened.
  const back = await page.evaluate((text) => xmlToJSON(text), xml);
  expect(back.root.grid).toEqual([{ item: ['1', '2'] }, { item: '3' }]);
});

test('CDATA and text beside comments are kept when converting XML to JSON', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  const result = await page.evaluate(() => xmlToJSON('<r><a><![CDATA[x < y]]></a><b>kept<!-- note --></b><c/></r>'));
  expect(result).toEqual({ r: { a: 'x < y', b: 'kept', c: {} } });
});

test('undo steps back over beautify one edit at a time and re-converts', async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await typeInto(page, '#left-editor', '{"a":1}');
  await page.locator('[data-action="beautify-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{\n  "a": 1\n}');

  await page.locator('[data-action="undo-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"a":1}');

  await page.locator('[data-action="undo-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
  await expect(page.locator('#right-editor')).toHaveValue('');
});

test("switching modes resets undo so the other mode's input cannot come back", async ({ page }) => {
  await openTool(page, 'json-xml-converter');
  await typeInto(page, '#left-editor', '{"a":1}');
  await page.locator('.mode-btn[data-mode="xml-json"]').click();
  await page.locator('[data-action="undo-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
  await expect(page.locator('#left-status .status-text')).toHaveText('Nothing to undo');
});

test('a paste error stays on screen instead of reverting to Ready', async ({ page }) => {
  await page.clock.install();
  await openTool(page, 'json-xml-converter');
  await setClipboardText(page, '{"broken":');
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
  await page.clock.runFor(3000);
  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
});

for (const width of [375, 800]) {
  test(`fits a ${width}px viewport with every toolbar button inside its panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openTool(page, 'json-xml-converter');
    await page.locator('[data-action="load-sample"]').click();

    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    for (const side of ['left', 'right']) {
      const panel = await page.locator(`.${side}-panel`).boundingBox();
      const buttons = await page.locator(`#${side}-actions .action-btn`).evaluateAll((els) =>
        els.filter((el) => el.offsetParent).map((el) => el.getBoundingClientRect().right));
      for (const right of buttons) expect(right).toBeLessThanOrEqual(panel.x + panel.width);
      expect((await page.locator(`#${side}-editor`).boundingBox()).height).toBeGreaterThan(250);
    }

    // The case menu opens un-clipped (the toolbar used to be an overflow scroller).
    await page.locator('[data-action="change-case"]').click();
    await expect(page.locator('#left-actions .dd__menu')).toBeVisible();
    const menu = await page.locator('#left-actions .dd__menu').boundingBox();
    expect(menu.height).toBeGreaterThan(100);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  });
}
