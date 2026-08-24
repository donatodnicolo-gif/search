// Lo STATO DI LAVORAZIONE che arriva dal Customer Service (deluxy-messaging).
//
// Il Customer Service è il decisore dell'evasione (Standard Deluxy §7.2): come
// si lavora un ordine — da_gestire, in pagamento, in ricerca del fornitore,
// gestito — lo decide lui, e ce lo PROPONE via `PATCH /api/v1/ordini/:id`
// (campo `csGestione`). Qui Orders lo mostra soltanto: NON è la nostra pipeline
// (`StatoOrdine`), che è un'altra cosa (registro e controllo). Le due stanno
// una accanto all'altra sulla scheda dell'ordine.
//
// ⚠️ Il vocabolario è del Customer Service, non nostro: se un giorno là ne
// aggiungono uno, qui NON deve sparire. Per questo `etichettaLavorazioneCs`
// ripiega sul codice grezzo (reso leggibile) invece di scartarlo, e il colore
// cade sul neutro. Meglio uno stato sconosciuto ma mostrato che uno perso.

export type StatoLavorazioneCs = {
  /** L'etichetta da mostrare a schermo. */
  nome: string;
  /** Variabile CSS del colore del pallino/della pill. */
  colore: string;
  /** Una riga che spiega cosa vuol dire, per il title/tooltip. */
  spiega: string;
};

// I codici visti sui dati veri del Customer Service (24/08/2026): gestito 830,
// da_gestire 501, attesa_consegna 5, in_pagamento 4, ricerca_fornitore 1; più
// `comunicazione`, dichiarato nel modello di là.
export const STATI_LAVORAZIONE_CS: Record<string, StatoLavorazioneCs> = {
  da_gestire: {
    nome: "Da gestire",
    colore: "var(--text-secondary)",
    spiega: "Il Customer Service non l'ha ancora preso in mano.",
  },
  ricerca_fornitore: {
    nome: "Ricerca fornitore",
    colore: "var(--orange)",
    spiega: "Si sta cercando chi prepara e consegna l'ordine.",
  },
  in_pagamento: {
    nome: "In pagamento",
    colore: "var(--gold-strong)",
    spiega: "In attesa che il cliente paghi, o che si paghi il fornitore.",
  },
  comunicazione: {
    nome: "In comunicazione",
    colore: "var(--blue)",
    spiega: "Scambio in corso col cliente o col fornitore.",
  },
  attesa_consegna: {
    nome: "In attesa di consegna",
    colore: "var(--blue)",
    spiega: "Tutto concordato: si aspetta che la consegna avvenga.",
  },
  gestito: {
    nome: "Gestito",
    colore: "var(--green)",
    spiega: "Il Customer Service ha chiuso la sua lavorazione dell'ordine.",
  },
};

/**
 * L'etichetta leggibile di uno stato di lavorazione del Customer Service.
 * `""` (nessuno stato comunicato) torna `null`: la scheda non si mostra affatto.
 * Un codice sconosciuto NON si scarta: si rende leggibile (underscore → spazi,
 * iniziale maiuscola) col colore neutro, perché il vocabolario è del CS e può
 * crescere senza avvisare.
 */
export function etichettaLavorazioneCs(codice: string | null | undefined): StatoLavorazioneCs | null {
  const c = (codice ?? "").trim();
  if (!c) return null;
  const noto = STATI_LAVORAZIONE_CS[c];
  if (noto) return noto;
  const leggibile = c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
  return {
    nome: leggibile,
    colore: "var(--text-secondary)",
    spiega: "Stato di lavorazione del Customer Service.",
  };
}
