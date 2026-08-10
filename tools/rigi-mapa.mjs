/* rigi-mapa.mjs — regenera el mapa inline de /rigi/. Sin dependencias.

     node tools/rigi-mapa.mjs

   Escribe el bloque entre <!-- rigi-mapa --> y <!-- /rigi-mapa --> de
   src/pages/rigi.{es,en}.html desde el dataset y la geometría pre-proyectada
   de static/data/geo/ar-provincias.paths.json, la misma que usan los mapas
   de /ciber/. Existe por lo mismo que rigi-tablas: los dos idiomas no pueden
   divergir, y un punto no se ubica dos veces a mano.

   La geometría de las provincias viene proyectada en píxeles, pero las anclas
   de los proyectos viven en lon/lat (campo est_ubicacion del dataset). Acá se
   reimplementa la proyección de ciber-geo-build (transversal de Mercator
   rotada 64° oeste) y se calibra escala y traslación contra dos cosas que el
   archivo de geometría ya trae: el punto real de CABA, que ciber-geo-build
   proyecta exacto, y el alto en píxeles del país completo contra los extremos
   geográficos norte y sur de Argentina. Antes de escribir nada, cada ancla se
   verifica por point-in-polygon contra el polígono de su provincia; si una
   cae afuera, esto falla ruidosamente y no se publica un punto corrido. */

import { readFile, writeFile } from 'node:fs/promises'

const REGISTRY = 'static/data/rigi-proyectos.json'
const GEO = 'static/data/geo/ar-provincias.paths.json'
const PAGES = { es: 'src/pages/rigi.es.html', en: 'src/pages/rigi.en.html' }

const data = JSON.parse(await readFile(REGISTRY, 'utf8'))
const geo = JSON.parse(await readFile(GEO, 'utf8'))

/* --- proyección -------------------------------------------------------------
   d3.geoTransverseMercator().rotate([64, 0]) equivale a rotar la esfera
   [64, 0, 90] y aplicar el raw de Mercator. La escala k y la traslación
   (tx, ty) que d3 resolvió con fitExtent se recuperan por calibración. */

const RAD = Math.PI / 180

function rawProject(lon, lat) {
  const l1 = (lon + 64) * RAD
  const phi = lat * RAD
  const cosphi = Math.cos(phi)
  const x = Math.cos(l1) * cosphi
  const y = Math.sin(l1) * cosphi
  const z = Math.sin(phi)
  const l2 = Math.atan2(-z, x)
  const p2 = Math.asin(y)
  return [Math.log(Math.tan(Math.PI / 4 + p2 / 2)), -l2]
}

/* Extremos geográficos del continente argentino: el hito norte en la frontera
   jujeña con Bolivia y el cabo San Pío en Tierra del Fuego. Fijan la escala
   vertical; CABA, que el archivo trae proyectada exacta, fija la traslación. */
const NORTE = [-66.22, -21.78]
const SUR = [-66.52, -55.06]
const CABA_LL = [-58.44, -34.61]

/* --- geometría publicada ----------------------------------------------------- */

const provs = {}
for (const [slug, p] of Object.entries(geo.provincias)) {
  const rings = p.path
    .split('Z')
    .filter((s) => s.trim())
    .map((seg) => seg.replace(/^M/, '').split('L').map((pt) => pt.split(',').map(Number)))
  provs[slug] = { nombre: p.nombre, rings }
}

let ymin = Infinity, ymax = -Infinity
for (const p of Object.values(provs)) {
  for (const ring of p.rings) for (const [, y] of ring) { if (y < ymin) ymin = y; if (y > ymax) ymax = y }
}

const [, Yn] = rawProject(...NORTE)
const [, Ys] = rawProject(...SUR)
const k = (ymax - ymin) / (Yn - Ys)
const [Xc, Yc] = rawProject(...CABA_LL)
const tx = geo.provincias.caba.cx - k * Xc
const ty = geo.provincias.caba.cy + k * Yc

const project = (lon, lat) => {
  const [X, Y] = rawProject(lon, lat)
  return [k * X + tx, ty - k * Y]
}

/* --- verificación ------------------------------------------------------------ */

function inside(pt, rings) {
  let inn = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inn = !inn
    }
  }
  return inn
}

function distToProv(pt, rings) {
  let d2 = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]
      const [x2, y2] = ring[i]
      const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
      let t = l2 ? ((pt[0] - x1) * (x2 - x1) + (pt[1] - y1) * (y2 - y1)) / l2 : 0
      t = Math.max(0, Math.min(1, t))
      d2 = Math.min(d2, (pt[0] - (x1 + t * (x2 - x1))) ** 2 + (pt[1] - (y1 + t * (y2 - y1))) ** 2)
    }
  }
  return Math.sqrt(d2)
}

/* Capitales de provincia: si la calibración anda, cada una cae en su polígono. */
const CAPITALES = [
  [-68.85, -32.89, 'mendoza'], [-68.06, -38.95, 'neuquen'], [-68.54, -31.54, 'san-juan'],
  [-64.19, -31.42, 'cordoba'], [-60.64, -32.95, 'santa-fe'], [-57.95, -34.92, 'buenos-aires'],
  [-62.27, -38.72, 'buenos-aires'], [-65.21, -26.83, 'tucuman'], [-65.42, -24.79, 'salta'],
  [-65.3, -24.19, 'jujuy'], [-55.9, -27.37, 'misiones'], [-58.99, -27.45, 'chaco'],
  [-58.17, -26.18, 'formosa'], [-64.29, -36.62, 'la-pampa'], [-63.0, -40.81, 'rio-negro'],
  [-65.1, -43.3, 'chubut'], [-69.22, -51.62, 'santa-cruz'], [-68.3, -54.8, 'tierra-del-fuego'],
  [-66.86, -29.41, 'la-rioja'], [-65.78, -28.47, 'catamarca'], [-64.26, -27.78, 'santiago-del-estero'],
  [-60.52, -31.73, 'entre-rios'], [-66.34, -33.3, 'san-luis'], [-58.83, -27.47, 'corrientes'],
]

/* Varias capitales están sobre el borde mismo de su provincia (la confluencia,
   la costa) y la geometría viene simplificada: se toleran 2.5 px de margen. */
const falladas = CAPITALES.filter(([lon, lat, slug]) =>
  !inside(project(lon, lat), provs[slug].rings) && distToProv(project(lon, lat), provs[slug].rings) > 2.5)
if (falladas.length > 0) {
  console.error(`✗ calibración de la proyección: ${falladas.length} capitales fuera de su provincia`)
  for (const [lon, lat, slug] of falladas) console.error(`  ${slug}: ${project(lon, lat).map(Math.round)}`)
  process.exit(1)
}

const slugProv = (nombre) =>
  nombre === 'Ciudad de Buenos Aires' ? 'caba'
    : nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')

const aprobados = data.proyectos.filter((p) => p.estado === 'aprobado')

let anclasMal = 0
for (const p of aprobados) {
  const u = p.est_ubicacion
  if (!u) { console.error(`✗ ${p.id}: aprobado sin est_ubicacion`); anclasMal++; continue }
  const slugs = p.provincias.map(slugProv)
  const pts = u.puntos.map(([lon, lat]) => project(lon, lat))
  if (u.precision === 'offshore') {
    const cerca = slugs.some((s) => distToProv(pts[0], provs[s].rings) < 25)
    if (!cerca) { console.error(`✗ ${p.id}: el ancla offshore quedó lejos de ${slugs.join(', ')}`); anclasMal++ }
  } else if (u.precision === 'traza') {
    for (const [i, pt] of [pts[0], pts[pts.length - 1]].entries()) {
      const ok = slugs.some((s) => inside(pt, provs[s].rings) || distToProv(pt, provs[s].rings) < 6) ||
        Object.values(provs).some((pr) => inside(pt, pr.rings))
      if (!ok) { console.error(`✗ ${p.id}: la cabecera ${i} de la traza cae fuera del país`); anclasMal++ }
    }
  } else {
    const ok = slugs.some((s) => inside(pts[0], provs[s].rings)) ||
      slugs.some((s) => distToProv(pts[0], provs[s].rings) < 6)
    if (!ok) { console.error(`✗ ${p.id}: el ancla cae fuera de ${slugs.join(', ')} (${pts[0].map(Math.round)})`); anclasMal++ }
  }
}
if (anclasMal) process.exit(1)
console.log(`✓ proyección calibrada (k=${k.toFixed(1)}) y ${aprobados.length} anclas verificadas contra sus provincias`)

/* --- textos ------------------------------------------------------------------ */

const SECTOR_EN = {
  'Minería': 'Mining', 'Petróleo y Gas': 'Oil & gas', 'Energía': 'Power',
  'Siderurgia': 'Steel', 'Infraestructura': 'Infrastructure',
}

/* Cuatro clases de color, no cinco: siderurgia e infraestructura tienen un
   proyecto cada una y comparten clase. Esa clase va en cuadrado, para que su
   identidad no dependa sólo del color; el tooltip y la lista conservan el
   sector exacto. La paleta está validada (CVD y contraste) contra el tema
   claro del sitio; ver el bloque del mapa en site.css. */
const GRUPOS = [
  { slug: 'mineria', sectores: ['Minería'], es: 'Minería', en: 'Mining' },
  { slug: 'petroleo-y-gas', sectores: ['Petróleo y Gas'], es: 'Petróleo y Gas', en: 'Oil & gas' },
  { slug: 'energia', sectores: ['Energía'], es: 'Energía', en: 'Power' },
  { slug: 'otros', sectores: ['Siderurgia', 'Infraestructura'], es: 'Siderurgia e infraestructura', en: 'Steel & infrastructure' },
]

/* Nombre corto para el tooltip y la lista: el de tabla no entra en un mapa. */
const CORTO = {
  'luz-del-campo-el-quemado': 'Parque Solar El Quemado',
  'vmos-oleoducto-sur': 'Oleoducto VMOS',
  'southern-energy-gnl': 'Licuefacción Southern Energy',
  'rincon-mining': 'Rincón',
  'sidersa-aceria': 'Sidersa',
  'gear-olavarria': 'P.E. Olavarría',
  'galan-hombre-muerto-oeste': 'Hombre Muerto Oeste',
  'acm-los-azules': 'Los Azules',
  'terminal-timbues': 'Terminal Timbúes',
  'masa-carbonatos-profundos': 'Carbonatos Profundos',
  'mas-veladero-fases-8-9': 'Veladero Fases 8 y 9',
  'mdasd-fenix-fase-1b': 'Fénix Fase 1B',
  'pacific-rim-diablillos': 'Diablillos',
  'tgs-gpm-tramo-1': 'Ampliación GPM Tramo I',
  'minera-san-jorge-cobre-mendocino': 'PSJ Cobre Mendocino',
  'exar-cauchari-olaroz': 'Cauchari Olaroz',
  'smp-gasoducto-exportacion': 'Gasoducto San Matías',
  'pampa-rincon-de-aranda': 'Rincón de Aranda',
  'liex-tres-quebradas': 'Tres Quebradas (3Q)',
  'vicuna-argentina': 'Vicuña',
  'posco-sal-de-oro-ii': 'Sal de Oro II',
}

const T = {
  es: {
    aria: 'Mapa de Argentina con el ancla estimada de cada proyecto aprobado en el RIGI',
    cap: 'Cada punto es el ancla estimada del proyecto: la mina, la planta o el salar que nombra la resolución, con el área en proporción al monto comprometido. Las obras lineales llevan su traza simplificada entre cabeceras, y el gasoducto de San Matías va punteado porque su resolución no separa el monto. Las posiciones son estimación propia, con su precisión declarada en el campo <span class="path">est_ubicacion</span> del archivo de datos: un ancla no es el polígono del derecho minero.',
    sinMonto: 'sin monto separado',
    comprometidos: 'comprometidos',
    tam: (chico, grande) => `el área escala con el monto · ${chico} y ${grande}`,
    grupo: (g) => g.es,
    sector: (s) => s,
    y: ' y ',
  },
  en: {
    aria: 'Map of Argentina with the estimated anchor of each approved RIGI project',
    cap: 'Each dot is the project’s estimated anchor: the mine, plant or salar the resolution names, with its area proportional to the committed amount. Linear works carry a simplified route between endpoints, and the San Matías pipeline is dotted because its resolution does not separate the amount. Positions are the register’s own estimate, precision declared in the <span class="path">est_ubicacion</span> field of the data file: an anchor is not the polygon of a mining title.',
    sinMonto: 'not separated',
    comprometidos: 'committed',
    tam: (chico, grande) => `area scales with the amount · ${chico} and ${grande}`,
    grupo: (g) => g.en,
    sector: (s) => SECTOR_EN[s],
    /* Las provincias compuestas se escriben igual que en la tabla, que las
       deja en español también en la página inglesa. */
    y: ' y ',
  },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const M = (usd) => `USD ${Math.round(usd / 1e6).toLocaleString('en-US')} M`
const r1 = (n) => Math.round(n * 10) / 10

/* --- armado ------------------------------------------------------------------ */

const montoMax = Math.max(...aprobados.map((p) => p.monto_comprometido_usd ?? 0))
const R_MAX = 26
const R_MIN = 5
const radio = (usd) => (usd ? Math.max(R_MIN, R_MAX * Math.sqrt(usd / montoMax)) : R_MIN)
const [vbW] = geo.viewBox.split(' ').slice(2).map(Number)

function mapa(lang) {
  const t = T[lang]
  const land = Object.entries(geo.provincias)
    .map(([slug, p]) => `<path class="map-prov" data-prov-path="${slug}" d="${p.path}"/>`)
    .join('')

  const trazas = []
  const dots = []
  const orden = [...aprobados].sort((a, b) => (b.monto_comprometido_usd ?? 0) - (a.monto_comprometido_usd ?? 0))

  for (const p of orden) {
    const u = p.est_ubicacion
    const g = GRUPOS.find((x) => x.sectores.includes(p.sector))
    const pts = u.puntos.map(([lon, lat]) => project(lon, lat).map(r1))
    const esTraza = u.precision === 'traza'
    const sinMonto = p.monto_comprometido_usd == null
    const mid = Math.floor(pts.length / 2)
    const ancla = !esTraza ? pts[0]
      : pts.length % 2 ? pts[mid]
        : [r1((pts[mid - 1][0] + pts[mid][0]) / 2), r1((pts[mid - 1][1] + pts[mid][1]) / 2)]
    const [dx, dy] = ancla
    const r = r1(radio(p.monto_comprometido_usd))

    if (esTraza) {
      trazas.push(`<path class="map-traza${sinMonto ? ' map-traza--punteada' : ''}" data-sector="${g.slug}" d="M${pts.map((q) => q.join(',')).join('L')}"/>`)
    }

    const monto = sinMonto ? t.sinMonto : M(p.monto_comprometido_usd)
    const label = `${CORTO[p.id]}: ${monto}${sinMonto ? '' : ` ${t.comprometidos}`}, ${t.sector(p.sector)}`
    /* El tooltip no flota sobre el punto: es una lectura fija a media altura
       sobre el margen derecho, que en Argentina es océano. Flotante, los
       puntos que se dibujan después lo taparían (el orden de pintado del SVG
       es el del documento) y en el cluster del Hombre Muerto no hay dónde
       ponerlo; arriba de todo lo tapa el masthead pegajoso al scrollear. */
    const tipX = vbW - 8
    const tipY = 470
    /* El grupo "otros" va en cuadrado de área equivalente. */
    const lado = r1(r * Math.sqrt(Math.PI))
    const marca = g.slug === 'otros'
      ? `<rect class="dot dot--otros" x="${r1(dx - lado / 2)}" y="${r1(dy - lado / 2)}" width="${lado}" height="${lado}"/>`
      : `<circle class="dot dot--${g.slug}${sinMonto ? ' dot--na' : ''}" cx="${dx}" cy="${dy}" r="${r}"/>`
    dots.push(
      `<a class="map-dot" href="#${p.id}" data-sector="${g.slug}" aria-label="${esc(label)}">` +
        `<circle class="hit" cx="${dx}" cy="${dy}" r="${Math.max(r + 4, 12)}"/>` + marca +
        `<g class="tip tip--fija" aria-hidden="true"><text x="${tipX}" y="${tipY}">${esc(CORTO[p.id])}</text>` +
        `<text class="tip-sub" x="${tipX}" y="${tipY + 17}">${esc(monto)} · ${esc(t.sector(p.sector))}</text></g>` +
      `</a>`,
    )
  }

  const filtros = GRUPOS.map((g) => {
    const n = aprobados.filter((p) => g.sectores.includes(p.sector)).length
    return {
      input: `<input class="mr-f" type="checkbox" id="mr-${lang}-${g.slug}" data-sector="${g.slug}" checked>`,
      chip: `<label class="mr-chip mr-chip--${g.slug}" for="mr-${lang}-${g.slug}"><span class="key key--${g.slug}" aria-hidden="true"></span>${t.grupo(g)} · ${n}</label>`,
    }
  })

  /* Referencias de tamaño: dos círculos de ejemplo, redondeados a la centena. */
  const ejChico = 500e6
  const ejGrande = 5000e6
  const rc = r1(radio(ejChico))
  const rg = r1(radio(ejGrande))
  const tamKey =
    `<svg class="map-tam" viewBox="0 0 ${Math.ceil(rg * 2 + rc * 2 + 18)} ${Math.ceil(rg * 2 + 4)}" aria-hidden="true">` +
    `<circle class="tam" cx="${rc + 2}" cy="${rg + 2}" r="${rc}"/>` +
    `<circle class="tam" cx="${rc * 2 + rg + 12}" cy="${rg + 2}" r="${rg}"/></svg>`

  const grupos = new Map()
  for (const p of orden) {
    const clave = p.provincias.join(t.y)
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(p)
  }
  const lista = [...grupos.entries()]
    .sort((a, b) => b[1].length - a[1].length ||
      b[1].reduce((s, p) => s + (p.monto_comprometido_usd ?? 0), 0) - a[1].reduce((s, p) => s + (p.monto_comprometido_usd ?? 0), 0))
    .map(([prov, ps]) => {
      const links = ps.map((p) => `<a href="#${p.id}">${esc(CORTO[p.id])}</a>`).join(', ')
      return `<li><span class="map-list-prov">${esc(prov)} · ${ps.length}</span> ${links}</li>`
    }).join('\n    ')

  return `
<div class="mapa-rigi">
  ${filtros.map((f) => f.input).join('\n  ')}
  <p class="map-key map-key--filtros">${filtros.map((f) => f.chip).join(' ')}</p>
  <figure class="mapa mapa--rigi">
    <svg viewBox="${geo.viewBox}" role="img" aria-label="${esc(t.aria)}">
      <g class="map-land">${land}</g>
      ${trazas.join('\n      ')}
      ${dots.join('\n      ')}
    </svg>
    <figcaption>${t.cap}</figcaption>
  </figure>
  <p class="map-key">${tamKey} ${t.tam(M(ejChico), M(ejGrande))}</p>
</div>
<ul class="map-list">
    ${lista}
</ul>
`
}

/* --- reemplazo entre marcadores --------------------------------------------- */

let wrote = 0
for (const [lang, file] of Object.entries(PAGES)) {
  let html = await readFile(file, 'utf8')
  const re = /(<!-- rigi-mapa -->)[\s\S]*?(<!-- \/rigi-mapa -->)/
  if (!re.test(html)) { console.error(`✗ ${file}: falta el marcador rigi-mapa`); process.exit(1) }
  html = html.replace(re, `$1${mapa(lang)}$2`)
  await writeFile(file, html)
  wrote++
  console.log(`✓ ${file}: mapa regenerado`)
}
if (wrote !== 2) process.exit(1)
