// Quanto lavoro ha fatto ciascun operatore, in un periodo.
//
// ⚠️⚠️ **Si contano solo gesti che lasciano un nome nel database.** Non c'è
// nessun log delle azioni in quest'app: le firme sono quattro, e sono queste.
// Tutto il resto (aver letto una chat, aver cercato un ordine, aver aiutato un
// collega) non è misurabile e **non va inventato** — un numero che sembra una
// prestazione e non lo è fa più danno di una colonna che manca.
//
// ⚠️ Il campanello grosso: `Ordine.gestioneDaId`/`gestioneIl` tengono
// **soltanto l'ULTIMO cambio di stato**, non la storia. Se Federica porta un
// ordine a «Gestito» e domani Riccardo lo riapre, quella chiusura sparisce dal
// conteggio di Federica. Sui numeri di oggi succede di rado, ma è il motivo per
// cui questa pagina misura **il lavoro, non il merito**, e lo dice a schermo.

import { db } from './db'
import { CHIUSURA } from './gestione'

export type RigaOperatore = {
  utenteId: string
  nome: string
  ruolo: string
  /** Non è più fra gli utenti: i suoi numeri restano, il nome è quello scritto sulle righe. */
  uscito: boolean
  ordiniPresi: number
  ordiniChiusi: number
  chatPrese: number
  chatRisposte: number
  messaggiInviati: number
  linkPagamento: number
  ordiniCreati: number
}

export type EsitoOperatori = {
  da: string
  a: string
  righe: RigaOperatore[]
  /**
   * Da quando ciascuna misura esiste davvero. Serve a non leggere uno zero come
   * «non ha fatto niente» quando la verità è «qui non si misurava ancora».
   */
  daQuando: { chiave: string; il: string | null }[]
}

/** Le colonne, con la firma nel database che le rende contabili. */
export const COLONNE = [
  {
    chiave: 'ordiniPresi',
    nome: 'Ordini presi',
    spiega: 'Ordini di cui si è preso carico: il bollino col suo nome sulla bacheca.',
  },
  {
    chiave: 'ordiniChiusi',
    nome: 'Ordini chiusi',
    spiega:
      'Ordini portati a «Gestito», cioè tolti dalla lista di lavoro. Vale l’ultimo cambio di stato: se qualcuno riapre l’ordine, la chiusura non si conta più a nessuno.',
  },
  {
    chiave: 'chatPrese',
    nome: 'Chat prese',
    spiega: 'Conversazioni di cui si è preso carico in Inbox.',
  },
  {
    chiave: 'chatRisposte',
    nome: 'Chat risposte',
    spiega:
      'Conversazioni diverse in cui ha scritto almeno un messaggio. È la misura più onesta di «quante chat ha seguito»: prendere in carico è un clic, rispondere è il lavoro.',
  },
  {
    chiave: 'messaggiInviati',
    nome: 'Messaggi inviati',
    spiega:
      'Messaggi partiti col suo nome, su tutti i canali. Le risposte automatiche non contano: nascono senza operatore, apposta.',
  },
  {
    chiave: 'linkPagamento',
    nome: 'Link di pagamento',
    spiega:
      'Ordini creati da «Nuovo ordine» col link di pagamento da mandare al cliente. Si misura dal 21/08/2026: prima nessuno scriveva chi li faceva, e quel dato non è recuperabile.',
  },
  {
    chiave: 'ordiniCreati',
    nome: 'Ordini creati',
    spiega:
      'Tutti gli ordini creati al telefono, sia col link sia già pagati. Stessa data d’inizio: 21/08/2026.',
  },
] as const

/**
 * Somma per operatore. Una query per misura, tutte sullo stesso intervallo.
 *
 * ⚠️ `da` incluso, `a` escluso: sono istanti, non giorni. Il confine dei giorni
 * lo decide chi chiama (il browser, che sta nel fuso di chi guarda) — farlo qui
 * vorrebbe dire calcolarlo sul server, che su Vercel sta a UTC e in estate
 * comincerebbe «oggi» alle due del mattino.
 */
export async function misuraOperatori(da: Date, a: Date): Promise<EsitoOperatori> {
  const quando = { gte: da, lt: a }

  const [utenti, presi, chiusi, chatPrese, messaggi, coppieChat, creati] = await Promise.all([
    db.utente.findMany({ select: { id: true, nome: true, ruolo: true } }),

    db.ordine.groupBy({
      by: ['presaDaId', 'presaDaNome'],
      where: { presaDaId: { not: '' }, presaIl: quando },
      _count: { _all: true },
    }),

    // ⚠️ Solo la chiusura: gli altri passaggi di stato sono lavoro in corso, e
    // contarli premierebbe chi sposta un ordine avanti e indietro.
    db.ordine.groupBy({
      by: ['gestioneDaId', 'gestioneDaNome'],
      where: { gestioneDaId: { not: '' }, gestione: CHIUSURA, gestioneIl: quando },
      _count: { _all: true },
    }),

    db.conversazione.groupBy({
      by: ['presaDaId', 'presaDaNome'],
      where: { presaDaId: { not: '' }, presaIl: quando },
      _count: { _all: true },
    }),

    db.messaggio.groupBy({
      by: ['utenteId', 'utenteNome'],
      where: { direzione: 'out', utenteId: { not: '' }, creatoIl: quando },
      _count: { _all: true },
    }),

    // Le chat DIVERSE in cui ha scritto: `distinct` fa fare al database il
    // lavoro di deduplica, e torna una riga per coppia (persona, conversazione).
    db.messaggio.findMany({
      where: { direzione: 'out', utenteId: { not: '' }, creatoIl: quando },
      select: { utenteId: true, conversazioneId: true },
      distinct: ['utenteId', 'conversazioneId'],
    }),

    db.ordineCreato.groupBy({
      by: ['utenteId', 'utenteNome', 'pagamento'],
      where: { utenteId: { not: '' }, creatoIl: quando },
      _count: { _all: true },
    }),
  ])

  // Una riga per persona. Si parte dagli utenti veri e si aggiungono quelli che
  // compaiono solo sulle misure: chi ha lasciato l'azienda ha comunque lavorato,
  // e far sparire i suoi numeri cambierebbe i totali del passato.
  const righe = new Map<string, RigaOperatore>()
  const riga = (id: string, nome: string): RigaOperatore => {
    const c = righe.get(id)
    if (c) return c
    const nuova: RigaOperatore = {
      utenteId: id,
      nome: nome || 'Senza nome',
      ruolo: '',
      uscito: true,
      ordiniPresi: 0,
      ordiniChiusi: 0,
      chatPrese: 0,
      chatRisposte: 0,
      messaggiInviati: 0,
      linkPagamento: 0,
      ordiniCreati: 0,
    }
    righe.set(id, nuova)
    return nuova
  }

  for (const u of utenti) {
    const r = riga(u.id, u.nome)
    // ⚠️ Il nome buono è quello dell'anagrafica, non quello copiato sulle righe:
    // se una persona si è corretta il nome, le righe vecchie hanno ancora il
    // vecchio e la stessa persona comparirebbe due volte.
    r.nome = u.nome
    r.ruolo = u.ruolo
    r.uscito = false
  }

  for (const g of presi) riga(g.presaDaId, g.presaDaNome).ordiniPresi += g._count._all
  for (const g of chiusi) riga(g.gestioneDaId, g.gestioneDaNome).ordiniChiusi += g._count._all
  for (const g of chatPrese) riga(g.presaDaId, g.presaDaNome).chatPrese += g._count._all
  for (const g of messaggi) riga(g.utenteId, g.utenteNome).messaggiInviati += g._count._all
  for (const c of coppieChat) riga(c.utenteId, '').chatRisposte += 1
  for (const g of creati) {
    const r = riga(g.utenteId, g.utenteNome)
    r.ordiniCreati += g._count._all
    if (g.pagamento === 'link') r.linkPagamento += g._count._all
  }

  const elenco = [...righe.values()]
  // In cima chi ha fatto di più, e chi non ha fatto niente in fondo ma **c'è
  // lo stesso**: una riga a zero è un'informazione, una riga assente sembra un
  // errore della pagina.
  elenco.sort((x, y) => totale(y) - totale(x) || x.nome.localeCompare(y.nome))

  return {
    da: da.toISOString(),
    a: a.toISOString(),
    righe: elenco,
    daQuando: await daQuandoSiMisura(),
  }
}

function totale(r: RigaOperatore): number {
  return (
    r.ordiniPresi + r.ordiniChiusi + r.chatPrese + r.messaggiInviati + r.ordiniCreati
  )
}

/**
 * Il primo giorno in cui ciascuna misura ha lasciato traccia.
 *
 * ⚠️ Serve a leggere gli zeri per quello che sono. «Zero link di pagamento nel
 * trimestre» non vuol dire che nessuno ne ha mandati: vuol dire che fino al
 * 21/08/2026 non li scrivevamo. Senza questa riga la pagina racconterebbe una
 * bugia con l'aria di un dato.
 */
async function daQuandoSiMisura(): Promise<{ chiave: string; il: string | null }[]> {
  const [presa, chiusura, chatPresa, messaggio, creato] = await Promise.all([
    db.ordine.findFirst({
      where: { presaIl: { not: null } },
      orderBy: { presaIl: 'asc' },
      select: { presaIl: true },
    }),
    db.ordine.findFirst({
      where: { gestioneDaId: { not: '' } },
      orderBy: { gestioneIl: 'asc' },
      select: { gestioneIl: true },
    }),
    db.conversazione.findFirst({
      where: { presaIl: { not: null } },
      orderBy: { presaIl: 'asc' },
      select: { presaIl: true },
    }),
    db.messaggio.findFirst({
      where: { direzione: 'out', utenteId: { not: '' } },
      orderBy: { creatoIl: 'asc' },
      select: { creatoIl: true },
    }),
    db.ordineCreato.findFirst({ orderBy: { creatoIl: 'asc' }, select: { creatoIl: true } }),
  ])
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
  return [
    { chiave: 'ordiniPresi', il: iso(presa?.presaIl) },
    { chiave: 'ordiniChiusi', il: iso(chiusura?.gestioneIl) },
    { chiave: 'chatPrese', il: iso(chatPresa?.presaIl) },
    { chiave: 'chatRisposte', il: iso(messaggio?.creatoIl) },
    { chiave: 'messaggiInviati', il: iso(messaggio?.creatoIl) },
    { chiave: 'linkPagamento', il: iso(creato?.creatoIl) },
    { chiave: 'ordiniCreati', il: iso(creato?.creatoIl) },
  ]
}
