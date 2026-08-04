/* tools/ciber-geo-build.mjs — proyecta la geometría de los mapas de /ciber/, una vez.

   Produce static/data/geo/ar-provincias.paths.json y world-land.paths.json:
   paths SVG ya proyectados y redondeados, más las anclas en píxeles que consume
   tools/ciber-maps.mjs (que por diseño no tiene dependencias). Solo hace falta
   correr esto de nuevo si cambia la geometría fuente, el viewBox, o si un caso
   internacional nuevo necesita un ancla de ciudad que no está en CIUDADES.

   Uso:
     GEO_MODULES_DIR=/dir/con/node_modules GEO_SRC_DIR=/dir/con/fuentes \
       node tools/ciber-geo-build.mjs
   Necesita: d3-geo, topojson-client, topojson-server, topojson-simplify.
   Fuentes en GEO_SRC_DIR:
     arg-adm1-10m.geojson  — Natural Earth 10m admin-1 filtrado a Argentina
                             (dominio público; 24 jurisdicciones con nombre e iso)
     countries-110m.json   — world-atlas@2 (Natural Earth 110m, dominio público)

   La elección de anclas no es geográfica sino editorial: el punto de cada
   incidente es la sede de los sistemas afectados, investigada a mano y guardada
   en el campo provincias del dataset; acá solo se proyectan centroides y anclas. */

import { createRequire } from 'module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULES = process.env.GEO_MODULES_DIR || process.cwd()
const SRC = process.env.GEO_SRC_DIR
if (!SRC) { console.error('falta GEO_SRC_DIR'); process.exit(1) }

const require = createRequire(join(MODULES, 'x.js'))
const d3 = require('d3-geo')
const topoClient = require('topojson-client')
const topoServer = require('topojson-server')
const topoSimplify = require('topojson-simplify')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'static', 'data', 'geo')
await mkdir(OUT, { recursive: true })

/* Enteros: a estos tamaños de viewBox el decimal es subpíxel y pesa un tercio. */
const round = (s) => s.replace(/-?\d+\.?\d*/g, (n) => String(Math.round(Number(n))))

/* --- Argentina: 24 jurisdicciones, transversal de Mercator ------------------ */

const AR_VIEW = [520, 1040]
const slugify = (name) =>
  name === 'Ciudad de Buenos Aires' ? 'caba'
    : name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')

const argFc = JSON.parse(await readFile(join(SRC, 'arg-adm1-10m.geojson'), 'utf8'))

/* Simplificación con presupuesto: el archivo final tiene que quedar liviano
   porque viaja inline en las dos páginas. */
let topo = topoServer.topology({ provincias: argFc }, 1e5)
topo = topoSimplify.presimplify(topo)
topo = topoSimplify.simplify(topo, topoSimplify.quantile(topo, 0.12))
const simplified = topoClient.feature(topo, topo.objects.provincias)

const arProj = d3.geoTransverseMercator().rotate([64, 0])
  .fitExtent([[6, 6], [AR_VIEW[0] - 6, AR_VIEW[1] - 6]], simplified)
const arPath = d3.geoPath(arProj)

const provincias = {}
for (const f of simplified.features) {
  const slug = slugify(f.properties.name)
  const [cx, cy] = arPath.centroid(f)
  provincias[slug] = {
    nombre: f.properties.name,
    path: round(arPath(f)),
    cx: Math.round(cx), cy: Math.round(cy),
  }
}

/* CABA es invisible a esta escala: el punto se corre al mar con una guía desde
   la posición real. Buenos Aires ancla en el centro de la provincia. */
const cabaReal = arProj([-58.44, -34.61])
provincias.caba.cx = Math.round(cabaReal[0])
provincias.caba.cy = Math.round(cabaReal[1])
provincias.caba.dot = [Math.round(cabaReal[0] + 68), Math.round(cabaReal[1] - 10)]

const arOut = {
  nota: 'Generado por tools/ciber-geo-build.mjs. Natural Earth 10m admin-1 (dominio público), transversal de Mercator, píxeles del viewBox.',
  viewBox: `0 0 ${AR_VIEW[0]} ${AR_VIEW[1]}`,
  provincias,
}

/* --- Mundo: contorno de tierra + anclas de casos e incidentes --------------- */

const W_VIEW = [960, 470]
let world = JSON.parse(await readFile(join(SRC, 'countries-110m.json'), 'utf8'))
world = topoSimplify.simplify(topoSimplify.presimplify(world),
  topoSimplify.quantile(topoSimplify.presimplify(world), 0.5))
const countries = world.objects.countries
countries.geometries = countries.geometries.filter((g) => g.id !== '010') // sin Antártida
const land = topoClient.merge(world, countries.geometries)

const wProj = d3.geoNaturalEarth1()
  .fitExtent([[4, 4], [W_VIEW[0] - 4, W_VIEW[1] - 4]], { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: land }] })
const wPath = d3.geoPath(wProj)

/* Ancla por caso internacional: la ciudad de la organización cuando se conoce,
   el país cuando el caso es de alcance nacional. lon/lat a mano. */
const CIUDADES = {
  'pemex-2019-11': [-99.13, 19.43],        // CDMX
  'copel-2021-02': [-49.27, -25.43],       // Curitiba
  'eletrobras-2021-02': [-43.21, -22.91],  // Río de Janeiro
  'epm-2022-12': [-75.56, 6.25],           // Medellín
  'ecopetrol-2026-07': [-74.07, 4.61],     // Bogotá
  'ucrania-2015-12': [24.71, 48.92],       // Ivano-Frankivsk (Prykarpattyaoblenergo)
  'ucrania-2016-12': [30.52, 50.45],       // Kyiv
  'ucrania-2022-04': [34.2, 48.6],       // operadora no nombrada: centro del país
  'triton-2017-08': [39.03, 22.80],        // Rabigh
  'norskhydro-2019-03': [10.75, 59.91],    // Oslo
  'colonial-2021-05': [-84.29, 34.07],     // Alpharetta, Georgia
  'dinamarca-2023-05': [9.50, 56.00],      // 22 operadoras: centro del país
}

/* Anclas de respaldo por país para filas futuras sin ciudad definida. */
const PAISES = {
  AR: [-58.4, -34.6], BO: [-68.1, -16.5], BR: [-47.9, -15.8], CL: [-70.7, -33.5],
  CO: [-74.1, 4.6], EC: [-78.5, -0.2], MX: [-99.1, 19.4], PE: [-77.0, -12.0],
  PY: [-57.6, -25.3], UY: [-56.2, -34.9], VE: [-66.9, 10.5], US: [-97.0, 38.5],
  CA: [-106.3, 52.9], DK: [9.5, 56.0], NO: [8.5, 60.5], SE: [15.0, 59.3],
  FI: [25.7, 61.9], DE: [10.0, 51.2], FR: [2.2, 46.6], ES: [-3.7, 40.4],
  IT: [12.5, 42.8], GB: [-1.5, 52.4], NL: [5.3, 52.1], BE: [4.5, 50.6],
  PL: [19.4, 52.1], UA: [31.2, 49.4], SA: [45.0, 24.0], AE: [54.3, 24.4],
  IL: [34.8, 31.5], IR: [53.0, 32.5], IN: [77.2, 28.6], CN: [116.4, 39.9],
  JP: [139.7, 35.7], KR: [127.0, 37.6], TW: [121.5, 25.0], AU: [149.1, -35.3],
}

const px = ([lon, lat]) => wProj([lon, lat]).map((v) => Math.round(v))
const casos = Object.fromEntries(Object.entries(CIUDADES).map(([id, ll]) => [id, px(ll)]))
const paises = Object.fromEntries(Object.entries(PAISES).map(([iso, ll]) => [iso, px(ll)]))

const worldOut = {
  nota: 'Generado por tools/ciber-geo-build.mjs. world-atlas@2 / Natural Earth 110m (dominio público), proyección Natural Earth, píxeles del viewBox. Sin Antártida.',
  viewBox: `0 0 ${W_VIEW[0]} ${W_VIEW[1]}`,
  land: round(wPath({ type: 'Feature', geometry: land })),
  casos,
  paises,
}

const arFile = join(OUT, 'ar-provincias.paths.json')
const worldFile = join(OUT, 'world-land.paths.json')
await writeFile(arFile, JSON.stringify(arOut))
await writeFile(worldFile, JSON.stringify(worldOut))
for (const f of [arFile, worldFile]) {
  const kb = ((await readFile(f, 'utf8')).length / 1024).toFixed(1)
  console.log(`✓ ${f} — ${kb} KB`)
  if (Number(kb) > 30) console.warn(`  ~ pasa el presupuesto (30 KB): subir la simplificación`)
}
