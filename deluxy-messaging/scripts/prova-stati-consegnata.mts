// Prova degli STATI che vogliono dire «la consegna è arrivata al cliente».
//
// ⚠️⚠️ IL CASO VERO (09/09/2026, segnalazione dell'utente: «quando un ordine è
// in app accettato da un partner e poi viene consegnato dal valet o dal partner
// in automatico deve andare in gestito»). Il Customer Service guardava il solo
// `delivered`. La piattaforma però ne usa TRE per dire la stessa cosa, e uno di
// quelli che mancavano — `delivered_time_to_approve`, «consegnata, ore del
// valet ancora da approvare» — è proprio il caso di un valet che chiude il giro
// dichiarando le ore. Contate quel giorno: 3 consegne in quello stato e 1.257
// in `approved`.
//
// ⚠️ E la parte che NON deve cambiare: `not_delivered` e `cancelled` sono
// «chiuse» per la piattaforma ma NON consegnate — quelle devono tornare a noi.
// Se un giorno qualcuno allargasse la lista alla lista «chiusa» di là, questa
// prova lo ferma.
import { eConsegnata, STATI_CONSEGNATA } from '../src/lib/piattaforma'
import { STATI_CHE_CHIUDONO } from '../src/lib/consegne-piattaforma'

let male = 0
function prova(stato: string, atteso: boolean, perche: string) {
  const avuto = eConsegnata(stato)
  const ok = avuto === atteso
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${stato.padEnd(28)} consegnata=${avuto}  — ${perche}`)
}

console.log('\n=== Che cosa vuol dire «consegnata» ===\n')
prova('delivered', true, 'la consegna chiusa e basta')
prova('delivered_time_to_approve', true, 'consegnata, ore del valet da approvare')
prova('approved', true, 'consegnata, ore già approvate')
prova('in_delivery', false, 'per strada: non è ancora arrivata')
prova('not_delivered', false, 'NON consegnata: deve tornare a noi')
prova('cancelled', false, 'annullata: chiusa di là, ma non consegnata')
prova('archived', false, 'archiviata: chiusa, ma non dice che è arrivata')
prova('created', false, 'creata e ferma')
prova('', false, 'nessuna consegna')

console.log('\n=== Coerenza fra le due sincronizzazioni ===\n')
for (const s of STATI_CONSEGNATA) {
  const ok = STATI_CHE_CHIUDONO.includes(s)
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} «${s}» chiude anche nel giro delle consegne`)
}
const inPiu = STATI_CHE_CHIUDONO.filter((s) => !(STATI_CONSEGNATA as readonly string[]).includes(s))
console.log(`ok   e in più chiude su: ${inPiu.join(', ')} (il lavoro è già di chi consegna)`)

console.log(male ? `\n${male} PROVE FALLITE\n` : '\nTutte le prove passate.\n')
process.exit(male ? 1 : 0)
