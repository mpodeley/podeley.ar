/* rigi-tablas.mjs — genera la tabla y las fichas de /rigi/ desde el dataset.
   Sin dependencias.

     node tools/rigi-tablas.mjs

   Escribe entre los marcadores <!-- rigi-tablas:aprobados --> y
   <!-- rigi-tablas:fichas --> de src/pages/rigi.{es,en}.html.

   Existe por lo mismo que ciber-maps: para que los dos idiomas no puedan
   divergir. Son veintiún proyectos por catorce campos, y transcribirlos a mano
   dos veces es garantía de que una cifra de la tabla en inglés termine diciendo
   algo distinto de la misma cifra en español. Acá los números salen del dataset
   una sola vez y sólo cambian los rótulos, que viven en el diccionario T.

   Correr después de tocar el dataset. rigi-check verifica los conteos del copy,
   pero no la tabla: la tabla no se escribe a mano, se regenera. */

import { readFile, writeFile } from 'node:fs/promises'

const REGISTRY = 'static/data/rigi-proyectos.json'
const PAGES = { es: 'src/pages/rigi.es.html', en: 'src/pages/rigi.en.html' }

const data = JSON.parse(await readFile(REGISTRY, 'utf8'))

const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

const SECTOR_EN = {
  'Minería': 'Mining',
  'Petróleo y Gas': 'Oil & gas',
  'Energía': 'Power',
  'Siderurgia': 'Steel',
  'Infraestructura': 'Infrastructure',
}

const T = {
  es: {
    cap: 'Monto = inversión comprometida en activos computables, la cifra que cuenta el régimen. Plazo = fecha límite del artículo 176. Un guion en el monto significa que la resolución no lo separa de la inversión total.',
    th: ['Resolución', 'Proyecto', 'Vehículo', 'Sector', 'Provincia', 'Comprometido', 'Plazo'],
    sinMonto: 'sin separar',
    total: (n, m) => `${n} proyectos aprobados · USD ${m} M en activos computables`,
    dt: {
      vpu: 'Vehículo', grupo: 'Presentado por', cuit: 'CUIT', sector: 'Sector',
      provincias: 'Provincia', capacidad: 'Capacidad', monto: 'Comprometido',
      total: 'Inversión total declarada', crono: 'Cronograma', plazo: 'Plazo del artículo 176',
      prov: 'Proveedores locales', ben: 'Incentivos invocados', exp: 'Expediente', acta: 'Acta del Comité',
    },
    fuentes: 'Fuente:',
    resolucionDel: (n, f) => `${n}, publicada el ${f}`,
    tagPelp: 'exportación estratégica',
    tagAmpl: 'ampliación',
    tagDesist: 'desistido',
    sinDato: 'sin dato',
  },
  en: {
    cap: 'Amount = investment committed in computable assets, the figure the regime actually counts. Deadline = the article 176 cutoff. A dash means the resolution does not separate it from total investment.',
    th: ['Resolution', 'Project', 'Vehicle', 'Sector', 'Province', 'Committed', 'Deadline'],
    sinMonto: 'not separated',
    total: (n, m) => `${n} approved projects · USD ${m} M in computable assets`,
    dt: {
      vpu: 'Vehicle', grupo: 'Filed by', cuit: 'Tax ID', sector: 'Sector',
      provincias: 'Province', capacidad: 'Capacity', monto: 'Committed',
      total: 'Total investment declared', crono: 'Schedule', plazo: 'Article 176 deadline',
      prov: 'Local suppliers', ben: 'Incentives invoked', exp: 'File', acta: 'Committee minutes',
    },
    fuentes: 'Source:',
    resolucionDel: (n, f) => `${n}, published ${f}`,
    tagPelp: 'strategic export',
    tagAmpl: 'expansion',
    tagDesist: 'withdrawn',
    sinDato: 'no data',
  },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* Convención numérica del sitio: miles con coma y decimal con punto, en los dos
   idiomas. Un número se escribe igual en la página .es y en la .en. */
const num = (n, dec = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const millones = (n) => (n >= 1e9 ? num(n / 1e6) : num(n / 1e6, n / 1e6 < 10 ? 1 : 0))

const fechaLarga = (iso, lang) => {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  const mes = MESES[lang][Number(m) - 1]
  if (!d) return lang === 'es' ? `${mes} de ${y}` : `${mes} ${y}`
  return lang === 'es' ? `${Number(d)} de ${mes} de ${y}` : `${mes} ${Number(d)}, ${y}`
}

const sectorDe = (p, lang) => (lang === 'en' ? SECTOR_EN[p.sector] ?? p.sector : p.sector)

const aprobados = data.proyectos
  .filter((p) => p.estado === 'aprobado')
  .sort((a, b) => a.publicacion_fecha.localeCompare(b.publicacion_fecha))
const otros = data.proyectos.filter((p) => p.estado !== 'aprobado')
const comprometido = aprobados.reduce((a, p) => a + (p.monto_comprometido_usd ?? 0), 0)

/* --- tabla ------------------------------------------------------------------ */

function tabla(lang) {
  const t = T[lang]
  const filas = aprobados.map((p) => {
    const monto = p.monto_comprometido_usd
      ? `USD ${millones(p.monto_comprometido_usd)} M`
      : `<span class="reg-na">${t.sinMonto}</span>`
    const res = p.resolucion.replace(/ del Ministerio de Economía$/, '').replace(/^Resolución /, '')
    return (
      `        <tr id="${p.id}">` +
      `<td class="reg-d"><a href="${p.boletin_url}" rel="noopener">${esc(res)}</a></td>` +
      `<td><a href="#ficha-${p.id}">${esc(p.proyecto)}</a></td>` +
      `<td>${esc(p.vpu)}</td>` +
      `<td>${esc(sectorDe(p, lang))}</td>` +
      `<td>${esc(p.provincias.join(' y '))}</td>` +
      `<td class="reg-n">${monto}</td>` +
      `<td class="reg-d">${esc(p.plazo_minimo ?? '—')}</td></tr>`
    )
  })

  return [
    '  <div class="reg-scroll">',
    '    <table class="reg">',
    `      <caption class="reg-cap">${t.cap}</caption>`,
    '      <thead>',
    `        <tr>${t.th.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>`,
    '      </thead>',
    '      <tbody>',
    ...filas,
    '      </tbody>',
    '      <tfoot>',
    `        <tr><td colspan="7">${t.total(aprobados.length, num(Math.round(comprometido / 1e6)))}</td></tr>`,
    '      </tfoot>',
    '    </table>',
    '  </div>',
  ].join('\n')
}

/* --- fichas ----------------------------------------------------------------- */

function ficha(p, lang) {
  const t = T[lang]
  const d = t.dt
  const fila = (dt, dd) => (dd ? `          <div><dt>${dt}</dt><dd>${dd}</dd></div>` : null)

  const crono = p.cronograma.length
    ? p.cronograma
        .map((tr) => {
          const rango = tr.desde ? ` (${tr.desde} → ${tr.hasta})` : ''
          return `${esc(tr.periodo)}${rango}: USD ${millones(tr.monto_usd)} M`
        })
        .join(' · ')
    : null

  const prov =
    p.proveedores_locales_pct !== null && p.proveedores_locales_pct !== undefined
      ? `${num(p.proveedores_locales_pct, p.proveedores_locales_pct % 1 ? 2 : 0)}%`
      : p.proveedores_locales_usd
        ? `USD ${millones(p.proveedores_locales_usd)} M`
        : null

  const tags = [
    p.exportacion_estrategica ? `<span class="tag">${t.tagPelp}</span>` : '',
    p.ampliacion ? `<span class="tag">${t.tagAmpl}</span>` : '',
    p.estado !== 'aprobado' ? `<span class="tag tag--caveat">${t.tagDesist}</span>` : '',
    `<span class="tag tag--quieto">${esc(sectorDe(p, lang))}</span>`,
  ].join('')

  const datos = [
    fila(d.vpu, esc(p.vpu)),
    fila(d.grupo, p.grupo ? esc(p.grupo) : null),
    fila(d.cuit, p.cuit),
    fila(d.sector, esc([sectorDe(p, lang), p.subsector].filter(Boolean).join(' · '))),
    fila(d.provincias, esc(p.provincias.join(' y '))),
    fila(d.capacidad, p.capacidad ? esc(p.capacidad) : null),
    fila(d.monto, p.monto_comprometido_usd ? `USD ${millones(p.monto_comprometido_usd)} M` : null),
    fila(d.total, p.monto_total_declarado_usd ? `USD ${millones(p.monto_total_declarado_usd)} M` : null),
    fila(d.crono, crono),
    fila(d.plazo, p.plazo_minimo ? esc(fechaLarga(p.plazo_minimo, lang)) : null),
    fila(d.prov, prov),
    fila(d.ben, p.beneficios.length ? p.beneficios.join(' · ') : null),
    fila(d.exp, p.expediente),
    fila(d.acta, p.acta_comite),
  ].filter(Boolean)

  const encabezado = p.resolucion
    ? `<p>${esc(t.resolucionDel(p.resolucion, fechaLarga(p.publicacion_fecha, lang)))}.</p>`
    : ''

  return [
    `    <details class="ficha" id="ficha-${p.id}">`,
    `      <summary><span class="ficha-nombre">${esc(p.proyecto)}</span><span class="ficha-meta">${tags}</span></summary>`,
    '      <div class="ficha-body">',
    ...(encabezado ? [`        ${encabezado}`] : []),
    '        <dl class="ficha-datos">',
    ...datos,
    '        </dl>',
    ...(p.nota ? [`        <p>${esc(p.nota)}</p>`] : []),
    `        <p class="ficha-fuentes">${t.fuentes} ${p.fuentes
      .map((u) => `<a href="${u}" rel="noopener">Boletín Oficial</a>`)
      .join(' · ')}</p>`,
    '      </div>',
    '    </details>',
  ].join('\n')
}

const fichas = (lang) =>
  ['  <div class="fichas">', ...[...aprobados, ...otros].map((p) => ficha(p, lang)), '  </div>'].join('\n')

/* --- escritura -------------------------------------------------------------- */

/* El bloque generado reemplaza todo lo que haya entre el marcador y el cierre
   de la sección o el próximo marcador. Se vuelve a dejar el marcador para que
   la próxima corrida encuentre dónde escribir. */
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
  html = reemplazar(html, 'rigi-tablas:aprobados', tabla(lang))
  html = reemplazar(html, 'rigi-tablas:fichas', fichas(lang))
  await writeFile(ruta, html)
  console.log(`  ✓ ${ruta}: tabla de ${aprobados.length} filas y ${aprobados.length + otros.length} fichas`)
}
