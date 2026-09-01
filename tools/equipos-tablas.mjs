/* equipos-tablas.mjs — genera las tablas y fichas de /equipos/ desde el dataset.
   Sin dependencias.

     node tools/equipos-tablas.mjs

   Escribe entre los marcadores equipos-tablas:* de src/pages/equipos.{es,en}.html.

   Existe por lo mismo que rigi-tablas y ciber-maps: para que los dos idiomas no
   puedan divergir. Los números salen del dataset una sola vez y sólo cambian
   los rótulos, que viven en el diccionario T. Los rangos se renderizan siempre
   como rango con su fecha: un conteo en disputa nunca aparece como número seco.

   Correr después de tocar el dataset. equipos-check verifica los conteos del
   copy y los anchors, pero no las tablas: las tablas no se escriben a mano,
   se regeneran. */

import { readFile, writeFile } from 'node:fs/promises'

const REGISTRY = 'static/data/equipos-parque.json'
const PAGES = { es: 'src/pages/equipos.es.html', en: 'src/pages/equipos.en.html' }

const data = JSON.parse(await readFile(REGISTRY, 'utf8'))

const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

const T = {
  es: {
    segmento: { perforacion: 'Perforación', fractura: 'Fractura', workover: 'Workover', pulling: 'Pulling' },
    unidad: { equipos: 'equipos', sets: 'sets' },
    estado: { activo: 'activo', anunciado: 'anunciado', 'en-armado': 'en armado', inactivo: 'inactivo', 'sin-dato': 'sin dato' },
    tec: { diesel: 'diésel', 'dual-fuel': 'dual fuel', 'e-frac': 'e-frac', electrico: 'eléctrico', gnc: 'GNC' },
    spec: {
      hhp: 'Potencia de bombeo', bombas: 'Bombas de fractura', fabricante_bombas: 'Fabricante de las bombas',
      motores: 'Motores', tier: 'Norma de emisiones', tipo_energia: 'Energía',
      potencia_hp: 'Potencia', capacidad_gancho_lb: 'Capacidad de gancho', fabricante_modelo: 'Fabricante y modelo',
      walking: 'Walking rig', mpd: 'Perforación con presión controlada (MPD)', bombas_lodo: 'Bombas de lodo',
      presion_max_psi: 'Presión máxima', profundidad_max_m: 'Profundidad máxima', automatizacion: 'Automatización',
      anio_ingreso: 'Ingreso al país', inversion_usd: 'Inversión anunciada',
    },
    specUnidad: { hhp: 'HHP', potencia_hp: 'HP', capacidad_gancho_lb: 'lb', presion_max_psi: 'psi', profundidad_max_m: 'm' },
    thSegmentos: ['Segmento', 'Activos', 'Detalle', 'Dato de', 'Fuente'],
    thEmpresas: ['Empresa', 'Equipos', 'Tecnología', 'Confianza', 'Dato de', 'Fuente'],
    thHhp: ['Operadora', 'HHP máximo informado', 'Percentil 95', 'Pozos', 'Ventana'],
    capSegmentos: 'Totales vigentes por segmento. Cada total ancla en un solo relevamiento; la fecha es la del dato, no la del registro.',
    capEmpresas: 'Un rango en la columna de equipos es el desacuerdo real entre fuentes, no imprecisión del registro: las fuentes de ambos extremos están citadas en la fila.',
    capHhp: 'Derivado propio del Adjunto IV oficial: la potencia de equipos de fractura que cada operadora informa en sus pozos. La operadora marcada no entra en ningún agregado.',
    si: 'sí', no: 'no', sinDato: 'sin dato', noConfiable: 'valor no confiable',
    fuentes: 'Fuentes:', fuente: 'Fuente:', operadoraDe: 'Operadora', cuencaDe: 'Cuenca', empresaDe: 'Empresa', estadoDe: 'Estado',
    dualFuel: (n) => `${n} dual fuel`,
    shaleConv: (s, c) => `${s} shale · ${c} convencional`,
    electricos: (n) => `${n} eléctricos anunciados`,
    pozos: (n) => `${n} pozos`,
  },
  en: {
    segmento: { perforacion: 'Drilling', fractura: 'Fracturing', workover: 'Workover', pulling: 'Pulling' },
    unidad: { equipos: 'rigs', sets: 'spreads' },
    estado: { activo: 'active', anunciado: 'announced', 'en-armado': 'rigging up', inactivo: 'idle', 'sin-dato': 'no data' },
    tec: { diesel: 'diesel', 'dual-fuel': 'dual fuel', 'e-frac': 'e-frac', electrico: 'electric', gnc: 'CNG' },
    spec: {
      hhp: 'Pumping horsepower', bombas: 'Frac pumps', fabricante_bombas: 'Pump manufacturer',
      motores: 'Engines', tier: 'Emissions tier', tipo_energia: 'Power',
      potencia_hp: 'Rated power', capacidad_gancho_lb: 'Hook load', fabricante_modelo: 'Make and model',
      walking: 'Walking rig', mpd: 'Managed pressure drilling (MPD)', bombas_lodo: 'Mud pumps',
      presion_max_psi: 'Max pressure', profundidad_max_m: 'Max depth', automatizacion: 'Automation',
      anio_ingreso: 'Entered the country', inversion_usd: 'Announced investment',
    },
    specUnidad: { hhp: 'HHP', potencia_hp: 'HP', capacidad_gancho_lb: 'lb', presion_max_psi: 'psi', profundidad_max_m: 'm' },
    unidadSeg: { workover: 'units', pulling: 'units' },
    thSegmentos: ['Segment', 'Active', 'Detail', 'Data as of', 'Source'],
    thEmpresas: ['Company', 'Units', 'Technology', 'Confidence', 'Data as of', 'Source'],
    thHhp: ['Operator', 'Max HHP reported', '95th percentile', 'Wells', 'Window'],
    capSegmentos: 'Current totals by segment. Each total is anchored to a single survey; the date is the date of the data, not of this registry.',
    capEmpresas: 'A range in the units column is genuine disagreement between sources, not imprecision: both ends are cited in the row.',
    capHhp: 'Derived from the official Adjunto IV filings: the frac horsepower each operator reports on its wells. The flagged operator is excluded from every aggregate.',
    si: 'yes', no: 'no', sinDato: 'no data', noConfiable: 'unreliable value',
    fuentes: 'Sources:', fuente: 'Source:', operadoraDe: 'Operator', cuencaDe: 'Basin', empresaDe: 'Company', estadoDe: 'Status',
    dualFuel: (n) => `${n} dual fuel`,
    shaleConv: (s, c) => `${s} shale · ${c} conventional`,
    electricos: (n) => `${n} electric announced`,
    pozos: (n) => `${n} wells`,
  },
}

const CONFIANZA = {
  es: { alta: 'alta', media: 'media', baja: 'baja' },
  en: { alta: 'high', media: 'medium', baja: 'low' },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Convención numérica del sitio: miles con coma y decimal con punto, en los dos
   idiomas. Un número se escribe igual en la página .es y en la .en. */
const num = (n, dec = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const mesLargo = (iso, lang) => {
  if (!iso) return null
  const [y, m] = iso.split('-')
  const mes = MESES[lang][Number(m) - 1]
  return lang === 'es' ? `${mes} de ${y}` : `${mes} ${y}`
}

/* El texto visible de un link de fuente es su dominio: la procedencia se lee
   sin hacer clic. */
const linkFuente = (u) => `<a href="${u}" rel="noopener">${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`
const linksFuentes = (urls) => [...new Set(urls)].map(linkFuente).join(' · ')

const empresaPorId = Object.fromEntries(data.empresas.map((e) => [e.id, e]))

/* --- totales por segmento --------------------------------------------------- */

function tablaSegmentos(lang) {
  const t = T[lang]
  const filas = data.segmentos.map((s) => {
    const detalle = []
    if (s.shale != null && s.convencional != null) detalle.push(t.shaleConv(s.shale, s.convencional))
    if (s.dual_fuel != null) detalle.push(t.dualFuel(s.dual_fuel))
    if (s.electricos_anunciados != null) detalle.push(t.electricos(s.electricos_anunciados))
    return (
      `        <tr id="parque-${s.segmento}">` +
      `<td>${t.segmento[s.segmento]}</td>` +
      `<td class="reg-n">${num(s.total)} ${t.unidadSeg?.[s.segmento] ?? t.unidad[s.unidad] ?? esc(s.unidad)}</td>` +
      `<td>${detalle.length ? detalle.join(' · ') : ''}</td>` +
      `<td class="reg-d">${mesLargo(s.fecha_dato, lang)}</td>` +
      `<td class="reg-d">${linksFuentes(s.fuentes)}</td></tr>`
    )
  })
  return tabla(t.capSegmentos, t.thSegmentos, filas)
}

/* --- empresas por segmento --------------------------------------------------- */

const rangoConteo = (c) => ('cantidad' in c ? num(c.cantidad) : `${num(c.cantidad_min)}–${num(c.cantidad_max)}`)

/* Con un solo segmento la tabla es la del segmento; con varios (workover y
   pulling comparten sección y marcador) se agrega la columna de segmento. */
function tablaEmpresas(lang, segmentos) {
  const t = T[lang]
  const varios = segmentos.length > 1
  const filas = data.empresas
    .flatMap((e) => e.conteos.filter((c) => segmentos.includes(c.segmento)).map((c) => ({ e, c })))
    .sort((a, b) => {
      const va = 'cantidad' in a.c ? a.c.cantidad : a.c.cantidad_max
      const vb = 'cantidad' in b.c ? b.c.cantidad : b.c.cantidad_max
      return vb - va || a.e.nombre.localeCompare(b.e.nombre)
    })
    .map(
      ({ e, c }) =>
        `        <tr id="${c.segmento}-${e.id}">` +
        `<td>${esc(e.nombre)}</td>` +
        (varios ? `<td>${t.segmento[c.segmento]}</td>` : '') +
        `<td class="reg-n">${rangoConteo(c)}</td>` +
        `<td>${(e.tecnologia ?? []).map((x) => t.tec[x] ?? x).join(' · ') || ''}</td>` +
        `<td class="reg-d">${CONFIANZA[lang][c.confianza]}</td>` +
        `<td class="reg-d">${mesLargo(c.fecha_dato, lang)}</td>` +
        `<td class="reg-d">${linksFuentes(c.fuentes)}</td></tr>`,
    )
  if (!filas.length) return `  <p class="reg-na">${t.sinDato}</p>`
  const th = varios ? [t.thEmpresas[0], t.thSegmentos[0], ...t.thEmpresas.slice(1)] : t.thEmpresas
  return tabla(t.capEmpresas, th, filas)
}

/* --- fichas ------------------------------------------------------------------ */

function valorSpec(s, lang) {
  const t = T[lang]
  const unidad = t.specUnidad[s.spec]
  if (typeof s.valor === 'boolean') return s.valor ? t.si : t.no
  if (typeof s.valor === 'number') {
    if (s.spec === 'inversion_usd') return `USD ${num(s.valor / 1e6, s.valor / 1e6 < 10 ? 1 : 0)} M`
    if (s.spec === 'anio_ingreso') return String(s.valor)
    return unidad ? `${num(s.valor)} ${unidad}` : num(s.valor)
  }
  return esc(s.valor)
}

function ficha(q, lang) {
  const t = T[lang]
  const e = empresaPorId[q.empresa]
  const titulo = q.id_publico ?? q.nombre ?? q.id
  const estado = q.estado_fecha
    ? `${t.estado[q.estado]} · ${mesLargo(q.estado_fecha, lang)}`
    : t.estado[q.estado]

  const tags = [
    `<span class="tag tag--quieto">${esc(e ? e.nombre : q.empresa)}</span>`,
    q.estado !== 'activo' ? `<span class="tag tag--caveat">${t.estado[q.estado]}</span>` : '',
  ].join('')

  const filasBase = [
    [t.empresaDe, e ? esc(e.nombre) : esc(q.empresa)],
    [t.operadoraDe, q.operadora ? esc(q.operadora) : null],
    [t.cuencaDe, q.cuenca ? esc(q.cuenca) : null],
    [t.estadoDe, estado],
  ]
    .filter(([, v]) => v)
    .map(([dt, dd]) => `          <div><dt>${dt}</dt><dd>${dd}</dd></div>`)

  /* Cada spec lleva su fuente al lado del valor, no al pie: las fichas se arman
     juntando anuncios sueltos y la procedencia es por dato. */
  const filasSpecs = q.specs.map(
    (s) =>
      `          <div><dt>${t.spec[s.spec]}</dt><dd>${valorSpec(s, lang)} <span class="ficha-fuente-inline">(${linkFuente(s.fuente)})</span></dd></div>`,
  )

  return [
    `    <details class="ficha" id="ficha-${q.id}">`,
    `      <summary><span class="ficha-nombre">${esc(titulo)}</span><span class="ficha-meta">${tags}</span></summary>`,
    '      <div class="ficha-body">',
    '        <dl class="ficha-datos">',
    ...filasBase,
    ...filasSpecs,
    '        </dl>',
    ...(q.nota ? [`        <p>${esc(q.nota)}</p>`] : []),
    `        <p class="ficha-fuentes">${t.fuentes} ${linksFuentes(q.fuentes)}</p>`,
    '      </div>',
    '    </details>',
  ].join('\n')
}

function fichas(lang, tipo) {
  const del = data.equipos
    .filter((q) => q.tipo === tipo)
    .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.id.localeCompare(b.id))
  if (!del.length) return `  <p class="reg-na">${T[lang].sinDato}</p>`
  return ['  <div class="fichas">', ...del.map((q) => ficha(q, lang)), '  </div>'].join('\n')
}

/* --- HHP por operadora ------------------------------------------------------- */

function tablaHhp(lang) {
  const t = T[lang]
  const filas = (data.est_hhp_operadoras ?? []).map((r) => {
    const marca = r.confiable ? '' : ` <span class="tag tag--caveat">${t.noConfiable}</span>`
    return (
      '        <tr>' +
      `<td>${esc(r.operadora)}${marca}</td>` +
      `<td class="reg-n">${num(r.hhp_max_informado)}</td>` +
      `<td class="reg-n">${r.hhp_p95 != null ? num(r.hhp_p95) : ''}</td>` +
      `<td class="reg-n">${r.pozos_muestra != null ? num(r.pozos_muestra) : ''}</td>` +
      `<td class="reg-d">${mesLargo(r.desde, lang)} → ${mesLargo(r.hasta, lang)}</td></tr>`
    )
  })
  if (!filas.length) return `  <p class="reg-na">${t.sinDato}</p>`
  return tabla(t.capHhp, t.thHhp, filas)
}

/* --- armado ------------------------------------------------------------------ */

function tabla(caption, th, filas) {
  return [
    '  <div class="reg-scroll">',
    '    <table class="reg">',
    `      <caption class="reg-cap">${caption}</caption>`,
    '      <thead>',
    `        <tr>${th.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>`,
    '      </thead>',
    '      <tbody>',
    ...filas,
    '      </tbody>',
    '    </table>',
    '  </div>',
  ].join('\n')
}

/* El bloque generado reemplaza todo lo que haya entre el marcador y su cierre.
   Se vuelve a dejar el marcador para que la próxima corrida encuentre dónde
   escribir. */
function reemplazar(html, marcador, bloque) {
  const abre = `<!-- ${marcador} -->`
  const i = html.indexOf(abre)
  if (i === -1) throw new Error(`falta el marcador ${abre}`)
  const fin = `<!-- /${marcador} -->`
  const j = html.indexOf(fin)
  const desde = i + abre.length
  const hasta = j === -1 ? desde : j
  return `${html.slice(0, desde)}\n${bloque}\n  ${fin}${html.slice(hasta + (j === -1 ? 0 : fin.length))}`
}

for (const [lang, ruta] of Object.entries(PAGES)) {
  let html
  try {
    html = await readFile(ruta, 'utf8')
  } catch {
    console.log(`  ~ ${ruta} todavía no existe, se saltea`)
    continue
  }
  html = reemplazar(html, 'equipos-tablas:segmentos', tablaSegmentos(lang))
  html = reemplazar(html, 'equipos-tablas:fractura', tablaEmpresas(lang, ['fractura']))
  html = reemplazar(html, 'equipos-tablas:perforacion', tablaEmpresas(lang, ['perforacion']))
  html = reemplazar(html, 'equipos-tablas:workover', tablaEmpresas(lang, ['workover', 'pulling']))
  html = reemplazar(html, 'equipos-tablas:fichas-fractura', fichas(lang, 'fractura'))
  html = reemplazar(html, 'equipos-tablas:fichas-perforacion', fichas(lang, 'perforacion'))
  html = reemplazar(html, 'equipos-tablas:hhp', tablaHhp(lang))
  await writeFile(ruta, html)
  console.log(`  ✓ ${ruta}: ${data.empresas.length} empresas y ${data.equipos.length} fichas`)
}
