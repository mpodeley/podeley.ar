# podeley.ar

Segment funnel — E&P, minería, gas y energía, ciber, consultoría, research. Estático,
bilingüe (ES/EN), sin dependencias y sin JavaScript propio: lo único que corre en el
navegador es la etiqueta de GoatCounter.

```
npm run build     # build.mjs + postbuild.mjs → dist/
npm run serve     # build + http://localhost:8080
npm run check     # las dos guardas: ciber-check + site-check
npm run deploy    # guardas + build + espejo a la org + push de dist/ a gh-pages
```

Node 20+. No hay `npm install`: nada tiene dependencias (`npm run deploy` baja
`gh-pages` con `npx` en el momento).

## Cómo está armado

`build.mjs` (~280 líneas, cero deps) ensambla `dist/` a partir de:

| | |
|---|---|
| `site.config.json` | lo que distingue a este sitio: origin, nav, idiomas, analytics |
| `src/layout.html` | el shell: `<head>` con OG/canonical/hreflang, masthead, footer |
| `src/pages/<slug>.<es\|en>.html` | **el copy** — HTML plano del `<main>` |
| `src/styles/tokens.css` + `chrome.css` | la identidad podeley: fuentes, `--pd-*`, masthead |
| `src/styles/site.css` | el diseño propio de este sitio |
| `static/` | fuentes, capturas, favicon, OG, los datos del registro ciber, `CNAME`, `robots.txt` |

`build.mjs`, `src/layout.html`, `chrome.css` y `tokens.css` son copias vendoreadas del
kit `podeley/identity`: acá no se editan — se edita el kit y se corre `npm run sync`
(`npm run sync:check` avisa si quedaron viejas). Lo que el kit no hace lo agrega
`tools/postbuild.mjs` parchando `dist/`: el `<lastmod>` del sitemap (fecha del último
commit de cada página, vía git) y el feed Atom del registro ciber (`/ciber/feed.xml`)
con su `<link>` de autodiscovery.

Español en la raíz (`/ep/`), inglés bajo `/en/` (`/en/ep/`). El sitemap y los pares
`hreflang` se generan solos desde la lista de páginas.

## Editar el copy

Abrí el archivo de la página y editá el HTML. Arriba de todo va un bloque de metadata
en JSON:

```html
<!--meta
{
  "title": "Consultoría de datos e IA para E&P — Matías Podeley",
  "description": "Actividad de la competencia, declinación por pozo, …",
  "nav": "ep"
}
-->
<section class="hero wrap">
  …
```

`title` y `description` alimentan `<title>`, la meta description y los tags OG/Twitter
de esa página; un `"jsonld"` opcional se emite como `ld+json` (lo llevan el home,
`/ciber/`, `/consultoria/` y `/perfil/`). `nav` marca el item activo del menú con las
claves de `site.config.json` (`ep`, `mineria`, `energia`, `ciber`, `consultoria`,
`perfil`); `research` quedó fuera del menú y `index`/`404` no lo declaran.

El texto va sin escapar en el JSON (`E&P`, comillas con `\"`); en el HTML del cuerpo
se escribe como HTML (`E&amp;P`).

Los labels del menú están en el `nav` de `site.config.json`; los textos del chrome
(footer, skip link, toggle de idioma) en `STRINGS`, arriba de `build.mjs` — que es del
kit, así que se cambian allá.

## Los números y sus guardas

Las cifras que el sitio repite entre páginas viven en `tools/metrics.json`; los conteos
del registro ciber salen de `static/data/ciber-incidentes.json`. Dos guardas las recitan
contra el copy y fallan donde quedó un número viejo:

- `tools/site-check.mjs` — las métricas compartidas (13.5 meses, 21,386 derechos…) en
  las páginas de los dos idiomas y en las tarjetas OG, y que el `dateModified` del
  Dataset de `/ciber/` diga lo mismo que el JSON.
- `tools/ciber-check.mjs` — el esquema del dataset, los numerales escritos en palabras
  ("catorce"), la paridad es/en de secciones y tablas; con `--links` verifica además
  que toda URL citada esté viva.

`npm run check` corre las dos, y el deploy no publica sin eso en verde. Alrededor del
registro también están `tools/ciber-monitor.mjs` (vigila ransomware.live y avisa cuando
hay que escribir una fila) y `tools/og-cards.mjs` (regenera los PNG de las tarjetas OG;
necesita playwright, ver su encabezado).

## Bloques disponibles

Definidos en `src/styles/site.css`, en el orden en que aparecen ahí:

- `<section class="hero wrap">` — `.kicker`, `h1`, `.hero-sub`, `.hero-cta`
- `<div class="rule" role="presentation">` — el separador de barras, entre secciones
- `<section class="pd-section wrap" id="…">` con `.section-head` (`.eyebrow` → `h2` → `.intro`)
- `.cards` / `.card` — grilla de casos con captura 16:10, `.pitch`, `.meta`, `.tag`
- `.seg-cards` / `.seg-card` — el selector de área del home
- `.principles` / `.principle` — el three-up con regla de color arriba
- `.btn--primary`, `.btn--outline`, `.link-plain`, `.cta-strip`, `.aside-link`

Los `.eyebrow` y `.kicker` se escriben en capitalización normal: el CSS los pasa a
mayúsculas.

## Capturas

`npm run shots` re-captura las 15 capturas de los casos a `static/assets/shots/`.
Necesita `playwright-core` + chromium y `sharp`; ver el encabezado de `tools/shots.mjs`.

## Deploy

El sitio se sirve desde la rama `gh-pages` de **`podeley/podeley.github.io`**, que es a
donde `npm run deploy` hace build y push (por eso el `-r` explícito en el script: sin él,
`gh-pages` empujaría a `origin`, que es otro repo). El dominio `podeley.ar` está conectado
(CNAME en `static/`, DNS en Porkbun).

La cadena completa: `tools/predeploy.mjs` (aborta si el árbol está sucio o HEAD no
coincide con `origin/main` — `gh-pages` publica el árbol, no lo commiteado, y con más de
una sesión trabajando eso ya mandó a producción trabajo a medias una vez) → `npm run
check` → build → `git push org main:main` (espeja la fuente en la org, así lo visible en
GitHub y lo publicado no driftean nunca) → push de `dist/` a `gh-pages`. Salteo
consciente: `PREDEPLOY_SKIP=1 npm run deploy`.

No hay GitHub Action activa: el token de `gh` no tiene scope `workflow`. El workflow listo
para activar está en `tools/deploy.workflow.yml`, con los pasos de activación en su
encabezado (PAT de la org como secret + mover el archivo a `.github/workflows/`).
