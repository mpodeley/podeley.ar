/* ciber-check.mjs — verificador del registro ciber. Sin dependencias.

     node tools/ciber-check.mjs           # valida el JSON, los conteos y la paridad es/en
     node tools/ciber-check.mjs --links   # además verifica que toda URL citada esté viva

   Existe porque los conteos del registro ("trece incidentes", "ocho de trece")
   están escritos a mano en varios archivos: las dos páginas ciber, las tarjetas
   del home, los enlaces desde energía y perfil, y las tarjetas OG. Cuando entra
   una fila nueva, esto recalcula los números desde el dataset y falla ruidosamente
   donde quedó un numeral viejo. También valida el dataset contra su esquema
   (static/data/ciber-incidentes.schema.json) con un subconjunto de JSON Schema:
   el esquema es el contrato público del dataset y acá se hace cumplir. */

import { readFile } from 'node:fs/promises'

const REGISTRY = 'static/data/ciber-incidentes.json'
const SCHEMA = 'static/data/ciber-incidentes.schema.json'
const PAGES = { es: 'src/pages/incidentes.es.html', en: 'src/pages/incidentes.en.html' }

/* Archivos que llevan el conteo total escrito en palabras, además de las páginas
   ciber. research.{es,en}.html linkea sin conteo y por eso no está. */
const SATellites = {
  es: ['src/pages/index.es.html', 'src/pages/energia.es.html', 'src/pages/perfil.es.html', 'src/pages/ciber.es.html'],
  en: ['src/pages/index.en.html', 'src/pages/energia.en.html', 'src/pages/perfil.en.html', 'src/pages/ciber.en.html'],
}
const OG_CARDS = 'tools/og-cards.mjs'

const checkLinks = process.argv.includes('--links')

let failures = 0
let warnings = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }
const warn = (msg) => { warnings++; console.warn(`  ~ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

/* --- validación contra el esquema ----------------------------------------- */
/* Subconjunto de JSON Schema 2020-12: $ref locales, type, enum, pattern,
   required, properties, additionalProperties, items, minItems, anyOf.
   Es lo único que el esquema usa; si el esquema crece, esto tiene que crecer. */

const schema = JSON.parse(await readFile(SCHEMA, 'utf8'))
const deref = (ref) => ref.split('/').slice(1).reduce((o, k) => o[k], schema)

function validate(value, sch, path, errs) {
  if (sch.$ref) sch = deref(sch.$ref)

  if (sch.anyOf) {
    const passes = sch.anyOf.some((branch) => {
      const sub = []
      validate(value, branch, path, sub)
      return sub.length === 0
    })
    if (!passes) errs.push(`${path}: no cumple ninguna variante (valor: ${JSON.stringify(value)})`)
    return
  }

  if (sch.enum && !sch.enum.includes(value)) {
    errs.push(`${path}: "${value}" no está en [${sch.enum.join(', ')}]`)
    return
  }

  if (sch.type) {
    const types = [].concat(sch.type)
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    if (!types.includes(actual)) {
      errs.push(`${path}: es ${actual}, se esperaba ${types.join('|')}`)
      return
    }
    if (value === null) return
  }

  if (typeof value === 'string' && sch.pattern && !new RegExp(sch.pattern).test(value))
    errs.push(`${path}: "${value.slice(0, 60)}" no matchea ${sch.pattern}`)

  if (Array.isArray(value)) {
    if (sch.minItems && value.length < sch.minItems)
      errs.push(`${path}: ${value.length} ítems, mínimo ${sch.minItems}`)
    if (sch.items) value.forEach((v, i) => validate(v, sch.items, `${path}[${i}]`, errs))
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of sch.required ?? [])
      if (!(req in value)) errs.push(`${path}: falta el campo "${req}"`)
    for (const [k, v] of Object.entries(value)) {
      if (sch.properties?.[k]) validate(v, sch.properties[k], `${path}.${k}`, errs)
      else if (sch.additionalProperties === false)
        errs.push(`${path}: campo inesperado "${k}"`)
      else if (typeof sch.additionalProperties === 'object')
        validate(v, sch.additionalProperties, `${path}.${k}`, errs)
    }
  }
}

console.log('esquema')
const data = JSON.parse(await readFile(REGISTRY, 'utf8'))
{
  const errs = []
  const { contexto_regional, ...rest } = data
  if (contexto_regional)
    warn('clave legada "contexto_regional": falta migrar a "contexto_internacional"')
  validate(rest, schema, 'registro', errs)
  if (errs.length) errs.forEach(fail)
  else ok(`${REGISTRY} cumple el esquema`)

  const ids = data.incidentes.map((i) => i.id)
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) fail(`ids duplicados: ${dup.join(', ')}`)
}

/* --- conteos --------------------------------------------------------------- */

const N = data.incidentes.length
const leakOnly = data.incidentes.filter((i) => i.canal_divulgacion === 'leak-site').length
const notLeakOnly = N - leakOnly
const alta = data.incidentes.filter((i) => i.confianza === 'alta').length
const media = data.incidentes.filter((i) => i.confianza === 'media').length
const years = data.incidentes.map((i) => Number(i.fecha_publica.slice(0, 4)))
const spanYears = Math.max(...years) - Math.min(...years)

const WORDS = {
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
    'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
    'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five',
    'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty'],
}

console.log(`\nconteos (desde el dataset): ${N} incidentes · ${leakOnly} solo leak-site · ` +
  `${notLeakOnly} con otra fuente · ${alta} alta · ${media} media · ${spanYears} años de rango`)

const allowed = new Set([N, leakOnly, notLeakOnly, alta, media, spanYears,
  (data.actores ?? []).length, (data.contexto_internacional ?? []).length])

for (const lang of ['es', 'en']) {
  const wordN = WORDS[lang][N]
  const wordM = WORDS[lang][leakOnly]

  const page = await readFile(PAGES[lang], 'utf8')
  for (const [word, what] of [[wordN, `total (${N})`], [wordM, `solo-leak-site (${leakOnly})`]]) {
    if (!word) { fail(`no tengo la palabra para ${what} en ${lang} — extender WORDS`); continue }
    if (new RegExp(`\\b${word}\\b`, 'iu').test(page)) ok(`${PAGES[lang]} dice "${word}" — ${what}`)
    else fail(`${PAGES[lang]} no menciona "${word}" — ${what} desactualizado`)
  }

  for (const file of SATellites[lang]) {
    const text = await readFile(file, 'utf8')
    if (new RegExp(`\\b${wordN}\\b`, 'iu').test(text)) ok(`${file} dice "${wordN}"`)
    else fail(`${file} no menciona "${wordN}" — conteo desactualizado`)
  }

  /* Numerales sospechosos: una palabra-número cerca de "incidente(s)/filas" cuyo
     valor no sale del dataset suele ser un conteo viejo. Se arranca en seis porque
     "dos compilaciones" o "tres canales" son prosa normal; los conteos del registro
     viven arriba de eso. "seis años" y similares quedan afuera por la excepción. */
  for (const file of [PAGES[lang], ...SATellites[lang]]) {
    const text = (await readFile(file, 'utf8')).toLowerCase()
    for (let v = 6; v < WORDS[lang].length; v++) {
      if (allowed.has(v)) continue
      const re = new RegExp(`\\b${WORDS[lang][v]}\\b(?!\\s+(años|years))`, 'giu')
      for (const m of text.matchAll(re)) {
        const ctx = text.slice(Math.max(0, m.index - 80), m.index + 80)
        if (/incidentes?|incidents?|filas|rows/i.test(ctx))
          warn(`${file}: "${WORDS[lang][v]}" cerca de "incidente/filas" y no sale del dataset — ¿numeral viejo?`)
      }
    }
  }
}

{
  const og = await readFile(OG_CARDS, 'utf8')
  for (const fig of [`${leakOnly} de ${N}`, `${leakOnly} of ${N}`]) {
    if (og.includes(fig)) ok(`${OG_CARDS} dice "${fig}"`)
    else fail(`${OG_CARDS} no dice "${fig}" — tarjeta OG desactualizada (regenerar PNGs al corregir)`)
  }
}

/* --- anclas de fila --------------------------------------------------------- */
/* El feed Atom publica https://podeley.ar/ciber/#<id> como id de cada entrada;
   las fichas de actores y los mapas linkean a las mismas anclas. Cada id del
   dataset tiene que existir como id="…" en las dos páginas. */

console.log('\nanclas de fila')
{
  const rowIds = [...data.incidentes, ...(data.contexto_internacional ?? [])].map((r) => r.id)
  for (const lang of ['es', 'en']) {
    const page = await readFile(PAGES[lang], 'utf8')
    const missing = rowIds.filter((id) => !page.includes(`id="${id}"`))
    if (missing.length === 0) ok(`${PAGES[lang]}: las ${rowIds.length} filas tienen ancla`)
    else fail(`${PAGES[lang]}: filas sin ancla — ${missing.join(', ')}`)
  }
}

/* --- actores ↔ incidentes --------------------------------------------------- */
/* Toda fila con actor nombrado tiene ficha, toda ficha lista exactamente sus
   filas, y los cruces a contexto_internacional existen. El nombre de la ficha
   es la clave del join: tiene que coincidir letra por letra con el campo actor. */

console.log('\nactores')
{
  const actores = data.actores ?? []
  const byName = new Map(actores.map((a) => [a.nombre, a]))
  if (byName.size !== actores.length) fail('actores: hay nombres duplicados')

  const conNombre = data.incidentes.filter((i) => i.actor_tipo !== 'desconocido')
  for (const i of conNombre) {
    const a = byName.get(i.actor)
    if (!a) fail(`incidente ${i.id}: actor "${i.actor}" sin ficha en actores`)
    else if (!a.incidentes.includes(i.id)) fail(`ficha ${a.id}: no lista su incidente ${i.id}`)
  }

  const idsInc = new Set(data.incidentes.map((i) => i.id))
  const idsCtx = new Set((data.contexto_internacional ?? []).map((c) => c.id))
  for (const a of actores) {
    for (const id of a.incidentes) {
      if (!idsInc.has(id)) { fail(`ficha ${a.id}: incidente inexistente ${id}`); continue }
      const row = data.incidentes.find((i) => i.id === id)
      if (row.actor !== a.nombre) fail(`ficha ${a.id}: ${id} nombra a "${row.actor}", no a "${a.nombre}"`)
    }
    for (const id of a.contexto ?? []) {
      if (!idsCtx.has(id)) fail(`ficha ${a.id}: caso de contexto inexistente ${id}`)
    }
  }
  ok(`${actores.length} fichas cruzan con ${conNombre.length} filas con actor nombrado`)
}

/* --- fichas y mapas en las páginas ------------------------------------------ */
/* El HTML de fichas y mapas se escribe (o genera) por duplicado en es/en; acá
   se verifica contra el dataset: una ficha por actor, un link por fila con
   actor nombrado, y mapas que cuentan exactamente lo que cuentan los datos. */

console.log('\nfichas y mapas en las páginas')
{
  const actores = data.actores ?? []
  const ctx = data.contexto_internacional ?? []
  const nombresFicha = new Set(actores.map((a) => a.nombre))
  const linksEsperados = data.incidentes.filter((i) => i.actor_tipo !== 'desconocido').length +
    ctx.filter((c) => nombresFicha.has(c.actor)).length

  const tallyProv = {}
  for (const i of data.incidentes) tallyProv[i.provincias[0]] = (tallyProv[i.provincias[0]] ?? 0) + 1
  const tallyPais = {}
  for (const c of ctx) tallyPais[c.pais] = (tallyPais[c.pais] ?? 0) + 1

  const svgLimpio = {}
  for (const lang of ['es', 'en']) {
    const page = await readFile(PAGES[lang], 'utf8')

    const nFichas = (page.match(/<details class="ficha"/g) ?? []).length
    if (nFichas === actores.length) ok(`${PAGES[lang]}: ${nFichas} fichas, una por actor`)
    else fail(`${PAGES[lang]}: ${nFichas} fichas para ${actores.length} actores`)
    for (const a of actores) {
      for (const id of [`ficha-${a.id}`, `actor-${a.id}`]) {
        if (!page.includes(`id="${id}"`)) fail(`${PAGES[lang]}: falta id="${id}"`)
      }
    }

    const nLinks = (page.match(/class="actor-link"/g) ?? []).length
    if (nLinks === linksEsperados) ok(`${PAGES[lang]}: ${nLinks} links de actor en las tablas`)
    else fail(`${PAGES[lang]}: ${nLinks} links de actor, esperados ${linksEsperados}`)

    const mapProv = {}
    for (const m of page.matchAll(/data-prov="([a-z-]+)" data-n="(\d+)"/g)) mapProv[m[1]] = Number(m[2])
    if (JSON.stringify(Object.entries(mapProv).sort()) === JSON.stringify(Object.entries(tallyProv).sort()))
      ok(`${PAGES[lang]}: el mapa argentino cuenta lo mismo que el dataset`)
    else fail(`${PAGES[lang]}: mapa AR ${JSON.stringify(mapProv)} vs dataset ${JSON.stringify(tallyProv)}`)

    const mapPais = {}
    for (const m of page.matchAll(/data-pais="([A-Z]{2})"/g)) mapPais[m[1]] = (mapPais[m[1]] ?? 0) + 1
    if (JSON.stringify(Object.entries(mapPais).sort()) === JSON.stringify(Object.entries(tallyPais).sort()))
      ok(`${PAGES[lang]}: el mapamundi cuenta lo mismo que el dataset`)
    else fail(`${PAGES[lang]}: mapamundi ${JSON.stringify(mapPais)} vs dataset ${JSON.stringify(tallyPais)}`)

    svgLimpio[lang] = [...page.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) =>
      m[0].replace(/aria-label="[^"]*"/g, '').replace(/<text[^>]*>[^<]*<\/text>/g, ''),
    ).join('\n')
  }
  if (svgLimpio.es === svgLimpio.en) ok('geometría de mapas idéntica entre es y en')
  else fail('los SVG de es y en divergen fuera de los textos — regenerar con tools/ciber-maps.mjs')
}

/* --- paridad es/en ---------------------------------------------------------- */

console.log('\nparidad es/en')
const pageText = { es: await readFile(PAGES.es, 'utf8'), en: await readFile(PAGES.en, 'utf8') }
{
  const ids = {}
  const tables = {}
  for (const lang of ['es', 'en']) {
    ids[lang] = [...pageText[lang].matchAll(/<(?:section|aside)[^>]+id="([^"]+)"/g)].map((m) => m[1])
    tables[lang] = [...pageText[lang].matchAll(/<table[\s\S]*?<\/table>/g)].map(
      (m) => (m[0].match(/<tbody[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g) ?? []).length,
    )
  }
  if (ids.es.join() === ids.en.join()) ok(`mismas secciones en el mismo orden (${ids.es.join(' → ')})`)
  else fail(`secciones distintas:\n    es: ${ids.es.join(', ')}\n    en: ${ids.en.join(', ')}`)

  if (tables.es.join() === tables.en.join()) ok(`mismas tablas con las mismas filas (${tables.es.join(', ') || 'ninguna'})`)
  else fail(`filas de tabla distintas: es ${tables.es.join(', ')} vs en ${tables.en.join(', ')}`)

  const details = {}
  for (const lang of ['es', 'en']) {
    details[lang] = [...pageText[lang].matchAll(/<details class="(?:ficha|gloss-item)" id="([^"]+)"/g)].map((m) => m[1])
  }
  if (details.es.join() === details.en.join()) ok(`mismos desplegables en el mismo orden (${details.es.length})`)
  else fail(`desplegables distintos:\n    es: ${details.es.join(', ')}\n    en: ${details.en.join(', ')}`)
}

/* --- links ------------------------------------------------------------------ */

if (checkLinks) {
  console.log('\nlinks')

  /* Dominios que fallan ante cualquier cliente automatizado pero andan en un
     navegador real. Se reportan aparte: hay que mirarlos a mano, no son links
     rotos. hcdn.gob.ar sirve una cadena de certificados incompleta que el
     navegador repara solo y curl no. */
  const ANTIBOT = ['lanacion.com.ar', 'infobae.com', 'ambito.com', 'iprofesional.com', 'clarin.com', 'hcdn.gob.ar']

  const urls = new Set()
  const collect = (node) => {
    if (Array.isArray(node)) node.forEach(collect)
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) k === 'fuentes' ? v.forEach((u) => urls.add(u)) : collect(v)
  }
  collect(data)
  for (const text of Object.values(pageText))
    for (const m of text.matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'))

  /* curl y no fetch: el fetch de Node negocia HTTP/2 y algunos servidores cierran
     la sesión con GOAWAY, que se emite como 'error' fuera de la promesa y voltea
     el proceso entero sin pasar por el catch. curl aísla cada URL en su proceso. */
  const { execFile } = await import('node:child_process')
  /* EDGAR (sec.gov) rechaza user-agents de navegador sin contacto: su política de
     fair access pide identificarse. Al resto se le habla como Firefox. */
  const ua = (u) =>
    new URL(u).hostname.endsWith('sec.gov')
      ? 'podeley.ar ciber-check matias@podeley.ar'
      : 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
  const curl = (u) =>
    new Promise((resolve) => {
      execFile(
        'curl',
        ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', '--max-time', '20', '-A', ua(u), '--', u],
        { timeout: 25000 },
        (err, stdout) => {
          const status = Number(stdout) || 0
          resolve({ u, status, err: status ? undefined : (err?.message?.split('\n')[0] ?? 'sin respuesta') })
        },
      )
    })

  const queue = [...urls]
  const results = []
  const workers = Array.from({ length: 6 }, async () => {
    let u
    while ((u = queue.shift())) results.push(await curl(u))
  })
  await Promise.all(workers)

  let alive = 0
  for (const { u, status, err } of results.sort((a, b) => a.u.localeCompare(b.u))) {
    if (status >= 200 && status < 400) { alive++; continue }
    const antibot = ANTIBOT.some((d) => new URL(u).hostname.endsWith(d))
    if (antibot) warn(`antibot conocido (${status || err}) — revisar a mano: ${u}`)
    else fail(`${status || err}: ${u}`)
  }
  ok(`${alive}/${results.length} URLs responden 2xx/3xx`)
}

/* --- veredicto --------------------------------------------------------------- */

console.log(
  `\n${failures ? `✗ ${failures} problema(s)` : '✓ sin problemas'}` +
  (warnings ? ` · ${warnings} aviso(s) para revisar a mano` : ''),
)
process.exit(failures ? 1 : 0)
