/* tools/ciber-maps.mjs — regenera los dos mapas inline de /ciber/. Sin dependencias.

     node tools/ciber-maps.mjs

   Escribe los bloques SVG entre los marcadores <!-- ciber-maps:ar --> y
   <!-- ciber-maps:world --> de src/pages/ciber.{es,en}.html, desde el dataset
   y la geometría pre-proyectada de static/data/geo/ (ver ciber-geo-build.mjs).
   Existe para que los dos idiomas no puedan divergir: la geometría es idéntica
   por construcción y solo cambian los textos, que salen del diccionario T.
   Correr después de tocar provincias o contexto_internacional en el dataset;
   ciber-check falla si el mapa y los datos no cuentan lo mismo. */

import { readFile, writeFile } from 'node:fs/promises'

const data = JSON.parse(await readFile('static/data/ciber-incidentes.json', 'utf8'))
const geoAr = JSON.parse(await readFile('static/data/geo/ar-provincias.paths.json', 'utf8'))
const geoW = JSON.parse(await readFile('static/data/geo/world-land.paths.json', 'utf8'))
const PAGES = { es: 'src/pages/ciber.es.html', en: 'src/pages/ciber.en.html' }

const T = {
  es: {
    incidente: (n) => (n === 1 ? '1 incidente' : `${n} incidentes`),
    arAria: 'Mapa de Argentina con el ancla territorial de cada incidente del registro',
    arCap: (caba, n) => `Dónde ancla cada incidente. Un ciberincidente no tiene provincia: el punto es la sede de los sistemas afectados, casi siempre administrativos, no la huella de la organización. Que ${caba} de ${n} anclen en CABA es el hallazgo de la capa administrativa, no geografía del riesgo. El criterio de cada fila está en el campo <span class="path">provincias</span> del archivo de datos.`,
    wAria: 'Mapamundi con los casos del contexto internacional',
    wCap: (n) => `Los ${n} casos del contexto, sobre el mapa. Cada punto lleva a su fila; la forma dice quién ataca.`,
    keyCriminal: 'crimen económico', keyEstatal: 'operación estatal', keyNn: 'sin atribuir',
  },
  en: {
    incidente: (n) => (n === 1 ? '1 incident' : `${n} incidents`),
    arAria: 'Map of Argentina with the territorial anchor of each incident in the register',
    arCap: (caba, n) => `Where each incident anchors. A cyber incident has no province: the dot is the seat of the affected systems, almost always administrative, not the organization's footprint. That ${caba} of ${n} anchor in Buenos Aires City is the administrative-layer finding, not risk geography. Each row's criterion sits in the <span class="path">provincias</span> field of the data file.`,
    wAria: 'World map with the international context cases',
    wCap: (n) => `The ${n} context cases, on the map. Each dot leads to its row; the shape says who attacks.`,
    keyCriminal: 'economic crime', keyEstatal: 'state operation', keyNn: 'unattributed',
  },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const shortOrg = (org) => org.replace(/\s*\(.*\)\s*$/, '')

/* --- Argentina -------------------------------------------------------------- */

const porProv = new Map()
for (const i of data.incidentes) {
  const p = i.provincias[0]
  if (!porProv.has(p)) porProv.set(p, [])
  porProv.get(p).push(i)
}

function mapaAr(lang) {
  const t = T[lang]
  const land = Object.entries(geoAr.provincias)
    .map(([slug, p]) => `<path class="map-prov" data-prov-path="${slug}" d="${p.path}"/>`)
    .join('')

  let leader = ''
  const dots = [...porProv.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([slug, rows]) => {
      const p = geoAr.provincias[slug]
      if (!p) throw new Error(`provincia sin geometría: ${slug}`)
      const [dx, dy] = p.dot ?? [p.cx, p.cy]
      if (p.dot) leader += `<line class="map-leader" x1="${p.cx}" y1="${p.cy}" x2="${dx}" y2="${dy}"/>`
      const n = rows.length
      const r = Math.round(Math.max(10, 8 * Math.sqrt(n)))
      const href = n === 1 ? `#${rows[0].id}` : '#registro'
      const label = `${p.nombre}: ${t.incidente(n)}`
      return `<a class="map-dot" href="${href}" data-prov="${slug}" data-n="${n}" aria-label="${esc(label)}">` +
        `<circle class="dot" cx="${dx}" cy="${dy}" r="${r}"/>` +
        `<text class="dot-n" x="${dx}" y="${dy}">${n}</text>` +
        `</a>`
    }).join('\n      ')

  const lista = [...porProv.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([slug, rows]) => {
      const links = rows.map((i) => `<a href="#${i.id}">${esc(shortOrg(i.org))}</a>`).join(', ')
      return `<li><span class="map-list-prov">${esc(geoAr.provincias[slug].nombre)} · ${rows.length}</span> ${links}</li>`
    }).join('\n    ')

  const caba = porProv.get('caba')?.length ?? 0
  return `
<figure class="mapa mapa--ar">
  <svg viewBox="${geoAr.viewBox}" role="img" aria-label="${esc(t.arAria)}">
    <g class="map-land">${land}</g>
    ${leader}
      ${dots}
  </svg>
  <figcaption>${t.arCap(caba, data.incidentes.length)}</figcaption>
</figure>
<ul class="map-list">
    ${lista}
</ul>
`
}

/* --- Mundo ------------------------------------------------------------------ */

function mapaWorld(lang) {
  const t = T[lang]
  const casos = data.contexto_internacional ?? []
  const dots = casos.map((c) => {
    const pos = geoW.casos[c.id] ?? geoW.paises[c.pais]
    if (!pos) throw new Error(`caso sin ancla: ${c.id} (${c.pais}) — correr ciber-geo-build`)
    const [x, y] = pos
    const year = c.fecha_publica.slice(0, 4)
    const label = `${shortOrg(c.org)}, ${year}`
    const clase = c.actor_tipo === 'estatal' ? 'estatal' : c.actor_tipo === 'desconocido' ? 'nn' : 'criminal'
    const mark = clase === 'estatal'
      ? `<rect class="dot dot--estatal" x="${x - 7}" y="${y - 7}" width="14" height="14"/>`
      : `<circle class="dot dot--${clase}" cx="${x}" cy="${y}" r="8"/>`
    return `<a class="map-dot" href="#${c.id}" data-pais="${c.pais}" aria-label="${esc(label)}">` + mark +
      `<g class="tip" aria-hidden="true"><text x="${Math.min(Math.max(x, 90), Number(geoW.viewBox.split(' ')[2]) - 90)}" y="${Math.max(y - 16, 18)}">${esc(label)}</text></g>` +
      `</a>`
  }).join('\n      ')

  return `
<figure class="mapa mapa--world">
  <svg viewBox="${geoW.viewBox}" role="img" aria-label="${esc(t.wAria)}">
    <path class="map-land-path" d="${geoW.land}"/>
      ${dots}
  </svg>
  <figcaption>${t.wCap(casos.length)}</figcaption>
</figure>
<p class="map-key"><span class="key key--criminal" aria-hidden="true"></span> ${t.keyCriminal} · <span class="key key--estatal" aria-hidden="true"></span> ${t.keyEstatal} · <span class="key key--nn" aria-hidden="true"></span> ${t.keyNn}</p>
`
}

/* --- reemplazo entre marcadores --------------------------------------------- */

let wrote = 0
for (const [lang, file] of Object.entries(PAGES)) {
  let html = await readFile(file, 'utf8')
  for (const [name, build] of [['ar', mapaAr], ['world', mapaWorld]]) {
    const re = new RegExp(`(<!-- ciber-maps:${name} -->)[\\s\\S]*?(<!-- /ciber-maps:${name} -->)`)
    if (!re.test(html)) { console.error(`✗ ${file}: falta el marcador ciber-maps:${name}`); process.exit(1) }
    html = html.replace(re, `$1${build(lang)}$2`)
  }
  await writeFile(file, html)
  wrote++
  console.log(`✓ ${file}: mapas regenerados`)
}
if (wrote !== 2) process.exit(1)
