import { prisma } from "@/lib/db";

// ── LE NOVITÀ PER I RIQUADRI IN BASSO A DESTRA ──
// Libro UX&UI v1.4 §7 (sistema del Customer Service): il toast dice «è appena
// successo» e sparisce in nove secondi; il pallino sulla voce di menu resta
// finché non vai a guardare. Due segnali diversi, mai confusi.
//
// ⚠️ Qui l'unico arrivo esterno vero sono LE ANALISI depositate dal Drive
// (custode o sessione Claude): arrivano mentre nessuno guarda, e finché non si
// apriva /analisi non lo sapeva nessuno. Le operazioni in coda le crea chi usa
// l'app (o un'AI su sua richiesta): non sono «appena successo» per chi lavora,
// e le segnala il pallino del menu.
//
// ⚠️⚠️ NON ESISTE UNA TABELLA DEGLI EVENTI, ED È VOLUTO: le novità si ricavano
// dai fatti già scritti (la riga in Analisi). Una tabella-copia sarebbe un
// secondo racconto della stessa cosa (Standard Deluxy §7).

/** Quante al massimo. Oltre, il client dice «più di N». */
const TETTO = 10;

export type Novita = {
  /** Stabile: `tipo:idRiga`. Serve al client per non mostrare due volte la stessa cosa. */
  id: string;
  tipo: string;
  gruppo: string;
  titolo: string;
  dettaglio: string;
  quando: string;
  link: string;
};

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
  // ⚠️⚠️ Le date delle righe le scrive il database (`@default(now())`), e il
  // segnaposto va confrontato con loro. Il client riceve `adesso` e lo rimanda
  // alla chiamata dopo: il confronto è sempre fra due letture dello stesso
  // orologio. (In locale su SQLite `select now()` non esiste: il catch tiene
  // l'ora dell'app, che lì è lo stesso orologio del database-file.)
  let adesso = new Date();
  try {
    const r = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
    if (r?.[0]?.now) adesso = new Date(r[0].now);
  } catch {
    // se il database non dice l'ora, quella di qui è meglio di niente
  }

  // ── LA PRIMA CHIAMATA NON MOSTRA NIENTE ──
  // ⚠️⚠️ Un avviso serve a dire «è APPENA successo»: sparare le analisi delle
  // ultime ore a ogni apertura insegna in due giorni che quei riquadri non
  // vogliono dire niente. Il passato si guarda in /analisi, che esiste apposta.
  if (!da || Number.isNaN(da.getTime())) {
    return { adesso: adesso.toISOString(), novita: [], troncato: false };
  }

  // ⚠️ Finestra CHIUSA in cima (`lte: adesso`), con `adesso` letto PRIMA della
  // query: una riga scritta mentre questa gira non si perde e non si ripete —
  // esce al giro dopo, perché il prossimo `da` è proprio questo `adesso`.
  const analisi = await prisma.analisi.findMany({
    where: { creataIl: { gt: da, lte: adesso } },
    select: { id: true, titolo: true, brand: true, esito: true, creataIl: true },
    orderBy: { creataIl: "desc" },
    // ⚠️ Un tetto anche al passato: se una scheda resta in pausa per un giorno,
    // `da` è vecchissimo e senza questo si leggerebbero righe per niente.
    take: TETTO + 1,
  });

  const troncato = analisi.length > TETTO;
  const novita: Novita[] = analisi.slice(0, TETTO).map((a) => ({
    id: `analisi:${a.id}`,
    tipo: "analisi",
    gruppo: "analisi",
    titolo: "Nuova analisi dal Drive",
    dettaglio: [a.titolo, a.brand !== "cross" ? a.brand : ""].filter(Boolean).join(" · "),
    quando: a.creataIl.toISOString(),
    link: `/analisi/${a.id}`,
  }));

  return { adesso: adesso.toISOString(), novita, troncato };
}
