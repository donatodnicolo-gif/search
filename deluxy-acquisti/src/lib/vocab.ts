// Vocabolario condiviso dell'app: stati, categorie, priorità, tipi di movimento
// e valute. Un'unica fonte per etichette e colori, così UI e AI parlano la
// stessa lingua. I colori sono nomi di token del Deluxy Design System.

export type Voce = { codice: string; etichetta: string; colore: string };

// ─── Stato della RICHIESTA di acquisto ───
export const STATI_RICHIESTA: Voce[] = [
  { codice: "inviata", etichetta: "Da approvare", colore: "var(--orange)" },
  { codice: "approvata", etichetta: "Approvata", colore: "var(--green)" },
  { codice: "rifiutata", etichetta: "Rifiutata", colore: "var(--red)" },
  { codice: "convertita", etichetta: "Convertita in acquisto", colore: "var(--blue)" },
  { codice: "annullata", etichetta: "Annullata", colore: "var(--text-tertiary)" },
];

// ─── Stato dell'ACQUISTO ───
export const STATI_ACQUISTO: Voce[] = [
  { codice: "ordinato", etichetta: "Ordinato", colore: "var(--blue)" },
  { codice: "ricevuto", etichetta: "Ricevuto", colore: "var(--purple)" },
  { codice: "pagato_parziale", etichetta: "Pagato in parte", colore: "var(--orange)" },
  { codice: "pagato", etichetta: "Pagato", colore: "var(--green)" },
  { codice: "annullato", etichetta: "Annullato", colore: "var(--text-tertiary)" },
];

// ─── Tipo di MOVIMENTO finanziario ───
export const TIPI_MOVIMENTO: Voce[] = [
  { codice: "acconto", etichetta: "Acconto", colore: "var(--orange)" },
  { codice: "saldo", etichetta: "Saldo", colore: "var(--green)" },
  { codice: "pagamento", etichetta: "Pagamento", colore: "var(--blue)" },
  { codice: "nota_credito", etichetta: "Nota di credito", colore: "var(--purple)" },
  { codice: "rimborso", etichetta: "Rimborso", colore: "var(--text-secondary)" },
];

export const STATI_MOVIMENTO: Voce[] = [
  { codice: "eseguito", etichetta: "Eseguito", colore: "var(--green)" },
  { codice: "previsto", etichetta: "Previsto", colore: "var(--orange)" },
];

export const METODI_PAGAMENTO = ["bonifico", "sepa", "carta", "contanti", "altro"] as const;

// ─── Priorità (richieste) ───
export const PRIORITA: Voce[] = [
  { codice: "bassa", etichetta: "Bassa", colore: "var(--text-tertiary)" },
  { codice: "media", etichetta: "Media", colore: "var(--blue)" },
  { codice: "alta", etichetta: "Alta", colore: "var(--orange)" },
  { codice: "urgente", etichetta: "Urgente", colore: "var(--red)" },
];

// ─── Categorie di spesa ───
export const CATEGORIE: string[] = [
  "Materie prime",
  "Confezionamento",
  "Fiori e piante",
  "Logistica e trasporti",
  "Marketing e ADV",
  "Attrezzature",
  "Software e licenze",
  "Servizi professionali",
  "Ufficio e cancelleria",
  "Manutenzioni",
  "Altro",
];

export const VALUTE = ["EUR", "USD", "GBP", "CHF"] as const;

// ─── Helper ───
export function voce(elenco: Voce[], codice: string | null | undefined): Voce {
  return (
    elenco.find((v) => v.codice === codice) ?? {
      codice: codice ?? "",
      etichetta: codice ?? "—",
      colore: "var(--text-tertiary)",
    }
  );
}

export function formattaImporto(importo: number, valuta = "EUR"): string {
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(
      importo || 0,
    );
  } catch {
    return `${(importo || 0).toFixed(2)} ${valuta}`;
  }
}

export function formattaData(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const data = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(
    data,
  );
}
