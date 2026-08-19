// Casi di prova della regola degli avvisi (src/lib/avvisi.ts).
//
// Si lancia a mano, senza aprire un browser:
//
//   npx tsx scripts/prova-avvisi.mts
//
// tsx non e fra le dipendenze: lo scarica npx al momento. Serve perche questa
// e la sola regola dell inbox che si puo sbagliare in silenzio — un avviso che
// non suona non lascia traccia da nessuna parte.

import { nuoviDaAvvisare } from '../src/lib/avvisi'

const IO = 'utente-mio'
const casi: { nome: string; prima: Map<string, number> | null; adesso: Parameters<typeof nuoviDaAvvisare>[1]; atteso: { quanti: number; daLibere: boolean } }[] = [
  {
    nome: 'primo caricamento con 106 non letti → silenzio',
    prima: null,
    adesso: [{ id: 'a', nonLetti: 106, presaDaId: '' }],
    atteso: { quanti: 0, daLibere: false },
  },
  {
    nome: 'messaggio su una conversazione MIA → avvisa',
    prima: new Map([['a', 0]]),
    adesso: [{ id: 'a', nonLetti: 1, presaDaId: IO }],
    atteso: { quanti: 1, daLibere: false },
  },
  {
    nome: 'messaggio su una conversazione LIBERA → avvisa e lo dice',
    prima: new Map([['a', 0]]),
    adesso: [{ id: 'a', nonLetti: 2, presaDaId: '' }],
    atteso: { quanti: 2, daLibere: true },
  },
  {
    nome: 'messaggio su una conversazione DI UN COLLEGA → silenzio',
    prima: new Map([['a', 0]]),
    adesso: [{ id: 'a', nonLetti: 3, presaDaId: 'utente-collega' }],
    atteso: { quanti: 0, daLibere: false },
  },
  {
    nome: 'il collega LIBERA una conversazione con 3 non letti → NON è un messaggio nuovo',
    prima: new Map([['a', 3]]),
    adesso: [{ id: 'a', nonLetti: 3, presaDaId: '' }],
    atteso: { quanti: 0, daLibere: false },
  },
  {
    nome: 'conversazione nuova di zecca e libera → avvisa per tutti i suoi messaggi',
    prima: new Map([['a', 0]]),
    adesso: [
      { id: 'a', nonLetti: 0, presaDaId: '' },
      { id: 'b', nonLetti: 2, presaDaId: '' },
    ],
    atteso: { quanti: 2, daLibere: true },
  },
  {
    nome: 'mia + collega insieme: conta solo la mia',
    prima: new Map([['a', 0], ['b', 0]]),
    adesso: [
      { id: 'a', nonLetti: 1, presaDaId: IO },
      { id: 'b', nonLetti: 5, presaDaId: 'utente-collega' },
    ],
    atteso: { quanti: 1, daLibere: false },
  },
  {
    nome: 'apro una conversazione e i non letti scendono → silenzio',
    prima: new Map([['a', 4]]),
    adesso: [{ id: 'a', nonLetti: 0, presaDaId: IO }],
    atteso: { quanti: 0, daLibere: false },
  },
  {
    nome: 'senza sapere chi guarda (ioId vuoto): solo le libere',
    prima: new Map([['a', 0], ['b', 0]]),
    adesso: [
      { id: 'a', nonLetti: 1, presaDaId: 'chiunque' },
      { id: 'b', nonLetti: 1, presaDaId: '' },
    ],
    atteso: { quanti: 1, daLibere: true },
  },
]

let falliti = 0
for (const c of casi) {
  const ioId = c.nome.includes('ioId vuoto') ? '' : IO
  const r = nuoviDaAvvisare(c.prima, c.adesso, ioId)
  const ok = r.quanti === c.atteso.quanti && r.daLibere === c.atteso.daLibere
  if (!ok) falliti++
  console.log(`${ok ? 'OK  ' : 'NO  '} ${c.nome} → quanti=${r.quanti} daLibere=${r.daLibere}`)
}
console.log(falliti === 0 ? `\nTutti e ${casi.length} i casi passano.` : `\n${falliti} casi FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
