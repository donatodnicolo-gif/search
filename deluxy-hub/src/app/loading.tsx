// /utenti interroga Budgets e può prendersi fino a 6 secondi (il timeout è
// dichiarato in organico.ts). Senza questo file la pagina precedente restava
// ferma a schermo senza un solo segnale, e sembrava che il clic non fosse
// arrivato.
export default function Caricamento() {
  return (
    <main className="main">
      <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Caricamento…</p>
    </main>
  );
}
