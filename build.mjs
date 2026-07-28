/* build.mjs — podeley.ar static build. Zero dependencies, no runtime JS shipped.
   Replaces MkDocs Material + mkdocs-static-i18n, which only bought us three
   things: ES/EN routing, the OG tags and the sitemap. All three live here now.

   Each page is plain HTML for <main>, preceded by a JSON metadata comment:

     <!--meta
     { "title": "...", "description": "...", "nav": "ep" }
     -->
     <section class="hero wrap"> ...

   JSON, not YAML, on purpose: JSON.parse is built in.

   Usage: node build.mjs   →   dist/   (ES at the root, EN under /en/) */

import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')
const ORIGIN = 'https://podeley.ar'

/* Segment nav — order matters, it is the funnel's order. `key` is what a page
   names in meta.nav to get aria-current. */
const NAV = [
  { key: 'ep', slug: 'ep', es: 'E&P', en: 'E&P' },
  { key: 'mineria', slug: 'mineria', es: 'Minería', en: 'Mining' },
  { key: 'energia', slug: 'energia', es: 'Gas y energía', en: 'Gas & power' },
  { key: 'research', slug: 'research', es: 'Research', en: 'Research' },
]

/* The only translated text outside the page files: the shell. */
const STRINGS = {
  es: {
    ogLocale: 'es_AR',
    navLabel: 'Secciones',
    skip: 'Ir al contenido',
    altLabel: 'EN',
    footNote: '© 2026 · Buenos Aires · Sitio estático en GitHub Pages',
    footSource: 'código del sitio',
    footFine:
      'El trabajo se describe por sector; la identidad de los clientes es reservada.',
  },
  en: {
    ogLocale: 'en',
    navLabel: 'Sections',
    skip: 'Skip to content',
    altLabel: 'ES',
    footNote: '© 2026 · Buenos Aires · Static site on GitHub Pages',
    footSource: 'site source',
    footFine: 'Work is described by sector; client identities are private.',
  },
}

const REPO = 'https://github.com/mpodeley/podeley.ar'

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* ES lives at the root, EN under /en/ — the same URL scheme v3 served, so no
   inbound link and no mailto `subject=` breaks. */
const urlFor = (slug, lang) => {
  const base = lang === 'es' ? '/' : '/en/'
  return slug === 'index' ? base : `${base}${slug}/`
}

const outFor = (slug, lang) => {
  if (slug === '404') return join(DIST, '404.html')
  const dir = lang === 'es' ? DIST : join(DIST, 'en')
  return slug === 'index' ? join(dir, 'index.html') : join(dir, slug, 'index.html')
}

const META_RE = /^\s*<!--meta\s*([\s\S]*?)-->\s*/

function parsePage(raw, file) {
  const m = raw.match(META_RE)
  if (!m) throw new Error(`${file}: missing the <!--meta … --> block`)
  let meta
  try {
    meta = JSON.parse(m[1])
  } catch (e) {
    throw new Error(`${file}: bad JSON in <!--meta>: ${e.message}`)
  }
  for (const k of ['title', 'description']) {
    if (!meta[k]) throw new Error(`${file}: meta.${k} is required`)
  }
  return { meta, body: raw.slice(m[0].length).trimEnd() }
}

function navHtml(lang, active) {
  return NAV.map((i) => {
    const current = i.key === active ? ' aria-current="page"' : ''
    return `<a href="${urlFor(i.slug, lang)}"${current}>${esc(i[lang])}</a>`
  }).join('\n      ')
}

function footerHtml(lang) {
  const s = STRINGS[lang]
  const map = [
    `<a href="${urlFor('index', lang)}">podeley.ar</a>`,
    ...NAV.map((i) => `<a href="${urlFor(i.slug, lang)}">${esc(i[lang])}</a>`),
  ].join(' · ')
  return `  <div class="wrap foot-inner">
    <p class="foot-map">${map}</p>
    <p class="foot-note">${s.footNote} · <a href="${REPO}">${s.footSource}</a></p>
  </div>
  <p class="wrap foot-fine">${s.footFine}</p>`
}

/* --- collect ------------------------------------------------------------- */

const files = (await readdir(join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort()
const pages = []
for (const file of files) {
  const m = file.match(/^(.+)\.(es|en)\.html$/)
  if (!m) throw new Error(`src/pages/${file}: name must be <slug>.<es|en>.html`)
  const [, slug, lang] = m
  const raw = await readFile(join(SRC, 'pages', file), 'utf8')
  pages.push({ file, slug, lang, ...parsePage(raw, `src/pages/${file}`) })
}
if (!pages.length) throw new Error('src/pages/ is empty')

const have = new Set(pages.map((p) => `${p.slug}.${p.lang}`))

/* --- render -------------------------------------------------------------- */

const layout = await readFile(join(SRC, 'layout.html'), 'utf8')

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })
await cp(join(ROOT, 'static'), DIST, { recursive: true })
await cp(join(SRC, 'styles'), join(DIST, 'styles'), { recursive: true })

for (const p of pages) {
  const s = STRINGS[p.lang]
  const other = p.lang === 'es' ? 'en' : 'es'
  const url = ORIGIN + urlFor(p.slug, p.lang)

  // 404 is Spanish-only and must not be indexed or cross-linked as a variant;
  // its toggle falls back to the other language's home.
  const translated = have.has(`${p.slug}.${other}`)
  const altHref = translated ? urlFor(p.slug, other) : urlFor('index', other)

  const canonical = p.slug === '404' ? '<meta name="robots" content="noindex">'
    : `<link rel="canonical" href="${url}">`
  const alternates = translated
    ? [
        `<link rel="alternate" hreflang="es" href="${ORIGIN}${urlFor(p.slug, 'es')}">`,
        `<link rel="alternate" hreflang="en" href="${ORIGIN}${urlFor(p.slug, 'en')}">`,
        `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${urlFor(p.slug, 'es')}">`,
      ].join('\n')
    : ''

  const html = layout
    .replaceAll('{{lang}}', p.lang)
    .replaceAll('{{og_locale}}', s.ogLocale)
    .replaceAll('{{title}}', esc(p.meta.title))
    .replaceAll('{{description}}', esc(p.meta.description))
    .replaceAll('{{url}}', url)
    .replaceAll('{{canonical}}', canonical)
    .replaceAll('{{alternates}}', alternates)
    .replaceAll('{{skip}}', esc(s.skip))
    .replaceAll('{{nav_label}}', esc(s.navLabel))
    .replaceAll('{{home}}', urlFor('index', p.lang))
    .replaceAll('{{nav}}', navHtml(p.lang, p.meta.nav))
    .replaceAll('{{alt_href}}', altHref)
    .replaceAll('{{alt_lang}}', other)
    .replaceAll('{{alt_label}}', s.altLabel)
    .replaceAll('{{footer}}', footerHtml(p.lang))
    .replaceAll('{{body}}', p.body)
    .replace(/\n{2,}(?=<(?:link|meta)\b)/g, '\n') // an empty slot must not leave a gap in <head>

  const out = outFor(p.slug, p.lang)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, html)
  console.log(`  ${urlFor(p.slug, p.lang).padEnd(16)} ← src/pages/${p.file}`)
}

/* --- sitemap ------------------------------------------------------------- */

const locs = pages
  .filter((p) => p.slug !== '404')
  .map((p) => ORIGIN + urlFor(p.slug, p.lang))
  .sort()
await writeFile(
  join(DIST, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs.map((l) => `  <url><loc>${l}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'),
)

console.log(`\n${pages.length} pages · ${locs.length} in sitemap.xml → dist/`)
