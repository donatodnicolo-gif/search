import type { Compenso, Inquadramento } from "@prisma/client";

// Vocabolario e regole di lettura dell'organico. Le regole di calcolo stanno
// QUI e in nessun'altra pagina: due pagine che si calcolano lo stesso numero
// per conto loro prima o poi danno due numeri (lezione di Budgets).

export const TIPI_CONTRATTO = [
  { chiave: "indeterminato", nome: "Tempo indeterminato" },
  { chiave: "determinato", nome: "Tempo determinato" },
  { chiave: "apprendistato", nome: "Apprendistato" },
  { chiave: "collaborazione", nome: "Collaborazione (co.co.co.)" },
  { chiave: "partita_iva", nome: "Partita IVA" },
  { chiave: "stage", nome: "Stage / tirocinio" },
  { chiave: "altro", nome: "Altro" },
] as const;

export function nomeTipoContratto(chiave: string): string {
  return TIPI_CONTRATTO.find((t) => t.chiave === chiave)?.nome ?? (chiave || "non indicato");
}

export const QUALIFICHE = ["operaio", "impiegato", "quadro", "dirigente"] as const;

export const FREQUENZE_ATTIVITA = ["giornaliera", "settimanale", "mensile", "su richiesta"] as const;

export const MOTIVI_COMPENSO = [
  { chiave: "assunzione", nome: "Assunzione" },
  { chiave: "aumento", nome: "Aumento" },
  { chiave: "promozione", nome: "Promozione" },
  { chiave: "adeguamento_ccnl", nome: "Adeguamento CCNL" },
  { chiave: "altro", nome: "Altro" },
] as const;

export function nomeMotivoCompenso(chiave: string): string {
  return MOTIVI_COMPENSO.find((m) => m.chiave === chiave)?.nome ?? (chiave || "—");
}

// La riga "corrente" di una storia è quella con la decorrenza più recente NON
// futura: una variazione già registrata con decorrenza al mese prossimo non è
// ancora vera oggi. Se esistono solo righe future, non c'è un corrente.
function corrente<T extends { decorrenza: Date }>(righe: T[], oggi = new Date()): T | null {
  const passate = righe.filter((r) => r.decorrenza.getTime() <= oggi.getTime());
  if (passate.length === 0) return null;
  return passate.reduce((a, b) => (a.decorrenza.getTime() >= b.decorrenza.getTime() ? a : b));
}

export function inquadramentoCorrente(righe: Inquadramento[]): Inquadramento | null {
  return corrente(righe);
}

export function compensoCorrente(righe: Compenso[]): Compenso | null {
  return corrente(righe);
}

// Costo azienda annuo: RAL × (1 + contributi%). SOLO se la percentuale di
// contributi è dichiarata: senza quell'ingrediente il costo è "non
// calcolabile", non zero (regola Deluxy sui dati mancanti).
export function costoAziendaAnnuo(compenso: Compenso | null): number | null {
  if (!compenso || compenso.contributiPct == null) return null;
  const ral = Number(compenso.ral);
  const pct = Number(compenso.contributiPct);
  if (!Number.isFinite(ral) || !Number.isFinite(pct)) return null;
  return ral * (1 + pct / 100);
}

// Un contratto a scadenza si segnala: entro 60 giorni è "in scadenza",
// oltre la data è "scaduto".
export function statoScadenza(scadenza: Date | null, oggi = new Date()): "ok" | "in_scadenza" | "scaduto" | null {
  if (!scadenza) return null;
  const giorni = (scadenza.getTime() - oggi.getTime()) / 86_400_000;
  if (giorni < 0) return "scaduto";
  if (giorni <= 60) return "in_scadenza";
  return "ok";
}
