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
  // Furgone: le consegne in guanti bianchi
  consegne: (
    <>
      <path d="M2.5 6.5h10v9h-10z" {...TRATTO} />
      <path d="M12.5 9.5h4l3 3v3h-7z" {...TRATTO} />
      <circle cx="6.5" cy="17.5" r="1.8" {...TRATTO} />
      <circle cx="16.5" cy="17.5" r="1.8" {...TRATTO} />
    </>
  ),
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
  // Schedario: registro centralizzato delle anagrafiche partner
  anagrafiche: (
    <>
      <path d="M4.5 6.5h15v13h-15z" {...TRATTO} />
      <path d="M7.5 6.5V4.5h9v2" {...TRATTO} />
      <path d="M4.5 11h5v2h5v-2h5" {...TRATTO} />
    </>
  ),
  // Segnaposto su mappa: prospezione commerciale
  scout: (
    <>
      <path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21z" {...TRATTO} />
      <circle cx="12" cy="10.5" r="2.5" {...TRATTO} />
    </>
  ),
  // Busta con scintilla: posta letta e smistata dall'AI
  mail: (
    <>
      <path d="M3.5 6.5h13v11h-13z" {...TRATTO} />
      <path d="m3.5 7.5 6.5 5 6.5-5" {...TRATTO} />
      <path d="M19.5 3.5v4M17.5 5.5h4" {...TRATTO} />
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
