// Che cosa direbbe l'AI, su conversazioni vere. NON MANDA NIENTE.
//   npx tsx scripts/prova-risposta-ai.mts
//
// ⚠️ È la stessa catena del bottone «Risposta rapida»: sceglie fra gli Script,
// applica le istruzioni CS AI e i PALETTI, e scrive nella lingua del cliente.
// Qui il testo si stampa e basta: **nessun messaggio esce**.
//
// ⚠️ Serve a rispondere a una domanda che prima o poi si fa: «l'AI potrebbe
// gestire da sola una conversazione?». Si guarda cosa direbbe **su casi veri**,
// non su esempi inventati — è l'unico modo per rispondere con dei fatti.
import { suggerisciRisposta } from '../src/lib/ai'
import { linguaDelTesto } from '../src/lib/lingua-testo'
import { db } from '../src/lib/db'

const script = (await db.script.findMany({ where: { attivo: true } })).map((s) => ({
  id: s.id,
  titolo: s.titolo,
  categoria: s.categoria,
  testo: s.testo,
  quando: s.quando,
}))
const negozi = await db.negozioShopify.findMany({ select: { id: true, nome: true } })
const marchi = new Map(negozi.map((n) => [n.id, { id: n.id, nome: n.nome }]))
console.log(`script attivi: ${script.length}`)

// Conversazioni con l'ULTIMO messaggio in arrivo: quelle che aspettano davvero.
const conv = await db.conversazione.findMany({
  where: { eliminataIl: null, archiviata: false },
  orderBy: { ultimoMessaggioIl: 'desc' },
  take: 40,
  select: {
    id: true,
    canale: true,
    nome: true,
    negozioId: true,
    messaggi: { orderBy: { creatoIl: 'desc' }, take: 1, select: { direzione: true, testo: true } },
  },
})
const aperte = conv
  .filter((c) => c.messaggi[0]?.direzione === 'in')
  // ⚠️ I saluti secchi («ciao») non dicono niente: si guarda dove c'è una
  // domanda vera, che è il caso in cui una risposta automatica conta.
  .filter((c) => c.messaggi[0].testo.trim().length > 25)
  .slice(0, 4)

console.log(`conversazioni con una domanda vera in attesa: ${aperte.length}\n`)

for (const c of aperte) {
  const testo = c.messaggi[0].testo.replace(/\s+/g, ' ').slice(0, 400)
  console.log('─'.repeat(72))
  console.log(`[${c.canale}] ${c.nome || 'senza nome'}`)
  console.log(`CLIENTE: ${testo}`)
  const esito = await suggerisciRisposta(
    testo,
    script,
    c.canale === 'email' ? 'email' : 'chat',
    c.negozioId ? (marchi.get(c.negozioId) ?? null) : null,
    linguaDelTesto(testo)
  )
  if (esito.stato !== 'ok') {
    console.log(`AI: (${esito.stato}${esito.stato === 'errore' ? ' — ' + esito.messaggio : ''})`)
  } else if (!esito.suggerimento) {
    // ⚠️ «Nessuno script adatto» è un esito valido, non un guasto: vuol dire che
    // quel caso non l'abbiamo ancora scritto, e serve una persona. È la
    // risposta più importante da guardare: dice quanto l'AI può reggere da sola.
    console.log('AI: NESSUNO SCRIPT ADATTO — servirebbe una persona')
  } else {
    console.log(`AI (script «${esito.suggerimento.titolo}»):\n${esito.suggerimento.risposta}`)
  }
  console.log()
}
await db.$disconnect()
