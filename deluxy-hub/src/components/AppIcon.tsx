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
  // Maison: il piano digitale dei siti Shopify
  maison: (
    <>
      <path d="M3.5 11 12 4.2 20.5 11" {...TRATTO} />
      <path d="M5.8 9.8v9.7h12.4V9.8" {...TRATTO} />
      <path d="M9.8 19.5v-5.2h4.4v5.2" {...TRATTO} />
    </>
  ),
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
  // Grafico a barre con freccia: budget e P&L su 3 livelli
  budgets: (
    <>
      <path d="M4 20.5V11M9.3 20.5V6.5M14.6 20.5v-8M21 20.5H3" {...TRATTO} />
      <path d="m15.5 6.5 5-3.5M20.5 3l-3.6.4M20.5 3l.4 3.6" {...TRATTO} />
    </>
  ),
  // Elenco con spunte: il registro delle attività condiviso fra le app
  tasks: (
    <>
      <path d="m4 6.5 1.5 1.5L8 5.5" {...TRATTO} />
      <path d="M11 7h9" {...TRATTO} />
      <path d="m4 12.5 1.5 1.5L8 11.5" {...TRATTO} />
      <path d="M11 13h9" {...TRATTO} />
      <path d="m4 18.5 1.5 1.5L8 17.5" {...TRATTO} />
      <path d="M11 19h9" {...TRATTO} />
    </>
  ),
  // Calendario: gli eventi datati di tutte le app
  calendario: (
    <>
      <path d="M4.5 6h15v13.5h-15z" {...TRATTO} />
      <path d="M4.5 10h15" {...TRATTO} />
      <path d="M8 4v3.5M16 4v3.5" {...TRATTO} />
      <path d="M8 13.5h2M8 16.5h2M14 13.5h2M14 16.5h2" {...TRATTO} />
    </>
  ),
  // Appendiabiti: il prodotto gestito come una maison di moda
  merchandising: (
    <>
      <path d="M12 5.2a1.6 1.6 0 0 1 1.6 1.6c0 1-1.6 1.2-1.6 2.4" {...TRATTO} />
      <path d="M12 9.2 4 15.2a1 1 0 0 0 .6 1.8h14.8a1 1 0 0 0 .6-1.8L12 9.2z" {...TRATTO} />
    </>
  ),
  // Megafono: l'advertising con analisi, azioni e campagne
  marketing: (
    <>
      <path d="M4 10v4l10 4V6z" {...TRATTO} />
      <path d="M14 6v12M18 9.5a3.5 3.5 0 0 1 0 5" {...TRATTO} />
      <path d="M6 14v4.5" {...TRATTO} />
    </>
  ),
  // Fumetto di chat: l'inbox unificata dei messaggi (WhatsApp, Meta, sito)
  messaggi: (
    <>
      <path
        d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z"
        {...TRATTO}
      />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" {...TRATTO} />
    </>
  ),
  // Sacchetto della spesa: il registro centralizzato degli ordini Shopify
  orders: (
    <>
      <path d="M6 8h12l-1 11.5H7z" {...TRATTO} />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" {...TRATTO} />
      <path d="M9.5 12h5" {...TRATTO} />
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
  // Scudo con spunta: i pagamenti autorizzati uno per uno
  transactions: (
    <>
      <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z" {...TRATTO} />
      <path d="m9 12 2.2 2.2L15.5 10" {...TRATTO} />
    </>
  ),
  // Parentesi angolari e barra: l'archivio degli script
  scripts: (
    <>
      <path d="M8.5 8.5 5 12l3.5 3.5" {...TRATTO} />
      <path d="M15.5 8.5 19 12l-3.5 3.5" {...TRATTO} />
      <path d="M13.2 5.5 10.8 18.5" {...TRATTO} />
    </>
  ),
  // Tesserino col profilo: l'organico e le persone
  personale: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" {...TRATTO} />
      <circle cx="9" cy="10.5" r="2" {...TRATTO} />
      <path d="M5.8 15.8c0-1.8 1.5-2.9 3.2-2.9s3.2 1.1 3.2 2.9" {...TRATTO} />
      <path d="M14.5 9.5h3.5M14.5 12.5h3.5" {...TRATTO} />
    </>
  ),
  // Andamento con il punto dell'evento: il cambio di vertice e cio che accade dopo
  fondo: (
    <>
      <path d="M3.5 19.5V4.5M3.5 19.5h17" {...TRATTO} />
      <path d="m6.5 16 3.5-4.5 3 2.5 4.5-7" {...TRATTO} />
      <circle cx="10" cy="11.5" r="1.6" {...TRATTO} />
    </>
  ),
  crm: (
    <>
      <circle cx="9.5" cy="7.8" r="3.2" {...TRATTO} />
      <path d="M3.2 19.5c.9-3.1 3.3-4.8 6.3-4.8.9 0 1.8.2 2.6.5" {...TRATTO} />
      <path d="M17.2 20.2c-2.5-2-3.9-3.4-3.9-5.1 0-1.2.9-2.1 2.1-2.1.7 0 1.4.4 1.8 1 .4-.6 1.1-1 1.8-1 1.2 0 2.1.9 2.1 2.1 0 1.7-1.4 3.1-3.9 5.1z" {...TRATTO} />
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
