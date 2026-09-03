"use client";

// Le due uscite del documento verso il cliente (02/09/2026):
//  - «Stampa»: la stampa del browser, con gli stili @media print che lasciano
//    sul foglio A4 solo il documento;
//  - «Scarica PDF»: il PDF generato sul server (/proforma/[id]/pdf), lo stesso
//    che viaggia allegato all'email — identico per chiunque lo apra.
// Il download è un link vero (non fetch+blob): il browser mostra il salvataggio
// col nome file parlante che arriva dal Content-Disposition.
export function AzioniDocumento({ id }: { id: string }) {
  return (
    <>
      <button type="button" className="btn secondary" onClick={() => window.print()} title="Stampa il documento (solo il foglio, senza l'app)">
        Stampa
      </button>
      <a href={`/proforma/${id}/pdf`} className="btn primary" title="Scarica il documento in PDF, pronto da inviare al cliente">
        Scarica PDF
      </a>
    </>
  );
}
