// Web A visual QA: node apps/web/scripts/screens-a.mjs [only-name-substring]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.env.BASE ?? 'http://localhost:5199';
const out = fileURLToPath(new URL('../.screens/', import.meta.url));
await mkdir(out, { recursive: true });
const M = { width: 390, height: 844 }, D = { width: 1440, height: 900 };
const ids = 'product_adfdc73bc839d15cd7754318,product_8eaba34d56960fb44ed580dd';
const shots = [
  { name: 'a-home', path: '/', vp: M, full: true },
  { name: 'a-home-desktop', path: '/', vp: D },
  { name: 'a-chat', path: '/', vp: M, full: true, chat: 'سامسونگ A07 قسطی' },
  { name: 'a-chat-need', path: '/', vp: M, full: true, chat: 'کتونی می‌خوام ولی نمی‌دونم چه مدلی' },
  { name: 'a-search-empty', path: '/search', vp: M },
  { name: 'a-search', path: '/search?q=' + encodeURIComponent('سامسونگ a07'), vp: M, full: true },
  { name: 'a-search-none', path: '/search?q=' + encodeURIComponent('زززز یییی'), vp: M, full: true },
  { name: 'a-search-filters', path: '/search?q=' + encodeURIComponent('هدفون'), vp: M, click: /^فیلتر/ },
  { name: 'a-search-discover', path: '/search?q=' + encodeURIComponent('کتونی'), vp: M, click: /^کمکم کن$/, full: true },
  { name: 'a-compare', path: '/compare?ids=' + ids, vp: M, full: true },
  { name: 'a-compare-empty', path: '/compare', vp: M },
  { name: 'a-search-desktop', path: '/search?q=' + encodeURIComponent('هدفون'), vp: D },
];
const only = process.argv[2];
const browser = await chromium.launch();
const errors = [];
for (const s of shots) {
  if (only && !s.name.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2, locale: 'fa-IR', isMobile: s.vp.width < 600, hasTouch: s.vp.width < 600 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${s.name} console: ${m.text()}`));
  await page.goto(base + s.path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(700);
  if (s.chat) {
    await page.fill('#chat-input', s.chat);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  if (s.click) {
    await page.getByRole('button', { name: s.click }).first().click().catch((e) => errors.push(s.name + ' click ' + e.message));
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${out}${s.name}.png`, fullPage: !!s.full });
  console.log('shot', s.name);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
