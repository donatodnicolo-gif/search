// Loading di rotta (Libro UX cap.6): testo sobrio mentre i dati arrivano.
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ padding: "56px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}
    >
      Caricamento…
    </div>
  );
}
