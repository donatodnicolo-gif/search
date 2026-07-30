// Scheletro mostrato durante il caricamento di qualsiasi pagina: comparendo
// subito, la navigazione risulta immediata anche mentre il server prepara i dati
// (le pagine sono dinamiche, quindi c'è sempre un'attesa di rete).
const barra = (w: string, h = 14): React.CSSProperties => ({
  width: w,
  height: h,
  borderRadius: 6,
  background: "var(--hairline)",
  opacity: 0.65,
  animation: "dlxPulse 1.2s ease-in-out infinite",
});

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <style>{`@keyframes dlxPulse { 0%,100% { opacity: .35 } 50% { opacity: .75 } }`}</style>
      <div className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={barra("260px", 30)} />
          <div style={barra("380px", 13)} />
        </div>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[92, 78, 85, 64, 72].map((w, i) => (
            <div key={i} style={barra(`${w}%`)} />
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[70, 88, 60].map((w, i) => (
            <div key={i} style={barra(`${w}%`)} />
          ))}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12.5, display: "block", marginTop: 14 }}>
        Carico i dati…
      </span>
    </div>
  );
}
