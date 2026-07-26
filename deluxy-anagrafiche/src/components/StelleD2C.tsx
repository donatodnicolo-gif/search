import { FASCE, FASCIA_SENZA_DATI, SOGLIA_AFFIDABILE, formattaVoto } from "@/lib/feedback-d2c";

// Come si mostra la valutazione D2C, ovunque allo stesso modo.
// Senza feedback NON si stampa uno zero: si scrive «Da valutare», altrimenti
// un partner mai giudicato sembrerebbe pessimo.
export function StelleD2C({
  voto,
  feedback,
  compatto,
  soloStelle,
}: {
  voto: number | null;
  feedback: number;
  compatto?: boolean;
  /** Voto di un singolo feedback: niente conteggio né "indicativo". */
  soloStelle?: boolean;
}) {
  const valore = feedback > 0 ? voto : null;
  if (valore == null) {
    return (
      <span className="d2c-vuoto" title="Nessun feedback ancora ricevuto">
        {compatto ? "—" : "Da valutare"}
      </span>
    );
  }
  const fascia = FASCE.find((f) => valore >= f.min) ?? FASCE[FASCE.length - 1];
  const indicativo = !soloStelle && feedback < SOGLIA_AFFIDABILE;
  const pieni = Math.round(valore);
  const titolo = soloStelle
    ? `${pieni} su 5`
    : `${fascia.etichetta} · ${formattaVoto(valore)} su 5 · ${feedback} feedback${
        indicativo ? " (pochi: voto indicativo)" : ""
      }`;
  return (
    <span className="d2c" title={titolo} style={{ color: fascia.colore }}>
      <span className="d2c-stelle" aria-label={titolo}>
        {"★".repeat(pieni)}
        <span className="d2c-stelle-vuote">{"★".repeat(5 - pieni)}</span>
      </span>
      {!soloStelle && (
        <>
          <span className="d2c-voto">{formattaVoto(valore)}</span>
          <span className="d2c-conta">
            {compatto ? `(${feedback})` : `${feedback} feedback`}
            {indicativo ? " · indicativo" : ""}
          </span>
        </>
      )}
    </span>
  );
}

// Badge testuale della fascia (Eccellente / Buono / … / Da valutare).
export function FasciaD2C({ voto, feedback }: { voto: number | null; feedback: number }) {
  const valore = feedback > 0 ? voto : null;
  const fascia = valore == null ? FASCIA_SENZA_DATI : (FASCE.find((f) => valore >= f.min) ?? FASCE[FASCE.length - 1]);
  return (
    <span className="badge" style={{ color: fascia.colore }}>
      <span className="dot" />
      <span style={{ color: "var(--text)" }}>{fascia.etichetta}</span>
    </span>
  );
}
