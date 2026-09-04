import { prisma } from "./db";

// LA DESCRIZIONE DECIDE LA TIPOLOGIA, QUANDO LA NOMINA.
//
// Regola dell'utente (04/09/2026): «se nella fattura è scritto affiliazione, la
// tipologia deve essere Affiliazioni».
//
// Non è un dettaglio di catalogazione: la tipologia è la voce con cui **Budgets
// legge il fatturato** (`GET /api/v1/fatturato`), quindi metterla storta sposta
// dei ricavi da una riga all'altra del conto economico. Il caso che l'ha fatta
// nascere: GIADA CAKE, luglio 2026, «Fee affiliazione Deluxy» di 450 €
// archiviata sotto «Consegne» (riparata con
// `scripts/ripara-tipologia-affiliazioni.mjs`).
//
// Sta scritta QUI e in nessun altro posto: una fattura nasce da due strade —
// il modulo a mano e l'import da Fatture in Cloud, che la tipologia se la
// IMPARA dall'ultima fattura del partner (ed è appunto così che una fee di
// affiliazione eredita «Consegne» da una consegna) — e due copie della stessa
// regola prima o poi divergono.
//
// ⚠️ Si aggiunge una parola qui solo quando NOMINA il servizio senza
// ambiguità. «Consegne» no: compare nelle descrizioni di mezzo mondo
// («consegne di eventi», «affiliazione + consegne») e trascinerebbe righe
// giuste nella voce sbagliata. Meglio poche parole certe che una regola
// prepotente: quando la parola non c'è, decide la persona.

const PAROLE: { nome: string; parola: RegExp }[] = [
  // affiliazione, affiliazioni, «fee di affiliazione annuale»…
  { nome: "Affiliazioni", parola: /affiliazion/i },
];

/** Il nome della tipologia che la descrizione nomina, se la nomina. */
export function tipologiaNominata(descrizione: string | null | undefined): string | null {
  const testo = descrizione ?? "";
  return PAROLE.find((p) => p.parola.test(testo))?.nome ?? null;
}

/** La tipologia che la descrizione nomina, presa dal catalogo. `null` se la
 *  descrizione non ne nomina nessuna (o se quella tipologia non esiste più:
 *  in quel caso la scelta resta di chi sta scrivendo, non si inventa niente). */
export async function tipologiaDaDescrizione(
  descrizione: string | null | undefined
): Promise<{ id: string; nome: string } | null> {
  const nome = tipologiaNominata(descrizione);
  if (!nome) return null;
  return prisma.tipologiaServizio.findFirst({ where: { nome }, select: { id: true, nome: true } });
}

/** La tipologia da salvare: quella nominata dalla descrizione se c'è, altrimenti
 *  quella scelta (dal modulo o imparata dall'import). Torna anche `corretta`,
 *  che serve a scriverlo nel registro invece di cambiare le carte in silenzio. */
export async function tipologiaDaUsare(
  descrizione: string | null | undefined,
  scelta: string
): Promise<{ id: string; corretta: { nome: string; prima: string } | null }> {
  const dallaDescrizione = await tipologiaDaDescrizione(descrizione);
  if (!dallaDescrizione || dallaDescrizione.id === scelta) return { id: scelta, corretta: null };
  const prima = await prisma.tipologiaServizio.findUnique({ where: { id: scelta }, select: { nome: true } });
  return { id: dallaDescrizione.id, corretta: { nome: dallaDescrizione.nome, prima: prima?.nome ?? "—" } };
}
