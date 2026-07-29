/* tools/shots.mjs — captures the 15 project screenshots for the case cards.
   Re-run whenever a project's landing view changes.

   Usage:
     SHOTS_MODULES_DIR=/path/with/node_modules node tools/shots.mjs [slug ...]
   Needs: playwright-core (+ a chromium binary, see EXEC below) and sharp.
   Output: static/assets/shots/<slug>.webp — 1600×1000, WebP q80, ≤~150 KB each. */

import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const MODULES = process.env.SHOTS_MODULES_DIR || process.cwd();
const require = createRequire(join(MODULES, 'x.js'));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const EXEC = process.env.SHOTS_CHROMIUM ||
  join(process.env.HOME, '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'assets', 'shots');
mkdirSync(OUT, { recursive: true });

// slug -> [url, settle(ms), toFigure] ; settle covers map tiles / 3D globes.
// toFigure: text-heavy docs sites — scroll to the first large figure/map so the
// shot shows a visual, not a wall of text.
const SITES = [
  ['estado-red-gas',            'https://mpodeley.github.io/estado-red-gas/',            3000, false],
  ['simulador-subastas-peru',       'https://mpodeley.github.io/simulador-subastas-peru/',       3000, false],
  ['gasoductos',                    'https://gasoductos.podeley.ar',                             6000, false],
  ['vaca-muerta-insar',             'https://mpodeley.github.io/vaca-muerta-insar/',             6000, true],
  ['vaca-muerta-nightlights',       'https://mpodeley.github.io/vaca-muerta-nightlights/',       3000, false],
  ['vaca-muerta-emisiones',         'https://mpodeley.github.io/vaca-muerta-emisiones/',         3000, true],
  ['litio-subsidencia',                   'https://mpodeley.github.io/litio-subsidencia/',                   3000, true],
  ['mineria-dem',                   'https://mpodeley.github.io/mineria-dem/',                   6000, true],
  ['rinconada-espectrometria',      'https://mpodeley.github.io/rinconada-espectrometria/',      3000, true],
  ['assembled-thought',             'https://mpodeley.github.io/assembled-thought/',             3000, false],
  ['interpretabilidad-mecanicista', 'https://mpodeley.github.io/interpretabilidad-mecanicista/', 3000, false],
  ['jspace-qwen',                   'https://mpodeley.github.io/jspace-qwen/',                   3000, true],
  ['pozos-neuquina',                'https://mpodeley.github.io/pozos-neuquina/',                3000, false],
  ['ep-americas',                   'https://mpodeley.github.io/ep-americas/',                   3000, false],
  ['neuquina',                      'https://neuquina.podeley.ar',                               6000, false],
  // Tier-0 choropleth paints on load; 6 s covers IGN tiles + agregados.json.
  ['catastro-minero-argentina',     'https://mpodeley.github.io/catastro-minero-argentina/',    6000, false],
];

// Walk the page (triggers lazy loads), then center the LARGEST visual
// (img/iframe/canvas) so the shot shows a figure or map, not prose.
async function scrollToFigure(page) {
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < Math.min(h, 24000); y += 800) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
  const found = await page.evaluate(() => {
    let best = null, bestArea = 0;
    for (const el of document.querySelectorAll('img, iframe, canvas')) {
      const w = el.clientWidth, h = el.clientHeight;
      if (w >= 500 && h >= 300 && w * h > bestArea) { bestArea = w * h; best = el; }
    }
    if (!best) return false;
    best.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  });
  if (found) await page.waitForTimeout(2000); // figure decode / map tiles
  return found;
}

// Landing page is pure prose? Hunt the nav's subpages for the biggest visual.
async function findBestSubpage(page) {
  const links = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('nav a[href], .md-nav a[href]')) {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        if (/paper|pdf/i.test(u.pathname)) continue;   // skip embedded-PDF pages
        if (u.origin === location.origin && !u.hash && u.href !== location.href && !out.includes(u.href)) out.push(u.href);
      } catch {}
    }
    return out.slice(0, 10);
  });
  let best = null;
  for (const href of links) {
    try {
      await page.goto(href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);
      await page.evaluate(async () => {           // trigger lazy loads
        const h = document.body.scrollHeight;
        for (let y = 0; y < Math.min(h, 24000); y += 800) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 100));
        }
      });
      const area = await page.evaluate(() => {
        let m = 0;
        for (const el of document.querySelectorAll('img, iframe, canvas'))
          if (el.clientWidth >= 500 && el.clientHeight >= 300) m = Math.max(m, el.clientWidth * el.clientHeight);
        return m;
      });
      if (area > 0 && (!best || area > best.area)) best = { href, area };
    } catch {}
  }
  return best;
}

const only = process.argv.slice(2);   // optional slugs to re-capture
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--hide-scrollbars'] });
let fail = 0;
for (const [slug, url, settle, toFigure] of SITES) {
  if (only.length && !only.includes(slug)) continue;
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },   // 16:10 — no crop math needed
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',                  // reproducible shots
      colorScheme: 'dark',                      // his sites are dark-canonical
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(settle);
    if (toFigure) {
      let ok = await scrollToFigure(page);
      if (!ok) {
        const best = await findBestSubpage(page);
        if (best) {
          await page.goto(best.href, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(settle);
          ok = await scrollToFigure(page);
        }
      }
      if (!ok) console.warn(`     (${slug}: no large figure found — landing shot)`);
    }
    const png = await page.screenshot({ type: 'png' });   // 2880×1800
    await ctx.close();
    const out = join(OUT, `${slug}.webp`);
    await sharp(png).resize(1600, 1000).webp({ quality: 80 }).toFile(out);
    const kb = Math.round((await sharp(out).metadata().then(() => require('fs').statSync(out).size)) / 1024);
    console.log(`ok   ${slug}.webp  ${kb} KB`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${slug}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
console.log(fail ? `${fail} failures` : 'all shots captured');
process.exit(fail ? 1 : 0);
