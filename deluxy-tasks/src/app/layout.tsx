import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Novita } from "@/components/Novita";
import { PalliniNav } from "@/components/PalliniNav";
import { TopbarLink } from "@/components/TopbarLink";
import { SESSION_COOKIE } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Tasks",
  description: "Registro centralizzato delle attività di un utente, condiviso tra le app Deluxy",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // «Esci» compare solo se c'è una sessione da chiudere (in sviluppo senza
  // segreto l'app è aperta e non c'è nulla da cui uscire).
  const jar = await cookies();
  const conSessione = Boolean(jar.get(SESSION_COOKIE)?.value);

  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Tasks</div>
              <div className="brand-sub">Attività condivise fra le app</div>
            </div>
          </a>
          <nav className="topbar-nav">
            {/* La voce «Attività» porta numero e pallino delle novità (Libro
                UX&UI §7): il numero è quanto lavoro c'è, il pallino è «è
                arrivato qualcosa da quando hai guardato». */}
            <PalliniNav />
            <TopbarLink href="/chiavi">Chiavi delle app</TopbarLink>
            {conSessione && (
              <form action="/api/logout" method="post">
                <button type="submit" className="topbar-link">
                  Esci
                </button>
              </form>
            )}
          </nav>
        </header>
        {children}
        {/* Riquadri in basso a destra: le attività che ARRIVANO dalle altre app
            via API. Nel layout perché devono avvisare da qualunque pagina. */}
        <Novita />
      </body>
    </html>
  );
}
