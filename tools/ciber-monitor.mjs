/* ciber-monitor.mjs — vigila los sitios de filtración por víctimas argentinas
   del sector energético. Sin dependencias.

     node tools/ciber-monitor.mjs           # lista lo que hay y marca lo nuevo
     node tools/ciber-monitor.mjs --check   # sale 1 si apareció algo nuevo (cron)
     node tools/ciber-monitor.mjs --json    # emite las filas nuevas listas para pegar

   El registro de static/data/ciber-incidentes.json se mantiene a mano: cada fila
   necesita leer lo que declaró la empresa, que ningún endpoint devuelve. Esto
   sólo avisa cuándo hay que sentarse a escribir una fila nueva.

   Por qué ransomware.live y no un feed de prensa: la mayoría de las filas del
   registro nunca tuvieron una línea publicada. El sitio de filtración del atacante
   es el único canal que las cubre a todas — a costa de que lo que dice es la versión
   del atacante, no un hecho verificado. Por eso la salida es un borrador, no una fila. */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const API = 'https://api.ransomware.live/v2/countryvictims/AR'
const REGISTRY = 'static/data/ciber-incidentes.json'

const args = process.argv.slice(2)
const check = args.includes('--check')
const asJson = args.includes('--json')

/* La clasificación por sector de la fuente no alcanza: la CNEA está catalogada
   como "Government & Defense" y es el organismo nuclear del país. Se cruza la
   categoría con un léxico propio, y aun así se revisa a ojo lo que caiga cerca. */
const SECTOR_ACTIVITIES = new Set(['Energy & Utilities', 'Energy'])

const LEXICON =
  /petrol|oleoduct|gasoduct|\boil\b|\bgas\b|energ|electric|electrif|nuclear|atomic|refin|combustible|hidrocarbur|yacimient|usina|central t[ée]rmica|transportadora|e[óo]lic|hidroel[ée]ctric|carbon[íi]fer|\bglp\b|\bgnl\b|aysa|aguas (corrientes|argentinas|santafesinas)|saneamiento|cooperativa el[ée]ctrica/i

/* Los sitios de filtración usan "<título>@<grupo>" como identidad de la víctima,
   y el permalink público es ese string en base64. Se reconstruye acá para no
   pedir un endpoint más por víctima. */
const permalink = (v) =>
  `https://www.ransomware.live/id/${Buffer.from(`${v.post_title}@${v.group_name}`).toString('base64')}`

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

/* El léxico se aplica al nombre y al dominio, nunca a la descripción: esa la
   escribe el atacante y es prosa de venta. Matcheando ahí, una bodega llamada
   Punta del Agua y una ferretería entraban al registro del sector energético. */
const relevant = (v) => {
  if (SECTOR_ACTIVITIES.has(v.activity)) return 'sector'
  return LEXICON.test([v.post_title, v.website].filter(Boolean).join(' ')) ? 'lexico' : null
}

/* --- lo que ya está registrado ------------------------------------------- */

const registry = JSON.parse(await readFile(REGISTRY, 'utf8'))
const known = new Set()
for (const row of registry.incidentes) {
  known.add(norm(row.org))
  const host = row.fuentes.map((f) => f.match(/ransomware\.live\/id\/(.+)$/)?.[1]).find(Boolean)
  if (host) known.add(norm(Buffer.from(host, 'base64').toString('utf8')))
}

/* --- lo que hay hoy ------------------------------------------------------- */

/* La API limita por tasa y devuelve 429 a la segunda corrida seguida. Se cachea
   media hora en un archivo ignorado por git: alcanza para iterar sin golpearla, y
   un cron diario nunca ve la caché. */
const CACHE = 'node_modules/.cache/ciber-victims-ar.json'
const TTL_MS = 30 * 60 * 1000

let victims = null
try {
  const hit = JSON.parse(await readFile(CACHE, 'utf8'))
  if (Date.now() - hit.at < TTL_MS) victims = hit.victims
} catch {
  /* sin caché o ilegible — se pide a la API */
}

if (!victims) {
  const res = await fetch(API, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    console.error(
      res.status === 429
        ? 'ransomware.live limitó por tasa (429). Reintentá en unos minutos.'
        : `ransomware.live respondió HTTP ${res.status}`,
    )
    process.exit(2)
  }
  victims = await res.json()
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, JSON.stringify({ at: Date.now(), victims }))
}

const hits = victims
  .map((v) => ({ v, why: relevant(v) }))
  .filter(({ why }) => why)
  .map(({ v, why }) => ({
    v,
    why,
    // Una víctima se da por conocida si su nombre o su dominio ya figura en el
    // registro. HASA aparece dos veces con grupos distintos: la clave incluye el
    // grupo para no colapsar dos incidentes reales en uno.
    isNew: !known.has(norm(`${v.post_title}@${v.group_name}`)) && !known.has(norm(v.post_title)) && !known.has(norm(v.website)),
  }))
  .sort((a, b) => a.v.discovered.localeCompare(b.v.discovered))

const fresh = hits.filter((h) => h.isNew)

/* --- salida --------------------------------------------------------------- */

if (asJson) {
  console.log(
    JSON.stringify(
      fresh.map(({ v }) => ({
        id: `${norm(v.website || v.post_title).slice(0, 18)}-${v.discovered.slice(0, 7)}`,
        org: v.post_title,
        subsector: 'REVISAR',
        fecha_incidente: v.discovered.slice(0, 10),
        fecha_publica: v.discovered.slice(0, 10),
        canal_divulgacion: 'leak-site',
        actor: v.group_name,
        actor_tipo: 'raas',
        sistemas_segun_empresa: null,
        sistemas_segun_actor: v.description || null,
        datos_publicados: 'sin confirmar',
        impacto_operativo_declarado: null,
        confianza: 'media',
        fuentes: [permalink(v)],
      })),
      null,
      2,
    ),
  )
} else {
  for (const { v, why, isNew } of hits) {
    const mark = isNew ? 'NUEVO ' : '      '
    const tag = why === 'lexico' ? ' (por léxico, revisar)' : ''
    console.log(`${mark}${v.discovered.slice(0, 10)}  ${v.group_name.padEnd(14)} ${v.post_title.slice(0, 44)}${tag}`)
  }
  console.log(
    `\n${victims.length} víctimas argentinas · ${hits.length} del sector · ` +
      `${fresh.length} sin registrar · registro al ${registry.actualizado}`,
  )
  if (fresh.length) console.log('para el borrador de las filas nuevas: node tools/ciber-monitor.mjs --json')
}

if (check && fresh.length) process.exit(1)
