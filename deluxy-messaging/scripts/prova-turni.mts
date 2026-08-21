// Casi di prova dei turni.
//   npx tsx scripts/prova-turni.mts
//
// ⚠️ Non scrive niente: prova le regole, che è dove si sbaglia. La regola che
// conta è una sola — **l'eccezione vince sulla settimana** — e sbagliarla non
// darebbe nessun errore: direbbe solo che una persona in ferie è di turno.
import {
  controllaFascia,
  giornoValido,
  oraValida,
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
// ⚠️ 24:00 è la FINE della giornata: solo in coda, e solo esatta.
prova('24:00 solo come fine', oraValida('24:00'), false)
prova('24:00 come fine sì', oraValida('24:00', true), true)
prova('24:30 mai', oraValida('24:30', true), false)

console.log('\n── Fasce ──')
prova('9→13 va bene', controllaFascia('09:00', '13:00'), '')
prova('13→9 è rifiutata', controllaFascia('13:00', '09:00') !== '', true)
prova('9→9 è rifiutata', controllaFascia('09:00', '09:00') !== '', true)
prova('20→24 va bene', controllaFascia('20:00', '24:00'), '')

console.log('\n── Giorni di calendario ──')
prova('2026-08-25 esiste', giornoValido('2026-08-25'), true)
// ⚠️ Il 31 aprile NON esiste: senza il controllo scivolerebbe al primo maggio
// e l'eccezione finirebbe sul giorno sbagliato, senza dire niente a nessuno.
prova('2026-04-31 non esiste', giornoValido('2026-04-31'), false)
prova('25/08/2026 non è il formato', giornoValido('25/08/2026'), false)

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
