import type { Metadata } from "next";
import "./globals.css";
import { Identita } from "@/components/Identita";
import { Novita } from "@/components/Novita";
import { PalliniNav } from "@/components/PalliniNav";

export const metadata: Metadata = {
  title: "Deluxy Acquisti",
  description:
    "Acquisti, richieste di acquisto e movimenti finanziari centralizzati, con ricerca AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Acquisti</div>
              <div className="brand-sub">Acquisti, richieste e pagamenti</div>
            </div>
          </a>
          <nav className="topbar-nav">
            {/* La voce «Richieste» porta numero e pallino delle novità (Libro
                UX&UI §7): il numero è quante aspettano una decisione, il
                pallino è «è arrivato qualcosa da quando hai guardato». */}
            <PalliniNav />
            <Identita />
          </nav>
        </header>
        {children}
        {/* Riquadri in basso a destra: le richieste che ARRIVANO da colleghi o
            altre app. Nel layout perché devono avvisare da qualunque pagina. */}
        <Novita />
      </body>
    </html>
  );
}
