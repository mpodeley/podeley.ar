/* rigi-extract.mjs — lee el cache del BO y emite un borrador de las filas del
   registro RIGI. Sin dependencias.

     node tools/rigi-extract.mjs            # tabla de control: qué salió y qué falta
     node tools/rigi-extract.mjs --json     # el borrador, para curar a mano
     node tools/rigi-extract.mjs --cita 1157/2026   # las citas de una resolución

   Requiere el cache de `node tools/rigi-bo.mjs --fetch`.

   Esto NO escribe el dataset. Cada campo que extrae viene con la frase de la
   resolución que lo respalda, y la fila se aprueba leyendo esa frase. Las
   resoluciones cambiaron de redacción entre 2024 y 2026 — hay al menos cuatro
   maneras de decir el monto comprometido — así que un extractor que acierte el
   90 % y falle callado en el 10 % publicaría cifras equivocadas con aire de
   dato oficial. Por eso el modo de trabajo es: el extractor propone y cita, yo
   verifico contra el texto, y lo que no cita no entra.

   Distinción que gobierna el campo del monto: el RIGI cuenta **activos
   computables**, no la inversión total del proyecto. En VMOS la total son USD
   3.000 M y los activos computables USD 2.486 M, y es sobre estos últimos que
   corren el mínimo del artículo 172 y el plazo del 176. La prensa los mezcla. */

import { readFile, readdir } from 'node:fs/promises'

const CACHE = 'raw/rigi-bo'
const args = process.argv.slice(2)
const asJson = args.includes('--json')
const citaDe = args.includes('--cita') ? args[args.indexOf('--cita') + 1] : null

/* El marcador de que una resolución aprueba un VPU. Las que sólo prorrogan,
   modifican o crean el Comité Evaluador no lo llevan. */
const MARCADOR = /Apruébase la solicitud de adhesión/i

const norm = (s) =>
  s
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')

/* Devuelve el primer patrón que matchea, junto con la oración que lo contiene.
   La cita es lo que hace verificable a la fila: sin ella el valor no se usa. */
function buscar(texto, patrones) {
  for (const [nombre, re] of patrones) {
    const m = texto.match(re)
    if (!m) continue
    const desde = texto.lastIndexOf('. Que ', m.index)
    const hasta = texto.indexOf('. Que ', m.index + m[0].length)
    return {
      valor: m[1]?.trim() ?? m[0].trim(),
      grupos: m.slice(1).map((g) => g?.trim() ?? null),
      patron: nombre,
      cita: texto.slice(desde > 0 ? desde + 2 : Math.max(0, m.index - 200), hasta > 0 ? hasta + 1 : m.index + m[0].length + 200).trim(),
    }
  }
  return null
}

/* "(USD. 83.169.124)" — con punto después de USD — aparece en la 413/2026. Un
   solo carácter de más dejaba la fila sin el segundo año. */
const usd = /\(USD\.?\s?([\d.]+(?:,\d+)?)\)/.source

/* Cada campo, con sus variantes en orden de preferencia. El nombre del patrón
   viaja al borrador: si una fila salió por la variante más laxa, se mira. */
const CAMPOS = {
  /* El guion final del "ARTÍCULO 2°.-" no es decorativo: sin exigirlo, el corte
     también matchea dentro de "ARTÍCULO 20", y como el artículo 1 de varias
     resoluciones pasa los 900 caracteres el motor terminaba tomando desde
     "ARTÍCULO 11" hasta el final. Ahí el sector y el VPU no están. */
  articulo1: [
    ['art1', /ART[ÍI]CULO\s*1\s*[°º]?\s*\.?\s*-\s*([\s\S]*?)(?=ART[ÍI]CULO\s*2\s*[°º]?\s*\.?\s*-)/],
  ],

  sector: [
    ['art1-sector-subsector', /enmarcado en el [Ss]ector (?:de )?"([^"]+)",? [Ss]ubsector (?:de |")?"?([^",.]+)"?/],
    ['art1-sector', /enmarcado en el [Ss]ector (?:de )?"([^"]+)"/],
    ['art1-bajo', /bajo el sector de ([a-záéíóú]+) y el plan de inversión/],
  ],

  /* `vpu` no se extrae con un patrón porque no hay uno: catorce resoluciones lo
     escriben de catorce maneras. Lo que sí es estable es el par nombre-CUIT, y
     que cuando hay dos el primero es la casa matriz y el segundo la sucursal
     dedicada — que es el VPU. Se extraen todos los pares en orden y el rol lo
     asigna la lectura; ver `entidades` más abajo. */

  proyecto: [
    ['art1-proyecto-unico', /titular del proyecto único denominado "([^"]+)"/i],
    ['art1-vpu-denominado', /titular del Vehículo de Proyecto Único \(VPU\) denominado "([^"]+)"/i],
    ['art1-proyecto-denominado', /titular del proyecto denominado "([^"]+)"/i],
    ['art1-titular-proyecto', /titular del [Pp]royecto "([^"]+)"/],
    ['art1-a-cargo', /a cargo del proyecto único denominado "([^"]+)"/i],
    ['art1-proyecto-suelto', /proyecto denominado "([^"]+)"/i],
  ],

  /* Activos computables, que es lo que cuenta el régimen. Las variantes están
     ordenadas de la más específica a la más laxa a propósito: "inversión total
     en activos computables" es inequívoca, "corresponden a inversiones en
     activos computables" aparece cuando la resolución primero dice la total. */
  monto_computable: [
    ['inversion-total-computables', new RegExp(`inversión total en activos computables[^()]{0,200}?${usd}`)],
    ['corresponden-computables', new RegExp(`${usd}[^.]{0,40}?corresponden a inversiones en activos computables`)],
    ['inversion-en-computables', new RegExp(`inversi(?:ones|ón) en activos computables (?:será[nd]?|ascien\\w+|de)[^()]{0,140}?${usd}`)],
  ],

  /* Las invertidas van primero y no es cosmético. TGS escribe "declaró en activos
     computables la suma de (USD 393.617.489) para el primer año … y de
     (USD 30.575.689) para el segundo año": leyendo hacia adelante desde "para el
     primer año" el primer monto que aparece es el del SEGUNDO. La variante que
     ancla el monto antes del año desempata. */
  cronograma_anio1: [
    ['primer-anio-invertido', new RegExp(`${usd} para el primer año`)],
    ['primer-anio', new RegExp(`para el primer año,? (?:de|será de|ser[áa]n de)?[^()]*?${usd}`)],
  ],
  cronograma_anio2: [
    ['segundo-anio-invertido', new RegExp(`${usd} para el segundo año`)],
    ['segundo-anio', new RegExp(`(?:para el|el monto de la inversión para el) segundo año,? (?:de|será de|ser[áa] de)?[^()]*?${usd}`)],
  ],

  /* La redacción de 2026 dice los dos años de un saque, sin nombrarlos: "…durante
     el primer y segundo año … es de (USD A) y (USD B) respectivamente". Rellena
     los dos campos anteriores cuando ninguno salió por su cuenta. */
  cronograma_par: [
    ['primer-y-segundo', new RegExp(`durante el primer y segundo año[^()]*?${usd}[^()]*?${usd} respectivamente`)],
  ],

  /* Y algunas ni siquiera lo abren por año: dan el total de los dos primeros y
     lo contrastan contra el 40 % del mínimo. No es un fallo de extracción, es
     lo único que la resolución dice — la fila queda con el bienio y sin apertura,
     y el registro tiene que poder representar eso sin inventar la mitad. */
  cronograma_bienio: [
    ['bienio-total', new RegExp(`primer y segundo año[^()]*?ascien[^()]*?${usd}`)],
  ],

  plazo_minimo: [
    ['fecha-limite', /fecha límite comprometida para alcanzar el monto mínimo de inversión[\s\S]{0,700}?es el (\d{1,2}[°º]? de [a-záéíóú]+ de \d{4})/i],
    ['estimo-fecha-limite', /estimó el (\d{1,2}[°º]? de [a-záéíóú]+ de \d{4}) como fecha límite para alcanzar la inversión mínima/i],
    ['fecha-limite-suelta', /fecha límite para alcanzar (?:el monto mínimo|la inversión mínima)[\s\S]{0,400}?(\d{1,2}[°º]? de [a-záéíóú]+ de \d{4})/i],
  ],

  /* El plan de desarrollo de proveedores del inciso l del artículo 47. Unas
     resoluciones lo dan en porcentaje y otras en dólares; se guardan los dos. */
  proveedores_pct: [
    ['pct-proveedores', /\(([\d,]+) ?%\)[^.]{0,200}?proveedores locales/],
    ['pct-proveedores-inv', /proveedores locales[^.]{0,200}?\(([\d,]+) ?%\)/],
  ],
  proveedores_usd: [['usd-proveedores', new RegExp(`${usd}[^.]{0,120}?(?:será cancelada|corresponde) a proveedores locales`)]],

  adhesion: [
    ['fecha-adhesion', /(\d{1,2}[°º]? de [a-záéíóú]+ de \d{4})[^.]{0,300}?como la de adhesión al RIGI/i],
    ['fecha-adhesion-inv', /considerar (?:dicha fecha|el (\d{1,2}[°º]? de [a-záéíóú]+ de \d{4}))[^.]{0,120}?adhesión al RIGI/i],
  ],

  capacidad: [['art1-capacidad', /por una capacidad[^,.]{0,140}/]],

  expediente: [['visto-ex', /Visto el expediente (EX-\d{4}-\d+)/]],
  acta: [['acta-comite', /Acta N[°º] ?(\d+)/]],

  /* Los incentivos que la resolución declara aplicables. Alimentan la capa
     fiscal: sin monetizar todavía, pero el inventario ya es información. */
  art190: [['franquicia-190', /franquicia establecida por el artículo 190/]],
  art198: [['incentivo-198', /incentivos del artículo 198/]],
  exportacion_estrategica: [['pelp', /como Proyecto de Exportación Estratégica de Largo Plazo/]],
  ampliacion: [['ampliacion', /ampliación de un proyecto preexistente/]],
}

/* --- lectura del cache ------------------------------------------------------ */

/* Cada "<Razón social> (ALIAS), CUIT N° 30-xxxxxxxx-x" del artículo 1, en orden
   de aparición. Las variantes de puntuación entre el nombre y el CUIT son
   muchas — coma, paréntesis, "(VPU)", nada — así que lo que se ancla es el
   CUIT y el nombre se toma hacia atrás. */
const PAR_ENTIDAD =
  /([A-ZÁÉÍÓÚÑ][^,;()]{2,85}?)\s*(?:\(([^)]{2,40})\))?\s*[,]?\s*\(?\s*CUIT\s*N?\s*[°º]?\s*:?\s*(\d{2}-?\d{8}-?\d)/g

/* Las provincias no se buscan con un patrón sino con el padrón: hay veinticuatro
   y son un conjunto cerrado, así que se pregunta cuáles aparecen en el texto en
   vez de adivinar cómo está redactada la ubicación. Un proyecto puede tocar dos
   —Sal de Oro II está en la zona limítrofe Salta-Catamarca— y varias
   resoluciones nombran provincias que no son la del proyecto (la sede del
   solicitante, el trazado de un ducto), así que esto propone y la fila decide. */
const PROVINCIAS = [
  ['Buenos Aires', /provincia de Buenos Aires/i],
  ['CABA', /Ciudad (?:Autónoma )?de Buenos Aires/i],
  ['Catamarca', /Catamarca/i],
  ['Chaco', /Chaco/i],
  ['Chubut', /Chubut/i],
  ['Córdoba', /Córdoba/i],
  ['Corrientes', /Corrientes/i],
  ['Entre Ríos', /Entre Ríos/i],
  ['Formosa', /Formosa/i],
  ['Jujuy', /Jujuy/i],
  ['La Pampa', /La Pampa/i],
  ['La Rioja', /La Rioja/i],
  ['Mendoza', /Mendoza/i],
  ['Misiones', /Misiones/i],
  ['Neuquén', /Neuqu[ée]n/i],
  ['Río Negro', /Río Negro/i],
  ['Salta', /Salta/i],
  ['San Juan', /San Juan/i],
  ['San Luis', /San Luis/i],
  ['Santa Cruz', /Santa Cruz/i],
  ['Santa Fe', /Santa Fe/i],
  ['Santiago del Estero', /Santiago del Estero/i],
  ['Tierra del Fuego', /Tierra del Fuego/i],
  ['Tucumán', /Tucumán/i],
]

/* Toda resolución abre con "Ciudad de Buenos Aires, <fecha>": sin sacar esa
   línea, CABA sale como ubicación de los veintiún proyectos, incluidos los que
   están en un salar de Catamarca. */
const provinciasDe = (texto) => {
  const sinEncabezado = texto.replace(/Ciudad de Buenos Aires,\s*\d{1,2}\/\d{1,2}\/\d{4}/g, '')
  return PROVINCIAS.filter(([, re]) => re.test(sinEncabezado)).map(([n]) => n)
}

const entidadesDe = (art1) =>
  [...art1.matchAll(PAR_ENTIDAD)].map((m) => ({
    nombre: m[1].replace(/^(?:y el plan de inversión,? )?(?:presentad[oa]s? |a )?(?:por |de )?(?:la firma |el )?/i, '').trim(),
    alias: m[2] ?? null,
    cuit: m[3],
  }))

const archivos = (await readdir(CACHE)).filter((f) => f.endsWith('.txt')).sort()
const filas = []

for (const archivo of archivos) {
  const crudo = await readFile(`${CACHE}/${archivo}`, 'utf8')
  if (!MARCADOR.test(crudo)) continue

  const cabecera = crudo.match(/^# (.+?) — (.+)\n# (\S+) · (\S+)/m)
  const texto = norm(crudo)
  const art1 = buscar(texto, CAMPOS.articulo1)?.valor ?? texto

  const fila = {
    resolucion: cabecera?.[2] ?? archivo,
    organismo: cabecera?.[1] ?? null,
    fecha_publicacion: cabecera?.[3] ?? null,
    boletin_url: cabecera?.[4] ?? null,
    archivo,
    entidades: entidadesDe(art1),
    provincias_art1: provinciasDe(art1),
    provincias_texto: provinciasDe(texto),
  }
  const citas = {}

  for (const [campo, patrones] of Object.entries(CAMPOS)) {
    if (campo === 'articulo1') continue
    /* Los campos de identidad se buscan en el artículo 1, que es el dispositivo:
       en los considerandos aparecen también los proyectos desistidos y los
       antecedentes de otras empresas. Posco es el caso: "Sal de Oro" (desistido)
       aparece antes que "Sal de Oro II" en el mismo texto. */
    const ambito = ['sector', 'proyecto', 'capacidad'].includes(campo) ? art1 : texto
    const hit = buscar(ambito, patrones)
    if (!hit) {
      fila[campo] = null
      continue
    }
    if (campo === 'sector') {
      fila.sector = hit.grupos[0]
      fila.subsector = hit.grupos[1] ?? null
    } else if (['art190', 'art198', 'exportacion_estrategica', 'ampliacion'].includes(campo)) {
      fila[campo] = true
    } else {
      fila[campo] = hit.valor
    }
    citas[campo] = { patron: hit.patron, cita: hit.cita.slice(0, 420) }
  }

  if (fila.cronograma_par && !fila.cronograma_anio1) {
    const par = buscar(texto, CAMPOS.cronograma_par)
    fila.cronograma_anio1 = par.grupos[0]
    fila.cronograma_anio2 = par.grupos[1]
    citas.cronograma_anio1 = citas.cronograma_anio2 = { patron: par.patron, cita: par.cita.slice(0, 420) }
  }
  delete fila.cronograma_par

  fila._citas = citas
  filas.push(fila)
}

/* --- salida ----------------------------------------------------------------- */

if (citaDe) {
  const f = filas.find((x) => x.resolucion.includes(citaDe))
  if (!f) {
    console.error(`no hay resolución que matchee "${citaDe}"`)
    process.exit(1)
  }
  console.log(`${f.organismo} — ${f.resolucion} · ${f.boletin_url}\n`)
  for (const [campo, { patron, cita }] of Object.entries(f._citas)) {
    console.log(`${campo}  [${patron}]\n  ${f[campo]}\n  «${cita}»\n`)
  }
  process.exit(0)
}

if (asJson) {
  console.log(JSON.stringify(filas, null, 2))
  process.exit(0)
}

const OBLIGATORIOS = ['sector', 'entidades', 'proyecto', 'monto_computable', 'cronograma_anio1', 'plazo_minimo']
const lleno = (f, c) => (c === 'entidades' ? f.entidades.length > 0 : Boolean(f[c]))

console.log(`${filas.length} resoluciones de aprobación en ${CACHE}/\n`)
console.log(`   sect ent  proy mont cron plaz   resolución            proyecto`)
for (const f of filas.sort((a, b) => a.fecha_publicacion.localeCompare(b.fecha_publicacion))) {
  const marcas = OBLIGATORIOS.map((c) => (lleno(f, c) ? ' ' : '·')).join('    ')
  console.log(`   ${marcas}   ${f.resolucion.padEnd(21)} ${(f.proyecto ?? '—').slice(0, 44)}`)
}

const faltan = Object.fromEntries(
  OBLIGATORIOS.map((c) => [c, filas.filter((f) => !lleno(f, c)).length]).filter(([, n]) => n),
)
console.log(
  Object.keys(faltan).length
    ? `\n· = sin extraer. Faltantes: ${JSON.stringify(faltan)}`
    : '\n✓ todos los campos obligatorios salieron en las 21',
)
