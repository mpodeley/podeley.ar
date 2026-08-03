/* postbuild.mjs — lo que el kit no hace, parcheado sobre dist/. Sin dependencias.

   Corre después de build.mjs (npm run build lo encadena) y escribe solo adentro
   de dist/:

     1. <lastmod> en el sitemap — fecha del último commit de cada página fuente
        (git %cs, fecha sola: el ISO completo arrastra husos por commit y el
        máximo por string mentiría). El kit vendoreado emite solo <loc> y acá
        no se edita.
     2. dist/ciber/feed.xml — feed Atom del registro de ciberincidentes,
        generado del JSON. Todas las fechas salen del dato, nunca del reloj:
        dos builds del mismo commit son byte-idénticos.
     3. El <link> de autodiscovery del feed en las dos páginas /ciber/.

   Si git falla o no conoce el archivo (clone raso, página nueva sin commit),
   el lastmod se omite — no se inventa. */

import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const REGISTRY = 'static/data/ciber-incidentes.json'

const { origin } = JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'))

/* --- 1. lastmod en el sitemap ---------------------------------------------- */

const gitDate = (file) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch { return null }
}

/* La URL deshace lo que urlFor() hizo: idioma default en la raíz, el resto
   bajo /<lang>/. Un slug vacío es el index. */
const srcFor = (loc) => {
  let path = loc.slice(origin.length)
  let lang = 'es'
  if (path.startsWith('/en/')) { lang = 'en'; path = path.slice(3) }
  const slug = path.replaceAll('/', '') || 'index'
  return { file: `src/pages/${slug}.${lang}.html`, slug }
}

const registryDate = gitDate(REGISTRY)
const sitemapPath = join(DIST, 'sitemap.xml')
let stamped = 0
const sitemap = (await readFile(sitemapPath, 'utf8')).replace(
  /^(  <url><loc>(.*?)<\/loc>)(<\/url>)$/gm,
  (line, head, loc, tail) => {
    const { file, slug } = srcFor(loc)
    let date = gitDate(file)
    if (slug === 'ciber' && registryDate && (!date || registryDate > date)) date = registryDate
    if (!date) return line
    stamped++
    return `${head}<lastmod>${date}</lastmod>${tail}`
  },
)
await writeFile(sitemapPath, sitemap)
console.log(`  sitemap.xml               ← lastmod en ${stamped} URLs`)

/* --- 2. feed Atom del registro ciber ---------------------------------------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const data = JSON.parse(await readFile(join(ROOT, REGISTRY), 'utf8'))
const FEED_URL = `${origin}/ciber/feed.xml`
const PAGE_URL = `${origin}/ciber/`
const day = (d) => `${d}T00:00:00Z`

/* Una corrección sobre una fila bumpea su entry — el suscriptor la ve volver
   como no leída — en vez de sumar entries de ruido. correcciones[].fila puede
   apuntar al contexto internacional; por eso se matchea contra el id propio. */
const entries = data.incidentes
  .map((row) => {
    const fixes = data.correcciones.filter((c) => c.fila === row.id).map((c) => c.fecha)
    const updated = [row.fecha_publica, ...fixes].sort().at(-1)
    const summary =
      `Canal: ${row.canal_divulgacion} · Confianza: ${row.confianza}. ` +
      (row.nota ?? row.sistemas_segun_empresa)
    return { row, updated, summary }
  })
  .sort((a, b) => b.updated.localeCompare(a.updated) || b.row.id.localeCompare(a.row.id))

const feed = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<feed xmlns="http://www.w3.org/2005/Atom">',
  `  <id>${FEED_URL}</id>`,
  `  <title>${esc(data.titulo)}</title>`,
  `  <updated>${day(data.actualizado)}</updated>`,
  `  <link rel="self" type="application/atom+xml" href="${FEED_URL}"/>`,
  `  <link rel="alternate" type="text/html" href="${PAGE_URL}"/>`,
  '  <author><name>Matías Podeley</name></author>',
  `  <rights>${esc(data.licencia)}</rights>`,
  ...entries.flatMap(({ row, updated, summary }) => [
    '  <entry>',
    `    <id>${PAGE_URL}#${row.id}</id>`,
    `    <title>${esc(row.actor ? `${row.org} — ${row.actor}` : row.org)}</title>`,
    `    <link rel="alternate" type="text/html" href="${PAGE_URL}"/>`,
    `    <published>${day(row.fecha_publica)}</published>`,
    `    <updated>${day(updated)}</updated>`,
    `    <summary>${esc(summary)}</summary>`,
    '  </entry>',
  ]),
  '</feed>',
  '',
].join('\n')
await writeFile(join(DIST, 'ciber', 'feed.xml'), feed)
console.log(`  ciber/feed.xml            ← ${entries.length} incidentes, actualizado ${data.actualizado}`)

/* --- 3. autodiscovery en las páginas /ciber/ -------------------------------- */

const LINKS = {
  'ciber/index.html':
    `<link rel="alternate" type="application/atom+xml" title="Registro ciber — novedades" href="${FEED_URL}">`,
  'en/ciber/index.html':
    `<link rel="alternate" type="application/atom+xml" title="Cyber registry — updates" href="${FEED_URL}">`,
}
for (const [rel, link] of Object.entries(LINKS)) {
  const p = join(DIST, rel)
  const html = await readFile(p, 'utf8')
  if (html.includes('application/atom+xml')) continue
  if (!html.includes('</head>')) throw new Error(`${rel}: no encuentro </head>`)
  await writeFile(p, html.replace('</head>', `${link}\n</head>`))
  console.log(`  ${rel.padEnd(24)}  ← autodiscovery del feed`)
}
