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
};
