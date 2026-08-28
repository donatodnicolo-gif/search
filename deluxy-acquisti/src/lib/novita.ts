import { prisma } from "./db";

// ── COSA È SUCCESSO DA QUANDO GUARDAVO L'ULTIMA VOLTA ──
//
// Sistema di notifiche in-app canonico Deluxy (Libro UX&UI §7); implementazione
// di riferimento: Customer Service (deluxy-messaging, src/lib/novita.ts).
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO. Le novità si ricavano
// dai fatti già scritti (la richiesta di acquisto, con la sua `creataIl`): una
// tabella-copia degli eventi andrebbe scritta in ogni punto dove succede
// qualcosa — cioè prima o poi qualcuno la dimentica. (Standard Deluxy §7.)
//
// ⚠️ Sta in una libreria e non dentro le rotte perché è la parte che si può
// PROVARE senza prima autenticarsi.

/** Quante novità per giro, al massimo. Oltre, il client dice «più di N». */
const TETTO = 10;
/** «Urgente» = una data di necessità entro TRE giorni: oltre non è un allarme. */
const GIORNI_URGENTE = 3;

export type Novita = {
  /** Stabile: `richiesta:id`. Serve al client per non mostrare due volte la stessa cosa. */
  id: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
  gravita: "info" | "attenzione";
  /** Email di chi ha originato la cosa: il client non ripete a uno ciò che ha fatto lui. */
  autore: string | null;
};

// ⚠️⚠️ L'OROLOGIO È QUELLO DEL DATABASE, non quello del browser né di questa
// funzione: le date delle righe le scrive lui (`@default(now())`). Il client
// riceve `adesso` e lo rimanda alla chiamata dopo: il confronto è sempre fra
// due letture dello stesso orologio.
async function oraDelDatabase(): Promise<Date> {
  try {
    const r = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
    if (r?.[0]?.now) return new Date(r[0].now);
  } catch {
    // se il database non dice l'ora, quella di qui è meglio di niente
  }
  return new Date();
}

/**
 * Le richieste di acquisto ARRIVATE fra `da` e adesso (per i riquadri in basso
 * a destra): qui una richiesta la scrive quasi sempre qualcun altro — un
 * collega o un'altra app via /api/v1 — e chi deve approvarla non lo sa finché
 * non apre la pagina.
 */
export async function novitaDa(
  da: Date | null,
): Promise<{ adesso: string; novita: Novita[]; troncato: boolean }> {
  const adesso = await oraDelDatabase();

  // ⚠️⚠️ LA PRIMA CHIAMATA NON MOSTRA NIENTE: senza `da` si torna solo il
  // segnaposto, o ogni ricarica della pagina risputerebbe le ultime ore.
  if (!da || Number.isNaN(da.getTime())) {
    return { adesso: adesso.toISOString(), novita: [], troncato: false };
  }

  // ⚠️ Finestra CHIUSA in cima (`lte: adesso`), con `adesso` letto PRIMA della
  // query: una riga scritta mentre questa gira esce al giro dopo, né persa né
  // ripetuta.
  const arrivate = await prisma.richiestaAcquisto.findMany({
    where: { creataIl: { gt: da, lte: adesso }, stato: { not: "annullata" } },
    select: {
      id: true,
      numero: true,
      titolo: true,
      richiedenteNome: true,
      richiedenteEmail: true,
      importoStimato: true,
      valuta: true,
      priorita: true,
      creataIl: true,
    },
    orderBy: { creataIl: "desc" },
    // ⚠️ Un tetto anche al passato: una scheda rimasta in pausa un giorno non
    // deve far leggere migliaia di righe per mostrarne dieci.
    take: TETTO + 1,
  });

  const troncato = arrivate.length > TETTO;
  const breve = (t: string, n = 90) => {
    const pulito = (t || "").replace(/\s+/g, " ").trim();
    return pulito.length > n ? pulito.slice(0, n - 1) + "…" : pulito;
  };
  const euro = (n: number, valuta = "EUR") =>
    n.toLocaleString("it-IT", { style: "currency", currency: valuta || "EUR" });

  const novita: Novita[] = arrivate.slice(0, TETTO).map((r) => ({
    id: `richiesta:${r.id}`,
    titolo: `Richiesta #${r.numero} da ${r.richiedenteNome || r.richiedenteEmail}`,
    dettaglio:
      breve(r.titolo) + (r.importoStimato ? ` — ${euro(r.importoStimato, r.valuta)}` : ""),
    quando: r.creataIl.toISOString(),
    link: "/",
    // ⚠️ In attenzione solo l'urgente: se sono arancioni tutte, non lo è nessuna.
    gravita: r.priorita === "urgente" ? "attenzione" : "info",
    autore: r.richiedenteEmail ?? null,
  }));

  return { adesso: adesso.toISOString(), novita, troncato };
}

export type SezioneMenu = {
  /** La data della cosa più recente che c'è. Stringa vuota = non c'è niente. */
  ultimo: string;
  /** Quanto lavoro aspetta in quella sezione. 0 = niente. */
  quanti: number;
  /** Qualcosa lì dentro ha una scadenza vicina. */
  urgente: boolean;
};

/**
 * Per la voce «Richieste» del menu: la data della richiesta più recente (per il
 * pallino) e quante aspettano una decisione (per il numero).
 *
 * ⚠️⚠️ I DUE SEGNALI DICONO COSE DIVERSE: il pallino è «è arrivato qualcosa da
 * quando hai guardato», il numero è «quanto lavoro c'è». Il conteggio è lo
 * STESSO del riepilogo della pagina (`richiesteDaApprovare`: stato `inviata`):
 * due modi di contare la stessa cosa direbbero due numeri diversi.
 */
export async function sezioniDelMenu(): Promise<Record<string, SezioneMenu>> {
  const fraTreGiorni = new Date(Date.now() + GIORNI_URGENTE * 24 * 3600 * 1000);

  const [ultima, daApprovare, inScadenza] = await Promise.all([
    // ⚠️ Le annullate restano fuori: annullando la più recente, la data deve
    // poter tornare indietro senza che il pallino segnali roba sparita.
    prisma.richiestaAcquisto.findFirst({
      where: { stato: { not: "annullata" } },
      orderBy: { creataIl: "desc" },
      select: { creataIl: true },
    }),
    prisma.richiestaAcquisto.count({ where: { stato: "inviata" } }),
    // ⚠️ Rosso solo dove il tempo scade da solo: una richiesta «mi serve entro
    // tre giorni» ancora da approvare è denaro o lavoro che si perde da sé.
    prisma.richiestaAcquisto.count({
      where: { stato: "inviata", dataNecessita: { not: null, lte: fraTreGiorni } },
    }),
  ]);

  return {
    "/": {
      ultimo: ultima ? ultima.creataIl.toISOString() : "",
      quanti: daApprovare,
      urgente: inScadenza > 0,
    },
  };
}
