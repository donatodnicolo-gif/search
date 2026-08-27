// Un indirizzo sbagliato dava il 404 nero di Next, fuori dal portale. Peggio:
// chi non era autenticato veniva mandato al login con `?da=<strada sbagliata>`
// e, appena entrato, rispedito proprio lì — cioè fuori dal Hub subito dopo aver
// fatto l'accesso. Almeno adesso resta dentro, con la barra e una via d'uscita.
export default function NonTrovata() {
  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Questa pagina non c&rsquo;è</h1>
        <p className="page-sub">
          L&rsquo;indirizzo non corrisponde a nessuna sezione del portale.
        </p>
      </div>
      <div className="card">
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Può capitare con un collegamento vecchio o con un indirizzo copiato a metà.
          Dalla home trovi tutte le app che puoi aprire.
        </p>
        <div style={{ marginTop: 16 }}>
          <a className="btn primary" href="/">
            Torna alla home
          </a>
        </div>
      </div>
    </main>
  );
}
