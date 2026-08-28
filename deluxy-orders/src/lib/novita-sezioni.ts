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
 * - `/` (il registro) — gli ordini li scrive la sync Shopify: sono L'arrivo
 *   esterno di quest'app. Si guarda `createdAt` (quando l'ordine è entrato nel
 *   registro), come la marca di sessione; `annullatoIl: null` perché un
 *   ordine annullato non è una novità da lavorare. ⚠️ `quanti` resta 0: il
 *   numero accanto alla voce è già il totale del registro (sb-count del
 *   layout), e il «da classificare» appartiene a /bacheca.
 * - `/controllo` — le anomalie di incasso: stessa condizione del conteggio
 *   `daRiconciliare` del layout, riga per riga.
 * - `/eventi` — gli eventi clienti trovati dall'app (`da-confermare`): il
 *   rilevamento li scrive da solo, e finché nessuno li guarda restano lì.
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const [ordini, controllo, eventi] = await Promise.all([
    prisma.ordine.aggregate({
      where: { annullatoIl: null },
      _max: { createdAt: true },
    }),
    prisma.ordine.aggregate({
      where: {
        statoIncasso: "da_riconciliare",
        gestioneIncasso: { in: ["riconciliazione", "pagamento_esterno"] },
        annullatoIl: null,
      },
      _max: { createdAt: true },
      _count: true,
    }),
    prisma.eventoCliente.aggregate({
      where: { stato: "da-confermare" },
      _max: { creatoIl: true },
      _count: true,
    }),
  ]);

  return {
    "/": { ultimo: quando(ordini._max.createdAt), quanti: 0, urgente: false },
    "/controllo": {
      ultimo: quando(controllo._max.createdAt),
      quanti: controllo._count,
      urgente: false,
    },
    "/eventi": { ultimo: quando(eventi._max.creatoIl), quanti: eventi._count, urgente: false },
  };
}
