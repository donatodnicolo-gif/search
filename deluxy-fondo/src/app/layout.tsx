import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Fondo",
  description:
    "Monitoraggio quotidiano di aziende in cambio di management: dati, indicatori chiave e ipotesi di investimento con la loro incertezza dichiarata.",
};

const VOCI = [
  { href: "/", testo: "Cruscotto" },
  { href: "/mandati", testo: "Mandati" },
  { href: "/tim", testo: "TIM" },
  { href: "/metodo", testo: "Metodo" },
  { href: "/dati", testo: "Dati" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Fondo</div>
              <div className="brand-sub">Cambio di management come segnale</div>
            </div>
          </a>
          <nav className="topbar-nav">
            {VOCI.map((v) => (
              <a key={v.href} className="topbar-link" href={v.href}>
                {v.testo}
              </a>
            ))}
          </nav>
        </header>
        {children}
        <footer className="wrap legale" style={{ paddingTop: 0 }}>
          <strong>Non è consulenza finanziaria.</strong> Deluxy Fondo è uno strumento di
          ricerca: mostra dati pubblici, indicatori calcolati e ipotesi con le loro
          assunzioni. Non raccomanda operazioni, non esegue ordini e non tiene conto della
          tua situazione personale. I rendimenti passati non predicono quelli futuri; le
          simulazioni non sono risultati reali. Verifica sempre i numeri sulle fonti
          primarie prima di qualunque decisione.
        </footer>
      </body>
    </html>
  );
}
