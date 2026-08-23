// Prova che dalla scheda di un ordine si arrivi ALLA conversazione giusta.
//   npx tsx scripts/prova-messaggi-ordine.mts
//
// Il bollino «✉ 2» adesso è un link a `/inbox?c=<id>`. Un link che porta sulla
// conversazione sbagliata è peggio del bollino fermo di prima: si legge la chat
// di un altro cliente credendo che sia di questo, e non se ne accorge nessuno.
//
// Si controlla che:
//  1. l'id che finisce nel link sia davvero una conversazione COLLEGATA a
//     quell'ordine (le regole sono in `conversazioniDellOrdine`: numero citato,
//     stessa email, stesso telefono — mai il nome);
//  2. sia la PIÙ RECENTE fra quelle collegate — chi ha scritto tre volte
//     aspetta risposta sull'ultima;
//  3. i conteggi della bacheca (due query per 200 ordini) tornino con quelli
//     del dettaglio (una query per ordine): sono due strade diverse per la
//     stessa risposta, e se divergessero nessuna delle due darebbe errore.
//
// ⚠️ Sola lettura.
import { db } from '../src/lib/db'
import { conversazioniDellOrdine, ordiniConMessaggi } from '../src/lib/messaggi-ordine'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

const ordini = await db.ordine.findMany({
  orderBy: { data: 'desc' },
  take: 200,
  select: { id: true, numero: true, email: true, telefono: true, gestione: true },
})
console.log(`\n${ordini.length} ordini guardati.`)

const mappa = await ordiniConMessaggi(ordini)
console.log(`${mappa.size} hanno almeno una conversazione collegata.`)

let controllati = 0
for (const [id, m] of mappa) {
  const o = ordini.find((x) => x.id === id)!
  const collegate = await conversazioniDellOrdine(o)

  verifica(
    `${o.numero}: il conteggio della bacheca torna con quello del dettaglio`,
    collegate.length === m.quanti,
    `bacheca ${m.quanti} · dettaglio ${collegate.length}`
  )

  verifica(
    `${o.numero}: il link punta a una conversazione DAVVERO collegata`,
    !!m.conversazioneId && collegate.some((c) => c.id === m.conversazioneId),
    m.conversazioneId || '(nessun id)'
  )

  // La più recente: `conversazioniDellOrdine` le ordina già per data decrescente.
  if (collegate.length > 1) {
    verifica(
      `${o.numero}: e punta alla PIÙ RECENTE delle ${collegate.length}`,
      m.conversazioneId === collegate[0].id,
      `${collegate[0].ultimoMessaggioIl.toLocaleDateString('it-IT')} · legame «${collegate[0].legame}»`
    )
  }

  controllati++
  if (controllati >= 12) break
}
if (!controllati) console.log('  --  nessun ordine con messaggi fra questi: niente da controllare')

// ── Il caso che ha fatto nascere la segnalazione ──
//
// «Comunicazione con cliente» lo scrive l'app quando qualcuno preme WhatsApp,
// Chiama o Email: NON vuol dire che esista una conversazione. Quanti ordini
// sono in quello stato senza niente da leggere? È il numero che dice se
// l'avviso «non registrata» serve o è rumore.
const inComunicazione = ordini.filter((o) => o.gestione === 'comunicazione')
const senzaNiente = inComunicazione.filter((o) => !mappa.get(o.id)?.quanti)
console.log(
  `\n«Comunicazione con cliente»: ${inComunicazione.length} ordini, di cui ${senzaNiente.length} SENZA nessuna conversazione collegata` +
    (inComunicazione.length
      ? ` (${Math.round((senzaNiente.length / inComunicazione.length) * 100)}%)`
      : '')
)
for (const o of senzaNiente.slice(0, 5)) console.log(`   ${o.numero}`)

console.log(falliti === 0 ? '\nI link portano dove dicono.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
