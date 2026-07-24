// Set minimale di icone (stroke) per la navigazione. Stile lineare, coerente
// col linguaggio Apple del design system.
export function Icona({ nome }: { nome: string }) {
  const p = PATHS[nome] ?? PATHS.prodotti;
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  collezioni: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="7.5" cy="7" r="0" />
    </>
  ),
  prodotti: (
    <>
      <path d="M20.5 7.3 12 3 3.5 7.3v9.4L12 21l8.5-4.3z" />
      <path d="M3.7 7.4 12 11.6l8.3-4.2M12 21v-9.4" />
    </>
  ),
  sviluppo: (
    <>
      <path d="M6 3v6a6 6 0 0 0 12 0V3" />
      <path d="M6 3h12M9 21h6M12 15v6" />
    </>
  ),
  costi: (
    <>
      <path d="M4 19V5M20 19V9M12 19V3M4 19h16" />
    </>
  ),
  visual: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="m3 14 4-4 4 4 3-3 4 4M8.5 9a1 1 0 1 0 0-0.01" />
    </>
  ),
  shopify: (
    <>
      <path d="M6 8h12l-1 12H7z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
};
