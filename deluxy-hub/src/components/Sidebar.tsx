"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { esci } from "@/lib/actions";
import { RUOLO_INFO } from "@/lib/ruoli";
import type { Sessione } from "@/lib/session";

// Il menu laterale del Hub, come in tutte le app Deluxy (Libro UX&UI §1).
// Elenca gli STRUMENTI del portale (home, installa, cartellino, amministrazione)
// — NON le 19 app, che sono il contenuto della home. Voce attiva da usePathname.
// Lo stato del cartellino arriva già calcolato dal layout (server): qui la
// sidebar è client solo per sapere su che pagina sei.
type Voce = {
  href: string;
  nome: string;
  icona: React.ReactNode;
  sub?: string; // riga secondaria muta (es. stato del cartellino, in parole)
  esatta?: boolean; // match esatto della rotta (per «/» e «/cartellino»)
};

export function Sidebar({
  sessione,
  cartellino,
}: {
  sessione: Sessione;
  cartellino: { dentro: boolean; da: string | null };
}) {
  const path = usePathname();
  const admin = sessione.ruolo === "admin";

  const sezioni: { titolo: string; voci: Voce[] }[] = [
    {
      titolo: "Portale",
      voci: [
        { href: "/", nome: "Le app", icona: iGriglia, esatta: true },
        // Il nome è quello della pagina: «Installa» da solo faceva pensare a
        // installare il Hub, mentre quella pagina spiega come portarsi sul
        // telefono TUTTE le app Deluxy (Libro, legge 11: stesso nome ovunque).
        { href: "/scarica", nome: "Installa le app", icona: iScarica },
      ],
    },
    {
      // Le presenze stanno tutte qui: le proprie e quelle del team. Prima
      // «Gestione cartellino» era in fondo ad Amministrazione, lontana dalla
      // stessa materia: chi cercava le ore del team le trovava in mezzo a
      // chiavi e servizi. Una materia, un posto solo.
      titolo: "Presenze",
      voci: [
        {
          href: "/cartellino",
          // «Di chi» è il cartellino: conta, ora che le voci sono due.
          nome: "Il mio cartellino",
          esatta: true,
          // Lo stato è nel pallino (verde/neutro) MA sempre anche in
          // parole nella riga sotto (§5/WCAG: il colore da solo non basta), con
          // l’ora d’ingresso, che è l’informazione che conta.
          icona: <span className={`sb-dot ${cartellino.dentro ? "verde" : "neutro"}`} aria-hidden="true" />,
          sub: cartellino.dentro ? (cartellino.da ? `Dentro dalle ${cartellino.da}` : "Dentro") : "Fuori",
        },
        ...(admin
          ? [{ href: "/cartellino/gestione", nome: "Gestione cartellini", icona: iGestione }]
          : []),
      ],
    },
    ...(admin
      ? [
          {
            // Amministrazione = il governo dell’impianto: le persone che
            // entrano, i segreti, la salute dei servizi. Le presenze non sono
            // impianto e infatti stanno sopra, con le loro.
            titolo: "Amministrazione",
            voci: [
              { href: "/utenti", nome: "Utenti", icona: iUtenti },
              { href: "/chiavi", nome: "Chiavi", icona: iChiavi },
              { href: "/stato", nome: "Stato servizi", icona: iStato },
            ],
          },
        ]
      : []),
  ];

  const attiva = (v: Voce) =>
    v.esatta ? path === v.href : path === v.href || path.startsWith(v.href + "/");

  return (
    <nav className="sidebar" aria-label="Navigazione">
      <div className="sb-voci">
        {sezioni.map((s) => (
          <div className="sb-sezione" key={s.titolo}>
            <div className="sb-label">{s.titolo}</div>
            {s.voci.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                className={`sb-item${attiva(v) ? " attiva" : ""}`}
                aria-current={attiva(v) ? "page" : undefined}
              >
                <span className="sb-icona">{v.icona}</span>
                <span className="sb-testo">
                  <span className="sb-nome">{v.nome}</span>
                  {v.sub && <span className="sb-sub">{v.sub}</span>}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Identità e uscita in fondo, come le sorelle (Libro §1): avatar iniziali,
          nome (→ profilo), ruolo come testo secondario (NON un badge oro: l'oro
          non è mai uno stato, §5), e «Esci» come icona — non più il bottone nero
          pesante che il Libro citava come difetto del Hub. */}
      <div className="sidebar-footer">
        <Link href="/profilo" className="sf-utente" title="Il tuo profilo">
          <span className="sf-avatar">{iniziali(sessione.nome)}</span>
          <span className="sf-testo">
            <span className="sf-nome">{sessione.nome}</span>
            <span className="sf-ruolo">{RUOLO_INFO[sessione.ruolo].etichetta}</span>
          </span>
        </Link>
        <form action={esci}>
          <button type="submit" className="sf-esci" title="Esci dal portale" aria-label="Esci">
            {iEsci}
          </button>
        </form>
      </div>
    </nav>
  );
}

function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/);
  return ((parti[0]?.[0] ?? "") + (parti[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ---- Icone (linea sottile, 17px, come le app sorelle) ----
const svg = (children: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const iGriglia = svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
const iScarica = svg(<><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></>);
const iUtenti = svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3.2 3.2 0 0 1 0 6" /><path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" /></>);
const iChiavi = svg(<><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8" /><path d="M16 16l2-2" /><path d="M19 19l1.5-1.5" /></>);
const iStato = svg(<><path d="M3 12h4l2 6 4-14 2 8h6" /></>);
const iGestione = svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 12l2 2 4-4" /></>);
const iEsci = svg(<><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" /><path d="M10 12H3" /><path d="M6 8l-4 4 4 4" /></>);
