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
  email: "Email",
  sito: "Sito / landing",
  seo: "SEO",
  crm: "CRM / pubblici",
  social: "Social organico",
  altro: "Altro",
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

export const STATI_CAMPAGNA = [
  "bozza",
  "in_apprendimento",
  "attiva",
  "in_pausa",
  "conclusa",
] as const;

export const ETICHETTA_STATO_CAMPAGNA: Record<string, string> = {
  bozza: "Bozza",
  in_apprendimento: "In apprendimento",
  attiva: "Attiva",
  in_pausa: "In pausa",
  conclusa: "Conclusa",
};

export const COLORE_STATO_CAMPAGNA: Record<string, string> = {
  bozza: "var(--text-tertiary)",
  in_apprendimento: "var(--gold-strong)",
  attiva: "var(--green)",
  in_pausa: "var(--orange)",
  conclusa: "var(--text-secondary)",
};

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
  in_pausa: "var(--orange)",
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
