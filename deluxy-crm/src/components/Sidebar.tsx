"use client";

import { usePathname } from "next/navigation";

// La navigazione dell'app: sidebar chiara traslucida con sezioni etichettate
// (design system §Navigazione). Client component solo per evidenziare la voce
// attiva; i dati dell'utente arrivano dal layout (server).

type Voce = { href: string; nome: string; icona: keyof typeof ICONE };
type Sezione = { etichetta: string; voci: Voce[] };

const SEZIONI: Sezione[] = [
  {
    etichetta: "Clientela",
    voci: [
      { href: "/", nome: "Oggi", icona: "oggi" },
      { href: "/clienti", nome: "Clienti", icona: "clienti" },
      { href: "/ricorrenze", nome: "Ricorrenze", icona: "ricorrenze" },
    ],
  },
  {
    etichetta: "Relazioni",
    voci: [
      { href: "/liste", nome: "Liste", icona: "liste" },
      { href: "/eventi", nome: "Eventi", icona: "eventi" },
      { href: "/mail", nome: "Mail", icona: "mail" },
      { href: "/whatsapp", nome: "WhatsApp", icona: "whatsapp" },
      { href: "/mail/template", nome: "Template", icona: "template" },
    ],
  },
  {
    etichetta: "Sistema",
    voci: [{ href: "/impostazioni", nome: "Impostazioni", icona: "impostazioni" }],
  },
];

// Icone stroke 1.7 stile SF Symbols, coerenti col resto dell'ecosistema.
const ICONE = {
  oggi: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </>
  ),
  clienti: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 19.5c.9-3.2 3.3-4.9 6.2-4.9s5.3 1.7 6.2 4.9" />
      <path d="M15.5 5.2a3.4 3.4 0 0 1 0 5.6M18.1 14.9c1.6.8 2.8 2.3 3.3 4.6" />
    </>
  ),
  ricorrenze: (
    <>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2.5" />
      <path d="M3.5 13.5h17M12 9v11.5M12 9C10 5.5 6.5 5 5.8 7.2 5.2 9 8.5 9 12 9zm0 0c2-3.5 5.5-4 6.2-1.8.6 1.8-2.7 1.8-6.2 1.8z" />
    </>
  ),
  eventi: (
    <>
      <path d="M7 3.5h10l-3.6 6.2a5 5 0 1 1-2.8 0z" transform="translate(0 .5)" />
      <path d="M12 15.5v4.5M8.5 20.5h7" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.6 7 8.4 6.3L20.4 7" />
    </>
  ),
  liste: (
    <>
      <path d="M8.5 6h12M8.5 12h12M8.5 18h8" />
      <circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none" />
      <path d="m19.2 16.2.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" transform="scale(.92) translate(1.2 .8)" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.5-1a8.5 8.5 0 1 0 4-16z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-1-1 .7a4.6 4.6 0 0 1-1.6-1.6l.7-1-1-2z" />
    </>
  ),
  template: (
    <>
      <path d="M7 3.5h7.5L19 8v12.5H7z" transform="translate(-1 0)" />
      <path d="M13.5 3.5V8H18M9 12h6M9 15.5h6" transform="translate(-1 0)" />
    </>
  ),
  impostazioni: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
} as const;

function Icona({ nome }: { nome: keyof typeof ICONE }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICONE[nome]}
    </svg>
  );
}

export default function Sidebar({ utente, ruolo }: { utente: string | null; ruolo: string | null }) {
  const pathname = usePathname();
  const attiva = (href: string) =>
    href === "/" ? pathname === "/" : href === "/mail" ? pathname === "/mail" || pathname === "/mail/componi" : pathname.startsWith(href);

  const iniziali = utente
    ? utente
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
    : "D";

  return (
    <aside className="sidebar">
      <a className="brand" href="/">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">Deluxy CRM</div>
          <div className="brand-sub">Il libro dei clienti</div>
        </div>
      </a>

      {SEZIONI.map((s) => (
        <div key={s.etichetta}>
          <div className="nav-sezione">{s.etichetta}</div>
          {s.voci.map((v) => (
            <a key={v.href} className={`nav-voce${attiva(v.href) ? " attiva" : ""}`} href={v.href}>
              <Icona nome={v.icona} />
              {v.nome}
            </a>
          ))}
        </div>
      ))}

      <div className="sidebar-fondo">
        <div className="avatar">{iniziali}</div>
        <div className="sidebar-utente">
          <div className="nome">{utente ?? "Team Deluxy"}</div>
          <div className="ruolo">{ruolo ?? "accesso di team"}</div>
        </div>
        <a className="esci" href="/logout" title="Esci">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M9.5 8 5 12l4.5 4M5 12h11" />
          </svg>
        </a>
      </div>
    </aside>
  );
}
