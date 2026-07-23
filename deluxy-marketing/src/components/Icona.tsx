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
  // Orologio all'indietro: storico
  storico: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9" />
      <path d="M4.5 4.5v4.4h4.4" />
      <path d="M12 8.5V12l2.8 1.8" />
    </>
  ),
};
