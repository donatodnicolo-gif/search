import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Merchandising",
  description: "Gestione del prodotto a 360°: collezioni, sviluppo, costi e margini, visual, Shopify",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Riapplica la preferenza sidebar prima del paint (niente lampeggio) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("merchandising-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
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
                <div className="brand-name">Deluxy Merchandising</div>
                <div className="brand-sub">Il prodotto a 360°, come una maison</div>
              </div>
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
