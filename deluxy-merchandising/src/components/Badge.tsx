// Pillola di stato con dot colorato (design system: badge di stato).
export function Badge({ testo, colore }: { testo: string; colore: string }) {
  return (
    <span className="badge" style={{ color: colore }}>
      <span className="dot" />
      <span style={{ color: "var(--text)" }}>{testo}</span>
    </span>
  );
}
