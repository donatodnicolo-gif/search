"use client";

import { usePathname } from "next/navigation";

// Menu laterale. Client component solo per evidenziare la voce attiva
// (usePathname); i conteggi arrivano dal layout (server).
export function Sidebar({
  conteggi,
}: {
  conteggi: { script: number; app: number; chiavi: number };
}) {
  const path = usePathname();
  const voci = [
    { href: "/", nome: "Testi", count: conteggi.script, icona: iconaScript },
    { href: "/app", nome: "App collegate", count: conteggi.app, icona: iconaApp },
    { href: "/impostazioni", nome: "Impostazioni", count: conteggi.chiavi, icona: iconaImpostazioni },
  ];
  return (
    <nav className="sidebar">
      <div className="sb-sezione">
        <div className="sb-label">Archivio testi</div>
        {voci.map((v) => {
          const attiva = v.href === "/" ? path === "/" || path.startsWith("/script") : path.startsWith(v.href);
          return (
            <a key={v.href} href={v.href} className={`sb-item${attiva ? " attiva" : ""}`}>
              <span className="sb-icona">{v.icona}</span>
              <span className="sb-nome">{v.nome}</span>
              {v.count != null && <span className="sb-count">{v.count}</span>}
            </a>
          );
        })}
      </div>
      <div className="sb-sezione">
        <div className="sb-label">Aggiungi</div>
        <a href="/script/nuovo" className={`sb-item${path === "/script/nuovo" ? " attiva" : ""}`}>
          <span className="sb-icona">{iconaPiu}</span>
          <span className="sb-nome">Nuovo testo</span>
        </a>
      </div>
    </nav>
  );
}

const iconaScript = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4.5h14v11H8l-3 3z" />
    <path d="M8.5 8.5h7" /><path d="M8.5 11.5h4.5" />
  </svg>
);
const iconaApp = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" />
    <rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" />
  </svg>
);
const iconaImpostazioni = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const iconaPiu = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
