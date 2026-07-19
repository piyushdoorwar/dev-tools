import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const EXTERNAL_ASSETS = [
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
    output: 'vendor/highlight.js/11.9.0/atom-one-dark.min.css',
    integrity: 'sha384-oaMLBGEzBOJx3UHwac0cVndtX5fxGQIfnAeFZ35RTgqPcYlbprH9o9PUV/F8Le07',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    output: 'vendor/highlight.js/11.9.0/highlight.min.js',
    integrity: 'sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp',
  },
  {
    source: 'https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.min.js',
    output: 'vendor/dompurify/3.4.12/purify.min.js',
    integrity: 'sha384-piCcpDdJ7qVeK4Tv8Z6Hpcr3ZBIgP16TxQTPVfsLFdZ5uDgwc3Y8Ho7oUnqf12qu',
  },
  {
    source: 'https://cdn.jsdelivr.net/npm/marked@18.0.6/lib/marked.umd.js',
    output: 'vendor/marked/18.0.6/marked.umd.js',
    integrity: 'sha384-uGn1eBC40GtuBgao0epc/cz9O4Lo8/flg/10SW+69UjLI5nP31iT4UPc65Xz10Le',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
    output: 'vendor/codemirror/5.65.16/codemirror.min.css',
    integrity: 'sha384-zaeBlB/vwYsDRSlFajnDd7OydJ0cWk+c2OWybl3eSUf6hW2EbhlCsQPqKr3gkznT',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css',
    output: 'vendor/codemirror/5.65.16/theme/dracula.min.css',
    integrity: 'sha384-ccdJwIIg/K0Ab6aXF4MPACh7ckk61tvQFTrfkhXZEALgAETURNZIAuQLcS/aPbrM',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
    output: 'vendor/codemirror/5.65.16/codemirror.min.js',
    integrity: 'sha384-ZYmwuq4n2gOcNxMSiJ6jyTj+BbIrilr7p6dlq6q5nmSWKmsH9UU4K1qqjycMkfmR',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js',
    output: 'vendor/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js',
    integrity: 'sha384-xYIbc5F55vPi7pb/lUnFj3wu24HlpAMZdtBHkNrb2YhPzJV3pX7+eqXT2PXSNMrw',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js',
    output: 'vendor/codemirror/5.65.16/mode/css/css.min.js',
    integrity: 'sha384-fpeIC2FZuPmw7mIsTvgB5BNc8QVxQC/nWg2W+CgPYOAiBiYVuHe2E8HiTWHBMIJQ',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
    output: 'vendor/codemirror/5.65.16/mode/javascript/javascript.min.js',
    integrity: 'sha384-g0o+WW9mdIxA7LaaCKTkRm0M5TVT+Bb4s9eocxPsI2G0Xm0POG9iD6G6qP1IIsfS',
  },
  {
    source: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    output: 'vendor/jszip/3.10.1/jszip.min.js',
    integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
  },
  {
    source: 'https://unpkg.com/qr-code-styling@1.6.0/lib/qr-code-styling.js',
    output: 'vendor/qr-code-styling/1.6.0/qr-code-styling.js',
    integrity: 'sha384-K7D1ZVqZVEPBKpQrjKR0/pDcFaWHQPzUBKNY5k8RRX5aGtd4WGHXEnO0qso4YowQ',
  },
  {
    source: 'https://unpkg.com/sql-formatter@15.4.2/dist/sql-formatter.min.js',
    output: 'vendor/sql-formatter/15.4.2/sql-formatter.min.js',
    integrity: 'sha384-7L46T4Kl2EnzUo/gQTjxNfalcv8uvTUmtMfBDjO7Cxef+mWAUErtpikKl3Qnsg4M',
  },
];

export function verifyIntegrity(bytes, integrity) {
  const [algorithm, expectedDigest] = integrity.split('-', 2);
  const actualDigest = createHash(algorithm).update(bytes).digest('base64');
  return actualDigest === expectedDigest;
}

export function localizeExternalReferences(html, htmlPath) {
  let localized = html;
  for (const asset of EXTERNAL_ASSETS) {
    const relativePath = path.posix.relative(path.posix.dirname(htmlPath), asset.output);
    localized = localized.replaceAll(asset.source, relativePath);
  }
  return localized;
}

export async function downloadExternalAssets(outputDirectory, fetchImplementation = fetch) {
  await Promise.all(EXTERNAL_ASSETS.map(async (asset) => {
    const response = await fetchImplementation(asset.source);
    if (!response.ok) {
      throw new Error(`Unable to download ${asset.source}: HTTP ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!verifyIntegrity(bytes, asset.integrity)) {
      throw new Error(`Integrity check failed for ${asset.source}`);
    }

    const outputPath = path.join(outputDirectory, asset.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
  }));
}
