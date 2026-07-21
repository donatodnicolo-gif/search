import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Tasks",
  description: "Registro centralizzato delle attività di un utente, condiviso tra le app Deluxy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        </header>
        {children}
      </body>
    </html>
  );
}
