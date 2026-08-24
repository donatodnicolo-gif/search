// Prova che una proposta del glossario si possa CORREGGERE prima di accettarla.
//   npx tsx scripts/prova-proposta-corretta.mts
//
// ⚠️⚠️ Il controllo che conta non è che il testo corretto finisca in glossario —
// quello è un update. È che **la proposta originale resti scritta**: è la prova
// di che cosa aveva detto l'AI, e serve all'unica domanda che vale
// («quanto spesso ci prende?»). Se accettando si sovrascrivesse la proposta,
// l'archivio racconterebbe un'AI più precisa di quella che è, e nessuno saprebbe
// che il prompt va cambiato.
//
// ⚠️ Scrive UNA proposta di prova e UNA voce di prova, e se le ricancella per id.
import { db } from '../src/lib/db'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

// La stessa funzione della rotta, ricopiata qui perché è dentro il file di rotta
// e da uno script non si importa: se un giorno divergono, questo controllo lo
// dice — è il motivo per cui confronta i risultati, non il codice.
function testoDaScrivere(
  p: { termine: string; definizione: string; categoria: string },
  c: { termine?: string; definizione?: string; categoria?: string }
) {
  const termine = (c.termine ?? '').trim() || p.termine
  const definizione = (c.definizione ?? '').trim() || p.definizione
  const categoria = (c.categoria ?? '').trim() || p.categoria
  return {
    termine,
    definizione,
    categoria,
    corretta: termine !== p.termine || definizione !== p.definizione || categoria !== p.categoria,
  }
}

console.log('\n── Quando conta come «corretta» ──')
const orig = { termine: 'Consegne a Ferragosto', definizione: 'Non si consegna.', categoria: 'cliente' }
verifica('accettata così com’è: NON corretta', !testoDaScrivere(orig, {}).corretta)
verifica(
  'campi vuoti = «lascia com’era»: NON corretta',
  !testoDaScrivere(orig, { termine: '', definizione: '  ' }).corretta
)
verifica(
  'stesso testo riscritto identico: NON corretta',
  !testoDaScrivere(orig, { definizione: 'Non si consegna.' }).corretta
)
verifica(
  'definizione cambiata: corretta',
  testoDaScrivere(orig, { definizione: 'Non il 15, ma il 14 e il 16 sì.' }).corretta
)
verifica('categoria cambiata: corretta', testoDaScrivere(orig, { categoria: 'tecnico' }).corretta)

// ── Sul database ──
console.log('\n── Sul database vero ──')
const negozio = await db.negozioShopify.findFirst({ select: { id: true } })
const p = await db.propostaGlossario.create({
  data: {
    tipo: 'aggiunta',
    termine: 'PROVA — si cancella da sola',
    definizione: 'Testo proposto dall’AI.',
    categoria: 'cliente',
    negozioId: '',
    perche: 'prova automatica',
    conversazioneId: 'prova',
  },
})

let voceId = ''
try {
  const scritto = testoDaScrivere(p, { definizione: 'Testo riscritto da una persona.' })
  verifica('il testo cambiato risulta una correzione', scritto.corretta)

  const voce = await db.voceGlossario.upsert({
    where: { termine_negozioId: { termine: scritto.termine, negozioId: p.negozioId } },
    update: { definizione: scritto.definizione, fonte: 'ai-corretta' },
    create: {
      termine: scritto.termine,
      definizione: scritto.definizione,
      categoria: scritto.categoria,
      negozioId: p.negozioId,
      fonte: 'ai-corretta',
      conversazioneId: p.conversazioneId,
      autoreNome: 'prova',
    },
  })
  voceId = voce.id
  verifica('in glossario finisce il testo CORRETTO', voce.definizione === 'Testo riscritto da una persona.')
  verifica(
    'e la voce si dichiara «corretta a mano», non «proposta dall’AI»',
    voce.fonte === 'ai-corretta',
    voce.fonte
  )

  await db.propostaGlossario.update({
    where: { id: p.id },
    data: {
      stato: 'accettata',
      decisaDaNome: 'prova',
      decisaIl: new Date(),
      corretta: scritto.corretta,
      termineAccettato: scritto.termine,
      definizioneAccettata: scritto.definizione,
    },
  })
  const riletta = await db.propostaGlossario.findUniqueOrThrow({ where: { id: p.id } })

  // ⚠️⚠️ IL CONTROLLO CHE CONTA.
  verifica(
    'la proposta ORIGINALE dell’AI è ancora lì',
    riletta.definizione === 'Testo proposto dall’AI.',
    riletta.definizione
  )
  verifica(
    'e accanto c’è quello che si è deciso di scrivere',
    riletta.definizioneAccettata === 'Testo riscritto da una persona.'
  )
  verifica('risulta accettata dopo correzione', riletta.corretta && riletta.stato === 'accettata')

  // ── Quante ne abbiamo corrette finora: è la misura dell'AI ──
  const [tot, corrette] = await Promise.all([
    db.propostaGlossario.count({ where: { stato: 'accettata' } }),
    db.propostaGlossario.count({ where: { stato: 'accettata', corretta: true } }),
  ])
  console.log(
    `\n  ${corrette} proposte accettate su ${tot} sono state corrette a mano` +
      (tot ? ` (${Math.round((corrette / tot) * 100)}%)` : '') +
      ' — da qui in poi si potrà vedere se l’AI migliora.'
  )
} finally {
  if (voceId) await db.voceGlossario.delete({ where: { id: voceId } })
  await db.propostaGlossario.delete({ where: { id: p.id } })
  const resta = await db.propostaGlossario.findUnique({ where: { id: p.id } })
  verifica('le righe di prova sono state cancellate', resta === null)
}

void negozio
console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
