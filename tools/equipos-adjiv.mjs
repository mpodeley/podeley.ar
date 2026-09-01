/* equipos-adjiv.mjs — agrega la potencia de fractura del Adjunto IV por operadora.
   Sin dependencias. Correr a demanda, nunca en CI: baja ~1,2 MB del CKAN oficial
   y el resultado se revisa antes de publicar.

     node tools/equipos-adjiv.mjs                        # compara contra el dataset
     node tools/equipos-adjiv.mjs --desde 2025-09 --hasta 2026-08
     node tools/equipos-adjiv.mjs --write                # reescribe est_hhp_operadoras
     node tools/equipos-adjiv.mjs --csv bajado.csv       # usa un CSV ya descargado
     node tools/equipos-adjiv.mjs --min-pozos 3          # piso de pozos por operadora

   Dos trampas del insumo, que también están declaradas en oficial.adjunto_iv:

   - empresa_informante es la OPERADORA del pozo, no la empresa de servicio que
     fractura. Este derivado no puede atribuir un set a su dueño, y por eso vive
     en est_hhp_operadoras y no en las filas de empresas.
   - potencia_equipos_fractura_hp sigue la convención de reporte de cada
     operadora: hay quienes informan la potencia nominal redondeada del set, una
     que informa la desplegada pozo a pozo, y valores implausibles. Por eso cada
     fila del dataset lleva confiable, y --write lo preserva junto con la nota:
     la clasificación es curaduría, no cálculo. */

import { readFile, writeFile } from 'node:fs/promises'

const REGISTRY = 'static/data/equipos-parque.json'
const CSV_URL =
  'http://datos.energia.gob.ar/dataset/71fa2e84-0316-4a1b-af68-7f35e41f58d7/resource/' +
  '2280ad92-6ed3-403e-a095-50139863ab0d/download/' +
  'datos-de-fractura-de-pozos-de-hidrocarburos-adjunto-iv-actualizacin-diaria.csv'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const write = args.includes('--write')
const minPozos = Number(flag('--min-pozos') ?? 3)

const hoy = new Date()
const mesISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const hasta = flag('--hasta') ?? mesISO(hoy)
const desde = flag('--desde') ?? mesISO(new Date(hoy.getFullYear() - 1, hoy.getMonth() + 1, 1))

/* --- insumo ----------------------------------------------------------------- */

let csv
const local = flag('--csv')
if (local) {
  csv = await readFile(local, 'utf8')
} else {
  console.log(`bajando ${CSV_URL}`)
  const res = await fetch(CSV_URL)
  if (!res.ok) {
    console.error(`✗ ${res.status} al bajar el CSV; probar --csv con una descarga manual`)
    process.exit(1)
  }
  csv = await res.text()
}

/* Parser CSV mínimo: comillas dobles, comas adentro de comillas, CRLF. */
function parsear(texto) {
  const filas = []
  let fila = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') {
      fila.push(campo.replace(/\r$/, ''))
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  if (campo || fila.length) { fila.push(campo.replace(/\r$/, '')); filas.push(fila) }
  return filas
}

const [header, ...filas] = parsear(csv)
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
for (const necesaria of ['empresa_informante', 'potencia_equipos_fractura_hp', 'anio_if', 'mes_if']) {
  if (!(necesaria in col)) {
    console.error(`✗ el CSV no trae la columna ${necesaria}; ¿cambió el recurso?`)
    process.exit(1)
  }
}

/* --- agregación ------------------------------------------------------------- */

const porOperadora = new Map()
let enVentana = 0
for (const f of filas) {
  if (f.length < header.length) continue
  const anio = f[col.anio_if]
  const mes = String(f[col.mes_if]).padStart(2, '0')
  if (!anio || anio === '0') continue
  const periodo = `${anio}-${mes}`
  if (periodo < desde || periodo > hasta) continue
  const hp = Number(f[col.potencia_equipos_fractura_hp])
  if (!Number.isFinite(hp) || hp <= 0) continue
  enVentana++
  const nombre = f[col.empresa_informante].trim()
  if (!porOperadora.has(nombre)) porOperadora.set(nombre, [])
  porOperadora.get(nombre).push(hp)
}

const agregado = [...porOperadora.entries()]
  .map(([operadora, valores]) => {
    valores.sort((a, b) => a - b)
    return {
      operadora,
      hhp_max_informado: valores[valores.length - 1],
      hhp_p95: valores[Math.max(0, Math.ceil(valores.length * 0.95) - 1)],
      pozos_muestra: valores.length,
      desde,
      hasta,
    }
  })
  .filter((r) => r.pozos_muestra >= minPozos)
  .sort((a, b) => b.hhp_max_informado - a.hhp_max_informado)

/* --- comparación y escritura ------------------------------------------------ */

const texto = await readFile(REGISTRY, 'utf8')
const data = JSON.parse(texto)
const previas = new Map((data.est_hhp_operadoras ?? []).map((r) => [r.operadora, r]))

console.log(`\n${enVentana} fracturas en la ventana ${desde} → ${hasta} · piso ${minPozos} pozos por operadora\n`)
console.log('operadora'.padEnd(42) + 'max HP'.padStart(10) + 'p95'.padStart(10) + 'pozos'.padStart(7) + '  dataset')
for (const r of agregado) {
  const previa = previas.get(r.operadora)
  const estado = previa
    ? previa.hhp_max_informado === r.hhp_max_informado
      ? 'igual'
      : `tenía ${previa.hhp_max_informado}`
    : 'nueva'
  const marca = previa?.confiable === false ? ' [no confiable]' : ''
  console.log(
    r.operadora.padEnd(42) +
      String(r.hhp_max_informado).padStart(10) +
      String(r.hhp_p95).padStart(10) +
      String(r.pozos_muestra).padStart(7) +
      `  ${estado}${marca}`,
  )
}
const caidas = [...previas.keys()].filter((op) => !agregado.some((r) => r.operadora === op))
if (caidas.length) console.log(`\nen el dataset pero sin fracturas en la ventana: ${caidas.join(', ')}`)

if (!write) {
  console.log('\n(sin --write no se toca el dataset)')
  process.exit(0)
}

/* La clasificación confiable/nota es curaduría: se preserva por operadora. Una
   operadora nueva entra confiable hasta que alguien la mire y diga lo contrario. */
const nuevo = agregado.map((r) => ({
  ...r,
  confiable: previas.get(r.operadora)?.confiable ?? true,
  nota: previas.get(r.operadora)?.nota ?? null,
}))

/* Cirugía textual sobre el archivo: se reemplaza sólo el arreglo
   est_hhp_operadoras para no reformatear el resto del JSON, que está escrito a
   mano. El arreglo es la última clave del objeto raíz. */
const clave = '"est_hhp_operadoras": ['
const i = texto.indexOf(clave)
if (i === -1) {
  console.error('✗ el dataset no tiene la clave est_hhp_operadoras')
  process.exit(1)
}
let j = i + clave.length
let nivel = 1
while (j < texto.length && nivel > 0) {
  if (texto[j] === '[') nivel++
  if (texto[j] === ']') nivel--
  j++
}
const cuerpo = nuevo.map((r) => '    ' + JSON.stringify(r).replace(/,"/g, ', "').replace(/":/g, '": ')).join(',\n')
const reemplazo = nuevo.length ? `${clave}\n${cuerpo}\n  ]` : `${clave}]`
await writeFile(REGISTRY, texto.slice(0, i) + reemplazo + texto.slice(j))
console.log(`\n✓ est_hhp_operadoras: ${nuevo.length} filas escritas en ${REGISTRY}`)
console.log('  revisar confiable/nota de las filas nuevas, y actualizar oficial.adjunto_iv.consultado a la fecha de esta corrida')
