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
  dipendenti: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="7.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M16 13.8c2.4.2 3.9 1.6 4.5 3.9" />
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
};

const sections: { label: string; items: Item[] }[] = [
  {
    label: "Budget",
    items: [
      { href: "/", label: "Dashboard", icon: icons.dashboard },
      { href: "/maison", label: "Maison", icon: icons.maison },
      { href: "/commerciale", label: "Team commerciale", icon: icons.commerciale },
    ],
  },
  {
    label: "Conti",
    items: [
      { href: "/pl", label: "P&L aziendale", icon: icons.pl },
      { href: "/dipendenti", label: "Dipendenti", icon: icons.dipendenti },
      { href: "/spese", label: "Spese ADV", icon: icons.spese },
    ],
  },
  {
    label: "Processo",
    items: [{ href: "/proposte", label: "Proposte budget", icon: icons.proposte }],
  },
  {
    label: "Configurazione",
    items: [
      { href: "/impostazioni", label: "Scenari, premi e costi", icon: icons.impostazioni },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">Deluxy Budgets</div>
          <div className="brand-sub">Budget &amp; P&amp;L</div>
        </div>
      </div>

      {sections.map((s) => (
        <div className="nav-section" key={s.label}>
          <div className="nav-label">{s.label}</div>
          {s.items.map((it) => (
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

      <div className="sidebar-footer">
        <div className="avatar">DX</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Deluxy</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Finanza &amp; Commerciale</div>
        </div>
      </div>
    </aside>
  );
}
