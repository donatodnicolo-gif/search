// Un'azienda ha quattro stati indipendenti, uno per dimensione:
//  - COMMERCIALE (`stato`)            — a che punto del funnel siamo arrivati
//  - LIVELLO     (`livello`)          — com'è messo il contatto *dentro* quel punto
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
//
// ⚠️ 31/07/2026 — «in contatto», «in attesa» e «da ricontattare» NON sono più
// stati commerciali: sono passati alla dimensione LIVELLO qui sotto. Non erano
// gradini del funnel ma il *momento* del contatto, e mescolarli agli altri
// costringeva a scegliere fra due informazioni vere insieme («è un prospect»
// **e** «sta aspettando una risposta»). Le 180 anagrafiche che li avevano sono
// diventate `prospect` tenendo il vecchio valore come livello.
export const STATI = [
  // I due che arrivano da Scout: prima di parlargli, il registro non aveva
  // parole per distinguere «l'ho scelto io» da «ce l'abbiamo e basta».
  "selezionato",
  "lead",
  "prospect",
  "in_trattativa",
  "attivo",
  "dismesso",
] as const;

export type Stato = (typeof STATI)[number];

export const ETICHETTE_STATO: Record<Stato, string> = {
  selezionato: "Selezionato",
  lead: "Lead",
  prospect: "Prospect",
  in_trattativa: "In trattativa",
  // ⚠️ Il VALORE resta `attivo` (è nel database di quasi mille anagrafiche e in
  // Scout, cambiarlo sarebbe una migrazione), ma l'ETICHETTA è «Cliente»
  // (31/07/2026, decisione dell'utente): «attivo» diceva due cose in una sola
  // parola — la scheda ha già un `attivo` che vuol dire «non archiviata», e
  // un'anagrafica archiviata risultava «Attivo» in elenco. «Cliente» dice
  // invece l'unica cosa che conta: ci compra.
  attivo: "Cliente",
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
  in_trattativa: "var(--purple)",
  attivo: "var(--green)",
  dismesso: "var(--red)",
};

export function isStato(v: string): v is Stato {
  return (STATI as readonly string[]).includes(v);
}

// ————————————————————— LIVELLO —————————————————————
// A che punto è il contatto *dentro* lo stato commerciale: gli abbiamo parlato,
// stiamo aspettando una risposta, va ripreso in mano. Non dice se è un prospect
// o un cliente — quello è lo stato — e per questo è una dimensione a parte:
// «prospect» e «in attesa di risposta» sono veri nello stesso momento.
// Vuoto = non indicato (nessun livello è quello «giusto» di partenza).
// L'ordine è quello in cui un rapporto si scalda: gli abbiamo parlato, aspetta
// una risposta, va ripreso in mano, ed è vivo.
export const LIVELLI = [
  "in_contatto",
  "in_attesa",
  "da_ricontattare",
  "attivo",
  // Erano stati commerciali fino al 31/07/2026, e come stati non funzionavano:
  // «a rischio» toglieva la parola «cliente» proprio a chi cliente lo è ancora,
  // e «non interessato» cancellava il fatto che restava un prospect a cui
  // avevamo parlato. Sono modi in cui va il rapporto, non gradini del funnel.
  "a_rischio",
  "non_interessato",
] as const;

export type Livello = (typeof LIVELLI)[number];

export const ETICHETTE_LIVELLO: Record<Livello, string> = {
  in_contatto: "In contatto",
  in_attesa: "In attesa",
  da_ricontattare: "Da ricontattare",
  // Stesso slug dello stato commerciale `attivo`, ma è un'altra colonna e vuol
  // dire un'altra cosa: lì «è un cliente», qui «il rapporto è vivo, ci
  // parliamo». Un cliente che non risponde più è stato Cliente con livello
  // «Da ricontattare», ed è proprio la coppia che prima non si poteva scrivere.
  attivo: "Attivo",
  a_rischio: "A rischio",
  non_interessato: "Non interessato",
};

export const COLORE_LIVELLO: Record<Livello, string> = {
  in_contatto: "var(--blue)",
  // Aspettare e dover richiamare sono due modi di essere fermi: arancione
  // entrambi, perché è lì che le trattative si spengono senza che nessuno
  // se ne accorga.
  in_attesa: "var(--orange)",
  da_ricontattare: "var(--orange)",
  attivo: "var(--green)",
  // Ancora cliente, ma da guardare: arancione, non rosso — il rosso è per chi
  // se n'è andato, e confonderli farebbe reagire tardi o troppo presto.
  a_rischio: "var(--orange)",
  non_interessato: "var(--red)",
};

export function isLivello(v: string): v is Livello {
  return (LIVELLI as readonly string[]).includes(v);
}

// ⚠️ In Deluxy Scout la stessa dimensione si chiama **momento del contatto**
// (`MomentoContatto`, colonna `livello_contatto`): valori identici, nome
// diverso. La funzione di sincronizzazione di Scout manda ancora questi tre
// come `stato`, e le API del registro li spostano da sé nel livello — vedi la
// nota «COMPATIBILITÀ CON SCOUT» in src/lib/partner-api.ts. Finché quella
// funzione non manda `livello`, non togliere quello spostamento: senza, ogni
// scrittura di Scout tornerebbe 400.

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
export const PREFISSO_LIVELLO = "liv:";

// Nome leggibile di un valore che compare nello storico dei passaggi.
export function nomeEventoStato(v: string): string {
  if (v === "archiviata") return "Archiviata";
  if (v.startsWith(PREFISSO_LIVELLO)) {
    const s = v.slice(PREFISSO_LIVELLO.length);
    return `Livello: ${isLivello(s) ? ETICHETTE_LIVELLO[s] : s || "—"}`;
  }
  if (v.startsWith(PREFISSO_FINANZIARIO)) {
    const s = v.slice(PREFISSO_FINANZIARIO.length);
    return `Finanziario: ${isStatoFinanziario(s) ? ETICHETTE_STATO_FINANZIARIO[s] : s || "—"}`;
  }
  if (v.startsWith(PREFISSO_ANALISI)) {
    const s = v.slice(PREFISSO_ANALISI.length);
    return `Analisi: ${isStatoAnalisi(s) ? ETICHETTE_STATO_ANALISI[s] : s || "—"}`;
  }
  if (isStato(v)) return ETICHETTE_STATO[v];
  // Storico più vecchio del 31/07/2026: «in_contatto» & C. erano stati
  // commerciali senza prefisso. Restano leggibili invece di comparire come
  // slug grezzo, ma dichiarati per quello che sono adesso.
  if (isLivello(v)) return `Livello: ${ETICHETTE_LIVELLO[v]}`;
  return v;
}
