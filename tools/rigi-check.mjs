/* rigi-check.mjs — verificador del registro RIGI. Sin dependencias.

     node tools/rigi-check.mjs           # esquema, invariantes y conteos contra el copy
     node tools/rigi-check.mjs --links   # además verifica que toda URL citada esté viva

   Existe por lo mismo que ciber-check: los conteos del registro ("veintiún
   proyectos", "USD 29.485 M") están escritos a mano en las dos páginas, y
   cuando entra una resolución nueva hay que saber dónde quedó el número viejo.
   Recalcula todo desde el dataset y falla ruidosamente.

   Además hace cumplir tres invariantes que son del registro, no del esquema, y
   que si se rompen publican una cifra equivocada con aire de dato oficial:

     1. Ningún agregado mezcla estados. El total comprometido suma aprobados y
        sólo aprobados; en evaluación y desistidos van por su cuenta.
     2. La suma del cronograma nunca supera el monto comprometido. Si lo supera
        es un error de carga: el cronograma son los primeros años del mismo monto.
     3. Toda fila sin monto comprometido explica por qué en su nota. Un null
        silencioso se lee como cero al sumar, y no es cero: es "la resolución no
        lo dice". */

import { readFile } from 'node:fs/promises'

const REGISTRY = 'static/data/rigi-proyectos.json'
const SCHEMA = 'static/data/rigi-proyectos.schema.json'
const PAGES = { es: 'src/pages/rigi.es.html', en: 'src/pages/rigi.en.html' }

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
    return
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
else ok(`${data.proyectos.length} filas validan contra ${SCHEMA}`)

/* --- invariantes del registro ---------------------------------------------- */

console.log('\ninvariantes')

const aprobados = data.proyectos.filter((p) => p.estado === 'aprobado')
const conMonto = aprobados.filter((p) => typeof p.monto_comprometido_usd === 'number')
const comprometido = conMonto.reduce((a, p) => a + p.monto_comprometido_usd, 0)

const fallasPrevias = failures
const ids = data.proyectos.map((p) => p.id)
const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
if (repetidos.length) fail(`ids repetidos: ${[...new Set(repetidos)].join(', ')}`)
else ok(`${ids.length} ids únicos`)

for (const p of data.proyectos) {
  const suma = p.cronograma.reduce((a, t) => a + t.monto_usd, 0)
  if (p.monto_comprometido_usd && suma > p.monto_comprometido_usd + 1) {
    fail(`${p.id}: el cronograma suma ${suma.toLocaleString('es-AR')} y supera el comprometido ${p.monto_comprometido_usd.toLocaleString('es-AR')}`)
  }
  if (p.monto_comprometido_usd === null && p.estado === 'aprobado' && !p.nota) {
    fail(`${p.id}: aprobado sin monto comprometido y sin nota que lo explique`)
  }
  if (p.cronograma_tipo === 'anual' && p.cronograma.length > 2) {
    fail(`${p.id}: cronograma anual con ${p.cronograma.length} tramos`)
  }
  if (p.estado === 'aprobado' && !p.boletin_url) {
    fail(`${p.id}: aprobado sin resolución en el Boletín Oficial`)
  }
}
if (failures === fallasPrevias) ok('cronogramas dentro del comprometido, y todo aprobado con su resolución')

/* El mapa dibuja lo que el dataset ancla: un aprobado sin est_ubicacion es un
   proyecto que desaparece del mapa sin que nadie lo note. */
const sinAncla = aprobados.filter((p) => !p.est_ubicacion)
if (sinAncla.length) fail(`aprobados sin est_ubicacion: ${sinAncla.map((p) => p.id).join(', ')}`)
else ok(`${aprobados.length} aprobados con ancla territorial estimada`)

/* El plazo del artículo 176 sólo puede leerse como vencido contra la fecha del
   dataset, no contra el reloj de quien corre esto: si no, el registro dice una
   cosa distinta cada día sin que nadie haya tocado un dato. */
const hoy = data.actualizado
const vencidos = aprobados.filter((p) => p.plazo_minimo && p.plazo_minimo.length === 10 && p.plazo_minimo < hoy)
for (const p of vencidos) {
  if (p.est_cumplimiento === 'sin-dato') {
    warn(`${p.id}: el plazo venció el ${p.plazo_minimo} y est_cumplimiento sigue en sin-dato`)
  }
}
ok(`${vencidos.length} plazos vencidos al ${hoy}`)

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

/* Los dos idiomas usan la convención inglesa de miles — es la regla del sitio,
   no un descuido: un número se escribe igual en la página .es y en la .en para
   que no haya que reformatearlo al traducir. Por eso acá no hay un en-US y un
   es-AR: hay uno solo. */
const millones = Math.round(comprometido / 1e6).toLocaleString('en-US')
const esperado = {
  es: [
    ['cantidad de aprobados en palabras', NUMERALES[aprobados.length]],
    ['comprometido en millones', millones],
    ['aprobados que informa Economía', NUMERALES[data.oficial.aprobados]],
  ],
  en: [
    ['approved count in words', EN_WORDS[aprobados.length]],
    ['committed, millions', millones],
    ['count the ministry reports', EN_WORDS[data.oficial.aprobados]],
  ],
}

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
  for (const [que, valor] of esperado[lang]) {
    if (!html.includes(valor)) fail(`${ruta}: no dice "${valor}" (${que})`)
  }
  /* El bloque del mapa se regenera con rigi-mapa; acá sólo se verifica que
     cuente lo mismo que el dataset. */
  const bloque = html.match(/<!-- rigi-mapa -->[\s\S]*?<!-- \/rigi-mapa -->/)
  const dots = bloque ? (bloque[0].match(/class="map-dot"/g) ?? []).length : 0
  if (dots !== aprobados.length) {
    fail(`${ruta}: el mapa dibuja ${dots} proyectos y el registro tiene ${aprobados.length} (correr tools/rigi-mapa.mjs)`)
  }
}
if (paginas) ok(`${paginas} página(s) recitan ${aprobados.length} aprobados y USD ${millones} M`)

/* --- enlaces ---------------------------------------------------------------- */

if (checkLinks) {
  console.log('\nenlaces')
  const urls = [...new Set(data.proyectos.flatMap((p) => p.fuentes).concat(data.oficial.url))]
  let muertos = 0
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
      if (!res.ok) { muertos++; fail(`${res.status} ${url}`) }
    } catch (err) {
      muertos++
      fail(`${err.message} ${url}`)
    }
  }
  if (!muertos) ok(`${urls.length} URLs vivas`)
}

/* --- resumen ---------------------------------------------------------------- */

console.log(
  `\n${aprobados.length} aprobados · ${data.proyectos.length - aprobados.length} en otros estados · ` +
    `USD ${millones} M comprometidos en activos computables ` +
    `(${conMonto.length} de ${aprobados.length} filas con monto)`,
)
console.log(
  `oficial al ${data.oficial.consultado}: ${data.oficial.aprobados} aprobados · ` +
    `USD ${Math.round(data.oficial.monto_aprobado_usd / 1e6).toLocaleString('en-US')} M`,
)

if (failures) {
  console.error(`\n✗ ${failures} problema(s)\n`)
  process.exit(1)
}
console.log('\n✓ registro RIGI en orden\n')
