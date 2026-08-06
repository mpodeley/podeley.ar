/* tools/cv-pdf.mjs — imprime el CV de raw/ a PDF en static/assets/.

   Uso:
     npm run cv                    los dos idiomas
     node tools/cv-pdf.mjs es      uno solo

   Los HTML fuente viven en raw/ (gitignoreado); lo publicable es el PDF. No necesita
   playwright-core: llama directo al binario de chromium, igual que los banners del kit.
   Se puede apuntar a otro con CV_CHROMIUM. */

import { execFileSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME = process.env.CV_CHROMIUM ||
  join(process.env.HOME, '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome');

const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ['es', 'en'];

if (!existsSync(CHROME)) {
  console.error(`No está el chromium en ${CHROME}. Apuntá a otro con CV_CHROMIUM.`);
  process.exit(1);
}

for (const lang of LANGS) {
  const src = join(ROOT, 'raw', `cv-${lang}.html`);
  const out = join(ROOT, 'static', 'assets', `cv-matias-podeley-${lang}.pdf`);

  if (!existsSync(src)) {
    console.error(`Falta ${src}`);
    process.exit(1);
  }

  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${out}`,
    `file://${src}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const kb = Math.round(statSync(out).size / 1024);
  console.log(`cv-matias-podeley-${lang}.pdf · ${kb} kB`);
}
