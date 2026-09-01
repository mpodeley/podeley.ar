/* equipos-check.mjs — verificador del registro del parque de equipos. Sin dependencias.

     node tools/equipos-check.mjs           # esquema, invariantes y conteos contra el copy
     node tools/equipos-check.mjs --links   # además verifica que toda URL citada esté viva

   Existe por lo mismo que rigi-check y ciber-check: los totales del registro
   ("54 equipos", "quince sets") están escritos a mano en las dos páginas, y
   cuando entra un relevamiento nuevo hay que saber dónde quedó el número viejo.
   Recalcula todo desde el dataset y falla ruidosamente.

   Además hace cumplir las invariantes que son del registro, no del esquema:

     1. Un conteo es una cifra o un rango, nunca las dos cosas, y el rango va
        abierto de verdad: min menor que max. El rango no es imprecisión propia,
        es el desacuerdo real entre fuentes, y promediarlo lo destruye.
     2. El desglose por empresas nunca supera el total del segmento. Que quede
        corto es esperable (no toda empresa tiene fila); que lo supere es una
        imposibilidad aritmética y hay una cifra equivocada cargada.
     3. Toda ficha de equipo cuelga de una empresa del registro que opera en ese
        segmento. Una ficha huérfana es un equipo que la tabla de empresas no
        explica.
     4. Las fechas de los datos nunca son posteriores a la fecha del dataset:
        el registro no puede citar un relevamiento del futuro. */

import { readFile } from 'node:fs/promises'

const REGISTRY = 'static/data/equipos-parque.json'
const SCHEMA = 'static/data/equipos-parque.schema.json'
const PAGES = { es: 'src/pages/equipos.es.html', en: 'src/pages/equipos.en.html' }

/* Dominios que bloquean el fetch programático de forma intermitente (403/405 a
   requests sin navegador). Sus URLs se citan igual — la fuente es la nota, no
   el servidor — así que un 403 acá degrada a warn en vez de romper el check. */
const DOMINIOS_403 = [
  'mase.lmneuquen.com', 'econojournal.com.ar', 'minutoneuquen.com', 'letrap.com.ar',
  'rionegro.com.ar', 'ambito.com', 'investing.com', 'diariouno.com.ar',
  'investors.calfrac.com', 'globenewswire.com',
]

const checkLinks = process.argv.includes('--links')

let failures = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }
const warn = (msg) => console.warn(`  ~ ${msg}`)
const ok = (msg) => console.log(`  ✓ ${msg}`)

const data = JSON.parse(await readFile(REGISTRY, 'utf8'))
const schema = JSON.parse(await readFile(SCHEMA, 'utf8'))

/* --- validación contra el esquema ------------------------------------------ */
/* Mismo subconjunto de JSON Schema 2020-12 que ciber-check: $ref locales, type,
   enum, pattern, required, properties, additionalProperties, items, minItems,
   anyOf. Si el esquema crece, esto tiene que crecer. */

const deref = (ref) => ref.split('/').slice(1).reduce((o, k) => o[k], schema)

function validate(value, sch, path, errs) {
  if (sch.$ref) sch = deref(sch.$ref)

  if (sch.anyOf) {
    const pasa = sch.anyOf.some((rama) => {
      const sub = []
      validate(value, rama, path, sub)
      return sub.length === 0
    })
    if (!pasa) errs.push(`${path}: no cumple ninguna variante (${JSON.stringify(value)})`)
    if (!sch.type && !sch.properties) return
  }

  if (sch.enum && !sch.enum.includes(value)) {
    errs.push(`${path}: "${value}" no está en [${sch.enum.join(', ')}]`)
    return
  }

  if (sch.type === 'null' && value !== null) errs.push(`${path}: se esperaba null`)
  if (sch.type === 'string' && typeof value !== 'string') {
    errs.push(`${path}: se esperaba string, hay ${typeof value}`)
    return
  }
  if (sch.type === 'number' && typeof value !== 'number') {
    errs.push(`${path}: se esperaba number, hay ${typeof value}`)
    return
  }
  if (sch.type === 'boolean' && typeof value !== 'boolean') {
    errs.push(`${path}: se esperaba boolean, hay ${typeof value}`)
    return
  }

  if (sch.pattern && !new RegExp(sch.pattern).test(value)) {
    errs.push(`${path}: "${value}" no matchea /${sch.pattern}/`)
  }

  if (sch.type === 'array') {
    if (!Array.isArray(value)) return errs.push(`${path}: se esperaba array`)
    if (sch.minItems && value.length < sch.minItems) {
      errs.push(`${path}: ${value.length} items, mínimo ${sch.minItems}`)
    }
    if (sch.items) value.forEach((v, i) => validate(v, sch.items, `${path}[${i}]`, errs))
    return
  }

  if (sch.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return errs.push(`${path}: se esperaba object`)
    }
    for (const req of sch.required ?? []) {
      if (!(req in value)) errs.push(`${path}: falta la propiedad requerida "${req}"`)
    }
    if (sch.additionalProperties === false && sch.properties) {
      for (const k of Object.keys(value)) {
        if (!(k in sch.properties)) errs.push(`${path}: propiedad no declarada "${k}"`)
      }
    }
    for (const [k, sub] of Object.entries(sch.properties ?? {})) {
      if (k in value) validate(value[k], sub, `${path}.${k}`, errs)
    }
  }
}

console.log('\nesquema')
const errs = []
validate(data, schema, 'raíz', errs)
if (errs.length) errs.forEach(fail)
else ok(`${data.empresas.length} empresas y ${data.equipos.length} fichas validan contra ${SCHEMA}`)

/* --- invariantes del registro ---------------------------------------------- */

console.log('\ninvariantes')

const porSegmento = Object.fromEntries(data.segmentos.map((s) => [s.segmento, s]))
const empresaPorId = Object.fromEntries(data.empresas.map((e) => [e.id, e]))
const hoy = data.actualizado

const fallasPrevias = failures

/* Ids únicos, entre empresas y equipos a la vez: los anchors de la página
   comparten un solo espacio de nombres. */
const ids = [...data.empresas.map((e) => e.id), ...data.equipos.map((q) => q.id)]
const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
if (repetidos.length) fail(`ids repetidos: ${[...new Set(repetidos)].join(', ')}`)
else ok(`${ids.length} ids únicos entre empresas y fichas`)

const idsPublicos = data.equipos.map((q) => q.id_publico).filter((x) => x !== null)
const pubRepetidos = idsPublicos.filter((id, i) => idsPublicos.indexOf(id) !== i)
if (pubRepetidos.length) fail(`id_publico repetidos: ${[...new Set(pubRepetidos)].join(', ')}`)

/* Forma del conteo: cifra o rango, nunca las dos; el rango abierto de verdad. */
const antesDeFechas = (fecha, donde) => {
  if (fecha && fecha.slice(0, 7) > hoy.slice(0, 7)) fail(`${donde}: fecha_dato ${fecha} posterior al dataset (${hoy})`)
}
for (const e of data.empresas) {
  for (const c of e.conteos) {
    const exacta = 'cantidad' in c
    const rango = 'cantidad_min' in c || 'cantidad_max' in c
    if (exacta && rango) fail(`${e.id}/${c.segmento}: cantidad y rango a la vez; es una o la otra`)
    if (rango && !('cantidad_min' in c && 'cantidad_max' in c)) fail(`${e.id}/${c.segmento}: rango incompleto`)
    if (rango && c.cantidad_min >= c.cantidad_max) fail(`${e.id}/${c.segmento}: rango ${c.cantidad_min}–${c.cantidad_max} no abre`)
    if (rango && (c.fuentes?.length ?? 0) < 2) {
      warn(`${e.id}/${c.segmento}: rango con una sola fuente; el rango existe porque las fuentes difieren`)
    }
    antesDeFechas(c.fecha_dato, `${e.id}/${c.segmento}`)
  }
}

/* Toda ficha cuelga de una empresa que opera en su segmento. */
for (const q of data.equipos) {
  const e = empresaPorId[q.empresa]
  if (!e) { fail(`${q.id}: la empresa "${q.empresa}" no existe en el registro`); continue }
  if (!e.conteos.some((c) => c.segmento === q.tipo)) {
    fail(`${q.id}: ${e.id} no tiene conteo en el segmento ${q.tipo}`)
  }
  if (q.estado === 'anunciado' && !q.nota && !q.estado_fecha) {
    fail(`${q.id}: anunciado sin nota ni estado_fecha; un anuncio sin fecha no caduca nunca`)
  }
  if (q.tipo === 'fractura' && q.id_publico === null && !q.nota) {
    warn(`${q.id}: set sin identificador público y sin nota que declare el id propio`)
  }
  if (q.id_publico === null && q.specs.length === 0) {
    fail(`${q.id}: sin identificador público y sin specs; no cumple el criterio de entrada`)
  }
  antesDeFechas(q.estado_fecha, q.id)
}

/* El desglose nunca supera el total del segmento. */
for (const s of data.segmentos) {
  let min = 0
  let max = 0
  let filas = 0
  for (const e of data.empresas) {
    for (const c of e.conteos) {
      if (c.segmento !== s.segmento) continue
      filas++
      min += 'cantidad' in c ? c.cantidad : c.cantidad_min
      max += 'cantidad' in c ? c.cantidad : c.cantidad_max
    }
  }
  if (min > s.total) fail(`${s.segmento}: el desglose suma al menos ${min} y el total es ${s.total}; imposibilidad aritmética`)
  else if (filas && max < s.total) warn(`${s.segmento}: el desglose llega a lo sumo a ${max} de ${s.total}; falta fila o nota de "otros"`)
  antesDeFechas(s.fecha_dato, s.segmento)
}
if (porSegmento.perforacion?.shale != null && porSegmento.perforacion?.convencional != null) {
  const { shale, convencional, total } = porSegmento.perforacion
  if (shale + convencional !== total) fail(`perforacion: ${shale} shale + ${convencional} convencional ≠ ${total}`)
}
if (porSegmento.fractura?.dual_fuel != null && porSegmento.fractura.dual_fuel > porSegmento.fractura.total) {
  fail(`fractura: ${porSegmento.fractura.dual_fuel} dual fuel sobre ${porSegmento.fractura.total} sets`)
}

/* El derivado del Adjunto IV vive del insumo oficial fechado. */
for (const f of data.est_hhp_operadoras ?? []) {
  if (f.confiable === false && !f.nota) fail(`est_hhp/${f.operadora}: confiable en false sin nota que explique por qué`)
  if (f.desde > f.hasta) fail(`est_hhp/${f.operadora}: ventana ${f.desde} → ${f.hasta} invertida`)
}

if (failures === fallasPrevias) ok('conteos bien formados, fichas ancladas y desgloses dentro de los totales')

/* --- los números que la página repite --------------------------------------- */

const NUMERALES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
]
const EN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five',
]

/* Los totales chicos se recitan en palabras (regla del sitio); los grandes, en
   dígitos, que se escriben igual en los dos idiomas. */
const enCopy = (n, lang) => (n <= 25 ? (lang === 'es' ? NUMERALES[n] : EN_WORDS[n]) : String(n))

const esperado = (lang) =>
  data.segmentos.map((s) => [`total de ${s.segmento}`, enCopy(s.total, lang)])

const MARCADORES = [
  'equipos-tablas:segmentos', 'equipos-tablas:fractura', 'equipos-tablas:perforacion',
  'equipos-tablas:workover', 'equipos-tablas:fichas-fractura', 'equipos-tablas:fichas-perforacion',
  'equipos-tablas:hhp',
]

console.log('\nconteos en el copy')
let paginas = 0
for (const [lang, ruta] of Object.entries(PAGES)) {
  let html
  try {
    html = await readFile(ruta, 'utf8')
  } catch {
    warn(`${ruta} todavía no existe`)
    continue
  }
  paginas++
  for (const [que, valor] of esperado(lang)) {
    if (!html.includes(valor)) fail(`${ruta}: no dice "${valor}" (${que})`)
  }
  for (const m of MARCADORES) {
    if (!html.includes(`<!-- ${m} -->`)) fail(`${ruta}: falta el marcador ${m}`)
  }
  /* Toda ficha del dataset tiene su anchor en la página: el id es la identidad
     pública de la fila y un enlace externo no puede quedar apuntando al aire. */
  for (const q of data.equipos) {
    if (!html.includes(`id="ficha-${q.id}"`)) fail(`${ruta}: falta el anchor ficha-${q.id} (correr tools/equipos-tablas.mjs)`)
  }
}
if (paginas) ok(`${paginas} página(s) recitan los totales de ${data.segmentos.length} segmentos`)

/* Satélites: páginas y herramientas que repiten totales del registro fuera de
   /equipos/. Cuando un total cambie, esto señala dónde quedó el número viejo.
   'digitos' cubre los textos que escriben el total en cifras aunque sea chico
   (la tarjeta OG dice "54 y 15"). */
const SATELITES = [
  { ruta: 'src/pages/ep.es.html', lang: 'es', totales: ['perforacion', 'fractura'] },
  { ruta: 'src/pages/ep.en.html', lang: 'en', totales: ['perforacion', 'fractura'] },
  { ruta: 'src/pages/casos.es.html', lang: 'es', totales: ['perforacion', 'fractura', 'workover', 'pulling'] },
  { ruta: 'src/pages/casos.en.html', lang: 'en', totales: ['perforacion', 'fractura', 'workover', 'pulling'] },
  { ruta: 'tools/og-cards.mjs', lang: 'digitos', totales: ['perforacion', 'fractura'] },
]
for (const s of SATELITES) {
  let texto
  try {
    texto = await readFile(s.ruta, 'utf8')
  } catch {
    warn(`${s.ruta} todavía no existe`)
    continue
  }
  for (const nombre of s.totales) {
    const total = porSegmento[nombre].total
    const valor = s.lang === 'digitos' ? String(total) : enCopy(total, s.lang)
    if (!texto.includes(valor)) fail(`${s.ruta}: no dice "${valor}" (total de ${nombre})`)
  }
}
ok(`${SATELITES.length} satélites repiten los totales vigentes`)

/* --- enlaces ---------------------------------------------------------------- */

if (checkLinks) {
  console.log('\nenlaces')
  const urls = [
    ...new Set([
      ...data.segmentos.flatMap((s) => [...s.fuentes, ...(s.dual_fuel_fuentes ?? [])]),
      ...data.empresas.flatMap((e) => [...e.fuentes, ...e.conteos.flatMap((c) => c.fuentes)]),
      ...data.equipos.flatMap((q) => [...q.fuentes, ...q.specs.map((s) => s.fuente)]),
      data.oficial.adjunto_iv.url,
    ]),
  ]
  let muertos = 0
  for (const url of urls) {
    const bloqueador = DOMINIOS_403.some((d) => new URL(url).hostname.endsWith(d))
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
      if (!res.ok) {
        if (bloqueador && [403, 405].includes(res.status)) {
          warn(`${res.status} ${url} (dominio que bloquea bots; verificar a mano)`)
        } else {
          muertos++
          fail(`${res.status} ${url}`)
        }
      }
    } catch (err) {
      if (bloqueador) warn(`${err.message} ${url} (dominio que bloquea bots; verificar a mano)`)
      else {
        muertos++
        fail(`${err.message} ${url}`)
      }
    }
  }
  if (!muertos) ok(`${urls.length} URLs verificadas`)
}

/* --- resumen ---------------------------------------------------------------- */

const resumen = data.segmentos.map((s) => `${s.total} ${s.segmento}`).join(' · ')
console.log(`\n${resumen} · ${data.empresas.length} empresas · ${data.equipos.length} fichas`)
console.log(`sin padrón oficial, consultado el ${data.oficial.consultado}`)

if (failures) {
  console.error(`\n✗ ${failures} problema(s)\n`)
  process.exit(1)
}
console.log('\n✓ registro del parque en orden\n')
