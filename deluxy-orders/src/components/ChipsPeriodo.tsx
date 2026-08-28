import Link from "next/link";

// Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): quattro pillole-link a
// selezione singola più il link di azzeramento. Sono LINK GET, non un form: la
// pagina passa `href(valore)` che conserva gli altri parametri della query, e
// `href("")` toglie il periodo. La traduzione del valore in date sta in
// `intervalloScorciatoia` (lib/analisi) — qui c'è solo la riga di chip.
export const SCORCIATOIE_PERIODO = [
  { valore: "mese", nome: "Mese in corso" },
  { valore: "scorso", nome: "Mese scorso" },
  { valore: "trimestre", nome: "Trimestre" },
  { valore: "anno", nome: "Anno" },
] as const;

export function ChipsPeriodo({
  attivo,
  href,
  azzera = "Tutto",
}: {
  /** Il valore di `periodo` nell'URL, se c'è: la chip corrispondente è piena. */
  attivo?: string;
  /** Costruisce il link di ogni chip conservando gli altri parametri. */
  href: (valore: string) => string;
  /** L'etichetta del link di azzeramento (compare solo con un periodo attivo). */
  azzera?: string;
}) {
  return (
    <div className="filtri riga-chips-scorri" style={{ marginBottom: 10 }}>
      {SCORCIATOIE_PERIODO.map((p) => (
        <Link
          key={p.valore}
          href={href(p.valore)}
          className={`chip-link${attivo === p.valore ? " attiva" : ""}`}
        >
          {p.nome}
        </Link>
      ))}
      {attivo ? (
        <Link href={href("")} className="chip-link azzera">
          {azzera}
        </Link>
      ) : null}
    </div>
  );
}
