// Glifi stroke 1.7px stile SF Symbols (19px) per le tipologie della sidebar.
// Le categorie sono testo libero: qui i glifi delle tipologie note, con un
// cartellino generico come default.

const TRATTO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const GLIFI: Record<string, React.ReactNode> = {
  // Griglia: visione globale su tutte le tipologie
  GLOBALE: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...TRATTO} />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...TRATTO} />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...TRATTO} />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...TRATTO} />
    </>
  ),
  // Shopping bag
  BOUTIQUE: (
    <>
      <path d="M6 8.5h12l-1 11.5H7z" {...TRATTO} />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" {...TRATTO} />
    </>
  ),
  // Fiore
  FIORISTA: (
    <>
      <circle cx="12" cy="8" r="3.2" {...TRATTO} />
      <path d="M12 11.2V20" {...TRATTO} />
      <path d="M12 16c-2.5 0-4.5-1.5-5-3.5 2.5 0 4.5 1.5 5 3.5zM12 16c2.5 0 4.5-1.5 5-3.5-2.5 0-4.5 1.5-5 3.5z" {...TRATTO} />
    </>
  ),
  // Fetta di torta
  PASTICCERIA: (
    <>
      <path d="M4.5 13h15v6.5h-15z" {...TRATTO} />
      <path d="M4.5 15.5c1.5 0 1.5 1.2 3 1.2s1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2" {...TRATTO} />
      <path d="M7.5 13v-2.5M12 13v-2.5M16.5 13v-2.5" {...TRATTO} />
      <path d="M12 8.5V7" {...TRATTO} />
    </>
  ),
  // Tavoletta di cioccolato
  CIOCCOLATERIA: (
    <>
      <rect x="5.5" y="4.5" width="13" height="15" rx="1.5" {...TRATTO} />
      <path d="M12 4.5v15M5.5 12h13" {...TRATTO} />
    </>
  ),
  // Forchetta e coltello
  RISTORANTE: (
    <>
      <path d="M8 4v6M6 4v3.5a2 2 0 0 0 4 0V4M8 10v10" {...TRATTO} />
      <path d="M16 4c-1.5 1.5-2 4-2 6h2v10" {...TRATTO} />
    </>
  ),
  // Cloche
  CATERING: (
    <>
      <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0z" {...TRATTO} />
      <path d="M12 9V7.5" {...TRATTO} />
      <path d="M3.5 19h17" {...TRATTO} />
    </>
  ),
  // Pacco regalo
  GIFTING: (
    <>
      <rect x="4.5" y="9" width="15" height="11" rx="1" {...TRATTO} />
      <path d="M12 9v11M4.5 13.5h15" {...TRATTO} />
      <path d="M12 9c-2-.5-4.5-1-4.5-3a1.8 1.8 0 0 1 3.5-.5c.5 1 .8 2.3 1 3.5.2-1.2.5-2.5 1-3.5a1.8 1.8 0 0 1 3.5.5c0 2-2.5 2.5-4.5 3z" {...TRATTO} />
    </>
  ),
  // Campanello da banco
  CONCIERGE: (
    <>
      <path d="M5 17a7 7 0 0 1 14 0z" {...TRATTO} />
      <path d="M12 10V8M10.5 8h3" {...TRATTO} />
      <path d="M4 19.5h16" {...TRATTO} />
    </>
  ),
  // Calice di vino
  ENOTECA: (
    <>
      <path d="M8 4h8c0 4-1.5 7-4 7s-4-3-4-7z" {...TRATTO} />
      <path d="M12 11v6M9 20h6M8 7h8" {...TRATTO} />
    </>
  ),
  // Diamante
  GIOIELLERIA: (
    <>
      <path d="m12 20 8-10-3-5H7l-3 5z" {...TRATTO} />
      <path d="M4 10h16M9.5 10 12 20l2.5-10L12 5z" {...TRATTO} />
    </>
  ),
  // Cappello da chef
  "CHEF PRIVATO": (
    <>
      <path d="M7 13.5A3.5 3.5 0 0 1 7.5 6.6 4.5 4.5 0 0 1 16.5 6.6 3.5 3.5 0 0 1 17 13.5V17H7z" {...TRATTO} />
      <path d="M7 19.5h10" {...TRATTO} />
    </>
  ),
  // Palloncino
  PARTY: (
    <>
      <ellipse cx="12" cy="9" rx="5" ry="6" {...TRATTO} />
      <path d="m12 15-1 1.5h2L12 15zM12 16.5c0 2-2 2-2 3.5" {...TRATTO} />
    </>
  ),
};

// Cartellino generico per tipologie senza glifo dedicato
const DEFAULT = (
  <>
    <path d="m4.5 12 8-8H20v7.5l-8 8z" {...TRATTO} />
    <circle cx="16" cy="8" r="1.2" {...TRATTO} />
  </>
);

export function IconaCategoria({ categoria }: { categoria: string }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      {GLIFI[categoria] ?? DEFAULT}
    </svg>
  );
}
