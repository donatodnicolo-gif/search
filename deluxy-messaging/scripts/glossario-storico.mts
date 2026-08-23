// La passata di recupero: legge TUTTE le conversazioni passate e propone le
// voci del glossario che ne escono.
//   npx tsx scripts/glossario-storico.mts
//
// ⚠️ Si fa UNA VOLTA, per riempire un glossario vuoto. Il giro di ogni notte
// resta alle ultime 24 ore: rileggere seicento conversazioni ogni mattina
// costerebbe e direbbe ogni volta le stesse cose.
//
// ⚠️ Come tutto il resto del glossario: **propone, non scrive**. Le voci nascono
// solo quando una persona accetta dalla pagina.
//
// ⚠️ Si guardano solo le conversazioni in cui il cliente ha scritto qualcosa di
// sostanza (oltre 60 caratteri): fra 590 ce ne sono centinaia fatte di «ciao»,
// newsletter e risponditori automatici. Darle al modello costa e produce rumore
// che poi qualcuno deve leggere e scartare.
import { giroGlossario } from '../src/lib/glossario-ai'
import { db } from '../src/lib/db'

const LOTTO = 25
/** Il tetto della passata intera: oltre, nessuno le rilegge davvero. */
const MAX_TOTALI = 40

const primaVoci = await db.voceGlossario.count()
const primaProposte = await db.propostaGlossario.count({ where: { stato: 'aperta' } })
console.log(`glossario prima: ${primaVoci} voci, ${primaProposte} proposte aperte\n`)

let salta = 0
let lette = 0
let nuove = 0
let scartate = 0
let lotto = 0

for (;;) {
  lotto++
  const e = await giroGlossario({
    ore: 0, // tutto lo storico
    salta,
    quante: LOTTO,
    minLunghezza: 60,
    // ⚠️ Poche per lotto: così le proposte vengono da conversazioni diverse
    // invece che tutte dalle prime venticinque.
    maxProposte: 4,
  })
  lette += e.conversazioniLette
  nuove += e.proposteNuove
  scartate += e.scartate
  console.log(
    `lotto ${lotto}: lette ${e.conversazioniLette}, proposte ${e.proposteNuove}, scartate ${e.scartate}, rimaste ${e.rimaste}${e.errore ? ' · ERRORE: ' + e.errore : ''}`
  )
  if (e.errore) break
  salta += LOTTO
  if (e.rimaste <= 0) break
  if (primaProposte + nuove >= MAX_TOTALI) {
    console.log(`\n⚠️ Fermato al tetto di ${MAX_TOTALI} proposte aperte: oltre non le rilegge nessuno.`)
    console.log(`   Restano ${e.rimaste} conversazioni da guardare: si riprende dopo averle smaltite.`)
    break
  }
}

const dopoProposte = await db.propostaGlossario.count({ where: { stato: 'aperta' } })
console.log(`\ntotale: ${lette} conversazioni lette, ${nuove} proposte nuove, ${scartate} scartate dal filtro`)
console.log(`proposte aperte adesso: ${dopoProposte}`)
await db.$disconnect()
