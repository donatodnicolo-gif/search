"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const stroke = {
  fill: "none",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  ),
  maison: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  commerciale: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19" />
      <path d="M16.5 8.5h5M19 6v5" />
    </svg>
  ),
  proposte: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  ),
  pl: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20.5V11M9.3 20.5V6.5M14.6 20.5v-8M21 20.5H3" />
      <path d="m15.5 6.5 5-3.5M20.5 3l-3.6.4M20.5 3l.4 3.6" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="6" r="2.6" />
      <circle cx="5.5" cy="17" r="2.6" />
      <circle cx="18.5" cy="17" r="2.6" />
      <path d="M12 8.6v3.4M12 12H7.2a1.7 1.7 0 0 0-1.7 1.7v.7M12 12h4.8a1.7 1.7 0 0 1 1.7 1.7v.7" />
    </svg>
  ),
  cfo: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 4.5h18M4.5 4.5v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-13" />
      <path d="M8 9.5l3 3 5-5.5" />
    </svg>
  ),
  consuntivo: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20V4h11l5 5v11z" />
      <path d="M14 4v5h5" />
      <path d="M8 13h8M8 16.5h5" />
    </svg>
  ),
  ricorrenti: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3.5V7h-3.5" />
      <path d="M12 8v4.3l2.8 1.7" />
    </svg>
  ),
  dipendenti: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="7.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M16 13.8c2.4.2 3.9 1.6 4.5 3.9" />
    </svg>
  ),
  margini: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 19 19 5" />
      <circle cx="7.5" cy="7.5" r="2.6" />
      <circle cx="16.5" cy="16.5" r="2.6" />
    </svg>
  ),
  piattaforme: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="8" height="8" rx="1.5" />
      <rect x="13" y="4" width="8" height="5" rx="1.5" />
      <rect x="3" y="15" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="8" rx="1.5" />
    </svg>
  ),
  spese: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 9.7c0-1.2 1.1-1.9 2.5-1.9s2.5.7 2.5 1.8c0 2.6-5 1.5-5 4.2 0 1.1 1.1 1.8 2.5 1.8s2.5-.6 2.5-1.7" />
    </svg>
  ),
  premi: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5.5a0 0 0 0 0 0 0c0 3 1.5 4.5 3.2 4.8M16 5h2.5c0 3-1.5 4.5-3.2 4.8" />
      <path d="M12 11v4M9 20h6M10 15h4l.6 5H9.4l.6-5z" />
    </svg>
  ),
  impostazioni: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.39 2.54a7 7 0 0 0-2.42 1.4l-2.35-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.4l.39 2.54h3.4l.39-2.54a7 7 0 0 0 2.42-1.4l2.35.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4z" />
    </svg>
  ),
  // ⭐ Due icone nate il 30/08/2026 per una ragione precisa: «Chiavi» usava
  // quella del CFO (un riquadro con spunta) e «Accesso» **la stessa del
  // trofeo dei premi**. Il custode UX ha deciso il 28/08 che due voci non
  // portano mai la stessa icona — a barra ridotta l'icona È l'etichetta, e un
  // trofeo su «Accesso» faceva sembrare la voce una costola dei premi.
  chiave: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M11 12h9M17 12v3M20 12v2.5" />
    </svg>
  ),
  accesso: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M14 3.5H6.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  ),
};

// Due aree nette: BUDGET (pianificazione) e CONSUNTIVO (dati reali), più la
// configurazione. L'appartenenza deve restare allineata con areaDi() in
// src/lib/aree.ts, che etichetta le pagine.
type Gruppo = { label?: string; items: Item[] };
type AreaNav = { area: string; badge: string; gruppi: Gruppo[] };

// ⭐ **Quattro voci, non ventitré** (revisione del 24/08/2026: «l'app è troppo
// complessa per il suo obiettivo»). La navigazione risponde alle tre domande
// dell'app — cosa manca, quanto abbiamo pianificato, come sta andando — più i
// premi. Le pagine di dettaglio esistono ancora tutte, ma ci si arriva **dal
// hub che le contiene**: in una lista di venti voci nessuna si trova.
const nav: AreaNav[] = [
  {
    area: "Lavoro",
    badge: "blue",
    gruppi: [
      {
        items: [
          // ⭐ L'apertura è «Aggiornato» (utente, 30/08/2026): chi apre chiede
          // come stanno andando le cose, non cosa manca da scrivere. «Da fare»
          // resta subito sotto.
          { href: "/aggiornato", label: "Aggiornato", icon: icons.consuntivo },
          { href: "/da-fare", label: "Da fare", icon: icons.dashboard },
          { href: "/budget", label: "Budget", icon: icons.maison },
          // ⭐ 27/08/2026, richiesta dell utente: «ho bisogno che da menu possa
          // andare a vedere i costi del personale e dei relativi team». La
          // revisione del 24/08 aveva ridotto la navigazione a quattro voci e
          // spinto queste due dentro il hub /budget — ma il costo del personale
          // e la seconda voce di spesa dell azienda, e cercarla dentro un altra
          // pagina vuol dire non guardarla. Due voci, non venti.
          { href: "/dipendenti", label: "Personale", icon: icons.dipendenti },
          { href: "/team", label: "Team", icon: icons.team },
          // ⭐ **L'ordine dice come si legge il gruppo** (30/08/2026): prima
          // quello che si SCRIVE (il budget, le persone, le squadre), poi il
          // **conto economico** che ne esce, e per ultimi i **premi** — che si
          // misurano su quel risultato. Prima erano invertiti, cioè il premio
          // stava sopra il numero che lo fa scattare.
          { href: "/pl", label: "Conto economico", icon: icons.pl },
          { href: "/premi", label: "Target e premi", icon: icons.premi },
        ],
      },
    ],
  },
  {
    area: "Configurazione",
    badge: "neutral",
    gruppi: [
      {
        items: [
          { href: "/impostazioni", label: "Scenari e costi", icon: icons.impostazioni },
          { href: "/impostazioni/chiavi", label: "Chiavi", icon: icons.chiave },
          { href: "/impostazioni/accesso", label: "Accesso", icon: icons.accesso },
        ],
      },
    ],
  },
];

// Un non-admin vede solo le proposte: e la stessa regola del middleware, qui
// applicata alle voci di menu. Mostrare porte che poi si chiudono in faccia e
// il modo piu sicuro per far pensare che l app sia rotta.
export function Sidebar({ ruolo = "admin", nome = null }: { ruolo?: "admin" | "lettura" | "proposte"; nome?: string | null }) {
  const pathname = usePathname();
  // ⚠️ Le proposte non stanno più nella navigazione dell'admin (il budget si
  // scrive diretto), ma il ruolo «proposte» continua a vivere di quelle: la sua
  // voce si costruisce qui invece di filtrare una nav che non la contiene più —
  // filtrandola, un responsabile vedrebbe una sidebar vuota.
  const visibile: AreaNav[] = ruolo === "admin"
    ? nav
    : [{
        area: "Lavoro",
        badge: "blue",
        gruppi: [{ items: [{ href: "/proposte", label: "Proposte budget", icon: icons.proposte }] }],
      }];
  // La radice rimanda al consuntivo: finché il redirect non è atterrato è quella
  // la voce accesa, così la sidebar non lampeggia su niente all'apertura.
  // Vince la voce col percorso **più lungo** che combacia: con il semplice
  // startsWith, su /impostazioni/chiavi si accendevano due voci insieme.
  const tutti = nav.flatMap((a) => a.gruppi.flatMap((g) => g.items.map((i) => i.href)));
  const migliore = tutti
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => (pathname === "/" ? href === "/aggiornato" : migliore === href);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">Deluxy Budgets</div>
          <div className="brand-sub">Budget &amp; P&amp;L</div>
        </div>
      </div>

      {visibile.map((a) => (
        <div className="nav-area" key={a.area}>
          <div className="nav-area-head">
            <span className={`dot dot-${a.badge}`} />
            {a.area}
          </div>
          {a.gruppi.map((g, gi) => (
            <div className="nav-section" key={g.label ?? gi}>
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`nav-item${isActive(it.href) ? " active" : ""}`}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="avatar">DX</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{nome ?? "Deluxy"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {nome ? (ruolo === "admin" ? "Amministratore" : "Proposte budget") : "Finanza & Commerciale"}
          </div>
        </div>
      </div>
    </aside>
  );
}
