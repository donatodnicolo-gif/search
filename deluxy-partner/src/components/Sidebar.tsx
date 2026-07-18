"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  partner: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M15.5 14.6c2.6.1 4.3 1.6 4.9 4" />
    </svg>
  ),
  fattura: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M7 3h10a1 1 0 0 1 1 1v17l-3-1.7L12 21l-3-1.7L6 21V4a1 1 0 0 1 1-1z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </svg>
  ),
  vendite: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 5h2l2.2 11h9.6L20 8H7" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="16.5" cy="19.5" r="1.3" />
    </svg>
  ),
  saldi: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3v18M5 8c0-2 2.5-3.5 7-3.5S19 6 19 8s-2.5 3.5-7 3.5S5 14 5 16s2.5 3.5 7 3.5 7-1.5 7-3.5" />
    </svg>
  ),
  scadenze: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.2" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </svg>
  ),
  transazioni: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 8h13M14 4.5 17.5 8 14 11.5" />
      <path d="M20 16H7M10 12.5 6.5 16l3.5 3.5" />
    </svg>
  ),
  analisi: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3v18" />
      <path d="M17 7.5c0-1.7-2.2-2.5-5-2.5s-5 .9-5 2.6c0 4.3 10 2.4 10 6.8 0 1.7-2.2 2.6-5 2.6s-5-.8-5-2.5" />
    </svg>
  ),
  confronti: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M7 17l4-6 3 3 4.5-7" />
      <path d="M3 4v16h18" />
    </svg>
  ),
  api: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12" />
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
    label: "Operatività",
    items: [
      { href: "/", label: "Dashboard", icon: icons.dashboard },
      { href: "/fatture", label: "Servizi a fatturazione", icon: icons.fattura },
      { href: "/vendite", label: "Vendite come vendor", icon: icons.vendite },
    ],
  },
  {
    label: "Rete",
    items: [{ href: "/partner", label: "Partner", icon: icons.partner }],
  },
  {
    label: "Amministrazione",
    items: [
      { href: "/saldi", label: "Saldi e bonifici", icon: icons.saldi },
      { href: "/transazioni", label: "Import transazioni", icon: icons.transazioni },
      { href: "/scadenzario", label: "Scadenzario", icon: icons.scadenze },
      { href: "/report", label: "Report", icon: icons.report },
      { href: "/analisi", label: "Analisi finanziaria", icon: icons.analisi },
      { href: "/confronti", label: "Confronti", icon: icons.confronti },
    ],
  },
  {
    label: "Configurazione",
    items: [
      { href: "/verifiche", label: "API verifiche", icon: icons.api },
      { href: "/impostazioni", label: "Impostazioni", icon: icons.impostazioni },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [chiusa, setChiusa] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // stato persistito: la preferenza sopravvive alla navigazione e al reload
  useEffect(() => {
    setChiusa(localStorage.getItem("sidebar-chiusa") === "1");
  }, []);
  const toggle = () => {
    setChiusa((v) => {
      localStorage.setItem("sidebar-chiusa", v ? "0" : "1");
      return !v;
    });
  };

  return (
    <aside
      className={`sidebar${chiusa ? " chiusa" : ""}`}
      style={{ width: chiusa ? 68 : 250, flex: `0 0 ${chiusa ? 68 : 250}px` }}
    >
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggle}
        title={chiusa ? "Espandi il menu" : "Riduci il menu"}
        aria-label={chiusa ? "Espandi il menu" : "Riduci il menu"}
      >
        <svg viewBox="0 0 24 24" {...stroke} style={{ width: 15, height: 15 }}>
          {chiusa ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
        </svg>
      </button>

      <div className="brand">
        <div className="brand-logo">D</div>
        <div className="solo-estesa">
          <div className="brand-name">Deluxy Partner</div>
          <div className="brand-sub">Gestione partner</div>
        </div>
      </div>

      {sections.map((s) => (
        <div className="nav-section" key={s.label}>
          <div className="nav-label solo-estesa">{s.label}</div>
          {s.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`nav-item${isActive(it.href) ? " active" : ""}`}
              title={chiusa ? it.label : undefined}
            >
              {it.icon}
              <span className="solo-estesa">{it.label}</span>
            </Link>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="avatar">DX</div>
        <div className="solo-estesa">
          <div style={{ fontSize: 13, fontWeight: 600 }}>Deluxy</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Amministrazione</div>
        </div>
      </div>
    </aside>
  );
}
