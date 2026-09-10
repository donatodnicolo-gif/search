import { prisma } from "./db";
import { dataUltimoOrdine, ricorrenze, TTL_PALLINI_MS } from "./orders";

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
 * Il giro fa 7 letture: 2 verso Orders (ricorrenze a 7 giorni con `limit` 1,
 * data dell'ultimo ordine) e 5 sul database (eventi e programmazioni).
 *
 * ⚠️ Le due letture verso Orders hanno TTL 300 s (TTL_PALLINI_MS): il giro
 * della sidebar è ogni 90 s e con la cache a 60 s ogni giro la mancava,
 * rifacendo a Orders la CTE dei clienti (~1 s) per un badge (revisione
 * performance 10/09). Orders sincronizza ogni 5 minuti: più fresco di così
 * il pallino non può essere.
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const fra7 = new Date(Date.now() + 7 * 86_400_000);
  const [imminenti, ultimoOrdine, ultimoEvento, eventiInArrivo, ultimaProgrammazione, programmateVicine, inRitardo] = await Promise.all([
    // Le ricorrenze dei prossimi 7 giorni: basta il totale, quindi limit: 1.
    ricorrenze({ prossimi: GIORNI_RICORRENZE, page: 1, limit: 1, ttlMs: TTL_PALLINI_MS }),
    // ⚠️ Il pallino dei clienti guarda la data dell'ULTIMO ORDINE valido del
    // registro: un ordine nuovo (cliente nuovo o cliente che torna) la sposta
    // avanti. Non c'è una `creatoIl` del cliente da guardare — il cliente vive
    // in Orders e nasce dal suo primo ordine. Si legge dalla rotta degli
    // ordini, non dalla CTE dei clienti (stesso valore, un quarto del costo).
    dataUltimoOrdine(),
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
    // Calendario: una programmazione «arriva» quando qualcuno la scrive (il
    // pallino), e «pesa» finché è da fare entro 7 giorni (il numero); in
    // rosso se una è già scaduta senza essere chiusa.
    prisma.programmazione
      .findFirst({ where: { stato: "da_fare" }, orderBy: { creatoIl: "desc" }, select: { creatoIl: true } })
      .catch(() => null),
    prisma.programmazione.count({ where: { stato: "da_fare", quando: { lte: fra7 } } }).catch(() => 0),
    prisma.programmazione.count({ where: { stato: "da_fare", quando: { lt: new Date() } } }).catch(() => 0),
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
      ultimo: ultimoOrdine.ok ? (ultimoOrdine.dati ?? "") : "",
      // Nessun numero: «quanti clienti» non è lavoro che aspetta, è l'archivio.
      quanti: 0,
      urgente: false,
    },
    "/eventi": {
      ultimo: ultimoEvento ? ultimoEvento.creatoIl.toISOString() : "",
      quanti: eventiInArrivo,
      urgente: false,
    },
    "/calendario": {
      ultimo: ultimaProgrammazione ? ultimaProgrammazione.creatoIl.toISOString() : "",
      quanti: programmateVicine,
      urgente: inRitardo > 0,
    },
  };
}
