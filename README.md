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
  "title": "E&P: qué hacen los vecinos y cómo declinan los pozos — Matías Podeley",
  "description": "Actividad de la competencia, declinación por pozo, …",
  "nav": "casos"
}
-->
<section class="hero wrap">
  …
```

`title` y `description` alimentan `<title>`, la meta description y los tags OG/Twitter
de esa página; un `"jsonld"` opcional se emite como `ld+json` (lo llevan el home,
`/ciber/`, `/casos/`, `/trabajo/` y `/perfil/`). `nav` marca el item activo del menú con
las claves de `site.config.json`, que son cuatro: `casos`, `ciber`, `trabajo`, `perfil`.
Las páginas de sector (`/ep/`, `/mineria/`, `/energia/`) declaran `casos`, y `/cto/`
declara `trabajo`, porque son drill-down de esos items y no items propios. `research`
quedó fuera del menú y `index`/`404` no lo declaran.

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

`git push` publica. No hay más deploy a mano.

**Canónico:** GitHub Pages en **`podeley/podeley.github.io`**, con el dominio `podeley.ar`
(CNAME en `static/`, DNS en Porkbun). **Backup:** Cloudflare Pages en `podeley.pages.dev`,
proyecto `podeley`. Si GitHub se cae, el failover es mover el A record en Porkbun a
Cloudflare; el backup ya está desplegado y al día.

Los dos deploys los hace `.github/workflows/deploy.yml`, un archivo con dos jobs guardados
por `if: github.repository`. La fuente vive en los dos remotos, así que cada uno corre el
suyo. Para que un push llegue a los dos, `origin` tiene dos push URL:

```bash
git remote set-url --add --push origin https://github.com/mpodeley/podeley.ar.git
git remote set-url --add --push origin https://github.com/podeley/podeley.github.io.git
```

(La primera línea hace falta: apenas se agrega una push URL explícita, git deja de usar la
del fetch.) Es config local, no viaja con el repo.

El job de Cloudflare necesita el secret `CLOUDFLARE_API_TOKEN` en `mpodeley/podeley.ar`
(permiso *Cloudflare Pages: Edit*). Si falta, el job avisa y sigue en verde en vez de
romper el push — el backup simplemente no se actualiza.

**El builder legacy de Pages no se usa.** `pages-build-deployment` (pool `dynamic`) quedó
wedgeado en estos dos repos tras el incidente de OIDC de GitHub del 2026-08-06: los runs
entran en `queued` y no arrancan nunca, y cancelarlos no lo destraba. Por eso Pages está en
`build_type=workflow` y publica desde este workflow, que corre en `ubuntu-latest`. También
por eso el deploy usa `actions/deploy-pages@v4` y no v5, que fue donde falló el OIDC.

### Failover a Cloudflare

Si GitHub Pages se cae, en Porkbun:

```
ALIAS  podeley.ar   podeley.github.io  ->  podeley.pages.dev
CNAME  www          podeley.github.io  ->  podeley.pages.dev
```

Con TTL 600 el cambio tarda unos diez minutos. Cloudflare revalida el dominio solo (por eso
`podeley.ar` queda configurado en el proyecto `podeley` aunque no lo esté sirviendo: sacarlo
solo agrega pasos el día que haya apuro). El TXT `_github-pages-challenge-podeley` no se
toca nunca — es lo que mantiene el dominio verificado del lado de GitHub para la vuelta.

Para volver, las mismas dos líneas al revés.

**Escape hatch manual**, si Actions no está disponible: `npm run deploy:cf` sube a
Cloudflare con el token en el entorno. Encadena `tools/predeploy.mjs`, que aborta si el
árbol está sucio o HEAD no coincide con `origin/main` — la subida directa publica el árbol
de trabajo, no el commit, y eso ya mandó trabajo a medias a producción una vez. Salteo
consciente: `PREDEPLOY_SKIP=1 npm run deploy:cf`. Por Actions ese riesgo no existe: siempre
se publica el commit.
