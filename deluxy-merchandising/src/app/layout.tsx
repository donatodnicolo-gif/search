import type { Metadata } from "next";
import { SelettoreAmbito } from "@/components/SelettoreAmbito";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import { brandCorrente, brandDisponibili } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Merchandising",
  description: "Gestione del prodotto a 360°: collezioni, sviluppo, costi e margini, visual, Shopify",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, disponibili] = await Promise.all([brandCorrente(), brandDisponibili()]);
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
          {disponibili.length > 0 && <SelettoreAmbito brand={brand} disponibili={disponibili} />}
        </header>
        {children}
      </body>
    </html>
  );
}
