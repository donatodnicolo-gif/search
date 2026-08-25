import type { Metadata } from "next";
import "./globals.css";
import { Identita } from "@/components/Identita";

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
          <Identita />
        </header>
        {children}
      </body>
    </html>
  );
}
