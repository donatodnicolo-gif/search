// Un'azienda ha tre stati indipendenti, uno per dimensione:
//  - COMMERCIALE (`stato`)            — ciclo di vita della relazione commerciale
//  - FINANZIARIO (`statoFinanziario`) — come paga, se possiamo lavorarci a credito
//  - ANALISI     (`statoAnalisi`)     — perimetro di analisi, catalogo di FINANCE
//                                       (deluxy-partner, campo "Cliente per l'anno")
// Etichette, colori e guardie di ogni dimensione stanno qui.

// Stati del ciclo di vita COMMERCIALE. "attivo" = partner operativo.
//
// ⚠️ **LISTA CONDIVISA CON DELUXY SCOUT** (l'app commerciale): stessi valori,
// stesso ordine, in `deluxy-scout/types/index.ts` → `StatoAffiliazione`.
// Decisione dell'utente del 29/07/2026: un'azienda ha UN solo stato
// commerciale, e dev'essere lo stesso da qualunque app la si guardi.
// Aggiungendone uno qui, va aggiunto anche di là: se no il registro manda a
// Scout uno stato che Scout non sa leggere, e viceversa.
//
// L'ordine è quello del funnel, dal nome sulla lista al rapporto chiuso.
export const STATI = [
  // I due che arrivano da Scout: prima di parlargli, il registro non aveva
  // parole per distinguere «l'ho scelto io» da «ce l'abbiamo e basta».
  "selezionato",
  "lead",
  "prospect",
  "in_contatto",
  "in_attesa",
  "in_trattativa",
  "da_ricontattare",
  "attivo",
  // NUOVO (29/07/2026): compra ancora, ma i segnali peggiorano. Prima si
  // passava da «attivo» a «dismesso» senza preavviso, cioè quando era tardi.
  "a_rischio",
  "non_interessato",
  "dismesso",
] as const;

export type Stato = (typeof STATI)[number];

export const ETICHETTE_STATO: Record<Stato, string> = {
  selezionato: "Selezionato",
  lead: "Lead",
  prospect: "Prospect",
  in_contatto: "In contatto",
  in_attesa: "In attesa",
  in_trattativa: "In trattativa",
  da_ricontattare: "Da ricontattare",
  attivo: "Attivo",
  a_rischio: "A rischio",
  non_interessato: "Non interessato",
  // ⚠️ Il VALORE resta `dismesso` (è nel database di 976 anagrafiche e cambiarlo
  // sarebbe una migrazione), ma l'ETICHETTA è «Dormiente»: è la parola che usa
  // l'app commerciale per la stessa identica cosa, e due nomi per un concetto
  // solo costringono a tradurre a mente ogni volta (decisione utente
  // 29/07/2026).
  dismesso: "Dormiente",
};

// Colore semantico del badge (token del design system)
export const COLORE_STATO: Record<Stato, string> = {
  selezionato: "var(--text-tertiary)",
  lead: "var(--blue)",
  prospect: "var(--text-tertiary)",
  in_contatto: "var(--blue)",
  in_attesa: "var(--orange)",
  in_trattativa: "var(--purple)",
  da_ricontattare: "var(--orange)",
  attivo: "var(--green)",
  // Ancora cliente, ma da guardare: giallo, non rosso — il rosso è per chi se
  // n'è andato, e confonderli farebbe reagire tardi o troppo presto.
  a_rischio: "var(--orange)",
  non_interessato: "var(--red)",
  dismesso: "var(--red)",
};

export function isStato(v: string): v is Stato {
  return (STATI as readonly string[]).includes(v);
}

// ————————————————————— Stato FINANZIARIO —————————————————————
// Come si comporta l'azienda sui pagamenti: è la dimensione che guarda
// l'amministrazione (FINANCE), non il commerciale. "da_verificare" è il
// punto di partenza di tutte le anagrafiche.
export const STATI_FINANZIARI = [
  "da_verificare",
  "regolare",
  "in_ritardo",
  "insoluto",
  "piano_di_rientro",
  "bloccato",
] as const;

export type StatoFinanziario = (typeof STATI_FINANZIARI)[number];

export const ETICHETTE_STATO_FINANZIARIO: Record<StatoFinanziario, string> = {
  da_verificare: "Da verificare",
  regolare: "Regolare",
  in_ritardo: "In ritardo",
  insoluto: "Insoluto",
  piano_di_rientro: "Piano di rientro",
  bloccato: "Bloccato",
};

export const COLORE_STATO_FINANZIARIO: Record<StatoFinanziario, string> = {
  da_verificare: "var(--text-tertiary)",
  regolare: "var(--green)",
  in_ritardo: "var(--orange)",
  insoluto: "var(--red)",
  piano_di_rientro: "var(--purple)",
  bloccato: "var(--red)",
};

export const STATO_FINANZIARIO_PREDEFINITO: StatoFinanziario = "da_verificare";

export function isStatoFinanziario(v: string): v is StatoFinanziario {
  return (STATI_FINANZIARI as readonly string[]).includes(v);
}

// ————————————————————— Stato ANALISI —————————————————————
// Catalogo di FINANCE (deluxy-partner, `Partner.clienteAnno`): dice se
// l'azienda è nel perimetro di confronto dell'anno ("P.P." = pari perimetro),
// se è entrata quest'anno, o se è uscita. Vuoto = mai analizzata.
export const STATI_ANALISI = ["pp", "nuovo", "dismesso"] as const;

export type StatoAnalisi = (typeof STATI_ANALISI)[number];

export const ETICHETTE_STATO_ANALISI: Record<StatoAnalisi, string> = {
  pp: "P.P.",
  nuovo: "Nuovo",
  dismesso: "Dismesso",
};

// Testo esteso per i menu (l'etichetta breve è quella del badge)
export const DESCRIZIONI_STATO_ANALISI: Record<StatoAnalisi, string> = {
  pp: "P.P. (pari perimetro)",
  nuovo: "Nuovo",
  dismesso: "Dismesso",
};

export const COLORE_STATO_ANALISI: Record<StatoAnalisi, string> = {
  pp: "var(--green)",
  nuovo: "var(--blue)",
  dismesso: "var(--red)",
};

export function isStatoAnalisi(v: string): v is StatoAnalisi {
  return (STATI_ANALISI as readonly string[]).includes(v);
}

// FINANCE scrive i valori come li mostra all'operatore ("P.P.", "Nuovo",
// "Dismesso"): in ingresso si accettano entrambe le forme e si normalizza
// sullo slug del registro.
export function normalizzaStatoAnalisi(v: string): StatoAnalisi | null {
  const s = v.trim().toLowerCase().replace(/\./g, "");
  if (s === "pp" || s === "p p" || s === "pari perimetro") return "pp";
  if (s === "nuovo") return "nuovo";
  if (s === "dismesso") return "dismesso";
  return null;
}

// ————————————————————— Storia —————————————————————
// I passaggi delle tre dimensioni finiscono nello stesso storico: quelli non
// commerciali sono prefissati ("fin:regolare", "ana:nuovo") così restano
// leggibili senza ambiguità.
export const PREFISSO_FINANZIARIO = "fin:";
export const PREFISSO_ANALISI = "ana:";

// Nome leggibile di un valore che compare nello storico dei passaggi.
export function nomeEventoStato(v: string): string {
  if (v === "archiviata") return "Archiviata";
  if (v.startsWith(PREFISSO_FINANZIARIO)) {
    const s = v.slice(PREFISSO_FINANZIARIO.length);
    return `Finanziario: ${isStatoFinanziario(s) ? ETICHETTE_STATO_FINANZIARIO[s] : s || "—"}`;
  }
  if (v.startsWith(PREFISSO_ANALISI)) {
    const s = v.slice(PREFISSO_ANALISI.length);
    return `Analisi: ${isStatoAnalisi(s) ? ETICHETTE_STATO_ANALISI[s] : s || "—"}`;
  }
  return isStato(v) ? ETICHETTE_STATO[v] : v;
}
