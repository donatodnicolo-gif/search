/* Caricamento di rotta: skeleton sobrio mentre la pagina server prepara i dati
   (DS §6 — obbligatorio su ogni rotta dati). 27/08 */
export default function Loading() {
  return (
    <main className="main" aria-busy="true" aria-label="Caricamento in corso">
      <div className="page-head">
        <div>
          <div className="skeleton skeleton-titolo" />
        </div>
      </div>
      <div className="tabella-wrap" style={{ padding: 12 }}>
        <div className="caricamento">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-riga" />
          ))}
        </div>
      </div>
    </main>
  );
}
