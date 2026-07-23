// Set minimale di icone (stroke) per la navigazione. Stile lineare, coerente
// col linguaggio Apple del design system.
export function Icona({ nome }: { nome: string }) {
  const p = PATHS[nome] ?? PATHS.analisi;
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
  // Lente su grafico: analisi e audit
  analisi: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20" />
      <path d="M7.5 12.5v-2M10.5 12.5v-4M13.5 12.5v-3" />
    </>
  ),
  // Elenco con spunte: azioni
  azioni: (
    <>
      <path d="m4 6.5 1.5 1.5L8 5.5" />
      <path d="M11 7h9" />
      <path d="m4 12.5 1.5 1.5L8 11.5" />
      <path d="M11 13h9" />
      <path d="m4 18.5 1.5 1.5L8 17.5" />
      <path d="M11 19h9" />
    </>
  ),
  // Spunta in uno scudo: audit
  audit: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" />
      <path d="m9 11.8 2.1 2.1L15.3 9.6" />
    </>
  ),
  // Megafono: campagne
  campagne: (
    <>
      <path d="M4 10v4l10 4V6z" />
      <path d="M14 6v12M18 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M6 14v4.5" />
    </>
  ),
  // Nuvola: la cartella Drive condivisa
  drive: (
    <>
      <path d="M7 17.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 10a3.8 3.8 0 0 1-.5 7.5z" />
    </>
  ),
  // Grafico a barre: metriche
  metriche: (
    <>
      <path d="M4 19V5M20 19V9M12 19V3M4 19h16" />
    </>
  ),
  // Etichetta prezzo: vendite
  vendite: (
    <>
      <path d="M12.5 3.5H20v7.5l-8.5 8.5L3 11z" />
      <circle cx="16" cy="7.5" r="1.3" />
    </>
  ),
  // Salvadanaio semplificato: budget
  budget: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M14.8 9.5c-.5-1-1.6-1.5-2.8-1.5-1.5 0-2.7.9-2.7 2s1 1.7 2.7 2c1.7.3 2.7 1 2.7 2s-1.2 2-2.7 2c-1.2 0-2.3-.5-2.8-1.5" />
    </>
  ),
  // Cursore su pagina: landing
  landing: (
    <>
      <rect x="3.5" y="4" width="17" height="12.5" rx="2" />
      <path d="m12.5 10.5 6.5 2.6-2.9 1 -1 2.9z" />
    </>
  ),
  // Penna: copy & annunci
  copy: (
    <>
      <path d="m14.5 5 4.5 4.5L8.5 20H4v-4.5z" />
      <path d="m12.5 7 4.5 4.5" />
    </>
  ),
  // Provetta: test Meta
  meta: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v6L5.6 18a2.4 2.4 0 0 0 2.1 3.5h8.6a2.4 2.4 0 0 0 2.1-3.5l-4.9-8.5v-6" />
      <path d="M8 15h8" />
    </>
  ),
  // Canali pubblicitari
  google: (
    <>
      <path d="M21 12.2c0 5-3.4 8.5-8.5 8.5a8.7 8.7 0 0 1 0-17.4c2.3 0 4.3.9 5.8 2.3l-2.4 2.3a4.9 4.9 0 0 0-3.4-1.3 5.4 5.4 0 0 0 0 10.8c2.9 0 4.6-1.7 4.9-4h-4.9v-3H21z" />
    </>
  ),
  metaads: (
    <>
      <path d="M3 14.6c0-3.7 1.9-7.1 4.2-7.1 1.3 0 2.4.8 3.9 3.2 1.4 2.2 2.3 3.6 2.3 3.6 1 1.6 1.6 2.3 2.5 2.3 1.3 0 2.1-1.4 2.1-3.7 0-2.6-1-5.3-2.9-5.3-1 0-1.9.6-3.1 2" />
      <path d="M3 14.6c0 2.2 1 3.7 2.6 3.7 1.2 0 2-.5 3.5-2.8" />
    </>
  ),
  tiktok: (
    <>
      <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 4c.4 2.6 2 4.1 4.5 4.3" />
    </>
  ),
  // Temi delle landing
  fiori: (
    <>
      <circle cx="12" cy="8.5" r="2.2" />
      <path d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6A2.6 2.6 0 0 1 17.2 8.5a2.6 2.6 0 0 1-2.6 2.6A2.6 2.6 0 0 1 12 13.5a2.6 2.6 0 0 1-2.6-2.4A2.6 2.6 0 0 1 6.8 8.5a2.6 2.6 0 0 1 2.6-2.4A2.6 2.6 0 0 1 12 3.5z" />
      <path d="M12 13.5V21M12 17.5c-1.8 0-3.4-.9-4.3-2.4M12 19c1.7 0 3.2-.8 4.2-2.2" />
    </>
  ),
  torta: (
    <>
      <path d="M4.5 20.5h15M5.5 20.5v-6.2h13v6.2" />
      <path d="M5.5 16.5c1.2 1 2.2 1 3.3 0s2.1-1 3.2 0 2.1 1 3.2 0 2.1-1 3.3 0" />
      <path d="M12 14.3v-3M12 8.6c-.9-.6-.9-1.7 0-2.6.9.9.9 2 0 2.6z" />
    </>
  ),
  colazione: (
    <>
      <path d="M5 9.5h11v6a4.5 4.5 0 0 1-4.5 4.5H9.5A4.5 4.5 0 0 1 5 15.5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M7.5 6.5c0-1 .8-1 .8-2M11 6.5c0-1 .8-1 .8-2" />
    </>
  ),
  regalo: (
    <>
      <path d="M4.5 11h15v9.5h-15zM4 7h16v4H4zM12 7v13.5" />
      <path d="M12 7c-2.8 0-4.5-1-4.5-2.4C7.5 3.4 8.6 3 9.5 3c1.7 0 2.5 2 2.5 4zM12 7c2.8 0 4.5-1 4.5-2.4C16.5 3.4 15.4 3 14.5 3c-1.7 0-2.5 2-2.5 4z" />
    </>
  ),
  palloncino: (
    <>
      <ellipse cx="12" cy="8.5" rx="5" ry="6" />
      <path d="m12 14.5-1 2h2zM12 16.5c0 2-1.5 2.2-1.5 4" />
    </>
  ),
  eventi: (
    <>
      <path d="M8 3.5h8l2 4-6 13-6-13z" />
      <path d="M6 7.5h12M10 7.5l2 13M14 7.5l-2 13" />
    </>
  ),
  compleanno: (
    <>
      <path d="M6 12.5h12v8H6zM4.5 20.5h15" />
      <path d="M9 12.5v-2.5M15 12.5v-2.5M9 7.2c-.6-.5-.6-1.3 0-2 .6.7.6 1.5 0 2zM15 7.2c-.6-.5-.6-1.3 0-2 .6.7.6 1.5 0 2z" />
    </>
  ),
  b2b: (
    <>
      <rect x="3.5" y="8" width="17" height="12" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3.5 13h17" />
    </>
  ),
  destinazioni: (
    <>
      <path d="M3.5 18.5 21 12 3.5 5.5l3 6.5z" />
      <path d="M6.5 12H21" />
    </>
  ),
  pagina: (
    <>
      <path d="M6 3.5h8L18.5 8v12.5H6z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  // Gruppo di persone: pubblici e liste
  pubblici: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.4M17 14.9c2 .6 3.5 2.4 3.5 4.6" />
    </>
  ),
  // Orologio all'indietro: storico
  storico: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9" />
      <path d="M4.5 4.5v4.4h4.4" />
      <path d="M12 8.5V12l2.8 1.8" />
    </>
  ),
};
