// Etichette e colori di PRESENTAZIONE per i valori che arrivano da Orders.
// I valori canonici (chiavi di liste, tipi, stati) vivono in Orders: qui c'è
// solo come mostrarli — colore semantico del design system e nome leggibile.

export const SEGMENTI: Record<string, { nome: string; colore: string }> = {
  vip: { nome: "VIP", colore: "var(--gold-strong)" },
  "da-non-perdere": { nome: "Da non perdere", colore: "var(--orange)" },
  fedele: { nome: "Fedele", colore: "var(--green)" },
  ricorrente: { nome: "Ricorrente", colore: "var(--blue)" },
  nuovo: { nome: "Nuovo", colore: "var(--blue)" },
  "una-tantum": { nome: "Una tantum", colore: "var(--text-secondary)" },
  "da-riattivare": { nome: "Da riattivare", colore: "var(--orange)" },
  perso: { nome: "Perso", colore: "var(--red)" },
};

export function segmento(chiave: string | null | undefined): { nome: string; colore: string } {
  if (!chiave) return { nome: "—", colore: "var(--text-tertiary)" };
  return SEGMENTI[chiave] ?? { nome: chiave, colore: "var(--text-secondary)" };
}

export const TIPI_RICORRENZA: Record<string, { nome: string; colore: string }> = {
  "da-precisare": { nome: "Da precisare", colore: "var(--text-secondary)" },
  compleanno: { nome: "Compleanno", colore: "var(--purple)" },
  anniversario: { nome: "Anniversario", colore: "var(--gold-strong)" },
  matrimonio: { nome: "Matrimonio", colore: "var(--gold)" },
  nascita: { nome: "Nascita o battesimo", colore: "var(--green)" },
  laurea: { nome: "Laurea o traguardo", colore: "var(--blue)" },
  ricorrenza: { nome: "Festa o ricorrenza", colore: "var(--orange)" },
  ringraziamento: { nome: "Ringraziamento", colore: "var(--text-secondary)" },
  condoglianze: { nome: "Condoglianze", colore: "var(--red)" },
  altro: { nome: "Altro", colore: "var(--text-tertiary)" },
};

export function tipoRicorrenza(chiave: string): { nome: string; colore: string } {
  return TIPI_RICORRENZA[chiave] ?? { nome: chiave, colore: "var(--text-secondary)" };
}

export const STATI_INVITO: Record<string, { nome: string; colore: string }> = {
  da_invitare: { nome: "Da invitare", colore: "var(--text-secondary)" },
  invitato: { nome: "Invitato", colore: "var(--blue)" },
  confermato: { nome: "Confermato", colore: "var(--green)" },
  declinato: { nome: "Declinato", colore: "var(--red)" },
  partecipato: { nome: "Partecipato", colore: "var(--purple)" },
};

export function statoInvito(chiave: string): { nome: string; colore: string } {
  return STATI_INVITO[chiave] ?? { nome: chiave, colore: "var(--text-secondary)" };
}

export const STATI_EVENTO: Record<string, { nome: string; colore: string }> = {
  bozza: { nome: "Bozza", colore: "var(--text-secondary)" },
  aperto: { nome: "Aperto", colore: "var(--blue)" },
  concluso: { nome: "Concluso", colore: "var(--green)" },
  annullato: { nome: "Annullato", colore: "var(--red)" },
};

export function statoEvento(chiave: string): { nome: string; colore: string } {
  return STATI_EVENTO[chiave] ?? { nome: chiave, colore: "var(--text-secondary)" };
}

export const TIPI_ATTIVITA: Record<string, string> = {
  nota: "Nota",
  chiamata: "Chiamata",
  email: "Email",
  incontro: "Incontro",
  whatsapp: "WhatsApp",
  ordine: "Ordine",
  altro: "Altro",
};

// La programmazione: cosa faremo CON un cliente, e com'è finita.
export const STATI_PROGRAMMAZIONE: Record<string, { nome: string; colore: string }> = {
  da_fare: { nome: "Da fare", colore: "var(--blue)" },
  fatta: { nome: "Fatta", colore: "var(--green)" },
  annullata: { nome: "Annullata", colore: "var(--text-tertiary)" },
};

export function statoProgrammazione(chiave: string): { nome: string; colore: string } {
  return STATI_PROGRAMMAZIONE[chiave] ?? { nome: chiave, colore: "var(--text-secondary)" };
}

export const MESI = [
  "",
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

export function giornoMese(giorno: number, mese: number): string {
  return `${giorno} ${MESI[mese] ?? ""}`.trim();
}

// Le ricorrenze sono PROSPETTICHE: «15 settembre, fra 5 giorni» vuol dire la
// data di quest'anno (o del prossimo, se è già passata) — sulla base di ciò
// che il cliente ha ordinato negli anni scorsi. Qui si calcola quella data
// vera, in ora di Roma, per mostrarla accanto al giorno/mese.
export function dataProspettica(fraGiorni: number, da: Date = new Date()): Date {
  return new Date(da.getTime() + fraGiorni * 86_400_000);
}

// «mar 15 set 2026»: la data corta con il giorno della settimana.
export function dataBreve(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

// "2026-09-15" in ora di Roma: la chiave di un giorno (per raggruppare).
export function chiaveGiorno(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// "14:30" in ora di Roma.
export function oraIt(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function quandoLeggibile(giorni: number): string {
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "domani";
  if (giorni < 30) return `fra ${giorni} giorni`;
  if (giorni < 60) return "fra circa un mese";
  return `fra ${Math.round(giorni / 30)} mesi`;
}

// Le date si mostrano SEMPRE in ora italiana: il server (Vercel) vive in UTC.
export function dataIt(iso: string | Date | null | undefined, conOra = false): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(conOra ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function euro(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
    useGrouping: "always",
  }).format(n);
}
