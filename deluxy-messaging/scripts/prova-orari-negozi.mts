// Prova delle REGOLE degli orari dei negozi (10/09/2026): validazione, «questa
// data si può scegliere?», e — dalla sera del 10/09 — IL MOTORE DELLE FASCE con
// le regole di deluxy.it dettate dall'utente e confermate dall'architetto UX:
// oggi a 2 ore dalla seconda fascia dopo quella in corso, di notte dalle 10-12,
// dalle 18 alle 19:59 la sola 20-22, dalle 20 per domani dalle 10-12 (2 ore),
// oltre a 1 ora; la disponibilità minima dei prodotti toglie le fasce che
// cominciano prima; il preavviso toglie i giorni troppo vicini.
// Non tocca il database. Uso: npx tsx scripts/prova-orari-negozi.mts
import {
  calendarioConsegna,
  etichettaFascia,
  fasceDelGiorno,
  giornoSelezionabile,
  leggiOrario,
  primoGiornoAperto,
  REGOLE_DELUXY,
  REGOLE_FASCE_AMPIE,
  validaOrario,
  type Adesso,
  type OrarioNegozioDati,
} from '../src/lib/orari-regole'

let male = 0
function prova(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${dettaglio ? '  — ' + dettaglio : ''}`)
}
const alle = (data: string, hhmm: string): Adesso => ({ data, minuti: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) })

console.log('\n=== Validazione ===\n')
const buono = validaOrario({
  giorniApertura: [6, 1, 2, 3, 4, 5, 1],
  regole: REGOLE_DELUXY,
  giorniChiusura: [
    { data: '2026-12-25', motivo: 'Natale', ogniAnno: true },
    { data: '2026-08-15', motivo: 'Ferragosto', ogniAnno: true },
  ],
  nota: '  prova  ',
})
prova('dati buoni passano', buono.ok, buono.ok ? '' : (buono as { errori: string[] }).errori.join(' | '))
if (buono.ok) {
  prova('giorni senza doppioni e ordinati', buono.dati.giorniApertura.join(',') === '1,2,3,4,5,6', buono.dati.giorniApertura.join(','))
  prova('chiusure ordinate per data', buono.dati.giorniChiusura[0].data === '2026-08-15')
  prova('nota ripulita', buono.dati.nota === 'prova')
}
const nessunGiorno = validaOrario({ giorniApertura: [], regole: REGOLE_DELUXY, giorniChiusura: [] })
prova('zero giorni aperti si rifiuta', !nessunGiorno.ok, !nessunGiorno.ok ? nessunGiorno.errori[0] : '')
const finestraRovescia = validaOrario({ giorniApertura: [1], regole: { ...REGOLE_DELUXY, finestraDa: '20:00', finestraA: '08:00' }, giorniChiusura: [] })
prova('finestra che finisce prima di cominciare si rifiuta', !finestraRovescia.ok, !finestraRovescia.ok ? finestraRovescia.errori[0] : '')
const fasciaTroppoLunga = validaOrario({ giorniApertura: [1], regole: { ...REGOLE_DELUXY, oltre: { durataOre: 12 }, finestraA: '12:00' }, giorniChiusura: [] })
prova('fascia più lunga della finestra si rifiuta', !fasciaTroppoLunga.ok, !fasciaTroppoLunga.ok ? fasciaTroppoLunga.errori[0] : '')
const oraStorta = validaOrario({ giorniApertura: [1], regole: { ...REGOLE_DELUXY, oggi: { ...REGOLE_DELUXY.oggi, limiteOra: '20' } }, giorniChiusura: [] })
prova('ora limite non HH:MM si rifiuta', !oraStorta.ok)
const chiusuraSenzaData = validaOrario({ giorniApertura: [1], regole: REGOLE_DELUXY, giorniChiusura: [{ data: '', motivo: 'x', ogniAnno: false }] })
prova('chiusura senza data si rifiuta', !chiusuraSenzaData.ok)

console.log('\n=== Etichette ===\n')
prova('08:00-12:00 → 08-12', etichettaFascia({ da: '08:00', a: '12:00' }) === '08-12')
prova('08:30-12:00 → 08:30-12', etichettaFascia({ da: '08:30', a: '12:00' }) === '08:30-12')

console.log('\n=== La data si può scegliere? (oggi = mer 09/09/2026) ===\n')
const dati: OrarioNegozioDati = buono.ok ? buono.dati : { giorniApertura: [1, 2, 3, 4, 5, 6], regole: REGOLE_DELUXY, giorniChiusura: [], nota: '' }
const OGGI = '2026-09-09'
const g = (iso: string) => giornoSelezionabile(dati, iso, OGGI)
prova('giovedì 10/09 aperto', g('2026-09-10').ok)
prova('domenica 13/09 chiuso (giorno della settimana)', !g('2026-09-13').ok && g('2026-09-13').motivo.includes('domenica'), g('2026-09-13').motivo)
prova('venerdì 25/12/2026 chiuso (Natale)', !g('2026-12-25').ok && g('2026-12-25').motivo.includes('Natale'), g('2026-12-25').motivo)
prova('25/12/2027 chiuso anche l’anno dopo (ogni anno)', !g('2027-12-25').ok)
prova('ieri 08/09 è passato', !g('2026-09-08').ok && g('2026-09-08').motivo.includes('passato'))
prova('oggi 09/09 si può scegliere', g(OGGI).ok)
prova('data illeggibile', !g('2026-13-40').ok)

console.log('\n=== IL MOTORE — regole deluxy.it, giovedì 10/09/2026 ===\n')
const dlx: OrarioNegozioDati = { giorniApertura: [0, 1, 2, 3, 4, 5, 6], regole: REGOLE_DELUXY, giorniChiusura: [], nota: '' }
const D0 = '2026-09-10', D1 = '2026-09-11', D2 = '2026-09-12'
const f = (data: string, ora: string, vincoli = {}) => fasceDelGiorno(dlx, data, alle(D0, ora), vincoli)
const s = (data: string, ora: string, vincoli = {}) => f(data, ora, vincoli).etichette.join(' ')
prova('10:30 oggi → dalla seconda dopo quella in corso: 14-16 …', s(D0, '10:30') === '14-16 16-18 18-20 20-22', s(D0, '10:30'))
prova('10:00 in punto oggi → 14-16 … (la fascia in corso è 10-12)', s(D0, '10:00') === '14-16 16-18 18-20 20-22', s(D0, '10:00'))
prova('08:00 oggi → 12-14 …', s(D0, '08:00') === '12-14 14-16 16-18 18-20 20-22', s(D0, '08:00'))
prova('16:00 oggi → 20-22 (seconda dopo 16-18)', s(D0, '16:00') === '20-22', s(D0, '16:00'))
prova('18:00–19:59 oggi → solo 20-22 (eccezione confermata)', s(D0, '19:59') === '20-22', s(D0, '19:59'))
prova('20:00 oggi → nessuna, con motivo', !f(D0, '20:00').ok && f(D0, '20:00').motivo.includes('20'), f(D0, '20:00').motivo)
prova('03:00 di notte oggi → dalle 10-12 (si conta dall’apertura)', s(D0, '03:00') === '10-12 12-14 14-16 16-18 18-20 20-22', s(D0, '03:00'))
prova('07:00 oggi → dalle 10-12', s(D0, '07:00') === '10-12 12-14 14-16 16-18 18-20 20-22', s(D0, '07:00'))
prova('domani alle 15:00 → tutte le 7 fasce di 2 ore', s(D1, '15:00') === '08-10 10-12 12-14 14-16 16-18 18-20 20-22', s(D1, '15:00'))
prova('domani alle 21:00 (dopo il limite) → dalle 10-12', s(D1, '21:00') === '10-12 12-14 14-16 16-18 18-20 20-22', s(D1, '21:00'))
prova('dopodomani → 14 fasce di un’ora 08-09 … 21-22', f(D2, '15:00').etichette.length === 14 && s(D2, '15:00').startsWith('08-09 09-10') && s(D2, '15:00').endsWith('21-22'), s(D2, '15:00'))
prova('dopodomani con disponibilità minima alle 10 → dalle 10-11', s(D2, '15:00', { oraMinima: 10 }).startsWith('10-11') && f(D2, '15:00', { oraMinima: 10 }).etichette.length === 12, s(D2, '15:00', { oraMinima: 10 }))
prova('oggi alle 10:30 con minimo alle 16 → 16-18 18-20 20-22', s(D0, '10:30', { oraMinima: 16 }) === '16-18 18-20 20-22', s(D0, '10:30', { oraMinima: 16 }))
prova('preavviso 2 giorni: oggi e domani spenti col motivo, dopodomani sì', !f(D0, '10:00', { leadGiorni: 2 }).ok && !f(D1, '10:00', { leadGiorni: 2 }).ok && f(D2, '10:00', { leadGiorni: 2 }).ok, f(D0, '10:00', { leadGiorni: 2 }).motivo)
prova('quando: oggi / domani / oltre', f(D0, '10:00').quando === 'oggi' && f(D1, '10:00').quando === 'domani' && f(D2, '10:00').quando === 'oltre')
const cal = calendarioConsegna(dlx, alle(D0, '20:30'), {}, 3)
prova('calendario alle 20:30: oggi spento, domani da 10-12, dopodomani orario', !cal[0].ok && cal[1].etichette[0] === '10-12' && cal[2].etichette.length === 14, cal.map((x) => `${x.data.slice(5)}:${x.ok ? x.etichette.length : 'no'}`).join(' '))

console.log('\n=== Fasce ampie (Flowers/Cake, punto di partenza) ===\n')
const amp: OrarioNegozioDati = { giorniApertura: [0, 1, 2, 3, 4, 5, 6], regole: REGOLE_FASCE_AMPIE, giorniChiusura: [], nota: '' }
const fa = (data: string, ora: string) => fasceDelGiorno(amp, data, alle(D0, ora)).etichette.join(' ')
prova('alle 09:00 oggi → 12-16 16-20', fa(D0, '09:00') === '12-16 16-20', fa(D0, '09:00'))
prova('alle 13:00 oggi → 16-20', fa(D0, '13:00') === '16-20', fa(D0, '13:00'))
prova('alle 16:00 oggi → nessuna (limite 16:00)', fa(D0, '16:00') === '')
prova('domani → 08-12 12-16 16-20', fa(D1, '16:00') === '08-12 12-16 16-20', fa(D1, '16:00'))

console.log('\n=== Lettura di una riga dal database ===\n')
const rotta = leggiOrario({ giorniApertura: '1,2,x,9,3', regole: '{non è json', giorniChiusura: '[{"data":"2026-12-25","motivo":"Natale","ogniAnno":true},{"data":"boh"}]', nota: 'n' })
prova('giorni: solo 1,2,3 (via x e 9)', rotta.giorniApertura.join(',') === '1,2,3', rotta.giorniApertura.join(','))
prova('regole rotte → predefinito, senza cadere', rotta.regole.finestraDa === '08:00' && rotta.regole.oggi.durataOre === 4)
prova('regole parziali → completate col predefinito', leggiOrario({ giorniApertura: '1', regole: '{"oggi":{"durataOre":2}}', giorniChiusura: '[]', nota: '' }).regole.oggi.durataOre === 2 && leggiOrario({ giorniApertura: '1', regole: '{"oggi":{"durataOre":2}}', giorniChiusura: '[]', nota: '' }).regole.oggi.limiteOra === '16:00')
prova('chiusure: resta solo quella con la data valida', rotta.giorniChiusura.length === 1 && rotta.giorniChiusura[0].ogniAnno)
prova('nessuna riga → punto di partenza: 7 giorni (NON una regola)', leggiOrario(null).giorniApertura.length === 7)
prova('primo giorno aperto di un negozio solo-domenica = 13/09', primoGiornoAperto({ ...dati, giorniApertura: [0] }, OGGI) === '2026-09-13')

console.log(male ? `\n${male} prove NON passate` : '\nTutte le prove passate')
process.exit(male ? 1 : 0)
