import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

for (const tool of ['json-xml-converter', 'json-toon-converter', 'json-yaml-toml-converter']) {
  test(`${tool}: sorting preserves every JSON key, including nested prototype names`, async ({ page }) => {
    await openTool(page, tool);
    const input = '{"z":1,"__proto__":{"z":2,"a":3},"a":[{"z":4,"__proto__":"kept"}]}';
    // Serialize in the page so the automation transport does not interpret
    // __proto__ while reconstructing the returned object.
    const output = await page.evaluate(text => JSON.stringify(sortObjectKeys(JSON.parse(text))), input);
    expect(JSON.parse(output)).toEqual(JSON.parse(input));
    expect(Object.keys(JSON.parse(output))).toEqual(['__proto__', 'a', 'z']);
    expect(Object.keys(JSON.parse(output).__proto__)).toEqual(['a', 'z']);
  });
}
