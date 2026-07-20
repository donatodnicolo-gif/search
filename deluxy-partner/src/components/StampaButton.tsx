"use client";

// Stampa/PDF del documento: usa la stampa del browser (Salva come PDF).
// Gli stili @media print in globals.css isolano il solo documento.
export function StampaButton() {
  return (
    <button type="button" className="btn secondary" onClick={() => window.print()}>
      Stampa / PDF
    </button>
  );
}
