import { COLORE_STATO, ETICHETTE_STATO, isStato } from "@/lib/stati";

export function BadgeStato({ stato }: { stato: string }) {
  const noto = isStato(stato);
  const colore = noto ? COLORE_STATO[stato] : "var(--text-tertiary)";
  const etichetta = noto ? ETICHETTE_STATO[stato] : stato;
  return (
    <span className="badge" style={{ color: colore }}>
      <span className="dot" />
      <span style={{ color: "var(--text)" }}>{etichetta}</span>
    </span>
  );
}
