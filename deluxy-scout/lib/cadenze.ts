// Cadenze per canale (docs/VISIONE-COMMERCIALE.md): i ritmi di ricontatto che
// l'app applica DA SOLA, così la disciplina commerciale non dipende dalla
// memoria del venditore.
//
// - Territorio/Telefono: dopo una visita, richiamo a 3g (interessato) o 7g
//   (da richiamare) — già in metrics.daRicontattare.
// - Web: un lead nuovo va risposto entro GIORNI_RISPOSTA_LEAD, poi è in ritardo;
//   la trattativa nata da un lead parte con follow-up a GIORNI_FOLLOWUP_LEAD.
// - Pipeline: nessuna trattativa senza prossima scadenza — se non la scegli,
//   l'app ne mette una a GIORNI_FOLLOWUP_DEAL.

export const GIORNI_RISPOSTA_LEAD = 2; // sul web chi tarda perde
export const GIORNI_FOLLOWUP_LEAD = 3; // primo follow-up di un lead qualificato
export const GIORNI_FOLLOWUP_DEAL = 7; // default per ogni trattativa nuova senza scadenza

/** Data ISO (YYYY-MM-DD) a N giorni da oggi. */
export function traGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
