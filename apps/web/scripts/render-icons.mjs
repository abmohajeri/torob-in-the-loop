// Renders PWA PNG icons from public/icon.svg with Playwright (chromium).
// Usage: node apps/web/scripts/render-icons.mjs
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(pub + 'icon.svg', 'utf8');
const b64 = Buffer.from(svg).toString('base64');

const jobs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const browser = await chromium.launch();
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.size, height: j.size } });
    // Maskable: full-bleed brand background, glyph within the 80% safe zone.
    const inner = j.maskable ? Math.round(j.size * 0.8) : j.size;
    const html = `<html><body style="margin:0;width:${j.size}px;height:${j.size}px;display:grid;place-items:center;background:${j.maskable ? '#0f766e' : 'transparent'}">
      <img src="data:image/svg+xml;base64,${b64}" width="${inner}" height="${inner}"/></body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: pub + j.file, omitBackground: !j.maskable });
    await page.close();
    console.log('wrote', j.file);
  }
} finally {
  await browser.close();
}
