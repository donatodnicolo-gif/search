"use client";

import { usePathname } from "next/navigation";

// Menu laterale. Client component solo per evidenziare la voce attiva; i
// conteggi arrivano dal layout (server). Le voci di amministrazione si vedono
// solo con il ruolo admin: chi non le vede non le può nemmeno aprire, perché
// ogni pagina ricontrolla il ruolo.
export function Sidebar({
  conteggi,
  ruolo,
}: {
  conteggi: { inAttesa: number; approvate: number };
  ruolo: string;
}) {
  const path = usePathname();
  const voci = [
    { href: "/", nome: "Da autorizzare", count: conteggi.inAttesa, icona: iconaFirma, admin: false },
    { href: "/richieste", nome: "Richieste", count: null, icona: iconaLista, admin: false },
    { href: "/distinte", nome: "Distinte", count: conteggi.approvate, icona: iconaBanca, admin: false },
    { href: "/beneficiari", nome: "Beneficiari", count: null, icona: iconaRubrica, admin: false },
    { href: "/registro", nome: "Registro", count: null, icona: iconaRegistro, admin: false },
    { href: "/chiavi", nome: "Chiavi delle app", count: null, icona: iconaChiave, admin: true },
    { href: "/operatori", nome: "Operatori", count: null, icona: iconaPersone, admin: true },
    { href: "/impostazioni", nome: "Impostazioni", count: null, icona: iconaImpostazioni, admin: true },
  ].filter((v) => !v.admin || ruolo === "admin");

  return (
    <nav className="sidebar">
      <div className="sb-sezione">
        <div className="sb-label">Pagamenti</div>
        {voci.map((v) => {
          const attiva = v.href === "/" ? path === "/" : path.startsWith(v.href);
          return (
            <a key={v.href} href={v.href} className={`sb-item${attiva ? " attiva" : ""}`}>
              <span className="sb-icona">{v.icona}</span>
              <span className="sb-nome">{v.nome}</span>
              {v.count != null && v.count > 0 && <span className="sb-count">{v.count}</span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

const svg = (d: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const iconaFirma = svg(
  <>
    <path d="M3 17c3 0 3-9 6-9s3 9 6 9 3-4 6-4" />
    <line x1="3" y1="21" x2="21" y2="21" />
  </>,
);
const iconaLista = svg(
  <>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </>,
);
const iconaBanca = svg(
  <>
    <path d="M3 10l9-6 9 6" />
    <line x1="4" y1="10" x2="4" y2="19" />
    <line x1="9" y1="10" x2="9" y2="19" />
    <line x1="15" y1="10" x2="15" y2="19" />
    <line x1="20" y1="10" x2="20" y2="19" />
    <line x1="2" y1="21" x2="22" y2="21" />
  </>,
);
const iconaRubrica = svg(
  <>
    <path d="M6 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6z" />
    <line x1="3" y1="8" x2="6" y2="8" />
    <line x1="3" y1="16" x2="6" y2="16" />
    <circle cx="13" cy="11" r="2" />
    <path d="M10 16a3 3 0 0 1 6 0" />
  </>,
);
const iconaRegistro = svg(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </>,
);
const iconaChiave = svg(
  <>
    <circle cx="8" cy="12" r="4" />
    <line x1="12" y1="12" x2="21" y2="12" />
    <line x1="18" y1="12" x2="18" y2="15" />
    <line x1="21" y1="12" x2="21" y2="16" />
  </>,
);
const iconaPersone = svg(
  <>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 7.75" />
  </>,
);
const iconaImpostazioni = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
);
