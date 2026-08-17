/* og-cards.mjs — genera las tarjetas de preview de 1200 × 630.

   Una sola og:image para todo el sitio hace que compartir /ep/ y /mineria/ se
   vea igual en WhatsApp y en LinkedIn, que es donde se decide el click. Cada
   página declara la suya en el bloque <!--meta> con "ogImage".

   Las fuentes van embebidas en base64 porque la página se renderiza con
   setContent y no tiene origen desde donde resolver rutas relativas.

   Necesita playwright-core y chromium, que no están en el node_modules de este
   repo. Igual que shots.mjs:

     SHOTS_MODULES_DIR=/ruta/con/node_modules \
     CHROME=$HOME/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome \
     node tools/og-cards.mjs
*/

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = process.cwd()
const OUT = join(ROOT, 'static/assets/og')

const require = createRequire(
  process.env.SHOTS_MODULES_DIR ? join(process.env.SHOTS_MODULES_DIR, 'noop.js') : import.meta.url,
)
const { chromium } = require('playwright-core')

/* La cifra es el gancho; la línea de abajo dice de qué es. El home y las dos
   páginas que no tienen un número al frente abren por la frase. */
const CARDS = [
  { slug: 'home', lang: 'es', eyebrow: 'Matías Podeley · Buenos Aires',
    title: 'Ingeniería, datos e IA para energía y minería' },
  { slug: 'home', lang: 'en', eyebrow: 'Matías Podeley · Buenos Aires',
    title: 'Engineering, data, and AI for energy and mining' },

  { slug: 'casos', lang: 'es', eyebrow: 'Casos · Energía y minería',
    title: 'Todo lo publicado, en una página' },
  { slug: 'casos', lang: 'en', eyebrow: 'Cases · Energy & mining',
    title: 'Everything published, on one page' },

  { slug: 'ep', lang: 'es', eyebrow: 'E&P · Cuenca Neuquina', fig: '13.5 meses',
    title: 'de anticipo sobre el registro oficial de actividad' },
  { slug: 'ep', lang: 'en', eyebrow: 'E&P · Neuquén basin', fig: '13.5 months',
    title: 'ahead of the official activity registry' },

  { slug: 'mineria', lang: 'es', eyebrow: 'Minería · Catastro y exploración', fig: '21,386 derechos',
    title: 'de siete provincias, unificados en un solo mapa' },
  { slug: 'mineria', lang: 'en', eyebrow: 'Mining · Title and exploration', fig: '21,386 claims',
    title: 'from seven provinces, merged into a single map' },

  { slug: 'energia', lang: 'es', eyebrow: 'Gas y energía · Mesas y comercialización', fig: 'Mes a mes',
    title: 'la red nacional de transporte de gas, tramo por tramo' },
  { slug: 'energia', lang: 'en', eyebrow: 'Gas & power · Trading desks', fig: 'Month by month',
    title: "Argentina's gas transport grid, segment by segment" },

  { slug: 'ciber', lang: 'es', eyebrow: 'Registro sectorial · Infraestructura crítica argentina', fig: '7 de 14',
    title: 'incidentes que se conocen solo porque el atacante los publicó' },
  { slug: 'ciber', lang: 'en', eyebrow: 'Sector register · Argentine critical infrastructure', fig: '7 of 14',
    title: 'incidents known only because the attacker published them' },

  { slug: 'isac', lang: 'es', eyebrow: 'Memo · Ciberdefensa sectorial · Energía argentina', fig: 'Cuatro firmas',
    title: 'pagan el primer año de un CERT sectorial de energía' },
  { slug: 'isac', lang: 'en', eyebrow: 'Memo · Sector cyber defense · Argentine energy', fig: 'Four signatures',
    title: 'pay for year one of a sector energy CERT' },

  { slug: 'rigi', lang: 'es', eyebrow: 'Registro RIGI · Grandes inversiones', fig: 'Veintiuno',
    title: 'proyectos aprobados, y la web oficial informa dieciséis' },
  { slug: 'rigi', lang: 'en', eyebrow: 'RIGI registry · Large investments', fig: 'Twenty-one',
    title: 'projects approved, while the official site lists sixteen' },

  { slug: 'trabajo', lang: 'es', eyebrow: 'Cómo trabajo · Petróleo, gas y minería',
    title: 'Consulta, proyecto o dirección técnica' },
  { slug: 'trabajo', lang: 'en', eyebrow: 'How I work · Oil, gas & mining',
    title: 'Consult, project, or technical direction' },

  { slug: 'cto', lang: 'es', eyebrow: 'CTO · Petróleo, gas y minería',
    title: 'Dirección de tecnología con dedicación parcial' },
  { slug: 'cto', lang: 'en', eyebrow: 'CTO · Oil, gas & mining',
    title: 'Part-time technology leadership' },

  { slug: 'research', lang: 'es', eyebrow: 'Seguridad de IA · Interpretabilidad',
    title: 'Interpretabilidad mecanicista, publicada con sus nulos' },
  { slug: 'research', lang: 'en', eyebrow: 'AI safety · Interpretability',
    title: 'Mechanistic interpretability, published with its null results' },

  { slug: 'perfil', lang: 'es', eyebrow: 'Perfil · Reservorios, proyectos e IA aplicada',
    title: 'Ingeniería de reservorios, proyectos, datos e IA' },
  { slug: 'perfil', lang: 'en', eyebrow: 'Profile · Reservoirs, projects and applied AI',
    title: 'Reservoir engineering, projects, data, and AI' },
]

const b64 = async (p) => (await readFile(join(ROOT, 'static/fonts', p))).toString('base64')
const [grotesk, plex, mono] = await Promise.all([
  b64('space-grotesk-500.woff2'), b64('ibm-plex-sans-400.woff2'), b64('ibm-plex-mono-500.woff2'),
])

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const html = (c) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:G;src:url(data:font/woff2;base64,${grotesk}) format('woff2')}
@font-face{font-family:P;src:url(data:font/woff2;base64,${plex}) format('woff2')}
@font-face{font-family:M;src:url(data:font/woff2;base64,${mono}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fbfbfa;color:#17181b;
  font-family:P,sans-serif;display:flex;flex-direction:column;
  justify-content:space-between;padding:72px 80px}
.brand{display:flex;align-items:center;gap:16px}
.brand svg{width:52px;height:52px;display:block}
.brand span{font-family:G;font-size:30px;letter-spacing:-.01em}
.eyebrow{font-family:M;font-size:19px;letter-spacing:.1em;text-transform:uppercase;color:#6d7076;margin-top:38px}
.fig{font-family:G;font-size:78px;line-height:1.05;letter-spacing:-.02em;margin-top:18px;color:#c24b22}
.title{font-family:G;font-size:${c.fig ? 40 : 60}px;line-height:1.14;letter-spacing:-.015em;
  margin-top:${c.fig ? 14 : 20}px;max-width:${c.fig ? 20 : 17}ch;color:#17181b}
.foot{display:flex;justify-content:space-between;align-items:flex-end}
.bar{width:120px;height:7px;background:#c24b22}
.dom{font-family:M;font-size:22px;color:#c24b22}
</style>
<div>
  <div class="brand">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="12" fill="#0f1012"/>
      <path d="M15 47 V21 L32 37 L49 21 V47" fill="none" stroke="#f4f4f2" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="15" cy="21" r="3" fill="#4EA8DE"/><circle cx="49" cy="21" r="3" fill="#FF7B54"/>
      <circle cx="32" cy="37" r="3" fill="#F2C14E"/><circle cx="15" cy="47" r="3" fill="#43C59E"/>
    </svg>
    <span>Matías Podeley</span>
  </div>
  <p class="eyebrow">${esc(c.eyebrow)}</p>
  ${c.fig ? `<p class="fig">${esc(c.fig)}</p>` : ''}
  <p class="title">${esc(c.title)}</p>
</div>
<div class="foot"><div class="bar"></div><div class="dom">podeley.ar</div></div>`

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })

for (const c of CARDS) {
  await page.setContent(html(c), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const name = `${c.slug}.${c.lang}.png`
  await page.screenshot({ path: join(OUT, name) })
  console.log(`  ${name}`)
}

await browser.close()
console.log(`${CARDS.length} tarjetas → static/assets/og/`)
