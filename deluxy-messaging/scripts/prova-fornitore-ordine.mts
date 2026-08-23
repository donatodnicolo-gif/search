// Prova che «a chi abbiamo dato quest'ordine» si scriva, si rilegga e non si
// perda.
//   npx tsx scripts/prova-fornitore-ordine.mts
//
// I tre controlli che contano:
//  1. si scrive e si rilegge, costo con la virgola compreso;
//  2. ⚠️⚠️ **lo scarico da Orders non lo cancella**. È il rischio vero: la sync
//     gira da sola ogni pochi minuti e fa un `upsert` sull'ordine. Se scrivesse
//     anche i nostri campi, il fornitore sparirebbe **senza che nessuno tocchi
//     niente** — e il difetto si vedrebbe solo un giorno dopo, come un dato mai
//     inserito;
//  3. si toglie del tutto (capita di sbagliare riga, e capita che il fornitore
//     dica di no dopo aver detto di sì).
//
// ⚠️ Lavora su UN ordine vero e alla fine gli rimette esattamente quello che
// aveva prima. Non tocca nient'altro.
import { db } from '../src/lib/db'
import { costoValido, fornitoreAtteso, leggiCosto } from '../src/lib/fornitore-ordine'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

// ── Le regole pure, senza database ──
console.log('\n── Come si legge un costo scritto a mano ──')
verifica('«130» → 130', leggiCosto('130') === 130)
verifica('«130,50» → 130.5 (la virgola italiana)', leggiCosto('130,50') === 130.5)
verifica('«130.50» → 130.5', leggiCosto('130.50') === 130.5)
verifica('« 130 € » → 130', leggiCosto(' 130 € ') === 130)
verifica('vuoto → null («non concordato», ≠ zero)', leggiCosto('') === null)
verifica('«centotrenta» → non valido', !costoValido(leggiCosto('centotrenta')))
verifica('«-5» → non valido', !costoValido(leggiCosto('-5')))
verifica('«999999» → non valido (oltre il tetto)', !costoValido(leggiCosto('999999')))
verifica('null → valido', costoValido(null))

console.log('\n── Quando la mancanza va segnalata ──')
verifica('ordine appena arrivato: non si segnala', !fornitoreAtteso('da_gestire'))
verifica('in ricerca fornitore: non si segnala', !fornitoreAtteso('ricerca_fornitore'))
verifica('in pagamento: SI segnala', fornitoreAtteso('in_pagamento'))
verifica('attesa consegna: SI segnala', fornitoreAtteso('attesa_consegna'))
// ⚠️ Gestito NO: contati, 822 degli 828 ordini senza fornitore erano chiusi.
// Un avviso su quasi ogni riga non lo legge piu nessuno.
verifica('gestito: NON si segnala (e chiuso, e sono 822)', !fornitoreAtteso('gestito'))

// ── Sul database ──
const o = await db.ordine.findFirst({ orderBy: { data: 'desc' } })
if (!o) {
  console.log('\nNessun ordine in tabella: niente da provare.')
  await db.$disconnect()
  process.exit(falliti === 0 ? 0 : 1)
}
console.log(`\n── Su ${o.numero}, ordine vero ──`)
const prima = {
  fornitoreNome: o.fornitoreNome,
  fornitoreId: o.fornitoreId,
  fornitoreCitta: o.fornitoreCitta,
  fornitoreTelefono: o.fornitoreTelefono,
  fornitoreEmail: o.fornitoreEmail,
  fornitoreCosto: o.fornitoreCosto,
  fornitoreNota: o.fornitoreNota,
  fornitoreDaId: o.fornitoreDaId,
  fornitoreDaNome: o.fornitoreDaNome,
  fornitoreIl: o.fornitoreIl,
}

try {
  await db.ordine.update({
    where: { id: o.id },
    data: {
      fornitoreNome: 'PROVA — Pasticceria Rossi',
      fornitoreCitta: 'Firenze',
      fornitoreTelefono: '+390550000000',
      fornitoreCosto: leggiCosto('130,50'),
      fornitoreNota: 'prova automatica',
      fornitoreDaNome: 'prova',
      fornitoreIl: new Date('2026-08-24T08:00:00.000Z'),
    },
  })
  const riletto = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  verifica('si rilegge il nome', riletto.fornitoreNome === 'PROVA — Pasticceria Rossi')
  verifica('si rilegge il costo con la virgola', riletto.fornitoreCosto === 130.5, String(riletto.fornitoreCosto))
  verifica('resta scritto chi e quando', !!riletto.fornitoreDaNome && !!riletto.fornitoreIl)

  // ── IL CONTROLLO CHE CONTA: la sincronizzazione da Orders ──
  //
  // Si rifà ESATTAMENTE quello che fa `sincronizza.ts`: un upsert sulla chiave
  // (negozioId, shopifyId) con i soli campi che arrivano da Orders. Se un
  // giorno qualcuno ci aggiungesse i nostri campi, questo controllo fallisce
  // **prima** che il fornitore sparisca dagli ordini veri.
  const comuni = {
    negozioNome: riletto.negozioNome,
    numero: riletto.numero,
    data: riletto.data,
    totale: riletto.totale,
    clienteNome: riletto.clienteNome,
    email: riletto.email,
    telefono: riletto.telefono,
  }
  await db.ordine.upsert({
    where: { negozioId_shopifyId: { negozioId: riletto.negozioId, shopifyId: riletto.shopifyId } },
    update: comuni,
    create: { negozioId: riletto.negozioId, shopifyId: riletto.shopifyId, ...comuni },
  })
  const dopoSync = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  verifica(
    'lo scarico da Orders NON cancella il fornitore',
    dopoSync.fornitoreNome === 'PROVA — Pasticceria Rossi' && dopoSync.fornitoreCosto === 130.5,
    `${dopoSync.fornitoreNome || '(vuoto)'} · ${dopoSync.fornitoreCosto ?? '(nessun costo)'}`
  )

  // ── Toglierlo ──
  await db.ordine.update({
    where: { id: o.id },
    data: { fornitoreNome: '', fornitoreCosto: null, fornitoreCitta: '', fornitoreNota: '' },
  })
  const vuoto = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  verifica(
    'si toglie del tutto',
    vuoto.fornitoreNome === '' && vuoto.fornitoreCosto === null
  )
} finally {
  // Rimesso com'era, campo per campo.
  await db.ordine.update({ where: { id: o.id }, data: prima })
  const tornato = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  verifica(
    'l’ordine è tornato com’era',
    tornato.fornitoreNome === prima.fornitoreNome && tornato.fornitoreCosto === prima.fornitoreCosto
  )
}

// ── Quanti ordini sanno già chi li prepara ──
const [conFornitore, totali] = await Promise.all([
  db.ordine.count({ where: { fornitoreNome: { not: '' } } }),
  db.ordine.count(),
])
const avanti = await db.ordine.count({
  where: { fornitoreNome: '', gestione: { in: ['in_pagamento', 'attesa_consegna'] } },
})
console.log(
  `\n${conFornitore} ordini su ${totali} hanno un fornitore registrato.\n` +
    `${avanti} sono già avanti (in pagamento o in attesa di consegna) e non risultano dati a nessuno: ` +
    `sono quelli che la bacheca segna «fornitore?».`
)

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
