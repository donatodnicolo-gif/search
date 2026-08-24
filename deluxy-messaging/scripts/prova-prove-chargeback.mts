// Prova del verdetto sulle prove di una contestazione.
//
// ⚠️⚠️ Il caso che questa prova esiste per fermare: una difesa costruita su una
// consegna che dai nostri archivi NON risulta. Sarebbe una dichiarazione falsa
// mandata a una banca, e vale molto piu' dei cento euro in ballo.
import { valuta, giorniAllaScadenza, type ProveOrdine } from '../src/lib/prove-chargeback'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const vuoto: ProveOrdine = {
  trovato: true, gestione: 'da_gestire', gestioneIl: null, gestioneDaNome: '',
  fornitoreNome: '', dataConsegna: null, fasciaConsegna: '', citta: '',
  conversazioni: 0, ultimoMessaggioIl: null, pagatoAlFornitore: null,
}

console.log('══ IL CASO SCOMODO ══')
{
  const v = valuta(vuoto, 'product_not_received')
  prova('mai lavorato + «mai ricevuto» → non abbiamo niente', v.livello === 'niente', v.titolo)
  prova('  e lo dice: prima verificare, e se non ha ricevuto si rimborsa',
    v.spiegazione.includes('rimborso'), v.spiegazione.slice(0, 60) + '…')
}
console.log('\n══ QUANDO ABBIAMO DAVVERO QUALCOSA ══')
{
  const pieno: ProveOrdine = { ...vuoto, gestione: 'gestito', gestioneIl: '2026-08-07T10:00:00Z',
    gestioneDaNome: 'Nicolò', fornitoreNome: 'Battistella fioreria', pagatoAlFornitore: 80,
    dataConsegna: '2026-08-07T00:00:00Z', fasciaConsegna: '12-13', citta: 'Milano',
    conversazioni: 2, ultimoMessaggioIl: '2026-08-08T09:00:00Z' }
  const v = valuta(pieno, 'product_not_received')
  prova('quattro elementi → «abbiamo»', v.livello === 'abbiamo' && v.punti.length === 4, `${v.punti.length} punti`)
  prova('  il fornitore pagato e un punto', v.punti.some(p => p.includes('Battistella') && p.includes('80,00')))
  prova('  la consegna prevista e un punto', v.punti.some(p => p.includes('07/08/2026') && p.includes('Milano')))
  for (const p of v.punti) console.log(`      · ${p}`)
}
console.log('\n══ UN ELEMENTO SOLO ══')
{
  const v = valuta({ ...vuoto, gestione: 'gestito', conversazioni: 1, ultimoMessaggioIl: '2026-08-08T09:00:00Z' }, 'fraudulent')
  prova('un solo elemento → «poco», e dice di cercare fuori', v.livello === 'poco', v.titolo)
  prova('  ricorda che le prove si mandano una volta sola', v.spiegazione.includes('una volta sola'))
}
console.log('\n══ FUORI DALLA COPIA DI 60 GIORNI ══')
{
  const v = valuta({ ...vuoto, trovato: false }, 'product_not_received')
  prova('non si dice «non abbiamo prove» di un ordine che non abbiamo letto', v.livello === 'non-si-sa', v.titolo)
}
console.log('\n══ I GIORNI ══')
{
  const adesso = new Date('2026-08-24T12:00:00Z').getTime()
  prova('4 settembre = 11 giorni', giorniAllaScadenza('2026-09-04T00:00:00Z', adesso) === 11,
    String(giorniAllaScadenza('2026-09-04T00:00:00Z', adesso)))
  prova('senza scadenza = null', giorniAllaScadenza(null, adesso) === null)
}
console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
