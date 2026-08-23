// Il controllo del foglio di stile.
//   npx tsx scripts/controlla-css.mts
//
// ⚠️ Cerca le DUE cose che marciscono davvero in un CSS che cresce per
// aggiunte, e nient'altro:
//   1. **selettori definiti due volte nello stesso contesto** — la seconda
//      regola vince in silenzio, e chi legge la prima crede che valga;
//   2. **colori scritti a mano che esistono già come token** — il design system
//      lo vieta, e un colore ripetuto è un colore che un giorno diverge.
//
// ⚠️ Quello che questo controllo NON segnala, per scelta:
//   · le distanze in px. Questo design system ha token per colori, raggi e
//     ombre, **non per lo spazio**: segnalarle darebbe decine di falsi allarmi;
//   · le classi «mai usate». Molte si compongono a runtime
//     (`canale-${m.canale}`, `bottone ${x ? 'mini' : ''}`) e un controllo
//     testuale le dà per morte: un elenco pieno di falsi allarmi non lo guarda
//     più nessuno, ed è peggio di non averlo.
import fs from 'node:fs'

const BASE = 'C:/Users/nicol/scoutwt/deluxy-messaging'
const css = fs.readFileSync(`${BASE}/src/app/globals.css`, 'utf8')
const tokens = fs.readFileSync(`${BASE}/src/app/tokens.css`, 'utf8')

const colore = new Map<string, string>()
for (const m of tokens.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))\s*;/gim)) {
  colore.set(m[2].trim().toLowerCase().replace(/\s+/g, ''), m[1])
}

// ⚠️ Si tiene il conto delle @media: due regole uguali in contesti diversi non
// sono un doppione, e contarle tali riempirebbe l'elenco di rumore.
const righe = css.split('\n')
let prof = 0
const contesto: string[] = []
const selettori = new Map<string, number[]>()
let n = 0
for (const r of righe) {
  n++
  const apre = (r.match(/\{/g) ?? []).length
  const chiude = (r.match(/\}/g) ?? []).length
  const m = /^([^@{}][^{}]*)\{/.exec(r.trim())
  if (m) {
    const chiave = (contesto.join('>') || 'base') + ' | ' + m[1].trim().replace(/\s+/g, ' ')
    if (!selettori.has(chiave)) selettori.set(chiave, [])
    selettori.get(chiave)!.push(n)
  }
  const at = /^\s*(@media[^{]*)\{/.exec(r)
  if (at) contesto.push(at[1].trim().replace(/\s+/g, ' '))
  prof += apre - chiude
  if (chiude > apre && contesto.length && prof <= contesto.length - 1) contesto.pop()
}

// ⚠️ Le eccezioni DICHIARATE: ridefinizioni volute, che vincono perché vengono
// dopo. Stanno qui per nome, così restano una scelta e non una svista — e se un
// giorno una sparisce, il controllo torna a segnalarla.
const VOLUTE = new Set([
  'base | .barra-ricerca',
  'base | .colonna',
  'base | .colonna-valore',
  'base | .scheda-ordine',
  'base | .scheda-ordine .riga-bassa',
])

let problemi = 0
console.log('── Selettori ripetuti nello stesso contesto ──')
for (const [k, v] of selettori) {
  if (v.length < 2) continue
  if (VOLUTE.has(k)) continue
  problemi++
  console.log(`  righe ${v.join(', ')}  ${k}`)
}
if (!problemi) console.log('  nessuno (a parte le ridefinizioni volute della bacheca stretta)')

console.log('\n── Colori scritti a mano che sono già un token ──')
let colori = 0
for (const m of css.matchAll(/^\s*([a-z-]+)\s*:\s*([^;]*?(#[0-9a-f]{3,8}|rgba?\([^)]+\))[^;]*);/gim)) {
  if (m[2].includes('var(')) continue
  // ⚠️ I temi del widget sono ESCLUSI di proposito: girano in un iframe sul
  // sito di un cliente, e devono restare indipendenti dalla nostra palette.
  if (m[1].startsWith('--w-')) continue
  const tok = colore.get(m[3].toLowerCase().replace(/\s+/g, ''))
  if (!tok) continue
  colori++
  console.log(`  riga ${css.slice(0, m.index).split('\n').length}: ${m[1]}: ${m[2].trim()} → var(${tok})`)
}
if (!colori) console.log('  nessuno')

console.log(
  problemi + colori === 0
    ? '\nIl foglio di stile è pulito.'
    : `\n${problemi + colori} cose da guardare.`
)
process.exit(problemi + colori === 0 ? 0 : 1)
