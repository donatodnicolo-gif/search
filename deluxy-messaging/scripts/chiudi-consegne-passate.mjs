// Segna come GESTITI gli ordini la cui consegna è già passata.
//
//   node scripts/chiudi-consegne-passate.mjs            # solo conteggio, non tocca niente
//   node scripts/chiudi-consegne-passate.mjs --esegui   # scrive davvero
//   node scripts/chiudi-consegne-passate.mjs --giorni 7 --esegui
//
// PERCHÉ SERVE: `gestione` è arrivata dopo, e nessuno è tornato a spuntare gli
// ordini vecchi. Risultato misurato il 29/07/2026: **907 ordini «da gestire», di
// cui 603 con la consegna precedente a ieri** — consegne avvenute mesi fa a cui
// manca solo la spunta. Con quelle in mezzo, «ordini da gestire» non è più un
// numero di lavoro: è archeologia, e la bacheca delle priorità mente.
//
// COSA FA, ESATTAMENTE: mette `gestione = 'gestito'`, la data di adesso e
// `gestioneDaNome = 'Chiusura automatica · consegna passata'`. Quel nome è una
// scelta: la riga dice chi ha spuntato l'ordine, e scriverci il nome di una
// persona che non l'ha fatto sarebbe una firma falsa in un registro che si usa
// per capire chi ha lavorato cosa.
//
// COSA NON TOCCA:
//  · gli ordini con consegna **da ieri in avanti** — lì c'è ancora lavoro;
//  · gli ordini **senza data di consegna** (286 al 29/07): non si sa se sono
//    passati, e chiuderli a scatola chiusa vuol dire perderli;
//  · lo stato della pipeline di Deluxy Orders (`statoChiave`), che è un'altra
//    cosa e non si decide da qui.
//
// ⚠️ Scrive in PRODUZIONE (database condiviso). Senza `--esegui` non scrive
// nulla: lanciarlo prima così, guardare il numero, poi rilanciare.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

for (const file of ['.env', '.env.local']) {
  try {
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // in produzione le variabili arrivano da Vercel
  }
}

const argomenti = process.argv.slice(2)
const esegui = argomenti.includes('--esegui')
const iGiorni = argomenti.indexOf('--giorni')
// Default 1 = «precedente a ieri»: ieri e oggi restano lavoro aperto.
const giorni = iGiorni >= 0 ? Number(argomenti[iGiorni + 1]) || 1 : 1

const oggi = new Date()
oggi.setHours(0, 0, 0, 0)
const confine = new Date(oggi.getTime() - giorni * 86400000)

const db = new PrismaClient()
const filtro = { gestione: { not: 'gestito' }, dataConsegna: { lt: confine } }

const quanti = await db.ordine.count({ where: filtro })
const piuVecchio = await db.ordine.findFirst({
  where: filtro,
  orderBy: { dataConsegna: 'asc' },
  select: { numero: true, dataConsegna: true },
})

console.log(`Confine: consegna prima del ${confine.toISOString().slice(0, 10)}`)
console.log(`Ordini da chiudere: ${quanti}`)
if (piuVecchio) {
  console.log(
    `Il più vecchio: ${piuVecchio.numero || '(senza numero)'} del ${piuVecchio.dataConsegna?.toISOString().slice(0, 10)}`
  )
}

if (!esegui) {
  console.log('\nNiente scritto (prova a vuoto). Per farlo davvero: --esegui')
} else if (quanti === 0) {
  console.log('\nNiente da fare.')
} else {
  const esito = await db.ordine.updateMany({
    where: filtro,
    data: {
      gestione: 'gestito',
      gestioneIl: new Date(),
      gestioneDaId: '',
      gestioneDaNome: 'Chiusura automatica · consegna passata',
    },
  })
  console.log(`\nSegnati come gestiti: ${esito.count}`)
  const restano = await db.ordine.count({ where: { gestione: { not: 'gestito' } } })
  const senzaData = await db.ordine.count({
    where: { gestione: { not: 'gestito' }, dataConsegna: null },
  })
  console.log(`Restano da gestire: ${restano} (di cui ${senzaData} senza data di consegna)`)
}

await db.$disconnect()
