import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Anagrafiche",
  description: "Registro centralizzato dei partner B2B Deluxy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Anagrafiche</div>
              <div className="brand-sub">Registro centralizzato partner B2B</div>
            </div>
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}
