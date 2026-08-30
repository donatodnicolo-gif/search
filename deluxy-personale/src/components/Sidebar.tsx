"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Sidebar del gestionale (Design System §3 Navigazione): sezioni con etichetta
// maiuscola, voce attiva con sfondo pieno e icona oro, utente in basso.

type Voce = { href: string; nome: string; icona: React.ReactNode };

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONE = {
  persone: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8S14.5 16 14.5 19" />
      <circle cx="16.5" cy="9" r="2.4" />
      <path d="M15.5 14.5c2.8 0 5 1.6 5 4.1" />
    </svg>
  ),
  organigramma: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="9" y="3" width="6" height="4.6" rx="1.4" />
      <rect x="3" y="16.4" width="6" height="4.6" rx="1.4" />
      <rect x="15" y="16.4" width="6" height="4.6" rx="1.4" />
      <path d="M12 7.6v4M6 16.4v-2.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2.5" />
    </svg>
  ),
  funzioni: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="1.8" />
      <rect x="13.1" y="3.5" width="7.4" height="7.4" rx="1.8" />
      <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="1.8" />
      <rect x="13.1" y="13.1" width="7.4" height="7.4" rx="1.8" />
    </svg>
  ),
  stipendi: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="6" width="18" height="12" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.2 9.2h.01M17.8 14.8h.01" />
    </svg>
  ),
  inquadramenti: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M7 3.5h7.5L19 8v12.5H7z" />
      <path d="M14.5 3.5V8H19M9.8 12h6.4M9.8 15.5h6.4" />
    </svg>
  ),
  cartellini: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </svg>
  ),
  benefit: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3.5" y="8" width="17" height="4" rx="1.2" />
      <path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5" />
      <path d="M12 8c-1.8 0-4.2-.7-4.2-2.4C7.8 4.2 9 3.5 10 3.5c1.6 0 2 2.2 2 4.5 0-2.3.4-4.5 2-4.5 1 0 2.2.7 2.2 2.1C16.2 7.3 13.8 8 12 8z" />
    </svg>
  ),
  chiavi: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="8" cy="15.5" r="4.2" />
      <path d="M11 12.5 20 3.5M16.5 7l2.6 2.6M13.9 9.6l2 2" />
    </svg>
  ),
} as const;

const SEZIONI: { nome: string; voci: Voce[] }[] = [
  {
    nome: "Organico",
    voci: [
      { href: "/", nome: "Persone", icona: ICONE.persone },
      { href: "/organigramma", nome: "Organigramma", icona: ICONE.organigramma },
      { href: "/funzioni", nome: "Funzioni e mansioni", icona: ICONE.funzioni },
    ],
  },
  {
    nome: "Amministrazione",
    voci: [
      { href: "/stipendi", nome: "Stipendi", icona: ICONE.stipendi },
      { href: "/benefit", nome: "Benefit", icona: ICONE.benefit },
      { href: "/inquadramenti", nome: "Inquadramenti", icona: ICONE.inquadramenti },
      { href: "/cartellini", nome: "Cartellini", icona: ICONE.cartellini },
    ],
  },
];

// «Un'etichetta di sezione si paga solo se raggruppa ≥ 2 voci: le sezioni
// monovoce si accorpano» (regola decisa dal custode il 28/08/2026 sul menu di
// FINANCE, valida per tutte le app). «Configurazione» ne aveva UNA — l'etichetta
// costava una riga di intestazione per introdurre una voce sola. Resta in fondo,
// staccata dalle altre da una spaziatura: il raggruppamento sopravvive senza
// che nessuna voce sparisca dal menu.
const VOCI_IN_FONDO: Voce[] = [{ href: "/chiavi", nome: "Chiavi delle app", icona: ICONE.chiavi }];

export function Sidebar({ nome, ruolo, conLogout }: { nome: string; ruolo: string; conLogout: boolean }) {
  const pathname = usePathname();
  const [aperto, setAperto] = useState(false);

  // Chiusura con Esc, come ogni pannello sovrapposto (Libro §9).
  useEffect(() => {
    if (!aperto) return;
    const suEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("keydown", suEsc);
    return () => document.removeEventListener("keydown", suEsc);
  }, [aperto]);

  // Il drawer si chiude appena si cambia pagina.
  useEffect(() => { setAperto(false); }, [pathname]);

  // Sul login il guscio non si monta: montato, metteva 9 link focalizzabili
  // PRIMA del campo password, coperti dall'overlay ma raggiungibili col Tab e
  // letti per intero dallo screen reader (misurato il 29/08/2026).
  if (pathname === "/login") return null;
  const attiva = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/persone") : pathname.startsWith(href);

  const iniziali =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "D";

  return (
    <>
      {/* Sotto i 900px il menu è un drawer da SINISTRA con topbar da 56px
          (Libro §2). Prima si sdraiava in flusso e mangiava 278px — il 34% della
          prima schermata — su ogni pagina, con le 8 voci sparse su tre colonne
          disallineate (misurato il 29/08/2026). */}
      <header className="topbar">
        <button
          type="button"
          className="topbar-menu"
          aria-label="Apri il menu"
          aria-expanded={aperto}
          aria-controls="menu-principale"
          onClick={() => setAperto(true)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" {...S}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="brand-logo">D</div>
        <div className="brand-name">Deluxy Personale</div>
      </header>

      {aperto && <div className="scrim" onClick={() => setAperto(false)} />}

      <aside id="menu-principale" className={`sidebar${aperto ? " aperta" : ""}`}>
      <a className="brand" href="/">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">Deluxy Personale</div>
          <div className="brand-sub">Organico e mansioni</div>
        </div>
      </a>

      {SEZIONI.map((sezione) => (
        <div key={sezione.nome}>
          <div className="nav-sezione">{sezione.nome}</div>
          {sezione.voci.map((voce) => (
            <a
              key={voce.href}
              href={voce.href}
              // Terzo segnale della voce attiva, oltre a sfondo e peso: senza,
              // chi naviga con lo screen reader non sa dove si trova (Libro §1).
              aria-current={attiva(voce.href) ? "page" : undefined}
              className={`nav-voce${attiva(voce.href) ? " attiva" : ""}`}
            >
              {voce.icona}
              {voce.nome}
            </a>
          ))}
        </div>
      ))}

      <div className="nav-staccate">
        {VOCI_IN_FONDO.map((voce) => (
          <a
            key={voce.href}
            href={voce.href}
            aria-current={attiva(voce.href) ? "page" : undefined}
            className={`nav-voce${attiva(voce.href) ? " attiva" : ""}`}
          >
            {voce.icona}
            {voce.nome}
          </a>
        ))}
      </div>

      <div className="sidebar-fondo">
        <div className="avatar">{iniziali}</div>
        <div className="sidebar-utente">
          <div className="sidebar-nome">{nome}</div>
          <div className="sidebar-ruolo">{ruolo}</div>
        </div>
        {conLogout && (
          <a className="logout-btn" href="/logout" title="Esci">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
              <path d="M10 8l-4 4 4 4M6 12h10" />
            </svg>
          </a>
        )}
      </div>
      </aside>
    </>
  );
}
