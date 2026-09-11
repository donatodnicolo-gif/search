// Prova delle REGOLE degli orari dei negozi (10/09/2026): validazione, «questa
// data si può scegliere?», e — dalla sera del 10/09 — IL MOTORE DELLE FASCE con
// le regole di deluxy.it dettate dall'utente e confermate dall'architetto UX:
// oggi a 2 ore dalla seconda fascia dopo quella in corso, di notte dalle 10-12,
// dalle 18 alle 19:59 la sola 20-22; domani ORARIO dall'orario minimo del carrello, e dalle 20 la prima fascia di domani
// dura due ore dall'orario minimo (08-10 senza vincoli) poi orarie,
// oltre a 1 ora; la disponibilità minima dei prodotti toglie le fasce che
// cominciano prima; il preavviso toglie i giorni troppo vicini.
// Non tocca il database. Uso: npx tsx scripts/prova-orari-negozi.mts
import {
  calendarioConsegna,
  etichettaFascia,
  fasceDelGiorno,
  giornoSelezionabile,
  leggiFasceTesto,
  leggiOrario,
  primoGiornoAperto,
  REGOLE_CAKE,
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
const f = (data: string, ora: string, vincoli = {}, d: OrarioNegozioDati = dlx) => fasceDelGiorno(d, data, alle(D0, ora), vincoli)
const s = (data: string, ora: string, vincoli = {}, d: OrarioNegozioDati = dlx) => f(data, ora, vincoli, d).etichette.join(' ')
prova('10:30 oggi → dalla seconda dopo quella in corso: 14-16 …', s(D0, '10:30') === '14-16 16-18 18-20 20-22', s(D0, '10:30'))
prova('10:00 in punto oggi → 14-16 … (la fascia in corso è 10-12)', s(D0, '10:00') === '14-16 16-18 18-20 20-22', s(D0, '10:00'))
prova('08:00 oggi → 12-14 …', s(D0, '08:00') === '12-14 14-16 16-18 18-20 20-22', s(D0, '08:00'))
prova('16:00 oggi → 20-22 (seconda dopo 16-18)', s(D0, '16:00') === '20-22', s(D0, '16:00'))
prova('18:00–19:59 oggi → solo 20-22 (eccezione confermata)', s(D0, '19:59') === '20-22', s(D0, '19:59'))
prova('20:00 oggi → nessuna, con motivo', !f(D0, '20:00').ok && f(D0, '20:00').motivo.includes('20'), f(D0, '20:00').motivo)
prova('03:00 di notte oggi → dalle 10-12 (si conta dall’apertura)', s(D0, '03:00') === '10-12 12-14 14-16 16-18 18-20 20-22', s(D0, '03:00'))
prova('07:00 oggi → dalle 10-12', s(D0, '07:00') === '10-12 12-14 14-16 16-18 18-20 20-22', s(D0, '07:00'))
prova('domani alle 15:00 → 14 fasce di UN’ORA 08-09 … 21-22', f(D1, '15:00').etichette.length === 14 && s(D1, '15:00').startsWith('08-09 09-10') && s(D1, '15:00').endsWith('21-22'), s(D1, '15:00'))
prova('domani alle 15:00 con orario minimo 9 → orarie dalle 09-10', s(D1, '15:00', { oraMinima: 9 }).startsWith('09-10 10-11') && f(D1, '15:00', { oraMinima: 9 }).etichette.length === 13, s(D1, '15:00', { oraMinima: 9 }))
prova('domani alle 21:00 (dopo le 20, senza vincoli) → PRIMA fascia 08-10 poi orarie 10-11 11-12 … 21-22', s(D1, '21:00') === '08-10 10-11 11-12 12-13 13-14 14-15 15-16 16-17 17-18 18-19 19-20 20-21 21-22', s(D1, '21:00'))
prova('domani alle 21:00 con orario minimo 9 → 09-11 poi 11-12 12-13 …', s(D1, '21:00', { oraMinima: 9 }).startsWith('09-11 11-12 12-13') && f(D1, '21:00', { oraMinima: 9 }).etichette.length === 12, s(D1, '21:00', { oraMinima: 9 }))
prova('domani alle 21:00 con orario minimo 10 → 10-12 poi 12-13 …', s(D1, '21:00', { oraMinima: 10 }).startsWith('10-12 12-13'), s(D1, '21:00', { oraMinima: 10 }))
prova('domani alle 19:59 (prima della soglia) → ancora tutte orarie', s(D1, '19:59').startsWith('08-09 09-10'), s(D1, '19:59'))
prova('dopodomani → 14 fasce di un’ora 08-09 … 21-22', f(D2, '15:00').etichette.length === 14 && s(D2, '15:00').startsWith('08-09 09-10') && s(D2, '15:00').endsWith('21-22'), s(D2, '15:00'))
prova('dopodomani con disponibilità minima alle 10 → dalle 10-11', s(D2, '15:00', { oraMinima: 10 }).startsWith('10-11') && f(D2, '15:00', { oraMinima: 10 }).etichette.length === 12, s(D2, '15:00', { oraMinima: 10 }))
prova('oggi alle 10:30 con minimo alle 16 → 16-18 18-20 20-22', s(D0, '10:30', { oraMinima: 16 }) === '16-18 18-20 20-22', s(D0, '10:30', { oraMinima: 16 }))
prova('preavviso 2 giorni: oggi e domani spenti col motivo, dopodomani sì', !f(D0, '10:00', { leadGiorni: 2 }).ok && !f(D1, '10:00', { leadGiorni: 2 }).ok && f(D2, '10:00', { leadGiorni: 2 }).ok, f(D0, '10:00', { leadGiorni: 2 }).motivo)
prova('quando: oggi / domani / oltre', f(D0, '10:00').quando === 'oggi' && f(D1, '10:00').quando === 'domani' && f(D2, '10:00').quando === 'oltre')
const cal = calendarioConsegna(dlx, alle(D0, '20:30'), {}, 3)
prova('calendario alle 20:30: oggi spento, domani 08-10 poi orarie (13 fasce), dopodomani orario', !cal[0].ok && cal[1].etichette[0] === '08-10' && cal[1].etichette[1] === '10-11' && cal[1].etichette.length === 13 && cal[2].etichette.length === 14, cal.map((x) => `${x.data.slice(5)}:${x.ok ? x.etichette.length : 'no'}`).join(' '))

console.log('\n=== Fasce ampie (Flowers/Cake, punto di partenza) ===\n')
const amp: OrarioNegozioDati = { giorniApertura: [0, 1, 2, 3, 4, 5, 6], regole: REGOLE_FASCE_AMPIE, giorniChiusura: [], nota: '' }
const fa = (data: string, ora: string) => fasceDelGiorno(amp, data, alle(D0, ora)).etichette.join(' ')
prova('alle 09:00 oggi → 12-16 16-20', fa(D0, '09:00') === '12-16 16-20', fa(D0, '09:00'))
prova('alle 13:00 oggi → 16-20', fa(D0, '13:00') === '16-20', fa(D0, '13:00'))
prova('alle 16:00 oggi → nessuna (drop-off 16:00)', fa(D0, '16:00') === '')
prova('Flowers alle 07:00 oggi → tutte (di notte dalle 08)', fa(D0, '07:00') === '08-12 12-16 16-20', fa(D0, '07:00'))
prova('Flowers domani alle 16:00 → tutte (la soglia del salto è alle 22)', fa(D1, '16:00') === '08-12 12-16 16-20', fa(D1, '16:00'))
prova('Flowers domani alle 22:30 → dalle 12 (salta 08-12)', fa(D1, '22:30') === '12-16 16-20', fa(D1, '22:30'))

console.log('\n=== Cake (drop-off 14:00, di notte dalle 12) ===\n')
const cake: OrarioNegozioDati = { giorniApertura: [0, 1, 2, 3, 4, 5, 6], regole: REGOLE_CAKE, giorniChiusura: [], nota: '' }
const fc = (data: string, ora: string) => fasceDelGiorno(cake, data, alle(D0, ora)).etichette.join(' ')
prova('Cake alle 07:00 oggi → dalle 12-16', fc(D0, '07:00') === '12-16 16-20', fc(D0, '07:00'))
prova('Cake alle 09:00 oggi → 12-16 16-20', fc(D0, '09:00') === '12-16 16-20', fc(D0, '09:00'))
prova('Cake alle 13:00 oggi → 16-20', fc(D0, '13:00') === '16-20', fc(D0, '13:00'))
prova('Cake alle 14:00 oggi → nessuna (drop-off 14:00)', fc(D0, '14:00') === '')
prova('Cake domani alle 15:00 → tutte', fc(D1, '15:00') === '08-12 12-16 16-20', fc(D1, '15:00'))
prova('Cake domani alle 20:30 → dalle 12', fc(D1, '20:30') === '12-16 16-20', fc(D1, '20:30'))
console.log('\n=== Giorni con fasce speciali ===\n')
prova('testo «08-12, 14-18» → due fasce', leggiFasceTesto('08-12, 14-18').map(etichettaFascia).join(' ') === '08-12 14-18', leggiFasceTesto('08-12, 14-18').map(etichettaFascia).join(' '))
prova('testo «9-11 · 15:30-17» → 09-11 e 15:30-17', leggiFasceTesto('9-11 · 15:30-17').map(etichettaFascia).join(' ') === '09-11 15:30-17', leggiFasceTesto('9-11 · 15:30-17').map(etichettaFascia).join(' '))
prova('testo storto → niente', leggiFasceTesto('mattina, 12-10').length === 0)
const soloDomenica: OrarioNegozioDati = { giorniApertura: [1, 2, 3, 4, 5, 6], regole: REGOLE_DELUXY, giorniChiusura: [], nota: '', giorniSpeciali: [{ data: D2, ogniAnno: false, fasce: [{ da: '10:00', a: '12:00' }, { da: '16:00', a: '18:00' }] }, { data: D1, ogniAnno: false, fasce: [{ da: '08:00', a: '12:00' }] }, { data: D0, ogniAnno: false, fasce: [{ da: '09:00', a: '11:00' }, { da: '17:00', a: '19:00' }] }] }
prova('dopodomani speciale → solo le sue fasce (non le orarie delle regole)', s(D2, '15:00', undefined, soloDomenica) === '10-12 16-18', s(D2, '15:00', undefined, soloDomenica))
prova('domani speciale → 08-12 anche alle 21 (niente salto, niente prima fascia lunga)', s(D1, '21:00', undefined, soloDomenica) === '08-12', s(D1, '21:00', undefined, soloDomenica))
prova('oggi speciale alle 10:00 → via la 09-11 già cominciata, resta 17-19', s(D0, '10:00', undefined, soloDomenica) === '17-19', s(D0, '10:00', undefined, soloDomenica))
prova('oggi speciale alle 20:30 → drop-off: spento', !f(D0, '20:30', undefined, soloDomenica).ok)
prova('speciale con orario minimo 17 → resta solo 17-19 (le fasce prima si tolgono)', s(D0, '08:00', { oraMinima: 17 }, soloDomenica) === '17-19', s(D0, '08:00', { oraMinima: 17 }, soloDomenica))
prova('l’esito dice «speciale»', f(D2, '15:00', undefined, soloDomenica).speciale === true)
const domenicaChiusa = { ...soloDomenica, giorniSpeciali: [{ data: '2026-09-13', ogniAnno: false, fasce: [{ da: '10:00', a: '14:00' }] }] }
prova('una domenica (giorno chiuso) con fasce speciali si può scegliere', giornoSelezionabile(domenicaChiusa, '2026-09-13', D0).ok && !giornoSelezionabile(soloDomenica, '2026-09-13', D0).ok)
const conflitto = validaOrario({ giorniApertura: [1], regole: REGOLE_DELUXY, giorniChiusura: [{ data: '2026-12-24', motivo: 'vigilia', ogniAnno: true }], giorniSpeciali: [{ data: '2026-12-24', ogniAnno: true, testo: '08-12' }] })
prova('stesso giorno chiuso E speciale si rifiuta', !conflitto.ok && /sia chiuso sia/.test(conflitto.ok ? '' : conflitto.errori.join(' ')), conflitto.ok ? '' : conflitto.errori.join(' | '))
const daTesto = validaOrario({ giorniApertura: [1], regole: REGOLE_DELUXY, giorniChiusura: [], giorniSpeciali: [{ data: '2026-12-24', ogniAnno: true, testo: '14-18, 08-12' }] })
prova('dal modulo il testo diventa fasce ordinate', daTesto.ok && daTesto.dati.giorniSpeciali?.[0].fasce.map(etichettaFascia).join(' ') === '08-12 14-18', daTesto.ok ? daTesto.dati.giorniSpeciali?.[0].fasce.map(etichettaFascia).join(' ') : daTesto.errori.join(' | '))
const sovrapposte = validaOrario({ giorniApertura: [1], regole: REGOLE_DELUXY, giorniChiusura: [], giorniSpeciali: [{ data: '2026-12-24', ogniAnno: false, testo: '08-12, 11-14' }] })
prova('fasce sovrapposte si rifiutano', !sovrapposte.ok)
const senzaFasce = validaOrario({ giorniApertura: [1], regole: REGOLE_DELUXY, giorniChiusura: [], giorniSpeciali: [{ data: '2026-12-24', ogniAnno: false, testo: 'boh' }] })
prova('giorno speciale senza fasce leggibili si rifiuta', !senzaFasce.ok)
const rilettura = leggiOrario({ giorniApertura: '1,2', regole: '{}', giorniChiusura: '[]', fasce: JSON.stringify([{ data: '2026-12-24', ogniAnno: true, fasce: [{ da: '08:00', a: '12:00' }, { da: 'x', a: 'y' }] }]), nota: '' })
prova('rilettura dalla colonna fasce: tiene le fasce buone, scarta le rotte', rilettura.giorniSpeciali?.length === 1 && rilettura.giorniSpeciali[0].fasce.length === 1)

const chiusoOggi: OrarioNegozioDati = { ...dlx, giorniChiusura: [{ data: D0, motivo: 'chiusura di oggi: si ordina per domani', ogniAnno: false }] }
const cc = calendarioConsegna(chiusoOggi, alle(D0, '10:00'), {}, 2)
prova('«Chiudi il negozio oggi»: oggi spento col motivo, domani aperto', !cc[0].ok && cc[0].motivo.includes('si ordina per domani') && cc[1].ok, cc[0].motivo)

console.log('\n=== Il calendario del partner (prodotti unici) ===\n')
const calPartner = (giorni: { data: string; aperto: boolean; dalle: string | null; alle?: string | null; origine?: string }[]) => ({ codice: 'PP-TORTA', nome: 'Torta della casa', partner: 'Clivati', calendario: giorni })
const chiusoDomani = calPartner([
  { data: D0, aperto: true, dalle: '07:30', alle: '19:30' },
  { data: D1, aperto: false, dalle: null, alle: null, origine: 'eccezione' },
  { data: D2, aperto: true, dalle: '09:00', alle: '19:30' },
])
const fp = (data: string, ora: string, prodotti: ReturnType<typeof calPartner>[]) => fasceDelGiorno(dlx, data, alle(D0, ora), { prodotti })
prova('partner chiuso domani → domani spento col suo nome', !fp(D1, '10:00', [chiusoDomani]).ok && fp(D1, '10:00', [chiusoDomani]).motivo.includes('Clivati'), fp(D1, '10:00', [chiusoDomani]).motivo)
prova('partner apre alle 07:30 → oggi alle 03:00 le fasce partono comunque dalle 10 (notte) e da 08 in su', fp(D0, '03:00', [chiusoDomani]).etichette[0] === '10-12')
prova('dopodomani il partner apre alle 09 → fasce orarie dalle 09-10', fp(D2, '10:00', [chiusoDomani]).etichette[0] === '09-10', fp(D2, '10:00', [chiusoDomani]).etichette.slice(0, 3).join(' '))
const chiudeAlle15 = calPartner([{ data: D0, aperto: true, dalle: '09:00', alle: '15:00' }])
prova('sono le 16, il partner ha chiuso alle 15 → oggi «ha già chiuso», si ordina da domani', !fp(D0, '16:00', [chiudeAlle15]).ok && fp(D0, '16:00', [chiudeAlle15]).motivo.includes('già chiuso'), fp(D0, '16:00', [chiudeAlle15]).motivo)
prova('sono le 10, il partner chiude alle 15 → oggi le fasce restano (14-16 …)', fp(D0, '10:30', [chiudeAlle15]).etichette.join(' ') === '14-16 16-18 18-20 20-22', fp(D0, '10:30', [chiudeAlle15]).etichette.join(' '))
const giaChiusoPiattaforma = calPartner([{ data: D0, aperto: false, dalle: '09:00', alle: '15:00', origine: 'chiuso-per-oggi' }])
prova('la piattaforma dice «chiuso-per-oggi» → stesso motivo', fp(D0, '16:00', [giaChiusoPiattaforma]).motivo.includes('già chiuso'))
const dueProdotti = [chiusoDomani, calPartner([{ data: D2, aperto: false, dalle: null, origine: 'settimanale' }])]
prova('due prodotti unici: basta che uno sia chiuso', !fp(D1, '10:00', dueProdotti).ok && !fp(D2, '10:00', dueProdotti).ok)
prova('giorno oltre il calendario del partner → nessun vincolo', fp('2026-10-10', '10:00', [chiusoDomani]).ok)

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
