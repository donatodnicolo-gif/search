"use client";

// Rete di sicurezza: qualunque errore non gestito di una pagina o di una server
// action finisce qui e si VEDE.
//
// Finché questo file non c'era, un'azione che falliva non produceva niente a
// schermo: nessun messaggio, nessun colore — l'operatore premeva e concludeva
// che il bottone «non fa nulla» (caso del 17/08/2026 in /transazioni). Meglio
// una schermata che dice cos'è successo e come uscirne.
export default function Errore({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Il caso più comune e più innocuo: la scheda del browser è rimasta aperta da
  // prima di un aggiornamento dell'app, quindi il server non riconosce più i
  // bottoni di quella pagina. Si risolve ricaricando, e vale la pena dirlo
  // invece di mostrare un messaggio tecnico in inglese.
  const paginaVecchia = /Server Action|Failed to find|unexpected response/i.test(error?.message ?? "");

  return (
    <div className="card" style={{ padding: 20, maxWidth: 640, margin: "40px auto" }}>
      <h1 className="page-title" style={{ fontSize: 20, marginBottom: 8 }}>
        {paginaVecchia ? "La pagina è da ricaricare" : "Qualcosa non ha funzionato"}
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {paginaVecchia ? (
          <>
            Questa scheda era aperta da prima di un aggiornamento dell&apos;app, quindi i suoi bottoni non
            sono più validi. <strong>Ricarica la pagina</strong> e ripeti l&apos;operazione: non è stato
            salvato nulla a metà.
          </>
        ) : (
          <>
            L&apos;operazione si è interrotta. <strong>Controlla se è stata salvata</strong> prima di
            ripeterla — se riguardava una fattura o un movimento, verifica nella sua scheda.
          </>
        )}
      </p>
      <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 12, wordBreak: "break-word" }}>
        {error?.message}
        {error?.digest && <> · rif. {error.digest}</>}
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" onClick={() => reset()}>Riprova</button>
        <button className="btn secondary" onClick={() => location.reload()}>Ricarica la pagina</button>
      </div>
    </div>
  );
}
