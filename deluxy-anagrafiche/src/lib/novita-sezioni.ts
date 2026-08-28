import { prisma } from "@/lib/db";

// ── COSA È ARRIVATO NELLE SEZIONI DEL MENU ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): per ogni voce di menu
// che riceve cose dall'esterno, la data della cosa più recente (per il
// pallino giallo) e quanto lavoro aspetta (per il numero).
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI. Il server dichiara **la data della cosa più
// recente che c'è**; il browser si ricorda l'ultima già vista (localStorage) e
// accende il pallino se le due differiscono. Nessuno chiede mai «che ore sono»
// a nessuno (src/lib/pallini.ts).
//
// ⚠️ Query AGGREGATE, non findMany: la chiamata gira ogni 90 secondi su ogni
// pagina aperta — MAX(data) e COUNT insieme dove il filtro è lo stesso.
//
// ⚠️ I CONTEGGI SONO GLI STESSI DELLA SIDEBAR (Sidebar.tsx, query unica):
// stessa condizione riga per riga, o due numeri diversi sullo stesso schermo
// farebbero smettere di credere a tutti e due.

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
 * - `/match` — le richieste di aggancio arrivano dalle ALTRE app (Scout,
 *   FINANCE, piattaforma): sono l'arrivo esterno per eccellenza del registro.
 * - `/riconciliazioni` — i disaccordi li aprono gli import: finché nessuno
 *   decide restano lì, e uno nuovo va notato.
 * - `/riconciliazione` — i referenti DA CLASSIFICARE. ⚠️ Il `Contatto` non ha
 *   una data di creazione: come «ultimo arrivo» si usa la data del Partner
 *   DA CLASSIFICARE più recente, che è il momento in cui quel lavoro nasce.
 * - `/consumers` — l'ultimo sync da Orders (`sincronizzatoIl`): il pallino
 *   dice «la fotografia è stata rinfrescata», il conteggio resta quello di
 *   popolazione già scritto dalla sidebar (non è lavoro che aspetta).
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const [match, disaccordi, partnerDaClassificare, contattiDaClassificare, sync] =
    await Promise.all([
      // Stessa condizione del conteggio `damatch` della sidebar.
      prisma.richiestaMatch.aggregate({
        where: { risolto: false, esito: { not: "agganciata" } },
        _max: { creatoIl: true },
        _count: true,
      }),
      prisma.riconciliazione.aggregate({
        where: { stato: "aperta" },
        _max: { creatoIl: true },
        _count: true,
      }),
      prisma.partner.aggregate({
        where: { attivo: true, categoria: "DA CLASSIFICARE" },
        _max: { creatoIl: true },
      }),
      // Stessa condizione del conteggio `dariconciliare` della sidebar.
      prisma.contatto.count({
        where: { archiviato: false, partner: { attivo: true, categoria: "DA CLASSIFICARE" } },
      }),
      prisma.consumer.aggregate({ _max: { sincronizzatoIl: true } }),
    ]);

  return {
    "/match": { ultimo: quando(match._max.creatoIl), quanti: match._count, urgente: false },
    "/riconciliazioni": {
      ultimo: quando(disaccordi._max.creatoIl),
      quanti: disaccordi._count,
      urgente: false,
    },
    "/riconciliazione": {
      ultimo: quando(partnerDaClassificare._max.creatoIl),
      quanti: contattiDaClassificare,
      urgente: false,
    },
    "/consumers": { ultimo: quando(sync._max.sincronizzatoIl), quanti: 0, urgente: false },
  };
}
