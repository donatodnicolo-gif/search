import { cambiaStatoAnalisi, cambiaStatoFinanziario } from "@/lib/azioni";
import {
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  DESCRIZIONI_STATO_ANALISI,
  ETICHETTE_STATO_FINANZIARIO,
  STATI_ANALISI,
  STATI_FINANZIARI,
  isStatoAnalisi,
  isStatoFinanziario,
} from "@/lib/stati";

// Pillole dello stato finanziario / analisi nella scheda azienda: gemelle di
// SelettoreStato (che governa lo stato commerciale), una riga per dimensione.
export function SelettoreStatoAzienda({
  partnerId,
  dimensione,
  statoAttuale,
}: {
  partnerId: string;
  dimensione: "finanziario" | "analisi";
  statoAttuale: string | null;
}) {
  const finanziario = dimensione === "finanziario";
  const azione = finanziario ? cambiaStatoFinanziario : cambiaStatoAnalisi;
  const campo = finanziario ? "statoFinanziario" : "statoAnalisi";
  const voci = finanziario
    ? STATI_FINANZIARI.map((s) => ({
        valore: s as string,
        etichetta: ETICHETTE_STATO_FINANZIARIO[s],
        colore: COLORE_STATO_FINANZIARIO[s],
      }))
    : [
        ...STATI_ANALISI.map((s) => ({
          valore: s as string,
          etichetta: DESCRIZIONI_STATO_ANALISI[s],
          colore: COLORE_STATO_ANALISI[s],
        })),
        { valore: "", etichetta: "Non analizzata", colore: "var(--text-tertiary)" },
      ];
  const attualeNoto = finanziario
    ? isStatoFinanziario(statoAttuale ?? "")
    : !statoAttuale || isStatoAnalisi(statoAttuale);

  return (
    <form action={azione.bind(null, partnerId)} className="selettore-stato">
      {voci.map((v) => {
        const attuale = v.valore === (statoAttuale ?? "");
        return (
          <button
            key={v.valore || "vuoto"}
            type="submit"
            name={campo}
            value={v.valore}
            disabled={attuale}
            className={`stato-pill${attuale ? " attuale" : ""}`}
            style={attuale ? { color: v.colore } : undefined}
            title={attuale ? "Stato attuale" : `Passa a "${v.etichetta}"`}
          >
            <span className="dot" />
            <span className="stato-label">{v.etichetta}</span>
          </button>
        );
      })}
      {/* Valore fuori catalogo (scritto da un'app): lo si vede comunque */}
      {!attualeNoto && (
        <span className="stato-pill attuale" style={{ color: "var(--text-tertiary)" }}>
          <span className="dot" />
          <span className="stato-label">{statoAttuale}</span>
        </span>
      )}
    </form>
  );
}
