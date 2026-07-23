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
