/* site-check.mjs — verificador de los números compartidos del sitio. Sin dependencias.

     node tools/site-check.mjs

   Existe porque las cifras que el sitio repite (13.5 meses, 21,386 derechos,
   siete provincias…) están escritas a mano en varias páginas, en los dos
   idiomas y en las tarjetas OG. Las auditorías de 2026-08 encontraron el home
   diciendo 21,386 mientras /mineria/ todavía decía 19,671: esta guardia hace
   que eso no vuelva a pasar. La verdad canónica vive en tools/metrics.json —
   se actualiza ahí primero y esto señala cada archivo que quedó viejo. Los
   conteos del registro ciber tienen guardia propia (ciber-check.mjs): acá va
   lo que no sale de un dataset. */

import { readFile } from 'node:fs/promises'

const METRICS = 'tools/metrics.json'
const OG_CARDS = 'tools/og-cards.mjs'
const CIBER_JSON = 'static/data/ciber-incidentes.json'
const CIBER_PAGES = ['src/pages/ciber.es.html', 'src/pages/ciber.en.html']

let failures = 0
let warnings = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }
const warn = (msg) => { warnings++; console.warn(`  ~ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

const { metrics } = JSON.parse(await readFile(METRICS, 'utf8'))
const cache = new Map()
const text = async (f) => {
  if (!cache.has(f)) cache.set(f, await readFile(f, 'utf8'))
  return cache.get(f)
}

/* --- métricas en las páginas ------------------------------------------------ */

console.log('métricas (desde tools/metrics.json)')
for (const m of metrics) {
  for (const lang of ['es', 'en']) {
    const expected = m[lang]
    const other = lang === 'es' ? m.en : m.es
    for (const file of m.files[lang] ?? []) {
      const t = await text(file)
      if (t.includes(expected)) ok(`${file} dice "${expected}" — ${m.id}`)
      else fail(`${file} no dice "${expected}" — ${m.id} desactualizado`)
      /* Formato por idioma: si la métrica se escribe distinto en cada idioma,
         encontrar la variante ajena delata una página a medio traducir. */
      if (other !== expected && t.includes(other))
        fail(`${file} contiene "${other}" — es el formato del otro idioma (${m.id})`)
    }
  }
}

/* --- métricas en las tarjetas OG -------------------------------------------- */

console.log('\ntarjetas OG')
{
  const og = await text(OG_CARDS)
  for (const m of metrics) {
    if (!m.og) continue
    for (const lang of ['es', 'en']) {
      if (og.includes(m.og[lang])) ok(`${OG_CARDS} dice "${m.og[lang]}"`)
      else fail(`${OG_CARDS} no dice "${m.og[lang]}" — tarjeta OG desactualizada (regenerar PNGs al corregir)`)
    }
  }
}

/* --- el Dataset JSON-LD de /ciber/ ------------------------------------------ */
/* El dato del registro declara su fecha en "actualizado"; el Dataset de la
   página la repite en dateModified. Acá se exige que digan lo mismo. */

console.log('\nDataset de /ciber/')
{
  const { actualizado } = JSON.parse(await readFile(CIBER_JSON, 'utf8'))
  for (const file of CIBER_PAGES) {
    const t = await text(file)
    const rawMeta = t.match(/^\s*<!--meta\s*([\s\S]*?)-->/)
    if (!rawMeta) { fail(`${file}: no encuentro el bloque <!--meta>`); continue }
    const stamp = JSON.parse(rawMeta[1]).jsonld?.dateModified
    if (!stamp) warn(`${file}: sin Dataset JSON-LD todavía`)
    else if (stamp === actualizado) ok(`${file} dateModified = ${actualizado}`)
    else fail(`${file} dateModified "${stamp}" ≠ "${actualizado}" del JSON del registro`)
  }
}

/* --- veredicto --------------------------------------------------------------- */

console.log(
  `\n${failures ? `✗ ${failures} problema(s)` : '✓ sin problemas'}` +
  (warnings ? ` · ${warnings} aviso(s) para revisar a mano` : ''),
)
process.exit(failures ? 1 : 0)
