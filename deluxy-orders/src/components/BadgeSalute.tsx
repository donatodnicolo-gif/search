import { ETICHETTE_SALUTE, saluteOrdine, type OrdineDaValutare } from "@/lib/salute";
import { motivoLeggibile, pagamentoLeggibile, rischioLeggibile } from "@/lib/ordini";

/**
 * La SALUTE dell'ordine in una pillola: conforme, a rischio, non pagato,
 * cancellato, nullo. La regola sta in `salute.ts` — qui si mostra soltanto.
 *
 * ⚠️ La pillola non dice solo il verdetto, dice anche PERCHÉ: «Cancellato ·
 * magazzino», «A rischio · rischio alto», «Non pagato · in attesa». Senza il
 * dettaglio si perderebbe quello che i vecchi badge (annullato con motivo,
 * rischio col livello) dicevano già, e un verdetto senza motivo è un verdetto
 * di cui non ci si fida.
 *
 * `mostraConforme` è falso di default: nelle card, dove lo spazio è poco,
 * ripetere «Conforme» su 95 righe su 100 sarebbe rumore — lì la pillola
 * compare solo quando c'è qualcosa da sapere. Nella tabella invece la colonna
 * esiste per tutti e la si accende (`mostraConforme`), perché una cella vuota
 * si legge come «non lo sappiamo».
 */
export function BadgeSalute({
  ordine,
  mostraConforme = false,
}: {
  ordine: OrdineDaValutare & { rischioMotivi?: string | null };
  mostraConforme?: boolean;
}) {
  const s = saluteOrdine(ordine);
  if (s === "conforme" && !mostraConforme) return null;
  const e = ETICHETTE_SALUTE[s];

  let dettaglio: string | null = null;
  if (s === "a_rischio") dettaglio = rischioLeggibile(ordine.rischioLivello);
  else if (s === "cancellato" || s === "nullo") dettaglio = motivoLeggibile(ordine.motivoAnnullamento);
  else if (s === "non_pagato") dettaglio = pagamentoLeggibile(ordine.financialStatus);

  // I motivi del rischio ce li dà Shopify e sono la cosa più utile da leggere
  // prima di decidere: finiscono nel tooltip, sotto la spiegazione.
  const motivi = s === "a_rischio" && ordine.rischioMotivi ? `\n${ordine.rischioMotivi}` : "";

  return (
    <span className={`badge-salute salute-${s}`} title={`${e.spiega}${motivi}`}>
      <span className="dot" style={{ background: e.colore }} aria-hidden="true" />
      {e.nome}
      {dettaglio ? <span className="badge-salute-dettaglio"> · {dettaglio}</span> : null}
    </span>
  );
}
