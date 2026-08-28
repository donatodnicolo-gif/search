import { prisma } from "./db";
import { elencoClienti, ricorrenze } from "./orders";

// ── COSA C'È DI NUOVO NELLE SEZIONI DEL MENU ──
//
// Sistema di notifiche in-app canonico Deluxy (Libro UX&UI §7); implementazione
// di riferimento: Customer Service (deluxy-messaging, src/lib/novita.ts).
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO: le novità si ricavano
// dai fatti già scritti — e qui i fatti stanno in DUE case: gli eventi Deluxy
// nel nostro schema `crm`, i clienti e le ricorrenze in Deluxy Orders (standard
// §7: casa unica, si legge dal proprietario via /api/v1, mai tabelle-copia).
// Le letture verso Orders passano dal client di src/lib/orders.ts, che ha già
// cache a TTL breve (60 s) e timeout: col giro dei pallini ogni 90 s non si
// martella nessuno.
//
// ⚠️ MAI ERRORI NEI PALLINI: se Orders non risponde, quella sezione torna vuota
// (niente pallino, niente numero) e basta. Il menu non è il posto dove dire che
// una API è giù — per quello c'è la pagina Impostazioni.

export type SezioneMenu = {
  /** La data della cosa più recente che c'è. Stringa vuota = non c'è niente. */
  ultimo: string;
  /** Quanto lavoro aspetta in quella sezione. 0 = niente. */
  quanti: number;
  /** Qualcosa lì dentro ha una scadenza vicina. */
  urgente: boolean;
};

/** Una ricorrenza «imminente» = entro SETTE giorni: il tempo di preparare un pensiero. */
const GIORNI_RICORRENZE = 7;

/**
 * Per ogni voce del menu con qualcosa che può arrivare: la data della cosa più
 * recente (per il pallino) e quanto aspetta (per il numero).
 *
 * ⚠️⚠️ I DUE SEGNALI DICONO COSE DIVERSE: il pallino è «è arrivato qualcosa da
 * quando hai guardato», il numero è «quanto lavoro c'è». Con un segnale solo,
 * uno dei due casi sparisce.
 *
 * Il giro fa 4 letture: 2 verso Orders (ricorrenze, clienti — entrambe con
 * `limit` minimo e cache 60 s) e 2 sul database (data e conteggio eventi).
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const [imminenti, clienti, ultimoEvento, eventiInArrivo] = await Promise.all([
    // Le ricorrenze dei prossimi 7 giorni: basta il totale, quindi limit: 1.
    ricorrenze({ prossimi: GIORNI_RICORRENZE, page: 1, limit: 1 }),
    // ⚠️ Il pallino dei clienti guarda l'`ultimoOrdine` più recente di tutta la
    // clientela: un ordine nuovo (cliente nuovo o cliente che torna) lo sposta
    // avanti. Non c'è una `creatoIl` del cliente da guardare — il cliente vive
    // in Orders e nasce dal suo primo ordine.
    elencoClienti({ ordina: "ultimo", verso: "desc", page: 1, limit: 1 }),
    // ⚠️ Gli eventi annullati restano fuori: annullando l'ultimo creato, la
    // data deve poter tornare indietro senza che il pallino segnali roba
    // sparita.
    prisma.evento
      .findFirst({
        where: { stato: { not: "annullato" } },
        orderBy: { creatoIl: "desc" },
        select: { creatoIl: true },
      })
      .catch(() => null),
    // «In arrivo» come nella pagina Eventi: da ieri in poi e non annullati.
    prisma.evento
      .count({
        where: { stato: { not: "annullato" }, dataInizio: { gte: new Date(Date.now() - 86_400_000) } },
      })
      .catch(() => 0),
  ]);

  const quanteRicorrenze = imminenti.ok ? imminenti.dati.totale : 0;

  return {
    "/ricorrenze": {
      // ⚠️ Niente `ultimo`: una ricorrenza non «arriva» — si avvicina. Non c'è
      // una data di creazione da confrontare, e un pallino appeso all'orologio
      // sarebbe proprio il confronto fra orologi che questo sistema vieta.
      // Parlano il numero e il rosso.
      ultimo: "",
      quanti: quanteRicorrenze,
      // ⚠️ Qui il rosso è giusto: un compleanno passato è passato per sempre.
      urgente: quanteRicorrenze > 0,
    },
    "/clienti": {
      ultimo: clienti.ok ? (clienti.dati.clienti[0]?.ultimoOrdine ?? "") : "",
      // Nessun numero: «quanti clienti» non è lavoro che aspetta, è l'archivio.
      quanti: 0,
      urgente: false,
    },
    "/eventi": {
      ultimo: ultimoEvento ? ultimoEvento.creatoIl.toISOString() : "",
      quanti: eventiInArrivo,
      urgente: false,
    },
  };
}
