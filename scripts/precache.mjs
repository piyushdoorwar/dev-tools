export function renderPrecacheManifest(assets) {
  const paths = assets.map((asset) => `./${asset}`);
  return `const PRECACHE_ASSETS = ${JSON.stringify(paths, null, 2)};\n`;
}
