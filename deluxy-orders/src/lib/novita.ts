import { prisma } from "@/lib/db";

// ── LE NOVITÀ PER I RIQUADRI IN BASSO A DESTRA E PER IL MENU ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): il toast dice «è appena
// successo» e sparisce; il pallino sulla voce di menu resta finché non vai a
// guardare; il numero dice quanto lavoro c'è. Tre segnali, tre significati.
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO. Le novità si ricavano
// dai fatti già scritti (un ordine arrivato dalla sync Shopify): una
// tabella-copia degli eventi sarebbe un secondo racconto della stessa cosa
// (Standard Deluxy §7: ogni dato ha una casa sola).
//
// ⚠️ Qui l'unico arrivo esterno vero sono GLI ORDINI: li scrive la sync
// Shopify, non chi usa l'app. Eventi clienti e anomalie di controllo li
// segnala il pallino del menu, non il toast — non sono «appena successo», sono
// lavoro che si accumula.

/** Quante per tipo, al massimo. Oltre, il client dice «più di N». */
const TETTO = 10;

export type Novita = {
  /** Stabile: `tipo:idRiga`. Serve al client per non mostrare due volte la stessa cosa. */
  id: string;
  tipo: string;
  /** Come si chiama questo tipo al plurale, per il riassunto: «5 ordini». */
  gruppo: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
};

const euro = (n: number, valuta = "EUR") =>
  n.toLocaleString("it-IT", { style: "currency", currency: valuta || "EUR" });

/**
 * Cosa è successo fra `da` e adesso.
 *
 * @param da  Il segnaposto dell'ultima volta. `null` = prima chiamata: si
 *            torna solo l'ora, senza novità.
 */
export async function novitaDa(
  da: Date | null
): Promise<{ adesso: string; novita: Novita[]; troncato: boolean }> {
  // ── L'OROLOGIO È QUELLO DEL DATABASE ──
  // ⚠️⚠️ Non quello del browser e nemmeno quello di questa funzione: le date
  // delle righe le scrive il database (`@default(now())`), e il segnaposto va
  // confrontato con loro. Il client riceve `adesso` e lo rimanda alla chiamata
  // dopo: il confronto è sempre fra due letture dello stesso orologio.
  let adesso = new Date();
  try {
    const r = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
    if (r?.[0]?.now) adesso = new Date(r[0].now);
  } catch {
    // se il database non dice l'ora, quella di qui è meglio di niente
  }

  // ── LA PRIMA CHIAMATA NON MOSTRA NIENTE ──
  // ⚠️⚠️ Un avviso serve a dire «è APPENA successo»: sparare le novità delle
  // ultime ore a ogni apertura insegna in due giorni che quei riquadri non
  // vogliono dire niente. Il passato si guarda nel registro, che esiste apposta.
  if (!da || Number.isNaN(da.getTime())) {
    return { adesso: adesso.toISOString(), novita: [], troncato: false };
  }

  // ⚠️ Finestra CHIUSA in cima (`lte: adesso`), con `adesso` letto PRIMA della
  // query: una riga scritta mentre questa gira non si perde e non si ripete —
  // esce al giro dopo, perché il prossimo `da` è proprio questo `adesso`.
  //
  // ⚠️ Si guarda `createdAt` (quando l'ordine è ENTRATO NEL REGISTRO), non la
  // data Shopify: un ordine di ieri sera importato adesso è nuovo per chi
  // lavora. Stessa domanda della marca di sessione (src/lib/sessione.ts).
  const ordini = await prisma.ordine.findMany({
    where: { createdAt: { gt: da, lte: adesso }, annullatoIl: null },
    select: {
      id: true,
      numero: true,
      brand: true,
      clienteNome: true,
      totale: true,
      valuta: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    // ⚠️ Un tetto anche al passato: se una scheda resta in pausa per un giorno,
    // `da` è vecchissimo e senza questo si leggerebbero centinaia di righe per
    // mostrarne tre.
    take: TETTO + 1,
  });

  const troncato = ordini.length > TETTO;
  const novita: Novita[] = ordini.slice(0, TETTO).map((o) => ({
    id: `ordine:${o.id}`,
    tipo: "ordine",
    gruppo: "ordini",
    titolo: `Nuovo ordine ${o.numero}`,
    dettaglio:
      [o.clienteNome, o.brand].filter(Boolean).join(" · ") +
      (o.totale ? ` — ${euro(o.totale, o.valuta)}` : ""),
    quando: o.createdAt.toISOString(),
    link: `/ordini/${o.id}`,
  }));

  return { adesso: adesso.toISOString(), novita, troncato };
}
