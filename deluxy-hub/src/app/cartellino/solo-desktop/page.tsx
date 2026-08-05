import Link from "next/link";

// Dove finisce chi apre il Cartellino dal telefono. Non è un errore: è la regola
// dell'azienda, quindi la pagina la spiega invece di limitarsi a un "vietato".
export default function SoloDesktopPage() {
  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Il cartellino si usa dal computer</h1>
        <p className="page-sub">
          Presenze, timbrature, ferie e certificati si registrano solo da una postazione
          desktop: una timbratura fatta dal telefono potrebbe partire da qualsiasi posto.
        </p>
      </div>

      <div className="card">
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
          Apri <strong>deluxy-hub.vercel.app</strong> dal computer dell'ufficio e trovi il
          <strong> Cartellino</strong> in alto a destra, accanto al tuo nome. Tutto il resto del
          portale continua a funzionare anche da qui.
        </p>
        <div style={{ marginTop: 18 }}>
          <Link href="/" className="btn primary">
            Torna alle app
          </Link>
        </div>
      </div>
    </main>
  );
}
