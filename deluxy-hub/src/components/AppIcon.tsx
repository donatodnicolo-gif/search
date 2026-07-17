import type { AppDeluxy } from "@/lib/apps";

const TRATTO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Glifi delle app: linea sottile, oro su tessera scura (vedi .app-icon).
const GLIFI: Record<AppDeluxy["icona"], React.ReactNode> = {
  // Lente: ricerca partner sul territorio
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" {...TRATTO} />
      <path d="M15.4 15.4 20 20" {...TRATTO} />
    </>
  ),
  // Documento con riga di totale: gestione finanziaria partner
  partner: (
    <>
      <path d="M5.5 3.5h9L18.5 7.5v13h-13z" {...TRATTO} />
      <path d="M14.5 3.5v4h4" {...TRATTO} />
      <path d="M9 12h6M9 16h6" {...TRATTO} />
    </>
  ),
  // Segnaposto su mappa: prospezione commerciale
  scout: (
    <>
      <path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21z" {...TRATTO} />
      <circle cx="12" cy="10.5" r="2.5" {...TRATTO} />
    </>
  ),
};

export function AppIcon({ icona }: { icona: AppDeluxy["icona"] }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      {GLIFI[icona]}
    </svg>
  );
}
