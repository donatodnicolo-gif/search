// Empty state canonico (Libro UX §6.2): icona in quadratino gold-soft 44px +
// titolo title-m + frase che insegna cosa entra qui. Un vuoto non è mai solo
// testo grigio. Presentazionale e senza hook: usabile in pagine server e client.
export function EmptyState({
  titolo,
  frase,
  icona,
}: {
  titolo: string;
  frase: string;
  icona?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icona">
        {icona ?? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 7v10l9 4 9-4V7" />
            <path d="M12 11v10" />
          </svg>
        )}
      </div>
      <div className="empty-titolo">{titolo}</div>
      <p className="empty-frase">{frase}</p>
    </div>
  );
}
