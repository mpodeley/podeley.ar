/* predeploy.mjs — guardia previa al deploy. Sin dependencias.

   Existe porque `gh-pages -d dist` publica lo que haya en el working tree, no
   lo commiteado: el 2026-08-03 un deploy se llevó a producción el trabajo a
   medias de otra sesión que editaba en paralelo (el registro ciber quedó en
   "catorce" en español y "thirteen" en inglés). Esta guardia corta eso:

     1. working tree limpio — nada sin commitear entra al build;
     2. HEAD == origin/main — no se publica un estado que el remoto no tiene.

   Si el fetch falla (sin red), avisa y compara contra el último origin/main
   conocido. Para saltarla a conciencia: PREDEPLOY_SKIP=1 npm run deploy. */

import { execSync } from 'node:child_process'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const fail = (msg) => { console.error(`\n✗ deploy abortado: ${msg}\n`); process.exit(1) }

if (process.env.PREDEPLOY_SKIP === '1') {
  console.log('⚠ predeploy salteada por PREDEPLOY_SKIP=1')
  process.exit(0)
}

const dirty = sh('git status --porcelain')
if (dirty) {
  fail(`el working tree tiene cambios sin commitear:\n${dirty}\n` +
    '  Commiteá (o stasheá) antes de publicar — puede haber otra sesión editando.')
}

try {
  execSync('git fetch origin main --quiet', { stdio: 'pipe', timeout: 15000 })
} catch {
  console.warn('⚠ no se pudo hacer fetch; comparo contra el último origin/main conocido')
}

const head = sh('git rev-parse HEAD')
const origin = sh('git rev-parse origin/main')
if (head !== origin) {
  fail(`HEAD (${head.slice(0, 7)}) ≠ origin/main (${origin.slice(0, 7)}).\n` +
    '  Pusheá o pulleá primero: lo publicado tiene que existir en el remoto.')
}

console.log('✓ predeploy: árbol limpio y en sync con origin/main')
