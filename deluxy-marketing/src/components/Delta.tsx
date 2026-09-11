import { variazione } from "@/lib/periodo";

// La variazione rispetto al confronto scelto nei filtri, in una riga sola.
//
// ⚠️ STA IN UN FILE SUO perché ne esistevano già due copie divergenti: una
// dentro la dashboard di un brand (che mostrava due delta fissi, «Δ» e «Δa») e
// una nessuna — le tabelle non ne avevano affatto. Il colore, il segno e il
// caso «non calcolabile» sono tre decisioni, e tre decisioni ricopiate
// divergono: la stessa crescita del 12% si sarebbe colorata in due modi nella
// stessa pagina.

/**
 * ⚠️ `prima === 0` NON è «+100%», è **non calcolabile**: una divisione per zero
 * non diventa una notizia perché fa comodo. Si mostra «—» col motivo nel
 * suggerimento, e chi guarda sa che il confronto non c'è — invece di leggere
 * una crescita inventata.
 *
 * ⚠️ E `invertito` serve alle voci in cui **scendere è buono** (la spesa, il
 * costo per ordine): senza, un risparmio del 20% si colorava di rosso e
 * sembrava un peggioramento.
 */
export function Delta({
  ora,
  prima,
  invertito,
  etichetta,
  sotto,
}: {
  ora: number;
  prima: number;
  /** true = scendere è un miglioramento (spesa, costi). */
  invertito?: boolean;
  /** Il nome del confronto, per il suggerimento: «periodo precedente», «stesso periodo 2025»… */
  etichetta?: string;
  /** true = riga sotto il numero (nelle tabelle), invece che accanto (nelle tessere). */
  sotto?: boolean;
}) {
  const v = variazione(ora, prima);
  const titolo = etichetta ? `rispetto a: ${etichetta}` : undefined;

  if (v == null) {
    return (
      <i
        className={sotto ? "cella-sub" : undefined}
        style={{ fontStyle: "normal", color: "var(--text-tertiary)", display: sotto ? "block" : undefined }}
        title={
          prima === 0
            ? `Nel confronto (${etichetta ?? "periodo di confronto"}) questo valore era zero: la variazione non è calcolabile, non è +100%.`
            : titolo
        }
      >
        —
      </i>
    );
  }

  const positivo = invertito ? v < 0 : v > 0;
  return (
    <i
      className={sotto ? "cella-sub" : undefined}
      style={{
        fontStyle: "normal",
        fontSize: 11.5,
        fontVariantNumeric: "tabular-nums",
        color: positivo ? "var(--green)" : "var(--red)",
        display: sotto ? "block" : undefined,
      }}
      title={titolo}
    >
      {v > 0 ? "+" : ""}
      {v.toFixed(0)}%
    </i>
  );
}
