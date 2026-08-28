// Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): quattro pillole-LINK
// GET + l'azzeramento, un solo parametro `periodo=mese|scorso|trimestre|anno`.
// Le date le traduce `intervalloScorciatoia` in lib/periodo.ts; ogni pagina
// dichiara con un commento su QUALE data dei suoi record si applica.
//
// Stanno FUORI dal form dei filtri, come nell'implementazione di riferimento
// (FINANCE, /fatture): il form non ha un campo `periodo`, quindi il suo submit
// le azzera da solo — il periodo scelto a mano vince.
//
// Le classi sono le pillole già di casa in quest'app (`pill-scelta`,
// `pill-opt`/`attuale`, `riga-chips-scorri` per lo scorrimento su mobile),
// NON le `.chip-link` di FINANCE: riusare le proprie vale più che importarne
// una copia.
export const VOCI_PERIODO = [
  { v: "mese", l: "Mese in corso" },
  { v: "scorso", l: "Mese scorso" },
  { v: "trimestre", l: "Trimestre" },
  { v: "anno", l: "Anno" },
] as const;

export function ChipsPeriodo({
  base,
  periodo,
  altriFiltri,
}: {
  /** Il percorso della pagina, es. "/analisi". */
  base: string;
  /** Il `periodo` con cui si sta guardando la pagina (da searchParams). */
  periodo?: string;
  /**
   * Gli ALTRI parametri attivi, come query string senza `periodo`.
   * ⚠️ Senza questi, cambiare periodo riporterebbe all'elenco COMPLETO:
   * il periodo è una lente, non deve cambiare anche cosa si sta guardando.
   */
  altriFiltri?: string;
}) {
  const coda = (altriFiltri ?? "").replace(/^[?&]+/, "");
  const resto = [...new URLSearchParams(coda).entries()].filter(([k]) => k !== "periodo");
  const query = (conPeriodo?: string) => {
    const u = new URLSearchParams(resto);
    if (conPeriodo) u.set("periodo", conPeriodo);
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const attivo = VOCI_PERIODO.some((x) => x.v === periodo);
  return (
    <div className="pill-scelta riga-chips-scorri" style={{ marginBottom: 12 }}>
      {VOCI_PERIODO.map((x) => (
        <a
          key={x.v}
          className={`pill-opt${periodo === x.v ? " attuale" : ""}`}
          href={`${base}${query(x.v)}`}
        >
          {x.l}
        </a>
      ))}
      {/* L'azzeramento compare solo quando c'è qualcosa da azzerare. */}
      {attivo && (
        <a className="pill-opt" href={`${base}${query()}`}>
          Tutte le date
        </a>
      )}
    </div>
  );
}
