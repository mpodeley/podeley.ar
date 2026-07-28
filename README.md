# podeley.ar

Segment funnel — E&P, minería, gas y energía, research. Estático, bilingüe (ES/EN),
sin dependencias y sin JavaScript en el sitio publicado.

```
npm run build     # → dist/
npm run serve     # build + http://localhost:8080
npm run deploy    # build + push de dist/ a la rama gh-pages
```

Node 20+. No hay `npm install`: el build no tiene dependencias (`npm run deploy` baja
`gh-pages` con `npx` en el momento).

## Cómo está armado

`build.mjs` (~150 líneas, cero deps) ensambla `dist/` a partir de:

| | |
|---|---|
| `src/layout.html` | el shell: `<head>` con OG/canonical/hreflang, masthead, footer |
| `src/pages/<slug>.<es\|en>.html` | **el copy** — HTML plano del `<main>` |
| `src/styles/tokens.css` | identidad podeley (fuentes + `--pd-*`) |
| `src/styles/site.css` | el diseño |
| `static/` | fuentes, capturas, favicon, OG, `CNAME`, `robots.txt` |

Español en la raíz (`/ep/`), inglés bajo `/en/` (`/en/ep/`). El sitemap y los pares
`hreflang` se generan solos desde la lista de páginas.

## Editar el copy

Abrí el archivo de la página y editá el HTML. Arriba de todo va un bloque de metadata
en JSON:

```html
<!--meta
{
  "title": "Datos públicos para E&P — Matías Podeley",
  "description": "Actividad de la competencia, declinación por pozo, …",
  "nav": "ep"
}
-->
<section class="hero wrap">
  …
```

`title` y `description` alimentan `<title>`, la meta description y los tags OG/Twitter
de esa página. `nav` marca el item activo del menú (`ep`, `mineria`, `energia`,
`research`; se omite en `index` y `404`).

El texto va sin escapar en el JSON (`E&P`, comillas con `\"`); en el HTML del cuerpo
se escribe como HTML (`E&amp;P`).

Los labels del menú y el footer son lo único traducido fuera de las páginas: están en
`NAV` y `STRINGS`, arriba de `build.mjs`.

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

GitHub Pages desde la rama `gh-pages`, dominio propio vía `static/CNAME`.
`npm run deploy` hace build y push. No hay GitHub Action: el token de `gh` no tiene
scope `workflow`.
