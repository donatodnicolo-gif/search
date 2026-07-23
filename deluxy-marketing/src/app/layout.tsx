import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Marketing",
  description:
    "La memoria operativa dell'advertising Deluxy: analisi, audit, azioni con storia e feedback, campagne e documenti della cartella ADV DELUXY SRL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Riapplica la preferenza sidebar prima del paint (niente lampeggio) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("marketing-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
          }}
        />
      </head>
      <body>
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center" }}>
            <ToggleSidebar />
            <a className="brand" href="/">
              <div className="brand-logo">D</div>
              <div>
                <div className="brand-name">Deluxy Marketing</div>
                <div className="brand-sub">Analisi, azioni e campagne ADV</div>
              </div>
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
