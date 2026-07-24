import { coloreMargine, percentuale } from "@/lib/dominio";

// Barra di marginalità sul venduto, colorata rispetto al target di collezione.
export function BarraMargine({ marginePct, target }: { marginePct: number; target?: number | null }) {
  const colore = coloreMargine(marginePct, target);
  const larghezza = Math.max(0, Math.min(100, marginePct * 100));
  return (
    <div className="margine-cella">
      <div className="margine-track">
        <span className="margine-fill" style={{ width: `${larghezza}%`, background: colore }} />
      </div>
      <span className="margine-valore" style={{ color: colore }}>{percentuale(marginePct)}</span>
    </div>
  );
}
