// Prova delle REGOLE degli orari dei negozi (10/09/2026): la validazione di
// quello che arriva dal modulo, «questa data si può scegliere?», l'etichetta
// della fascia come la scrivono i siti, e la lettura di una riga con JSON rotto.
// Non tocca il database. Uso: npx tsx scripts/prova-orari-negozi.mts
import {
  etichettaFascia,
  giornoSelezionabile,
  leggiOrario,
  primoGiornoAperto,
  prossimiGiorni,
  validaOrario,
  type OrarioNegozioDati,
} from '../src/lib/orari-regole'

let male = 0
function prova(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${dettaglio ? '  — ' + dettaglio : ''}`)
}

console.log('\n=== Validazione ===\n')
const buono = validaOrario({
  giorniApertura: [6, 1, 2, 3, 4, 5, 1],
  fasce: [
    { da: '16:00', a: '20:00' },
    { da: '08:00', a: '12:00' },
  ],
  giorniChiusura: [
    { data: '2026-12-25', motivo: 'Natale', ogniAnno: true },
    { data: '2026-08-15', motivo: 'Ferragosto', ogniAnno: true },
  ],
  nota: '  prova  ',
})
prova('dati buoni passano', buono.ok)
if (buono.ok) {
  prova('giorni senza doppioni e ordinati', buono.dati.giorniApertura.join(',') === '1,2,3,4,5,6', buono.dati.giorniApertura.join(','))
  prova('fasce ordinate per orario', buono.dati.fasce[0].da === '08:00', buono.dati.fasce.map(etichettaFascia).join(' '))
  prova('chiusure ordinate per data', buono.dati.giorniChiusura[0].data === '2026-08-15')
  prova('nota ripulita', buono.dati.nota === 'prova')
}
const nessunGiorno = validaOrario({ giorniApertura: [], fasce: [], giorniChiusura: [] })
prova('zero giorni aperti si rifiuta', !nessunGiorno.ok, !nessunGiorno.ok ? nessunGiorno.errori[0] : '')
const rovescia = validaOrario({ giorniApertura: [1], fasce: [{ da: '12:00', a: '08:00' }], giorniChiusura: [] })
prova('fascia col massimo prima del minimo si rifiuta', !rovescia.ok, !rovescia.ok ? rovescia.errori[0] : '')
const oraStorta = validaOrario({ giorniApertura: [1], fasce: [{ da: '8', a: '12:00' }], giorniChiusura: [] })
prova('orario non HH:MM si rifiuta', !oraStorta.ok)
const doppia = validaOrario({ giorniApertura: [1], fasce: [{ da: '08:00', a: '12:00' }, { da: '08:00', a: '12:00' }], giorniChiusura: [] })
prova('fascia doppia si rifiuta', !doppia.ok)
const chiusuraSenzaData = validaOrario({ giorniApertura: [1], fasce: [], giorniChiusura: [{ data: '', motivo: 'x', ogniAnno: false }] })
prova('chiusura senza data si rifiuta', !chiusuraSenzaData.ok)
const zeroFasce = validaOrario({ giorniApertura: [1], fasce: [], giorniChiusura: [] })
prova('zero fasce si accetta (tornano le voci storiche)', zeroFasce.ok)

console.log('\n=== Etichette ===\n')
prova('08:00-12:00 → 08-12', etichettaFascia({ da: '08:00', a: '12:00' }) === '08-12', etichettaFascia({ da: '08:00', a: '12:00' }))
prova('08:30-12:00 → 08:30-12', etichettaFascia({ da: '08:30', a: '12:00' }) === '08:30-12', etichettaFascia({ da: '08:30', a: '12:00' }))

console.log('\n=== La data si può scegliere? (oggi = mer 09/09/2026) ===\n')
const dati: OrarioNegozioDati = buono.ok ? buono.dati : { giorniApertura: [1, 2, 3, 4, 5, 6], fasce: [], giorniChiusura: [], nota: '' }
const OGGI = '2026-09-09'
const g = (iso: string) => giornoSelezionabile(dati, iso, OGGI)
prova('giovedì 10/09 aperto', g('2026-09-10').ok)
prova('domenica 13/09 chiuso (giorno della settimana)', !g('2026-09-13').ok && g('2026-09-13').motivo.includes('domenica'), g('2026-09-13').motivo)
prova('venerdì 25/12/2026 chiuso (Natale)', !g('2026-12-25').ok && g('2026-12-25').motivo.includes('Natale'), g('2026-12-25').motivo)
prova('25/12/2027 chiuso anche l’anno dopo (ogni anno)', !g('2027-12-25').ok, g('2027-12-25').motivo)
prova('ieri 08/09 è passato', !g('2026-09-08').ok && g('2026-09-08').motivo.includes('passato'), g('2026-09-08').motivo)
prova('oggi 09/09 si può scegliere', g(OGGI).ok)
prova('data illeggibile', !g('2026-13-40').ok, g('2026-13-40').motivo)
const soloUnaVolta: OrarioNegozioDati = { ...dati, giorniChiusura: [{ data: '2026-12-25', motivo: 'inventario', ogniAnno: false }] }
prova('chiusura NON ogni anno vale solo quell’anno', !giornoSelezionabile(soloUnaVolta, '2026-12-25', OGGI).ok && giornoSelezionabile(soloUnaVolta, '2027-12-25', OGGI).ok)

console.log('\n=== Anteprima e primo giorno ===\n')
const settimana = prossimiGiorni(dati, 7, OGGI)
prova('7 giorni, 6 aperti (una domenica)', settimana.filter((x) => x.ok).length === 6, settimana.map((x) => `${x.data.slice(5)}:${x.ok ? 'sì' : 'no'}`).join(' '))
const soloDomenica: OrarioNegozioDati = { ...dati, giorniApertura: [0] }
prova('primo giorno aperto di un negozio solo-domenica = 13/09', primoGiornoAperto(soloDomenica, OGGI) === '2026-09-13', String(primoGiornoAperto(soloDomenica, OGGI)))

console.log('\n=== Lettura di una riga dal database ===\n')
const rotta = leggiOrario({ giorniApertura: '1,2,x,9,3', fasce: '{non è json', giorniChiusura: '[{"data":"2026-12-25","motivo":"Natale","ogniAnno":true},{"data":"boh"}]', nota: 'n' })
prova('giorni: solo 1,2,3 (via x e 9)', rotta.giorniApertura.join(',') === '1,2,3', rotta.giorniApertura.join(','))
prova('fasce rotte → vuote, senza cadere', rotta.fasce.length === 0)
prova('chiusure: resta solo quella con la data valida', rotta.giorniChiusura.length === 1 && rotta.giorniChiusura[0].ogniAnno)
const predefinito = leggiOrario(null)
prova('nessuna riga → punto di partenza: 7 giorni e 3 fasce (NON una regola)', predefinito.giorniApertura.length === 7 && predefinito.fasce.length === 3)

console.log(male ? `\n${male} prove NON passate` : '\nTutte le prove passate')
process.exit(male ? 1 : 0)
