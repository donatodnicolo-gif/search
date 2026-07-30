// I dati della schermata iniziale: cosa deve fare un operatore, adesso.
//
// Il criterio non è «mostrare tutto», è rispondere alle domande di chi apre
// l'app all'inizio del turno, nell'ordine in cui contano:
//
//  1. **Chi sta aspettando una risposta?** Un cliente che ha scritto e non ha
//     ancora risposta è il debito più caro che abbiamo. Su WhatsApp c'è anche un
//     orologio vero: passate 24 ore dal suo ultimo messaggio, Meta non lascia
//     più rispondere in testo libero — quindi «aspetta da 22 ore» non è solo
//     brutto, è una porta che si sta chiudendo.
//  2. **Quali ordini vanno lavorati, di tutti i marchi, in che ordine?** Le
//     fasce di urgenza sono le stesse della bacheca ordini (src/lib/urgenza.ts):
//     oggi, prossimi giorni, scaduti da poco, senza data, scaduti da tempo. Qui
//     si mostrano solo i NON gestiti: quelli spuntati non sono lavoro.
//  3. **Cosa è rimasto in mezzo?** Reclami aperti, rimborsi da decidere,
//     pagamenti non ancora inviati: le code che, se nessuno le guarda, restano
//     ferme per giorni senza che niente lo dica.
//  4. **Cosa mi sono ripromesso di fare?** I promemoria (Attivita).
//
// Tutto in UNA passata di query parallele: la schermata iniziale è quella che si
// apre più spesso, e non deve essere la più lenta.

import { db } from './db'
import { inizioDomani, inizioOggi, limiteCalde } from './urgenza'
import { risolutoreMarchio } from './marchio-conversazione'

/** Quante ore ha ancora la finestra di WhatsApp prima di chiudersi. */
export const FINESTRA_WA_ORE = 24
/** Sotto questa soglia la finestra si segnala: c'è ancora tempo per rispondere. */
const AVVISO_FINESTRA_ORE = 4

export type AttesaDto = {
  id: string
  canale: string
  chi: string
  brand: string
  ultimoTesto: string
  nonLetti: number
  /** Da quanti minuti aspetta una risposta. */
  attesaMinuti: number
  /** Ore rimaste della finestra WhatsApp; `null` sugli altri canali. */
  oreFinestra: number | null
  /** La finestra sta per chiudersi (o è chiusa): si risponde adesso o mai più. */
  finestraCritica: boolean
}

export type OrdineUrgenteDto = {
  id: string
  numero: string
  brand: string
  cliente: string
  citta: string
  fascia: string
  gestione: string
  dataConsegna: string | null
  fasciaOraria: string
}

export type ReclamoApertoDto = {
  id: string
  ordineNumero: string
  brand: string
  cliente: string
  casistica: string
  /** 1 lieve, 2 media, 3 grave. */
  gravita: number
  stato: string
  /** Le azioni da fare, prima riga: è quello che manca per chiuderlo. */
  azioni: string
  colpa: string
  giorniAperto: number
}

export type AttivitaDto = {
  id: string
  testo: string
  scadenza: string | null
  riferimento: string
  utenteNome: string
  fatta: boolean
}

/**
 * I canali in cui c'è una PERSONA che aspetta.
 *
 * ⚠️ Misurato il 29/07: 106 conversazioni non lette, di cui 105 email — e le
 * email non lette sono quasi tutte newsletter e notifiche di piattaforme. Un
 * unico numero «106 da rispondere» avrebbe reso la schermata iniziale un allarme
 * che suona sempre, cioè un allarme che non si guarda più. Chi scrive in chat
 * invece sta davvero aspettando, e su WhatsApp ha anche un timer addosso.
 */
const CANALI_CHAT = ['whatsapp', 'messenger', 'instagram', 'widget']

export type DatiDashboard = {
  numeri: {
    daRispondere: number
    daRispondereChat: number
    daRispondereEmail: number
    conversazioniAperte: number
    consegneOggi: number
    ordiniDaGestire: number
    ordiniInRitardo: number
    reclamiAperti: number
    rimborsiDaDecidere: number
    pagamentiDaInviare: number
  }
  attese: AttesaDto[]
  ordini: OrdineUrgenteDto[]
  reclami: ReclamoApertoDto[]
  attivita: AttivitaDto[]
}

function minutiDa(d: Date): number {
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
}

export async function datiDashboard(): Promise<DatiDashboard> {
  const oggi = inizioOggi()
  const domani = inizioDomani()
  const calde = limiteCalde()

  const [
    daRisponderePiu,
    conversazioniAperte,
    daRispondere,
    consegneOggi,
    ordiniDaGestire,
    ordiniInRitardo,
    reclamiAperti,
    rimborsiDaDecidere,
    pagamentiDaInviare,
    marchi,
    ordiniUrgenti,
    reclamiVivi,
    attivita,
  ] = await Promise.all([
    // Chi aspetta: conversazioni con messaggi non letti, la più vecchia prima —
    // ordinare per «ultimo messaggio recente» metterebbe in cima chi ha appena
    // scritto e in fondo chi aspetta da ieri.
    //
    // Si prendono più righe del necessario perché poi le chat vanno davanti
    // alle email: prendendone 12 secche, con 105 mail non lette, in cima non
    // arriverebbe mai una chat.
    db.conversazione.findMany({
      where: { archiviata: false, nonLetti: { gt: 0 } },
      orderBy: { ultimoMessaggioIl: 'asc' },
      take: 200,
    }),
    db.conversazione.count({ where: { archiviata: false } }),
    db.conversazione.count({ where: { archiviata: false, nonLetti: { gt: 0 } } }),
    db.ordine.count({ where: { dataConsegna: { gte: oggi, lt: domani } } }),
    db.ordine.count({ where: { gestione: { not: 'gestito' } } }),
    // In ritardo = consegna passata e non ancora spuntato come gestito, ma solo
    // le «calde»: oltre, sono consegne avvenute a cui manca la spunta e
    // contarle come ritardo farebbe un numero enorme e inutile.
    db.ordine.count({
      where: { gestione: { not: 'gestito' }, dataConsegna: { gte: calde, lt: oggi } },
    }),
    db.reclamo.count({ where: { stato: { in: ['aperto', 'in_lavorazione'] } } }),
    db.rimborso.count({ where: { stato: 'richiesto' } }),
    db.richiestaPagamento.count({ where: { inviataIl: null } }),
    risolutoreMarchio(),
    // Gli ordini da lavorare di TUTTI i marchi. Si prendono i non gestiti con
    // una finestra larga e si mettono in fascia qui sotto: le fasce non si
    // possono ordinare in SQL senza cinque query.
    db.ordine.findMany({
      where: { gestione: { not: 'gestito' } },
      orderBy: [{ dataConsegna: 'asc' }],
      take: 400,
      select: {
        id: true,
        numero: true,
        negozioNome: true,
        clienteNome: true,
        citta: true,
        gestione: true,
        dataConsegna: true,
        fasciaConsegna: true,
      },
    }),
    // I reclami vivi. Ordinati per GRAVITÀ e poi per età: un reclamo grave di
    // ieri viene prima di uno lieve di una settimana, ma un lieve che invecchia
    // non deve sparire sotto — è così che un reclamo «lieve» diventa una
    // recensione da una stella.
    db.reclamo.findMany({
      where: { stato: { in: ['aperto', 'in_lavorazione'] } },
      orderBy: [{ gravita: 'desc' }, { creatoIl: 'asc' }],
      take: 10,
      select: {
        id: true,
        ordineNumero: true,
        negozioNome: true,
        clienteNome: true,
        casistica: true,
        gravita: true,
        stato: true,
        azioni: true,
        colpaTipo: true,
        colpaNome: true,
        creatoIl: true,
      },
    }),
    db.attivita.findMany({
      where: { fatta: false },
      orderBy: [{ scadenza: 'asc' }, { creatoIl: 'desc' }],
      take: 12,
    }),
  ])

  const tutteLeAttese: AttesaDto[] = daRisponderePiu.map((c) => {
    const minuti = minutiDa(c.ultimoMessaggioIl)
    const ore = FINESTRA_WA_ORE - minuti / 60
    const whatsapp = c.canale === 'whatsapp'
    return {
      id: c.id,
      canale: c.canale,
      chi: c.nomeRubrica || c.nome || c.idEsterno,
      brand: marchi.marchioDi(c),
      ultimoTesto: c.ultimoTesto.slice(0, 140),
      nonLetti: c.nonLetti,
      attesaMinuti: minuti,
      oreFinestra: whatsapp ? Math.max(0, Math.round(ore * 10) / 10) : null,
      finestraCritica: whatsapp && ore <= AVVISO_FINESTRA_ORE,
    }
  })

  // Prima le chat (c'è una persona che aspetta, e su WhatsApp un timer), poi le
  // email; dentro ogni gruppo, prima chi aspetta da più tempo. Le finestre che
  // stanno per chiudersi passano davanti a tutto: sono l'unica cosa che, se non
  // si fa adesso, non si può più fare in testo libero.
  const attese = tutteLeAttese
    .sort((a, b) => {
      if (a.finestraCritica !== b.finestraCritica) return a.finestraCritica ? -1 : 1
      const chatA = CANALI_CHAT.includes(a.canale)
      const chatB = CANALI_CHAT.includes(b.canale)
      if (chatA !== chatB) return chatA ? -1 : 1
      return b.attesaMinuti - a.attesaMinuti
    })
    .slice(0, 12)

  const daRispondereChat = tutteLeAttese.filter((a) => CANALI_CHAT.includes(a.canale)).length

  // Le fasce: stesso ordine e stessa logica della bacheca ordini, così le due
  // schermate non raccontano priorità diverse.
  function fasciaDi(d: Date | null): { chiave: string; peso: number } {
    if (!d) return { chiave: 'senza-data', peso: 4 }
    if (d >= oggi && d < domani) return { chiave: 'oggi', peso: 1 }
    if (d >= domani) return { chiave: 'prossime', peso: 2 }
    if (d >= calde) return { chiave: 'scadute-recenti', peso: 3 }
    return { chiave: 'scadute-vecchie', peso: 5 }
  }

  const ordini: OrdineUrgenteDto[] = ordiniUrgenti
    .map((o) => ({ o, f: fasciaDi(o.dataConsegna) }))
    .sort((a, b) => {
      if (a.f.peso !== b.f.peso) return a.f.peso - b.f.peso
      const da = a.o.dataConsegna?.getTime() ?? 0
      const dbb = b.o.dataConsegna?.getTime() ?? 0
      // Dentro «oggi» e «prossime» prima le consegne più vicine; fra le scadute
      // recenti prima le più recenti (è lì che può esserci ancora da fare).
      return a.f.chiave === 'scadute-recenti' ? dbb - da : da - dbb
    })
    .slice(0, 12)
    .map(({ o, f }) => ({
      id: o.id,
      numero: o.numero,
      brand: o.negozioNome,
      cliente: o.clienteNome,
      citta: o.citta,
      fascia: f.chiave,
      gestione: o.gestione,
      dataConsegna: o.dataConsegna?.toISOString() ?? null,
      fasciaOraria: o.fasciaConsegna,
    }))

  return {
    numeri: {
      daRispondere,
      daRispondereChat,
      // Quello che resta sono le mail non lette: quasi tutte newsletter, e
      // vanno contate a parte per non far suonare l'allarme sbagliato.
      daRispondereEmail: Math.max(0, daRispondere - daRispondereChat),
      conversazioniAperte,
      consegneOggi,
      ordiniDaGestire,
      ordiniInRitardo,
      reclamiAperti,
      rimborsiDaDecidere,
      pagamentiDaInviare,
    },
    attese,
    ordini,
    reclami: reclamiVivi.map((r) => ({
      id: r.id,
      ordineNumero: r.ordineNumero,
      brand: r.negozioNome,
      cliente: r.clienteNome,
      casistica: r.casistica,
      gravita: r.gravita,
      stato: r.stato,
      // Solo la prima riga delle azioni: serve a sapere COSA manca, non a
      // rileggere tutto il reclamo in una lista.
      azioni: r.azioni.split('\n')[0]?.trim().slice(0, 90) ?? '',
      colpa: r.colpaNome || (r.colpaTipo && r.colpaTipo !== 'nessuno' ? r.colpaTipo : ''),
      giorniAperto: Math.max(0, Math.round((Date.now() - r.creatoIl.getTime()) / 86400000)),
    })),
    attivita: attivita.map((a) => ({
      id: a.id,
      testo: a.testo,
      scadenza: a.scadenza?.toISOString() ?? null,
      riferimento: a.riferimento,
      utenteNome: a.utenteNome,
      fatta: a.fatta,
    })),
  }
}
