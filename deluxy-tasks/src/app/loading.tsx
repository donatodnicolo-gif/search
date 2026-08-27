// Loading di rotta (Libro UX&UI cap.6: obbligatorio su ogni rotta dati; le
// pagine sono force-dynamic, quindi senza questo file il click resta muto).
// Soglie NN/g: testo sobrio, niente barre sotto i 10 s.
export default function Loading() {
  return (
    <main className="wrap">
      <div className="vuoto" role="status" aria-live="polite">
        Caricamento…
      </div>
    </main>
  );
}
