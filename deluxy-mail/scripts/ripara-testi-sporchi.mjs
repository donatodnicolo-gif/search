// Ripara il TESTO delle mail sporcato dagli indirizzi dei link.
//
// Il caso: un client di posta avvolge singole lettere in un link
// (`Buongio<a href="mailto:x@y.it">r</a>no Luca`) e la conversione in testo
// semplice ci infila dentro l'indirizzo — «Buongior mailto:x@y.itno Luca».
// Quel testo non è solo l'anteprima: è quello che legge l'AI.
//
// Dal 30/07 le mail nuove nascono già pulite (lib/imap.ts → testoMigliore).
// Questo script sistema quelle GIÀ scaricate, ricavando il testo dall'HTML che
// è ancora in casa.
//
// ⚠️ SCRIVE nel database, quindi di suo NON fa niente: senza `--applica` conta
// soltanto. Uso:
//   node --env-file=.env scripts/ripara-testi-sporchi.mjs            (conta)
//   node --env-file=.env scripts/ripara-testi-sporchi.mjs --applica  (ripara)
import { PrismaClient } from '@prisma/client'

const applica = process.argv.includes('--applica')

// Le stesse regole di src/lib/htmlMail.ts, qui in JS: se cambiano lì, cambiano
// anche qui (questo script è una tantum, non vale un pacchetto condiviso).
function sporco(testo) {
  const mailto = (testo.match(/mailto:/gi) ?? []).length
  if (mailto >= 3) return true
  const url = testo.match(/https?:\/\/\S{6,}/gi) ?? []
  return url.length >= 4 && new Set(url.map((u) => u.slice(0, 40))).size <= 2
}

function htmlAPlain(html) {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const db = new PrismaClient()
let visti = 0
let daRiparare = 0
let riparati = 0

try {
  // A blocchi: la tabella ha decine di migliaia di righe e i corpi sono grossi.
  const PASSO = 500
  let cursore = null
  for (;;) {
    const blocco = await db.messaggio.findMany({
      take: PASSO,
      ...(cursore ? { skip: 1, cursor: { id: cursore } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, corpoTesto: true, corpoHtml: true },
    })
    if (blocco.length === 0) break
    cursore = blocco[blocco.length - 1].id
    visti += blocco.length

    for (const m of blocco) {
      if (!m.corpoHtml || !m.corpoTesto || !sporco(m.corpoTesto)) continue
      const pulito = htmlAPlain(m.corpoHtml)
      if (pulito.replace(/\s+/g, ' ').trim().length < 20) continue
      daRiparare++
      if (!applica) continue
      await db.messaggio.update({
        where: { id: m.id },
        data: { corpoTesto: pulito, anteprima: pulito.replace(/\s+/g, ' ').slice(0, 200) },
      })
      riparati++
    }
    process.stdout.write(`\r  esaminate ${visti} mail · da riparare ${daRiparare}${applica ? ` · riparate ${riparati}` : ''}   `)
  }
  console.log(
    `\n${applica ? `Riparate ${riparati}` : `Da riparare ${daRiparare}`} mail su ${visti} esaminate.` +
      (applica ? '' : '\nPer applicare davvero: aggiungi --applica')
  )
} catch (e) {
  console.error('\nErrore:', String(e?.message || e).split('\n')[0])
} finally {
  await db.$disconnect()
}
