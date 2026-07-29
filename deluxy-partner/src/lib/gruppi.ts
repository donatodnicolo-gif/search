import { prisma } from "./db";

// Gruppi di pagamento: piu schede saldate da un'unica amministrazione.
//
// L'etichetta si scrive a mano, e finche' si scrive a mano si sbaglia:
// «CHANEL» e «Chanel» sono due gruppi diversi, e chi compila non sa quali
// gruppi esistono gia'. Qui si preparano i SUGGERIMENTI da mostrare nel form:
//
//  1. `uso`      — i gruppi gia' assegnati, con le schede che ci stanno dentro;
//  2. `candidato`— le insegne che si ripetono su piu schede;
//  3. `scheda`   — tutte le altre insegne, per cercarci dentro (escono solo
//                  scrivendo: servono a scoprire le parentele che il nome
//                  nasconde, tipo «FAG TORINO FIORI» e «FIORI TORINO (FAG …)»).
//
// ⚠️ Il gruppo NON si deduce dal nome: in anagrafica ci sono cinque
// «PASTICCERIA …» che sono aziende diverse fra loro. Per questo ogni voce
// arriva con l'elenco delle schede coinvolte (si giudica a colpo d'occhio) e
// nessuna viene mai applicata da sola: il gruppo lo assegna una persona.

export type TipoSuggerimento = "uso" | "candidato" | "scheda";

export type SuggerimentoGruppo = {
  /** Etichetta del gruppo (quella che finirebbe in `Partner.gruppo`). */
  nome: string;
  tipo: TipoSuggerimento;
  /** Nomi delle schede coinvolte: gia' nel gruppo, o che condividono l'insegna. */
  membri: string[];
};

// Parole che dicono il MESTIERE, non l'insegna. Un prefisso fatto solo di
// queste non e' un gruppo di pagamento: «PASTICCERIA» accomuna cinque aziende
// diverse, «PASTICCERIA TAVEGGIA» no.
const GENERICHE = new Set([
  "pasticceria", "pasticcerie", "fioreria", "fiorista", "fioraio", "fiori",
  "fiore", "fiorito", "fiorita", "negozio", "bottega", "atelier", "boutique",
  "bar", "ristorante", "caffe", "forno", "casa", "flowers", "flower", "garden",
  "sushi", "food", "srl", "srls", "snc", "sas", "spa", "di", "de", "del",
  "della", "dei", "delle", "dal", "da", "il", "lo", "la", "le", "gli", "i",
  "e", "and", "the",
]);

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/**
 * L'insegna dentro il nome della scheda: via la ragione sociale fra parentesi
 * («BASARA (SUSHI RO SRL)» → «BASARA») e via il mese appiccicato in fondo
 * («DR VRANJES gennaio» → «DR VRANJES»), che indica la mensilita', non l'azienda.
 */
export function insegna(nome: string): string {
  let s = nome.replace(/\([^)]*\)/g, " ");
  for (const mese of MESI) {
    s = s.replace(new RegExp(`\\b${mese}\\b`, "gi"), " ");
  }
  return s.replace(/[\s-]+/g, " ").trim();
}

/** Chiave di confronto fra etichette: «GRUÈ» e «grue» sono lo stesso gruppo. */
export function chiaveGruppo(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // via gli accenti: GRUÈ -> grue
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Suggerimenti per il campo «Gruppo di pagamento»: gruppi in uso, insegne
 * ripetute (da confermare a mano) e tutte le altre insegne, cercabili.
 */
export async function suggerimentiGruppi(): Promise<SuggerimentoGruppo[]> {
  const partner = await prisma.partner.findMany({
    select: { id: true, nome: true, gruppo: true },
    orderBy: { nome: "asc" },
  });

  // 1. Gruppi gia' assegnati, con le schede che ci stanno dentro.
  const inUso = new Map<string, { nome: string; membri: string[] }>();
  for (const p of partner) {
    const g = p.gruppo?.trim();
    if (!g) continue;
    const k = chiaveGruppo(g);
    const voce = inUso.get(k) ?? { nome: g, membri: [] };
    voce.membri.push(p.nome);
    inUso.set(k, voce);
  }

  // 2. Prefissi dell'insegna (1–3 parole) condivisi da almeno due schede.
  //    Etichetta e parole vengono dalla STESSA divisione: mescolarne due
  //    («BOTTEGA M.G.M.» = 2 parole intere ma 4 alfanumeriche) faceva contare
  //    due volte la stessa scheda e nascere gruppi da un partner solo.
  const perPrefisso = new Map<string, { nome: string; membri: Map<string, string> }>();
  for (const p of partner) {
    const parole = insegna(p.nome).split(" ").filter(Boolean);
    for (let n = 1; n <= Math.min(3, parole.length); n++) {
      const pezzo = parole.slice(0, n);
      const chiave = chiaveGruppo(pezzo.join(" "));
      if (chiave.length < 3) continue;
      // prefisso fatto solo di parole-mestiere: non identifica nessuno
      if (chiave.split(" ").every((t) => GENERICHE.has(t))) continue;
      const voce = perPrefisso.get(chiave) ?? { nome: pezzo.join(" ").toUpperCase(), membri: new Map() };
      voce.membri.set(p.id, p.nome);
      perPrefisso.set(chiave, voce);
    }
  }

  // Fra prefissi che pescano ESATTAMENTE le stesse schede tengo il piu corto:
  // «PASTICCERIA TAVEGGIA» e non «PASTICCERIA TAVEGGIA C».
  const candidati = new Map<string, { nome: string; membri: string[] }>();
  for (const [chiave, voce] of perPrefisso) {
    if (voce.membri.size < 2) continue;
    if (inUso.has(chiave)) continue; // gia' un gruppo vero: sta nella prima sezione
    const insieme = [...voce.membri.keys()].sort().join(" ");
    const gia = candidati.get(insieme);
    if (!gia || voce.nome.length < gia.nome.length) {
      candidati.set(insieme, { nome: voce.nome, membri: [...voce.membri.values()] });
    }
  }

  // 3. Tutte le altre insegne: non sono gruppi, ma si cercano. Scrivendo «FAG»
  //    si vedono le due schede che lo contengono e si decide.
  const usate = new Set([...inUso.keys(), ...[...candidati.values()].map((c) => chiaveGruppo(c.nome))]);
  const schede: { nome: string; membri: string[] }[] = [];
  for (const p of partner) {
    if (p.gruppo?.trim()) continue; // ha gia' un gruppo: si trova cercando quello
    const etichetta = insegna(p.nome).toUpperCase();
    const k = chiaveGruppo(etichetta);
    if (!k || usate.has(k)) continue;
    usate.add(k);
    schede.push({ nome: etichetta, membri: [p.nome] });
  }

  const ordina = (a: { nome: string; membri: string[] }, b: { nome: string; membri: string[] }) =>
    b.membri.length - a.membri.length || a.nome.localeCompare(b.nome, "it");

  return [
    ...[...inUso.values()].sort(ordina).map((v) => ({ ...v, tipo: "uso" as const })),
    ...[...candidati.values()].sort(ordina).map((v) => ({ ...v, tipo: "candidato" as const })),
    ...schede.map((v) => ({ ...v, tipo: "scheda" as const })),
  ];
}
