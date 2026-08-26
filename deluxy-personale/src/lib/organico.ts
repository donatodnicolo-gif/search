import type { Compenso, Inquadramento } from "@prisma/client";

// La stessa normalizzazione con cui Hub e import riconoscono le persone:
// minuscole, senza accenti, spazi compressi. Vive qui e in nessun altro posto.
export function normalizzaNome(nome: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Vocabolario e regole di lettura dell'organico. Le regole di calcolo stanno
// QUI e in nessun'altra pagina: due pagine che si calcolano lo stesso numero
// per conto loro prima o poi danno due numeri (lezione di Budgets).

// Comprende anche i tipi con cui ragiona Budgets (Dipendente, Consulente;
// Stagista = stage): sono selezionabili come gli altri — deciso dall'utente il
// 24/08, «dovresti poter importare anche tipo contratto da budget». Chi vuole
// la forma legale precisa (indeterminato, apprendistato…) la sceglie apposta.
export const TIPI_CONTRATTO = [
  { chiave: "dipendente", nome: "Dipendente" },
  { chiave: "indeterminato", nome: "Tempo indeterminato" },
  { chiave: "determinato", nome: "Tempo determinato" },
  { chiave: "apprendistato", nome: "Apprendistato" },
  { chiave: "collaborazione", nome: "Collaborazione (co.co.co.)" },
  { chiave: "partita_iva", nome: "Partita IVA" },
  { chiave: "consulente", nome: "Consulente" },
  { chiave: "stage", nome: "Stage / tirocinio" },
  { chiave: "altro", nome: "Altro" },
] as const;

export function nomeTipoContratto(chiave: string): string {
  return TIPI_CONTRATTO.find((t) => t.chiave === chiave)?.nome ?? (chiave || "non indicato");
}

// Tipi AUTONOMI: fatturano un compenso, non hanno una RAL — niente mensilità,
// niente netto in busta, e il costo azienda è il compenso stesso salvo oneri
// pattuiti in più (es. rivalsa INPS). La collaborazione co.co.co. NON è qui:
// ha i contributi di gestione separata a carico committente, quindi resta nel
// mondo «RAL + contributi».
export const TIPI_AUTONOMI = ["partita_iva", "consulente"] as const;

export function eAutonomo(tipoContratto: string | null | undefined): boolean {
  return tipoContratto != null && (TIPI_AUTONOMI as readonly string[]).includes(tipoContratto);
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

// I quattro benefit con cui si parte (pagina /benefit, bottone «Crea i tipi
// di base»). Sono un seme, non un limite: l'amministratore aggiunge da lì
// tutti i tipi che vuole.
export const TIPI_BENEFIT_BASE = [
  { nome: "Buoni pasto", descrizione: "Ticket giornalieri: nel dettaglio il valore del singolo buono" },
  { nome: "Cellulare aziendale", descrizione: "Telefono e/o SIM: nel dettaglio il modello o il numero" },
  { nome: "PC aziendale", descrizione: "Computer di lavoro: nel dettaglio il modello" },
  { nome: "Auto aziendale", descrizione: "Vettura a uso promiscuo o di servizio: nel dettaglio modello e targa" },
] as const;

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

// La prima riga con decorrenza FUTURA: chi oggi non ha un corrente ma ha una
// decorrenza davanti (assunzione a settembre) non è «da inquadrare» — è
// «decorre dal …», e le pagine lo devono dire.
export function prossimaDecorrenza<T extends { decorrenza: Date }>(righe: T[], oggi = new Date()): T | null {
  const future = righe.filter((r) => r.decorrenza.getTime() > oggi.getTime());
  if (future.length === 0) return null;
  return future.reduce((a, b) => (a.decorrenza.getTime() <= b.decorrenza.getTime() ? a : b));
}

// Costo azienda annuo: lordo × (1 + contributi%). Per i DIPENDENTI serve la
// percentuale dichiarata: senza quell'ingrediente il costo è "non
// calcolabile", non zero (regola Deluxy sui dati mancanti). Per gli AUTONOMI
// il costo è il compenso per costruzione (su una fattura non ci sono oneri
// datoriali nascosti): contributi assenti = compenso pieno, non "non so".
export function costoAziendaAnnuo(
  compenso: Compenso | null,
  opzioni: { autonomo?: boolean } = {},
): number | null {
  if (!compenso) return null;
  const lordo = Number(compenso.ral);
  if (!Number.isFinite(lordo)) return null;
  if (compenso.contributiPct == null) {
    return opzioni.autonomo ? Math.round(lordo * 100) / 100 : null;
  }
  const pct = Number(compenso.contributiPct);
  if (!Number.isFinite(pct)) return null;
  // Al centesimo: 18.750 × 1,38 in virgola mobile fa 25874,999…96, e un'API
  // che lo restituisce così sporca ogni consumatore a valle.
  return Math.round(lordo * (1 + pct / 100) * 100) / 100;
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
