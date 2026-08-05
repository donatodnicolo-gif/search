// Cataloghi di dominio dell'app Marketing: brand, canali, tipi di analisi,
// stati di azioni e campagne. Stringhe normalizzate (niente enum in SQLite):
// ogni valore ha etichetta e — dove serve — colore del design system.

export const BRANDS = ["flowers", "cake", "gifts", "cross"] as const;
export type Brand = (typeof BRANDS)[number];

export const ETICHETTA_BRAND: Record<string, string> = {
  flowers: "Flowers",
  cake: "Cake",
  gifts: "Gifts",
  cross: "Cross-brand",
  pubblici: "Pubblici (CRM)",
  performance: "Analisi Performance",
  altro: "Altro",
};

export const COLORE_BRAND: Record<string, string> = {
  flowers: "var(--purple)",
  cake: "var(--orange)",
  gifts: "var(--blue)",
  cross: "var(--gold-strong)",
  pubblici: "var(--green)",
  performance: "var(--text-secondary)",
  altro: "var(--text-tertiary)",
};

export const CANALI = [
  "google_ads",
  "meta_ads",
  "tiktok",
  "email",
  "sito",
  "seo",
  "crm",
  "social",
  "altro",
] as const;

export const ETICHETTA_CANALE: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok: "TikTok Ads",
  email: "Email",
  sito: "Sito / landing",
  seo: "SEO",
  crm: "CRM / pubblici",
  social: "Social organico",
  altro: "Altro",
};

export const COLORE_CANALE: Record<string, string> = {
  google_ads: "#1a73e8",
  meta_ads: "#0866ff",
  tiktok: "#111111",
  email: "var(--text-secondary)",
  sito: "var(--text-secondary)",
  seo: "var(--text-secondary)",
  crm: "var(--text-secondary)",
  social: "var(--text-secondary)",
  altro: "var(--text-tertiary)",
};

export const TIPI_ANALISI = [
  "audit_google",
  "audit_meta",
  "analisi_performance",
  "revisione_creativi",
  "revisione_landing",
  "report_settimanale",
  "analisi_pubblici",
  "analisi",
  "altro",
] as const;

export const ETICHETTA_TIPO_ANALISI: Record<string, string> = {
  audit_google: "Audit Google Ads",
  audit_meta: "Audit Meta Ads",
  analisi_performance: "Analisi performance",
  revisione_creativi: "Revisione creativi & copy",
  revisione_landing: "Revisione landing",
  report_settimanale: "Report settimanale",
  analisi_pubblici: "Analisi pubblici",
  analisi: "Analisi",
  altro: "Altro",
};

export const ESITI_ANALISI = ["ok", "attenzione", "critico"] as const;

export const ETICHETTA_ESITO: Record<string, string> = {
  ok: "OK",
  attenzione: "Attenzione",
  critico: "Critico",
};

export const COLORE_ESITO: Record<string, string> = {
  ok: "var(--green)",
  attenzione: "var(--orange)",
  critico: "var(--red)",
};

// Stati azione: ricalcano i gemelli dei piani su Drive (TODO / IN CORSO /
// FATTO / SUPERATA / BLOCCATO) così la lingua resta una sola.
export const STATI_AZIONE = ["todo", "in_corso", "fatta", "superata", "bloccata"] as const;

export const ETICHETTA_STATO_AZIONE: Record<string, string> = {
  todo: "Da fare",
  in_corso: "In corso",
  fatta: "Fatta",
  superata: "Superata",
  bloccata: "Bloccata",
};

export const COLORE_STATO_AZIONE: Record<string, string> = {
  todo: "var(--blue)",
  in_corso: "var(--gold-strong)",
  fatta: "var(--green)",
  superata: "var(--text-tertiary)",
  bloccata: "var(--red)",
};

// Stati "aperti" = l'azione richiede ancora lavoro
export const STATI_AZIONE_APERTI = ["todo", "in_corso", "bloccata"];

export const PRIORITA = ["alta", "media", "bassa"] as const;
export const ETICHETTA_PRIORITA: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};
export const COLORE_PRIORITA: Record<string, string> = {
  alta: "var(--red)",
  media: "var(--orange)",
  bassa: "var(--text-tertiary)",
};

export const OWNERS = ["ai", "utente"] as const;
export const ETICHETTA_OWNER: Record<string, string> = {
  ai: "AI",
  utente: "Utente",
};

// L'ordine è quello della vita di una campagna: si scrive, si prepara a
// partire, parte, impara, gira, si ferma, finisce. `defunta` sta in fondo
// perché è l'uscita.
export const STATI_CAMPAGNA = [
  "bozza",
  "in_lancio",
  "in_apprendimento",
  "attiva",
  "in_pausa",
  "conclusa",
  "defunta",
] as const;

export const ETICHETTA_STATO_CAMPAGNA: Record<string, string> = {
  bozza: "Bozza",
  in_lancio: "In lancio",
  in_apprendimento: "In apprendimento",
  attiva: "Attiva",
  in_pausa: "In pausa",
  conclusa: "Conclusa",
  defunta: "Defunta",
};

export const COLORE_STATO_CAMPAGNA: Record<string, string> = {
  bozza: "var(--text-tertiary)",
  in_lancio: "var(--blue)",
  in_apprendimento: "var(--gold-strong)",
  attiva: "var(--green)",
  // Ferma per scelta, non in allarme: distinta dal rosso di "critica"
  in_pausa: "var(--ardesia)",
  conclusa: "var(--text-secondary)",
  defunta: "var(--text-tertiary)",
};

export const SPIEGA_STATO_CAMPAGNA: Record<string, string> = {
  bozza: "Scritta, non ancora decisa.",
  in_lancio: "Decisa e pronta: non è ancora partita, ma va fatta partire. È una cosa da fare, non un archivio.",
  in_apprendimento: "Partita da poco: i numeri non sono ancora leggibili.",
  attiva: "Sta girando, si giudica sui numeri.",
  in_pausa: "Ferma, ma può ripartire.",
  conclusa: "Finita: si guarda solo nello storico.",
  defunta:
    "Da non considerare mai più: sparisce dagli elenchi e dai conteggi operativi. La spesa che ha fatto resta nei totali — quei soldi sono usciti davvero.",
};

// Le campagne che chiedono attenzione oggi: elenchi, contatori, alert.
// `in_lancio` è qui dentro perché è una cosa da fare; bozza, conclusa e
// defunta no.
export const STATI_CAMPAGNA_VIVE = ["in_lancio", "in_apprendimento", "attiva", "in_pausa"] as const;

// Lo stato che vuol dire "non nominarmela più". Sta in una costante sola
// perché il giorno che se ne aggiunge un altro non si va a caccia di stringhe
// sparse per venti file.
export const STATI_CAMPAGNA_IGNORATE = ["defunta"] as const;

// ⚠️ Gli stati che sono NOSTRI: Google non sa cosa siano, e l'import non deve
// sovrascriverli mai.
//
// È costato caro. L'import scriveva `stato` con quello che dice Google
// (`attiva` / `in_pausa`), quindi una campagna marcata **defunta** tornava
// `in_pausa` alla passata dopo e ricompariva in ogni elenco. Misurato sul
// registro il 04/08/2026: **66 marcature «→ defunta» su 68 erano state
// annullate** dall'import, e la stessa campagna era stata rimarcata fino a
// quattro volte da chi non capiva perché tornasse.
//
// È la stessa distinzione del gruppo — `stato` è il giudizio nostro,
// `statoPiattaforma` è il fatto di Google — che alla campagna non era mai
// stata applicata.
export const STATI_CAMPAGNA_NOSTRI = ["defunta", "in_lancio", "bozza"] as const;

export const CATEGORIE_DRIVE = [
  "definitivi",
  "analisi",
  "piani",
  "audit",
  "archivio",
  "pubblici",
  "creativita",
  "seo",
  "altro",
] as const;

export const ETICHETTA_CATEGORIA_DRIVE: Record<string, string> = {
  definitivi: "Definitivi",
  analisi: "Analisi",
  piani: "Piani",
  audit: "Audit",
  archivio: "Archivio",
  pubblici: "Pubblici",
  creativita: "Creatività",
  seo: "SEO",
  altro: "Altro",
};

// ---------- Formattazione (it-IT) ----------

export function formattaData(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formattaDataOra(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formattaEuro(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n < 100 ? 2 : 0 });
}

export function formattaNumero(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("it-IT");
}

// ROAS = ricavi / spesa (se entrambi presenti e spesa > 0)
export function roas(ricavi: number | null | undefined, spesa: number | null | undefined): number | null {
  if (ricavi == null || spesa == null || spesa <= 0) return null;
  return ricavi / spesa;
}

// ---------- Monitoraggio / nuove sezioni ----------

export const SITI = ["gifts", "cake", "flowers"] as const;
export const ETICHETTA_SITO: Record<string, string> = {
  gifts: "Deluxy.it",
  cake: "Cakedesign.me",
  flowers: "Deluxyflowers.com",
};

export const SCOPE_MKT = ["totale", "gifts", "flowers", "cake"] as const;
export const ETICHETTA_SCOPE: Record<string, string> = {
  totale: "Deluxy (totale)",
  gifts: "Deluxy.it (Gifts)",
  flowers: "Flowers",
  cake: "Cake",
};

export const MESI_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export const STATI_TEST_META = ["idea", "pianificato", "in_corso", "concluso", "promosso", "respinto"] as const;
export const ETICHETTA_STATO_TEST: Record<string, string> = {
  idea: "Idea",
  pianificato: "Pianificato",
  in_corso: "In corso",
  concluso: "Concluso",
  promosso: "Promosso",
  respinto: "Respinto",
};
export const COLORE_STATO_TEST: Record<string, string> = {
  idea: "var(--text-tertiary)",
  pianificato: "var(--blue)",
  in_corso: "var(--gold-strong)",
  concluso: "var(--text-secondary)",
  promosso: "var(--green)",
  respinto: "var(--red)",
};

export const STATI_LANDING = ["attiva", "mismatch", "da_verificare", "dismessa"] as const;
export const ETICHETTA_STATO_LANDING: Record<string, string> = {
  attiva: "Attiva",
  mismatch: "Mismatch",
  da_verificare: "Da verificare",
  dismessa: "Dismessa",
};
export const COLORE_STATO_LANDING: Record<string, string> = {
  attiva: "var(--green)",
  mismatch: "var(--orange)",
  da_verificare: "var(--blue)",
  dismessa: "var(--text-tertiary)",
};

export const ETICHETTA_TIPO_COPY: Record<string, string> = {
  titolo: "Titolo RSA",
  descrizione: "Descrizione RSA",
  primary_text: "Primary text Meta",
  headline_meta: "Headline Meta",
  keyword: "Keyword",
  sitelink: "Sitelink",
  nota: "Nota",
  altro: "Altro",
};

export const ETICHETTA_ENTITA_REGISTRO: Record<string, string> = {
  analisi: "Analisi",
  azione: "Azione",
  campagna: "Campagna",
  metrica: "Metrica",
  landing: "Landing",
  copy: "Copy",
  test_meta: "Test Meta",
  drive: "Drive",
  vendite: "Vendite",
  budget: "Budget",
  settimana: "Settimana MKT",
  pubblico: "Pubblico",
};

export function formattaPercento(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const segno = n > 0 ? "+" : "";
  return `${segno}${(n * 100).toFixed(0)}%`;
}

// Stati di una keyword (colonna `stato` di CopyAnnuncio quando tipo="keyword").
// ⚠️ Il testo con cui una keyword si MOSTRA non è il testo con cui esiste su
// Google. L'import dal Monitoraggio ci attacca il tipo di corrispondenza —
// «flower milan (match esatto)» — e mandare quella stringa allo script vuol
// dire cercare su Google una keyword che non esiste: l'operazione tornerebbe
// "bersaglio non trovato" e nessuno capirebbe perché.
//
// Si toglie SOLO una parentesi finale che contiene solo parole di
// corrispondenza: «rose rosse (san valentino)» non è un tipo di corrispondenza
// e resta intatta.
const PAROLE_CORRISPONDENZA =
  /^(match\s+)?(esatto|esatta|exact|broad|generica|generico|ampia|frase|phrase|modificata|modified|bmm)$/i;

export function testoKeywordPulito(testo: string): string {
  const m = testo.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return testo.trim();
  return PAROLE_CORRISPONDENZA.test(m[2].trim()) ? m[1].trim() : testo.trim();
}

export const STATI_KEYWORD = ["attiva", "vincente", "da_valutare", "in_pausa", "esclusa"] as const;
export const ETICHETTA_STATO_KEYWORD: Record<string, string> = {
  attiva: "Attiva",
  vincente: "Vincente",
  da_valutare: "Da valutare",
  in_pausa: "In pausa",
  esclusa: "Esclusa",
  // valore ereditato dall'import, trattato come "attiva"
  attivo: "Attiva",
};
export const COLORE_STATO_KEYWORD: Record<string, string> = {
  attiva: "var(--blue)",
  attivo: "var(--blue)",
  vincente: "var(--green)",
  da_valutare: "var(--gold-strong)",
  in_pausa: "var(--ardesia)",
  esclusa: "var(--red)",
};

// ---------- Pubblici (CRM & audience) ----------

export const PIATTAFORME_PUBBLICO = ["meta", "google", "tiktok", "klaviyo", "shopify", "altro"] as const;
export const ETICHETTA_PIATTAFORMA: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  klaviyo: "Klaviyo",
  shopify: "Shopify",
  altro: "Altro",
};

export const TIPI_PUBBLICO = [
  "cliente",
  "lookalike",
  "retargeting",
  "interessi",
  "esclusione",
  "segmento",
  "altro",
] as const;
export const ETICHETTA_TIPO_PUBBLICO: Record<string, string> = {
  cliente: "Lista clienti",
  lookalike: "Lookalike",
  retargeting: "Retargeting",
  interessi: "Interessi",
  esclusione: "Esclusione",
  segmento: "Segmento CRM",
  altro: "Altro",
};

export const STATI_PUBBLICO = [
  "attivo",
  "in_aggiornamento",
  "da_verificare",
  "da_creare",
  "obsoleto",
] as const;
export const ETICHETTA_STATO_PUBBLICO: Record<string, string> = {
  attivo: "Attivo",
  in_aggiornamento: "In aggiornamento",
  da_verificare: "Da verificare",
  da_creare: "Da creare",
  obsoleto: "Obsoleto",
};
export const COLORE_STATO_PUBBLICO: Record<string, string> = {
  attivo: "var(--green)",
  in_aggiornamento: "var(--gold-strong)",
  da_verificare: "var(--blue)",
  da_creare: "var(--purple)",
  obsoleto: "var(--text-tertiary)",
};

// Sotto queste soglie il pubblico non è utilizzabile/efficace (regole Meta).
export const SOGLIA_POOL_MINIMO = 1000;

// ---------- Guardrail e governance (Definitivi 00.x, 10, 11) ----------

export const CLASSI_CAMPAGNA = ["traino", "standard", "sperimentale"] as const;
export const ETICHETTA_CLASSE: Record<string, string> = {
  traino: "Traino",
  standard: "Standard",
  sperimentale: "Sperimentale",
};
export const COLORE_CLASSE: Record<string, string> = {
  traino: "var(--gold-strong)",
  standard: "var(--text-secondary)",
  sperimentale: "var(--purple)",
};

export const LIVELLI_MODIFICA = ["L0", "L1", "L2", "L3"] as const;
export const ETICHETTA_LIVELLO: Record<string, string> = {
  L0: "L0 — Osservazione",
  L1: "L1 — Leggera",
  L2: "L2 — Significativa",
  L3: "L3 — Strutturale",
};

export const COLORE_ALERT: Record<string, string> = {
  rosso: "var(--red)",
  arancio: "var(--orange)",
  giallo: "var(--gold-strong)",
};

export const SEZIONI_MEMORIA = ["metodo", "decisioni", "trappole"] as const;
export const ETICHETTA_SEZIONE_MEMORIA: Record<string, string> = {
  metodo: "Metodo di lavoro",
  decisioni: "Decisioni trasversali",
  trappole: "Trappole tecniche",
};

export const PRIORITA_INCONGRUENZA: Record<string, string> = {
  P0: "P0 — Blocca decisioni corrette",
  P1: "P1 — Importante",
  P2: "P2 — Minore",
};
export const STATI_INCONGRUENZA = ["aperta", "vera", "parziale", "respinta", "integrata"] as const;
export const ETICHETTA_STATO_INCONGRUENZA: Record<string, string> = {
  aperta: "Aperta",
  vera: "Verificata: vera",
  parziale: "Verificata: parziale",
  respinta: "Non confermata",
  integrata: "Integrata nei documenti",
};
export const COLORE_STATO_INCONGRUENZA: Record<string, string> = {
  aperta: "var(--orange)",
  vera: "var(--red)",
  parziale: "var(--gold-strong)",
  respinta: "var(--text-tertiary)",
  integrata: "var(--green)",
};

export const FREQUENZE_CADENZA: Record<string, string> = {
  settimanale: "Ogni settimana (lunedì)",
  bisettimanale: "Ogni 2 settimane",
  mensile: "Ogni mese (il 1°)",
  trimestrale: "Ogni trimestre",
  annuale: "Ogni anno",
};

export const STATI_CREATIVO = ["in_coda", "attivo", "vincente", "sostituito", "bocciato"] as const;
export const ETICHETTA_STATO_CREATIVO: Record<string, string> = {
  in_coda: "In coda",
  attivo: "Attivo",
  vincente: "Vincente",
  sostituito: "Sostituito",
  bocciato: "Bocciato",
};
export const COLORE_STATO_CREATIVO: Record<string, string> = {
  in_coda: "var(--blue)",
  attivo: "var(--gold-strong)",
  vincente: "var(--green)",
  sostituito: "var(--text-tertiary)",
  bocciato: "var(--red)",
};

// Le operazioni verso le piattaforme, in parole. Sta qui e non nella pagina
// Operazioni perche la stessa etichetta serve nelle tabelle di keyword e
// termini, dove si mostra cosa e gia stato deciso su quella parola.
export const ETICHETTA_OPERAZIONE: Record<string, string> = {
  pausa_campagna: "Pausa campagna",
  attiva_campagna: "Riattiva campagna",
  budget: "Cambio budget",
  pausa_keyword: "In pausa",
  attiva_keyword: "Riattivata",
  negativa: "Esclusa",
  nuova_keyword: "Aggiunta",
  nuova_campagna: "Campagna nuova",
  pausa_gruppo: "Pausa gruppo",
  attiva_gruppo: "Riattiva gruppo",
};
