/**
 * Caricamento (Libro UX&UI cap.6, soglie NN/g): le pagine sono `force-dynamic`,
 * quindi ogni navigazione ricalcola sul server. Testo sobrio — sotto il secondo
 * Next non lo mostra nemmeno, sopra dà un segnale invece di uno schermo fermo.
 */
export default function Loading() {
  return (
    <main className="wrap">
      <p className="caricamento" role="status">
        Caricamento…
      </p>
    </main>
  );
}
