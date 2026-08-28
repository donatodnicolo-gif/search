import type { Metadata } from "next";
import { ScrimSidebar } from "@/components/ScrimSidebar";
import { SessioneScaduta } from "@/components/SessioneScaduta";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Anagrafiche",
  description: "Registro centralizzato dei partner B2B Deluxy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Riapplica la preferenza sidebar prima del paint (niente lampeggio).
            Su mobile (≤800px) il drawer nasce SEMPRE chiuso, a prescindere dalla
            preferenza salvata: così si apre solo col tocco e — con la
            navigazione a ricaricamento pieno delle pagine — si richiude a ogni
            passaggio (Libro §2). 27/08 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var v=localStorage.getItem("anagrafiche-sidebar");if(v==="chiusa"||window.innerWidth<=800)document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
          }}
        />
      </head>
      <body>
        <header className="topbar">
          <ToggleSidebar />
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Anagrafiche</div>
              <div className="brand-sub">Registro centralizzato partner B2B</div>
            </div>
          </a>
        </header>
        {children}
        <ScrimSidebar />
        {/* La fascia «sessione scaduta»: resta invisibile finché il poller dei
            pallini (PalliniNav) non se ne accorge. Libro UX&UI v1.4 §7. */}
        <SessioneScaduta />
      </body>
    </html>
  );
}
