import { prisma } from "@/lib/db";

// ── COSA È ARRIVATO NELLE SEZIONI DEL MENU ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): per ogni voce di menu
// che riceve cose dall'esterno, la data della cosa più recente (per il
// pallino giallo) e quanto lavoro aspetta (per il numero).
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI. Il server dichiara **la data della cosa più
// recente che c'è**; il browser si ricorda l'ultima già vista (localStorage) e
// accende il pallino se le due differiscono (src/lib/pallini.ts).
//
// ⚠️ Query AGGREGATE, non findMany: la chiamata gira ogni 90 secondi su ogni
// pagina aperta — MAX(data) e COUNT insieme dove il filtro è lo stesso.

export type SezioneMenu = {
  /** La data della cosa più recente che c'è. Stringa vuota = non c'è niente. */
  ultimo: string;
  /** Quanto lavoro aspetta in quella sezione. 0 = niente. */
  quanti: number;
  /** Qualcosa lì dentro ha una scadenza vicina. */
  urgente: boolean;
};

const quando = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/**
 * Le sezioni scelte, e perché queste:
 * - `/scadenzario` — le fatture aperte con una scadenza. È l'unica sezione col
 *   colore: una fattura che scade entro SETTE GIORNI (o è già scaduta) è
 *   denaro che si perde da solo se nessuno sollecita → `urgente`.
 * - `/fatture` — la fatturazione servizi: il pallino dice «è stata emessa una
 *   fattura nuova», il numero quante ne restano da incassare.
 * - `/transazioni` — l'import banca: le transazioni `nuova` aspettano di
 *   essere registrate o ignorate, e arrivano da sole (sync Qonto).
 *
 * ⚠️ I conteggi seguono le stesse condizioni delle pagine che li mostrano:
 * lo scadenzario filtra `pagata: false, imponibile > 0` (scadenzario/page.tsx)
 * — qui uguale, senza il filtro per anno perché una fattura aperta dell'anno
 * scorso è ancora lavoro, non storia.
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  // Una fattura con la scadenza vicina non è «una in più»: è denaro che si
  // perde da solo se nessuno la sollecita. Le già scadute rientrano (lte).
  const fraSetteGiorni = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const [ultimaFattura, fattureAperte, scadenzario, urgenti, transazioni] = await Promise.all([
    // «Nuova fattura» = una riga nuova nel registro, pagata o no: il pallino
    // parla dell'ARRIVO, il conteggio del lavoro.
    prisma.fatturaServizio.aggregate({ _max: { createdAt: true } }),
    prisma.fatturaServizio.count({ where: { pagata: false, imponibile: { gt: 0 } } }),
    prisma.fatturaServizio.aggregate({
      where: { pagata: false, imponibile: { gt: 0 }, scadenza: { not: null } },
      _max: { createdAt: true },
      _count: true,
    }),
    prisma.fatturaServizio.count({
      where: { pagata: false, imponibile: { gt: 0 }, scadenza: { not: null, lte: fraSetteGiorni } },
    }),
    prisma.transazioneBancaria.aggregate({
      where: { stato: "nuova" },
      _max: { createdAt: true },
      _count: true,
    }),
  ]);

  return {
    "/scadenzario": {
      ultimo: quando(scadenzario._max.createdAt),
      quanti: scadenzario._count,
      urgente: urgenti > 0,
    },
    "/fatture": {
      ultimo: quando(ultimaFattura._max.createdAt),
      quanti: fattureAperte,
      urgente: false,
    },
    "/transazioni": {
      ultimo: quando(transazioni._max.createdAt),
      quanti: transazioni._count,
      urgente: false,
    },
  };
}
