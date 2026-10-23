// Visual QA screenshots. Start `npx vite --port 5199` first, then: node apps/web/scripts/screens.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5199';
const out = fileURLToPath(new URL('../.screens/', import.meta.url));
await mkdir(out, { recursive: true });

const shots = [
  { name: 'dev-mobile', path: '/_dev', vp: { width: 390, height: 844 }, full: true },
  { name: 'home-mobile', path: '/', vp: { width: 390, height: 844 } },
  { name: 'product-mobile', path: '/p/123', vp: { width: 390, height: 844 } },
  { name: 'notfound-mobile', path: '/nope', vp: { width: 390, height: 844 } },
  { name: 'home-desktop', path: '/', vp: { width: 1440, height: 900 } },
  { name: 'dev-desktop', path: '/_dev', vp: { width: 1440, height: 900 } },
];
const sheet = process.argv.includes('--sheets');

const browser = await chromium.launch();
const errors = [];
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2, locale: 'fa-IR', isMobile: s.vp.width < 600, hasTouch: s.vp.width < 600 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|\/api\//.test(m.text()) && errors.push(`${s.name} console: ${m.text()}`));
    await page.goto(base + s.path, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}${s.name}.png`, fullPage: !!s.full });
    console.log('shot', s.name);
    if (sheet && s.name === 'home-mobile') {
      for (const label of ['بودجه', 'شرایط خرید', 'محدوده']) {
        const chip = page.getByRole('button', { name: new RegExp(label) }).first();
        if (await chip.count()) {
          await chip.click();
          await page.waitForTimeout(600);
          await page.screenshot({ path: `${out}sheet-${label.replace(/\s/g, '-')}.png` });
          console.log('shot sheet', label);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
