// Stato di caricamento di rotta (Libro UX cap.6, §1): tutte le pagine sono
// force-dynamic, quindi ogni navigazione attende il server. Uno skeleton sobrio
// riempie l'attesa senza far saltare il layout.
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="skeleton" style={{ height: 34, width: 280, maxWidth: "70%" }} />
          <div className="skeleton" style={{ height: 14, width: 440, maxWidth: "90%", marginTop: 12 }} />
        </div>
      </div>

      <div className="kpi-grid">
        {[0, 1, 2].map((i) => (
          <div className="kpi" key={i}>
            <div className="skeleton" style={{ height: 12, width: 130 }} />
            <div className="skeleton" style={{ height: 24, width: 100, marginTop: 12 }} />
          </div>
        ))}
      </div>

      <div className="card tight">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="skeleton" key={i} style={{ height: 16, width: `${100 - i * 6}%` }} />
          ))}
        </div>
      </div>

      <span
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        Caricamento…
      </span>
    </div>
  );
}
