/* rigi-bo.mjs — barre el Boletín Oficial buscando normas del RIGI y cachea el
   texto completo de cada una. Sin dependencias.

     node tools/rigi-bo.mjs                 # busca y escribe el índice
     node tools/rigi-bo.mjs --fetch         # además baja el cuerpo de cada norma
     node tools/rigi-bo.mjs --fetch --force # re-baja lo ya cacheado

   El registro de static/data/rigi-proyectos.json se construye leyendo estas
   resoluciones: cada VPU aprobado tiene la suya, con el monto comprometido al
   centavo y el cronograma año por año. No hay dataset abierto que lo diga —
   argentina.gob.ar/economia/rigi publica agregados sin descarga — así que la
   procedencia de cada cifra del registro es un aviso del BO, y esto es lo que
   los junta.

   El buscador del BO no es una API documentada: es el endpoint que consume su
   propio frontend (ver /js/busqueda.js). El payload va como params=<JSON> y el
   objeto tiene que parecerse al que arma ParametrosBusqueda, campo por campo.
   Dos cosas lo rompen en silencio y devuelven {"error":2}: mandar
   tipoBusqueda en minúscula, y agregar claves que el formulario deja
   undefined (ordenamiento, fecha). Si algún día empieza a fallar, empezar por ahí.

   El cuerpo cacheado en raw/rigi-bo/ no se commitea (raw/ está gitignoreado):
   son ~80 avisos que se vuelven a bajar en un minuto. */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'

const BUSQUEDA = 'https://www.boletinoficial.gob.ar/busquedaAvanzada/realizarBusqueda'
const DETALLE = 'https://www.boletinoficial.gob.ar/detalleAviso/primera'
const CACHE = 'raw/rigi-bo'
const INDEX = `${CACHE}/index.json`

const args = process.argv.slice(2)
const doFetch = args.includes('--fetch')
const force = args.includes('--force')

/* Dos términos, no uno. "RIGI" sola pierde los avisos que sólo escriben el
   nombre largo, y el nombre largo solo pierde los que abrevian desde el título.
   Se unen por id, que es la identidad del aviso.

   El segundo va con todas:true a la fuerza. El buscador por defecto une las
   palabras con OR, y "Régimen de Incentivo para Grandes Inversiones" en OR
   devuelve 109.868 avisos — cualquier norma que diga "régimen". */
const TERMINOS = [
  { texto: 'RIGI', todas: false },
  { texto: 'Régimen de Incentivo para Grandes Inversiones', todas: true },
]

/* Los tipos de norma tal como los imprime el listado, del más largo al más
   corto: el parser corta por el primero que matchea y "Resolución General"
   tiene que ganarle a "Resolución". */
const TIPOS = [
  'Resolución General',
  'Resolución Sintetizada',
  'Decisión Administrativa',
  'Resolución',
  'Disposición',
  'Comunicación',
  'Decreto',
  'Circular',
  'Aviso Oficial',
  'Ley',
]

/* El RIGI nace con la ley 27.742, publicada el 8 de julio de 2024: nada anterior
   puede ser una norma del régimen. Sin este piso, el término largo trae 119
   avisos de 1998 a 2023 que sólo comparten las palabras "régimen" e
   "inversiones" — y encima son escaneos sin cuerpo HTML que fallan al bajar. */
const DESDE = '08/07/2024'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) podeley.ar/rigi-bo'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const plain = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

/* El objeto que espera el endpoint. Espejo de ParametrosBusqueda + lo que le
   setean cargarDatosBusqueda y cargarParametrosBusqAvanzada. */
const paramsFor = ({ texto, todas }, pagina) => ({
  texto,
  seccion: [1],
  rubros: [],
  nroNorma: '',
  anioNorma: '',
  denominacion: '',
  tipoContratacion: '',
  anioContratacion: '',
  nroContratacion: '',
  fechaDesde: DESDE,
  fechaHasta: '',
  tipoBusqueda: 'Avanzada',
  numeroPagina: pagina,
  ultimoRubro: '',
  busquedaRubro: false,
  hayMasResultadosBusqueda: true,
  ejecutandoLlamadaAsincronicaBusqueda: false,
  ultimaSeccion: '',
  todasLasPalabras: todas,
  filtroPorRubrosSeccion: false,
  filtroPorRubroBusqueda: false,
  filtroPorSeccionBusqueda: false,
  busquedaOriginal: pagina === 1,
  comienzaDenominacion: false,
  ordenamientoSegunda: true,
  seccionesOriginales: [1],
  ultimoItemExterno: null,
  ultimoItemInterno: null,
})

async function buscar(termino, pagina) {
  const body = new URLSearchParams({
    params: JSON.stringify(paramsFor(termino, pagina)),
    array_volver: '[]',
  })
  const res = await fetch(BUSQUEDA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.boletinoficial.gob.ar/busquedaAvanzada/primera',
      'User-Agent': UA,
    },
    body,
  })
  if (!res.ok) throw new Error(`búsqueda "${termino.texto}" p${pagina}: HTTP ${res.status}`)
  const json = await res.json()
  if (json.error !== 0) {
    throw new Error(`"${termino.texto}" p${pagina}: ${json.mensajes?.join(' · ') ?? 'error'}`)
  }
  return json.content
}

/* El listado no trae los campos separados: cada resultado es un ancla seguida de
   "ORGANISMO Tipo N/AAAA Fecha de Publicacion: DD/MM/AAAA <expediente> <extracto>".
   Se parte por "Fecha de Publicacion:" y lo de la izquierda se corta por el tipo. */
function parseListado(htmlStr) {
  const anchors = [...htmlStr.matchAll(/href="\/detalleAviso\/primera\/(\d+)\/(\d+)\?busqueda=1"/g)]
  return anchors.map((m, i) => {
    const desde = m.index
    const hasta = i + 1 < anchors.length ? anchors[i + 1].index : htmlStr.length
    const texto = plain(htmlStr.slice(desde, hasta)).replace(/^href="[^"]*"[^>]*>\s*/, '')
    const [izq, der = ''] = texto.split('Fecha de Publicacion:')

    let tipo = null
    let corte = -1
    for (const t of TIPOS) {
      const idx = izq.lastIndexOf(t)
      if (idx > corte) {
        corte = idx
        tipo = t
      }
    }

    return {
      id: m[1],
      fecha: `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`,
      fechaBo: m[2],
      organismo: corte > 0 ? izq.slice(0, corte).trim() : izq.trim(),
      tipo,
      norma: corte >= 0 ? izq.slice(corte).trim() : '',
      extracto: der.replace(/^\s*\d{2}\/\d{2}\/\d{4}\s*/, '').trim(),
      url: `${DETALLE}/${m[1]}/${m[2]}`,
    }
  })
}

/* --- 1. índice ------------------------------------------------------------- */

await mkdir(CACHE, { recursive: true })

const porId = new Map()
for (const termino of TERMINOS) {
  let pagina = 1
  let total = null
  const antes = porId.size
  for (;;) {
    const content = await buscar(termino, pagina)
    if (total === null) total = content.cantidad_result_seccion?.['1'] ?? 0
    const filas = parseListado(content.html ?? '')
    if (!filas.length) break
    for (const f of filas) if (!porId.has(f.id)) porId.set(f.id, f)
    if (!content.sig_pag || content.sig_pag <= pagina) break
    pagina = content.sig_pag
    await sleep(400)
  }
  console.log(
    `  ${termino.texto} → ${total} en el buscador · ${porId.size - antes} nuevos para el índice`,
  )
}

const avisos = [...porId.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
await writeFile(INDEX, `${JSON.stringify({ barrido: avisos.length, avisos }, null, 2)}\n`)
console.log(`✓ ${avisos.length} avisos únicos → ${INDEX}`)

const porTipo = avisos.reduce((acc, a) => ((acc[a.tipo] = (acc[a.tipo] ?? 0) + 1), acc), {})
for (const [t, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${t}`)
}

/* --- 2. cuerpo de cada aviso ----------------------------------------------- */

if (!doFetch) {
  console.log('\n  (sin --fetch: no se bajó ningún cuerpo)')
  process.exit(0)
}

const yaEstan = new Set(force ? [] : (await readdir(CACHE)).filter((f) => f.endsWith('.txt')))
let bajados = 0
let fallidos = 0

for (const a of avisos) {
  const nombre = `${a.fechaBo}-${a.id}.txt`
  if (yaEstan.has(nombre)) continue
  try {
    const res = await fetch(a.url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    /* El cuerpo vive en un único div; el resto de la página es chrome del sitio. */
    const m = html.match(/<div id="cuerpoDetalleAviso"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)
    if (!m) throw new Error('sin cuerpoDetalleAviso')
    const cuerpo = plain(m[1].replace(/<\/p>/gi, '</p>\n').replace(/<br\s*\/?>/gi, '\n'))
    await writeFile(
      `${CACHE}/${nombre}`,
      `# ${a.organismo} — ${a.norma}\n# ${a.fecha} · ${a.url}\n\n${cuerpo}\n`,
    )
    bajados++
    process.stdout.write(`\r  bajando… ${bajados}`)
    await sleep(350)
  } catch (err) {
    fallidos++
    console.error(`\n  ✗ ${a.norma} (${a.fecha}): ${err.message}`)
  }
}

console.log(`\n✓ ${bajados} cuerpos nuevos en ${CACHE}/${fallidos ? ` · ${fallidos} fallaron` : ''}`)
