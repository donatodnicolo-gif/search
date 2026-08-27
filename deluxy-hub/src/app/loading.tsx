/* Loading di rotta (Libro UX cap.6, D3): sotto 1 s Next non lo mostra
   quasi mai; fra 2 e 10 s un testo sobrio basta. */
export default function Loading() {
  return (
    <main className="main">
      <p className="caricamento" role="status">
        Caricamento…
      </p>
    </main>
  );
}
