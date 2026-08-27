"use client";

// La rete di sicurezza del portale: prima non c'era, e un'eccezione imprevista
// (una query che cade, il database irraggiungibile) portava alla schermata
// spoglia di Next — senza barra, senza marchio e senza una strada per tornare.
// Il Hub sapeva già dire bene i guasti PREVISTI (i messaggi di /utenti, i
// quattro stati dell'organico): mancava il posto dove finiscono gli altri.
export default function Errore({
  error,
  reset,
}: {
  // Next aggiunge un campo digest all'errore: e' il riferimento che compare
  // anche nei registri del server, l'unico modo per ricollegare una
  // segnalazione a cio' che e' successo davvero.
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Qualcosa si è rotto</h1>
        <p className="page-sub">
          Non è colpa tua: una pagina del portale non è riuscita a caricare i suoi dati.
        </p>
      </div>
      <div className="card">
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Puoi riprovare subito: spesso è un intoppo passeggero. Se torna, scrivilo a chi
          amministra il portale — con l&rsquo;ora esatta, che aiuta a ritrovarlo nei registri.
        </p>
        {error?.digest && (
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
            Riferimento dell&rsquo;errore: <code>{error.digest}</code>
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="btn primary" onClick={reset}>
            Riprova
          </button>
          <a className="btn" href="/">
            Torna alla home
          </a>
        </div>
      </div>
    </main>
  );
}
