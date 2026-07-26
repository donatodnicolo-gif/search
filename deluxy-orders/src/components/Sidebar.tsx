"use client";

import { usePathname } from "next/navigation";

// Menu laterale. Client component solo per evidenziare la voce attiva
// (usePathname); i conteggi arrivano dal layout (server).
export function Sidebar({
  conteggi,
}: {
  conteggi: { ordini: number; daClassificare: number; clienti: number; liste: number; automazioni: number; script: number };
}) {
  const path = usePathname();
  const voci = [
    { href: "/", nome: "Ordini", count: conteggi.ordini, icona: iconaLista },
    { href: "/bacheca", nome: "Bacheca", count: conteggi.daClassificare, icona: iconaBacheca },
    { href: "/clienti", nome: "Clienti", count: conteggi.clienti, icona: iconaClienti },
    { href: "/liste", nome: "Liste", count: conteggi.liste, icona: iconaListeClienti },
    { href: "/script", nome: "Script", count: conteggi.script, icona: iconaScript },
    { href: "/automazioni", nome: "Automazioni", count: conteggi.automazioni, icona: iconaAutomazioni },
    { href: "/consegna", nome: "Consegna", count: null, icona: iconaConsegna },
    { href: "/impostazioni", nome: "Impostazioni", count: null, icona: iconaImpostazioni },
  ];
  return (
    <nav className="sidebar">
      <div className="sb-sezione">
        <div className="sb-label">Registro ordini</div>
        {voci.map((v) => {
          const attiva = v.href === "/" ? path === "/" : path.startsWith(v.href);
          return (
            <a key={v.href} href={v.href} className={`sb-item${attiva ? " attiva" : ""}`}>
              <span className="sb-icona">{v.icona}</span>
              <span className="sb-nome">{v.nome}</span>
              {v.count != null && <span className="sb-count">{v.count}</span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

const iconaLista = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
  </svg>
);
const iconaBacheca = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" />
  </svg>
);
const iconaClienti = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const iconaListeClienti = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
    <path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" />
  </svg>
);
const iconaScript = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" />
    <path d="M9 12h6" /><path d="M9 16h4" />
  </svg>
);
const iconaAutomazioni = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5h16v11H7l-3 3z" />
    <path d="M8.5 10.5h.01" /><path d="M12 10.5h.01" /><path d="M15.5 10.5h.01" />
  </svg>
);
const iconaConsegna = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
    <circle cx="12" cy="15.5" r="2.5" /><path d="M12 14.3v1.4l1 .6" />
  </svg>
);
const iconaImpostazioni = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
