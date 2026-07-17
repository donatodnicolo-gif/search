import { cambiaStato } from "@/lib/azioni";
import { COLORE_STATO, ETICHETTE_STATO, STATI, isStato } from "@/lib/stati";

// Pillole degli stati nella scheda partner: quella attuale è evidenziata,
// un click su un'altra fa passare l'anagrafica a quello stato.
export function SelettoreStato({ partnerId, statoAttuale }: { partnerId: string; statoAttuale: string }) {
  return (
    <form action={cambiaStato.bind(null, partnerId)} className="selettore-stato">
      {STATI.map((s) => {
        const attuale = s === statoAttuale;
        return (
          <button
            key={s}
            type="submit"
            name="stato"
            value={s}
            disabled={attuale}
            className={`stato-pill${attuale ? " attuale" : ""}`}
            style={attuale ? { color: COLORE_STATO[s] } : undefined}
            title={attuale ? "Stato attuale" : `Passa a "${ETICHETTE_STATO[s]}"`}
          >
            <span className="dot" />
            <span className="stato-label">{ETICHETTE_STATO[s]}</span>
          </button>
        );
      })}
      {/* Stato fuori catalogo (dati storici): lo si vede comunque */}
      {!isStato(statoAttuale) && (
        <span className="stato-pill attuale" style={{ color: "var(--text-tertiary)" }}>
          <span className="dot" />
          <span className="stato-label">{statoAttuale}</span>
        </span>
      )}
    </form>
  );
}
