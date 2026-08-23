// Il correttore contro il modello vero, su frasi vere.
//   npx tsx scripts/prova-correttore-vero.mts
//
// ⚠️ Questo CHIAMA OpenAI (costa qualche millesimo) e serve a provare la catena
// intera: maschera → modello → filtro. Le regole, che sono la parte dove si fa
// il danno, si provano gratis con `prova-correttore.mts`.
//
// ⚠️ L'ultimo caso è il più importante e non ha refusi: è una frase GIUSTA con
// dentro un indirizzo, un numero d'ordine e un telefono. Se lì esce anche un
// solo «refuso», il correttore è rumore — e a furia di allarmi falsi si impara
// a premere «Manda così» senza leggere, cioè a spegnerlo lasciandolo acceso.
import { cercaRefusi } from '../src/lib/correttore'
import { applica } from '../src/lib/refusi'
import { db } from '../src/lib/db'

const casi = [
  'Good mornign, this is Federica, let me go over your order, one moment please',
  'Yes we recived your order',
  'Il prezzo sarebbe 115€ compresa consegnsa',
  'Ho necessità tutta via di confermare entro un ora',
  'Buongiorno, per l’ordine #2529 la consegna è in Via Bellaria 16, 21018 Sesto Calende. Ci trova allo +393498853209.',
]

for (const testo of casi) {
  const e = await cercaRefusi(testo)
  const trovati = e.refusi.map((r) => `${r.sbagliato}→${r.giusto}`).join(', ')
  console.log(`\n«${testo}»`)
  console.log(`   controllato: ${e.controllato} · refusi: ${trovati || '(nessuno)'}`)
  if (e.refusi.length) console.log(`   corretto:    «${applica(testo, e.refusi)}»`)
}
await db.$disconnect()
