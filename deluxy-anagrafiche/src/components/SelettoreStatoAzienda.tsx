import { cambiaLivello, cambiaStatoAnalisi, cambiaStatoFinanziario, cambiaStatoFornitore } from "@/lib/azioni";
import {
  COLORE_LIVELLO,
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  COLORE_STATO_FORNITORE,
  DESCRIZIONI_STATO_ANALISI,
  ETICHETTE_LIVELLO,
  ETICHETTE_STATO_FINANZIARIO,
  ETICHETTE_STATO_FORNITORE,
  LIVELLI,
  STATI_ANALISI,
  STATI_FINANZIARI,
  STATI_FORNITORE,
  isLivello,
  isStatoAnalisi,
  isStatoFinanziario,
  isStatoFornitore,
} from "@/lib/stati";

export type DimensioneAzienda = "livello" | "finanziario" | "analisi" | "fornitore";

type Voce = { valore: string; etichetta: string; colore: string };

// Le dimensioni diverse da quella commerciale, tutte con la stessa meccanica:
// pillole, una sola scelta, la corrente disabilitata. Aggiungerne una vuol dire
// una riga qui, non un altro componente.
const DIMENSIONI: Record<
  DimensioneAzienda,
  { campo: string; azione: (id: string, fd: FormData) => Promise<void>; voci: Voce[]; noto: (v: string | null) => boolean }
> = {
  // Vuoto è una scelta legittima e va offerta: un'anagrafica appena nata non è
  // «in contatto», e senza la pillola «Non indicato» il livello si potrebbe
  // solo mettere, mai togliere.
  livello: {
    campo: "livello",
    azione: cambiaLivello,
    voci: [
      ...LIVELLI.map((l) => ({ valore: l as string, etichetta: ETICHETTE_LIVELLO[l], colore: COLORE_LIVELLO[l] })),
      { valore: "", etichetta: "Non indicato", colore: "var(--text-tertiary)" },
    ],
    noto: (v) => !v || isLivello(v),
  },
  finanziario: {
    campo: "statoFinanziario",
    azione: cambiaStatoFinanziario,
    voci: STATI_FINANZIARI.map((s) => ({
      valore: s as string,
      etichetta: ETICHETTE_STATO_FINANZIARIO[s],
      colore: COLORE_STATO_FINANZIARIO[s],
    })),
    noto: (v) => isStatoFinanziario(v ?? ""),
  },
  analisi: {
    campo: "statoAnalisi",
    azione: cambiaStatoAnalisi,
    voci: [
      ...STATI_ANALISI.map((s) => ({
        valore: s as string,
        etichetta: DESCRIZIONI_STATO_ANALISI[s],
        colore: COLORE_STATO_ANALISI[s],
      })),
      { valore: "", etichetta: "Non analizzata", colore: "var(--text-tertiary)" },
    ],
    noto: (v) => !v || isStatoAnalisi(v),
  },
  // Vuoto = non è un nostro fornitore: è la voce che TOGLIE il ruolo, e senza
  // di lei un'azienda segnata fornitore per sbaglio lo resterebbe per sempre.
  fornitore: {
    campo: "statoFornitore",
    azione: cambiaStatoFornitore,
    voci: [
      ...STATI_FORNITORE.map((s) => ({
        valore: s as string,
        etichetta: ETICHETTE_STATO_FORNITORE[s],
        colore: COLORE_STATO_FORNITORE[s],
      })),
      { valore: "", etichetta: "Non fornitore", colore: "var(--text-tertiary)" },
    ],
    noto: (v) => !v || isStatoFornitore(v),
  },
};

// Pillole di livello / stato finanziario / stato analisi nella scheda azienda:
// gemelle di SelettoreStato (che governa lo stato commerciale), una riga per
// dimensione.
export function SelettoreStatoAzienda({
  partnerId,
  dimensione,
  statoAttuale,
}: {
  partnerId: string;
  dimensione: DimensioneAzienda;
  statoAttuale: string | null;
}) {
  const { campo, azione, voci, noto } = DIMENSIONI[dimensione];

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
      {!noto(statoAttuale) && (
        <span className="stato-pill attuale" style={{ color: "var(--text-tertiary)" }}>
          <span className="dot" />
          <span className="stato-label">{statoAttuale}</span>
        </span>
      )}
    </form>
  );
}
