// Prova dell elenco dei fornitori a cui proporre un ordine.
//
// ⚠️⚠️ Perche' l ORDINE dell elenco conta: davanti a una consegna di domani si
// scrive ai primi due o tre, non a tutti. L ordine dell elenco E' la decisione
// di chi lavora — un elenco alfabetico manda a chiedere ogni volta alle stesse
// insegne (quelle con la A) e lascia fuori chi ha gia' lavorato per noi.
import {
  chiaveFornitore, daQuanto, nomeEsito, ordinaCandidati, punteggioCandidato,
  riassunto, siPuoRichiedere, type Candidato, type Chiesto,
} from '../src/lib/richieste-fornitore'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const cand = (p: Partial<Candidato>): Candidato => ({
  id: 'x', nome: 'Tizio', categoria: 'FIORISTA', citta: 'Milano', telefono: '+39333',
  email: '', recapitoDa: '', stato: 'prospect', ordiniFatti: 0, ...p,
})
const chiesto = (p: Partial<Chiesto>): Chiesto => ({
  id: 'c', fornitoreNome: 'Tizio', fornitoreId: '', canale: 'whatsapp',
  chiestoIl: '2026-08-24T10:00:00Z', chiestoDaNome: 'Nicolò', esito: 'in_attesa', nota: '', ...p,
})

console.log('══ CHI VA IN CIMA ══')
{
  const noto = cand({ nome: 'Gia Lavorato', ordiniFatti: 4 })
  const nuovo = cand({ nome: 'Mai Visto' })
  prova('chi ha gia lavorato per noi batte chi non conosciamo', punteggioCandidato(noto) > punteggioCandidato(nuovo))
  const attivo = cand({ nome: 'Partner', stato: 'attivo' })
  prova('un partner attivo batte un prospect', punteggioCandidato(attivo) > punteggioCandidato(nuovo))
  const senzaTel = cand({ nome: 'Senza', telefono: '', email: 'a@b.it' })
  prova('senza numero va sotto', punteggioCandidato(senzaTel) < punteggioCandidato(nuovo))
  prova('  ma NON sparisce: ha comunque un punteggio', punteggioCandidato(senzaTel) > 0)
  const referente = cand({ nome: 'Ref', recapitoDa: 'Mario' })
  prova('un recapito di un referente vale un po meno', punteggioCandidato(referente) < punteggioCandidato(nuovo))
}

console.log('\n══ CHI NON SI RICHIAMA ══')
prova('chi non abbiamo mai chiesto: si', siPuoRichiedere(undefined))
prova('chi e in attesa: si (a volte non ha visto)', siPuoRichiedere(chiesto({ esito: 'in_attesa' })))
// ⚠️ Richiamare chi ha gia' detto no e' la cosa che da' piu' fastidio a un
// fornitore, e la seconda volta la risposta non cambia.
prova('chi ha detto NO: no', !siPuoRichiedere(chiesto({ esito: 'no' })))
prova('chi ha detto SI: no (e gia' + ' suo)', !siPuoRichiedere(chiesto({ esito: 'si' })))

console.log('\n══ L ORDINE DELL ELENCO ══')
{
  const chiesti = new Map<string, Chiesto>([
    [chiaveFornitore('Ha Risposto No'), chiesto({ fornitoreNome: 'Ha Risposto No', esito: 'no' })],
    [chiaveFornitore('In Attesa'), chiesto({ fornitoreNome: 'In Attesa', esito: 'in_attesa' })],
  ])
  const righe = ordinaCandidati([
    cand({ nome: 'Ha Risposto No' }),
    cand({ nome: 'In Attesa' }),
    cand({ nome: 'Da Chiedere' }),
  ], chiesti)
  prova('prima chi non e stato ancora chiesto', righe[0].candidato.nome === 'Da Chiedere', righe.map(r=>r.candidato.nome).join(' → '))
  prova('poi chi e in attesa', righe[1].candidato.nome === 'In Attesa')
  // ⚠️ Chi ha risposto NON sparisce: sparire vorrebbe dire che quel lavoro non
  // e' stato fatto, e qualcuno lo rifarebbe.
  prova('chi ha risposto resta in fondo, non sparisce', righe.length === 3 && righe[2].candidato.nome === 'Ha Risposto No')
  prova('e la sua risposta viaggia con lui', righe[2].chiesto?.esito === 'no')
}

console.log('\n══ DA QUANTO ══')
{
  const ora = new Date('2026-08-24T12:00:00Z').getTime()
  prova('due minuti', daQuanto('2026-08-24T11:58:00Z', ora) === '2 minuti fa', daQuanto('2026-08-24T11:58:00Z', ora))
  prova('un ora', daQuanto('2026-08-24T11:00:00Z', ora) === '1 ora fa', daQuanto('2026-08-24T11:00:00Z', ora))
  prova('tre giorni', daQuanto('2026-08-21T12:00:00Z', ora) === '3 giorni fa', daQuanto('2026-08-21T12:00:00Z', ora))
}

console.log('\n══ IL RIASSUNTO ══')
prova('nessuno chiesto', riassunto([]) === 'Non hai ancora chiesto a nessuno.')
prova('uno ha detto si: si dice solo quello', riassunto([chiesto({ esito: 'si' }), chiesto({ esito: 'no' })]) === '1 ha detto sì.')
// ⚠️ Se hanno detto no TUTTI, il problema non sono i fornitori: continuare a
// cercarne altri e' la reazione istintiva e quasi sempre quella sbagliata.
{
  const tuttiNo = riassunto([chiesto({esito:'no'}), chiesto({esito:'no'}), chiesto({esito:'no'})])
  prova('tre no su tre: lo dice', tuttiNo.includes('prezzo o la data'), tuttiNo)
}
prova('due chiesti senza risposta', riassunto([chiesto({}), chiesto({})]).includes('2 senza risposta'))
prova('gli esiti hanno un nome leggibile', nomeEsito('si') === 'ha detto sì' && nomeEsito('in_attesa') === 'in attesa')

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
