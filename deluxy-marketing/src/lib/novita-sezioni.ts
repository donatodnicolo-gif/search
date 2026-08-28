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
// (I numeretti della sidebar restano quelli di conteggi-sidebar.ts, con la
// loro cache: qui si aggiungono solo le DATE e il conteggio delle operazioni,
// che deve combaciare col suo — stessa condizione, riga per riga.)

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
 * - `/analisi` — le analisi le deposita il custode dal Drive (o una sessione
 *   Claude): arrivano dall'esterno mentre nessuno guarda. ⚠️ `quanti` resta 0:
 *   un'analisi non è lavoro «da fare» che si conta, e il numero accanto alla
 *   voce è già il totale (sb-count di conteggi-sidebar).
 * - `/operazioni` — la coda verso Google/Meta: `in_attesa` aspetta
 *   un'approvazione, `approvata` aspetta l'esecutore. Stessa condizione del
 *   conteggio `nOperazioni` di conteggi-sidebar.ts.
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const [analisi, operazioni] = await Promise.all([
    prisma.analisi.aggregate({ _max: { creataIl: true } }),
    prisma.operazioneAdv.aggregate({
      where: { stato: { in: ["in_attesa", "approvata"] } },
      _max: { creataIl: true },
      _count: true,
    }),
  ]);

  return {
    "/analisi": { ultimo: quando(analisi._max.creataIl), quanti: 0, urgente: false },
    "/operazioni": {
      ultimo: quando(operazioni._max.creataIl),
      quanti: operazioni._count,
      urgente: false,
    },
  };
}
