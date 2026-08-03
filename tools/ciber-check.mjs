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
const PAGES = { es: 'src/pages/ciber.es.html', en: 'src/pages/ciber.en.html' }

/* Archivos que llevan el conteo total escrito en palabras, además de las páginas
   ciber. research.{es,en}.html linkea sin conteo y por eso no está. */
const SATellites = {
  es: ['src/pages/index.es.html', 'src/pages/energia.es.html', 'src/pages/perfil.es.html'],
  en: ['src/pages/index.en.html', 'src/pages/energia.en.html', 'src/pages/perfil.en.html'],
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
  `${notLeakOnly} con otra fuente · ${alta} de confianza alta · ${spanYears} años de rango`)

const allowed = new Set([N, leakOnly, notLeakOnly, alta, spanYears])

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
}

/* --- links ------------------------------------------------------------------ */

if (checkLinks) {
  console.log('\nlinks')

  /* Dominios que responden 403/desafío a cualquier cliente sin navegador real.
     Se reportan aparte: hay que mirarlos a mano, no son links rotos. */
  const ANTIBOT = ['lanacion.com.ar', 'infobae.com', 'ambito.com', 'iprofesional.com', 'clarin.com']

  const urls = new Set()
  const collect = (node) => {
    if (Array.isArray(node)) node.forEach(collect)
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) k === 'fuentes' ? v.forEach((u) => urls.add(u)) : collect(v)
  }
  collect(data)
  for (const text of Object.values(pageText))
    for (const m of text.matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'))

  const queue = [...urls]
  const results = []
  const workers = Array.from({ length: 6 }, async () => {
    let u
    while ((u = queue.shift())) {
      try {
        const res = await fetch(u, {
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
          headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
            accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          },
        })
        results.push({ u, status: res.status })
      } catch (e) {
        results.push({ u, status: 0, err: e.name === 'TimeoutError' ? 'timeout' : e.cause?.code ?? e.message })
      }
    }
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
