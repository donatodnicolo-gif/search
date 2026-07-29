// Pillola di stato con dot colorato (design system: badge di stato).
export function Badge({ testo, colore, title }: { testo: string; colore: string; title?: string }) {
  return (
    <span className="badge" style={{ color: colore }} title={title}>
      <span className="dot" />
      <span style={{ color: "var(--text)" }}>{testo}</span>
    </span>
  );
}
