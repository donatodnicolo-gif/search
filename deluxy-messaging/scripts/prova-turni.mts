// Casi di prova dei turni.
//   npx tsx scripts/prova-turni.mts
//
// ⚠️ Non scrive niente: prova le regole, che è dove si sbaglia. La regola che
// conta è una sola — **l'eccezione vince sulla settimana** — e sbagliarla non
// darebbe nessun errore: direbbe solo che una persona in ferie è di turno.
import {
  controllaFascia,
  giornoIso,
  giornoSettimana,
  giornoValido,
  lunediDi,
  oraValida,
  piuGiorni,
  turniDelGiorno,
  type EsitoTurni,
} from '../src/lib/turni'

let falliti = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  const ok = JSON.stringify(avuto) === JSON.stringify(atteso)
  if (!ok) falliti++
  console.log(`${ok ? 'OK  ' : 'NO  '} ${nome}${ok ? '' : `\n     avuto ${JSON.stringify(avuto)}\n     atteso ${JSON.stringify(atteso)}`}`)
}

console.log('── Orari ──')
prova('09:00 va bene', oraValida('09:00'), true)
prova('9 non va bene', oraValida('9'), false)
prova('25:00 non esiste', oraValida('25:00'), false)
// ⚠️⚠️ «24:00» NON si accetta, nemmeno come fine: il campo orario del browser
// (`<input type="time">`) arriva alle 23:59, e un turno salvato con le 24:00
// tornava a schermo con la casella di fine VUOTA — dato giusto nel database,
// pagina che sembra rotta. Trovato provando la pagina, non leggendo il codice.
prova('24:00 non esiste', oraValida('24:00'), false)
prova('23:59 sì', oraValida('23:59'), true)
prova('00:00 sì', oraValida('00:00'), true)

console.log('\n── Fasce ──')
prova('9→13 va bene', controllaFascia('09:00', '13:00'), '')
prova('13→9 è rifiutata', controllaFascia('13:00', '09:00') !== '', true)
prova('9→9 è rifiutata', controllaFascia('09:00', '09:00') !== '', true)
prova('20→23:59 va bene', controllaFascia('20:00', '23:59'), '')
prova('20→24:00 è rifiutata', controllaFascia('20:00', '24:00') !== '', true)

console.log('\n── Giorni di calendario ──')
prova('2026-08-25 esiste', giornoValido('2026-08-25'), true)
// ⚠️ Il 31 aprile NON esiste: senza il controllo scivolerebbe al primo maggio
// e l'eccezione finirebbe sul giorno sbagliato, senza dire niente a nessuno.
prova('2026-04-31 non esiste', giornoValido('2026-04-31'), false)
prova('25/08/2026 non è il formato', giornoValido('25/08/2026'), false)

console.log('\n── Le settimane ──')
const il = (s: string) => new Date(`${s}T12:00:00`)
// ⚠️ La domenica è il caso che si sbaglia: `getDay()` la chiama 0, e presa così
// com'è sposta tutta la settimana di un giorno. L'errore si vedrebbe solo di
// domenica, quando in ufficio non c'è nessuno a notarlo.
prova('lunedì 24 ago → giorno 1', giornoSettimana(il('2026-08-24')), 1)
prova('domenica 30 ago → giorno 7', giornoSettimana(il('2026-08-30')), 7)
prova('il lunedì di mercoledì 26', giornoIso(lunediDi(il('2026-08-26'))), '2026-08-24')
prova('il lunedì di DOMENICA 30', giornoIso(lunediDi(il('2026-08-30'))), '2026-08-24')
prova('il lunedì di lunedì 24 è sé stesso', giornoIso(lunediDi(il('2026-08-24'))), '2026-08-24')
// ⚠️ Le due notti in cui cambia l'ora legale durano 23 e 25 ore: sommare
// 7 × 86.400.000 millisecondi farebbe scivolare la settimana di un giorno, due
// volte l'anno. `setDate` non ha questo problema.
prova(
  'la settimana dopo il 25 ottobre (ora solare)',
  giornoIso(piuGiorni(lunediDi(il('2026-10-19')), 7)),
  '2026-10-26'
)
prova(
  'la settimana dopo il 29 marzo (ora legale)',
  giornoIso(piuGiorni(lunediDi(il('2026-03-23')), 7)),
  '2026-03-30'
)
prova('sette giorni avanti e sette indietro si torna', giornoIso(piuGiorni(piuGiorni(il('2026-10-25'), 7), -7)), '2026-10-25')

console.log('\n── La regola vera: l’eccezione vince sulla settimana ──')
const dati: EsitoTurni = {
  operatori: [
    { id: 'fe', nome: 'Federica', ruolo: 'operatore' },
    { id: 'ri', nome: 'Riccardo', ruolo: 'operatore' },
  ],
  turni: [
    { id: 't1', utenteId: 'fe', utenteNome: 'Federica', giorno: 2, dalle: '09:00', alle: '13:00' },
    { id: 't2', utenteId: 'fe', utenteNome: 'Federica', giorno: 2, dalle: '15:00', alle: '18:00' },
    { id: 't3', utenteId: 'ri', utenteNome: 'Riccardo', giorno: 2, dalle: '10:00', alle: '19:00' },
  ],
  eccezioni: [
    {
      id: 'e1',
      utenteId: 'fe',
      utenteNome: 'Federica',
      giorno: '2026-08-25',
      tipo: 'riposo',
      dalle: '',
      alle: '',
      motivo: 'ferie',
      creatoDaNome: 'Nicolò',
    },
    {
      id: 'e2',
      utenteId: 'ri',
      utenteNome: 'Riccardo',
      giorno: '2026-09-01',
      tipo: 'orario',
      dalle: '14:00',
      alle: '18:00',
      motivo: 'visita',
      creatoDaNome: 'Nicolò',
    },
  ],
}

// Un martedì qualunque: valgono le due fasce di Federica e quella di Riccardo.
prova(
  'martedì normale → 3 fasce',
  turniDelGiorno(dati, '2026-08-18', 2).map((t) => `${t.nome} ${t.dalle}`),
  ['Federica 09:00', 'Riccardo 10:00', 'Federica 15:00']
)

// ⚠️ Martedì 25 agosto Federica è in ferie: SPARISCONO ENTRAMBE le sue fasce,
// non una. Un riposo cancella il giorno, non un turno.
prova(
  '25 ago (ferie di Federica) → resta solo Riccardo',
  turniDelGiorno(dati, '2026-08-25', 2).map((t) => `${t.nome} ${t.dalle}`),
  ['Riccardo 10:00']
)

// ⚠️ Martedì 1 settembre Riccardo ha un orario diverso: la fascia dell'eccezione
// SOSTITUISCE la sua abituale, non ci si aggiunge.
prova(
  '1 set (orario diverso di Riccardo) → 14:00, non 10:00',
  turniDelGiorno(dati, '2026-09-01', 2).map((t) => `${t.nome} ${t.dalle}–${t.alle}`),
  ['Federica 09:00–13:00', 'Riccardo 14:00–18:00', 'Federica 15:00–18:00']
)

// Un lunedì: nessuno ha turni, e non ci si inventa niente.
prova('lunedì → nessuno', turniDelGiorno(dati, '2026-08-24', 1), [])

console.log(falliti === 0 ? '\nTutti i casi passano.' : `\n${falliti} FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
