/**
 * Mappa UNICA stato consegna → colore (Libro UX&UI cap. 5).
 *
 * ⚠️ DIFETTO 4/5 (27/08/2026): questa mappa era COPIATA cinque volte e
 * divergente. Il caso pericoloso: `not_delivered` usciva ROSSA nella lista
 * (`deliveries-list`) e GRIGIA sulla mappa (`delivery-map`) — lo stesso stato,
 * due colori, e chi smista leggeva «fallita da recuperare» in un posto e
 * «archiviata, non toccare» nell'altro. Da qui in poi la fonte e' UNA sola.
 *
 * I valori sono i colori dei token del Design System (styles.css) espressi in
 * esadecimale, perche' i pin di Google Maps e i marker inline vogliono un
 * colore concreto, non `var(--…)`. Ogni riga cita il token che replica.
 *
 * DEROGA ANNOTATA — «legenda storica consegne» (Libro cap.5, verdetto 2–1):
 * chi smista da anni legge `created` = ROSSO («da lavorare adesso»), e la stessa
 * urgenza vale per `not_delivered` e `not_accepted` (tutti e tre chiedono un
 * intervento ADESSO). Il giallo di «In gestione» e' il token `--amber`, nato
 * apposta per questa legenda e sempre accompagnato dal testo dello stato.
 * Chi cambia questi colori senza una migrazione governata reintroduce gli
 * errori di smistamento.
 */
export const STATO_CONSEGNA_COLORE: Record<string, string> = {
  created: '#d70015', //                  --red    · Da gestire: intervento adesso
  assigned: '#e6b800', //                 --amber   · In gestione (legenda storica)
  in_preparation: '#ff9500', //           arancio legacy (nessun token): In preparazione
  accepted: '#0071e3', //                 --blue    · Accettata: in lavorazione
  in_delivery: '#6d3fc4', //              --purple  · In consegna: fase speciale
  cancellation_requested: '#5ac8fa', //   azzurro legacy (nessun token): Cancellazione richiesta
  delivered: '#248a3d', //                --green   · Consegnata
  approved: '#248a3d', //                 --green   · Approvata
  delivered_time_to_approve: '#ff9500', //arancio legacy: ore da approvare
  not_delivered: '#d70015', //            --red    · Non consegnata: intervento adesso (era grigia sulla mappa)
  not_accepted: '#d70015', //             --red    · Non accettata: intervento adesso
  cancelled: '#8a8a8e', //                --grey    · terminato/inerte
  invalidated: '#8a8a8e', //              --grey    · annullata d'ufficio
  archived: '#8a8a8e', //                 --grey    · archiviata
};

/** Neutro per uno stato sconosciuto (terminato/inerte). Pari a `--grey`. */
export const STATO_CONSEGNA_COLORE_DEFAULT = '#8a8a8e';

/** Colore dello stato, con ripiego sul neutro. */
export function coloreStato(status: string): string {
  return STATO_CONSEGNA_COLORE[status] ?? STATO_CONSEGNA_COLORE_DEFAULT;
}
