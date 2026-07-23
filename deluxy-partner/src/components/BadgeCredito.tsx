import type { SchedaCredito } from "@/lib/stato-credito";

// Badge dello stato finanziario del cliente (design system: pillola + dot).
// Il title spiega perché siamo in quello stato: comodo negli elenchi fitti.
export function BadgeCredito({ s, titolo }: { s: SchedaCredito; titolo?: boolean }) {
  return (
    <span className={`badge ${s.colore}`} title={titolo === false ? undefined : `${s.motivo} ${s.azione}`}>
      <span className="dot" />
      {s.etichetta}
    </span>
  );
}
