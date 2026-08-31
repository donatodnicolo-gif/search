// La cornice delle schermate di accesso (login, password dimenticata, nuova
// password): stesso riquadro di vetro, stesso marchio, stessa firma in fondo.
// Sta in un componente solo perché le tre pagine devono sembrare la stessa
// stanza — e perché lo stile del login non si copia a mano in tre posti.
export function CorniceAccesso({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string;
  sottotitolo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
        background:
          "radial-gradient(600px 400px at 18% 12%, rgba(184,150,62,0.14), transparent 60%), radial-gradient(700px 500px at 85% 90%, rgba(17,19,24,0.10), transparent 60%), var(--bg)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--surface-translucent)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          border: "1px solid var(--hairline)",
          borderRadius: 24,
          boxShadow: "var(--shadow-float)",
          padding: "40px 36px 30px",
          textAlign: "center",
        }}
      >
        <div
          className="brand-logo"
          style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}
        >
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>{titolo}</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          {sottotitolo}
        </p>

        {children}

        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 26, textAlign: "center" }}>
          Consegne in guanti bianchi, dal 2019.
        </p>
      </div>
    </div>
  );
}
