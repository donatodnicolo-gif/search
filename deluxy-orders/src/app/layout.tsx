import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { contaClienti } from "@/lib/clienti";
import { LISTE } from "@/lib/segmenti";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Orders",
  description: "Registro centralizzato degli ordini Shopify Deluxy",
};

// I conteggi della sidebar. Se il DB non è raggiungibile (build o prima
// configurazione) tornano a zero senza far cadere la pagina.
async function conteggi(): Promise<{ ordini: number; daClassificare: number; clienti: number; liste: number; automazioni: number; script: number }> {
  try {
    const [ordini, daClassificare, clienti, automazioni, script] = await Promise.all([
      prisma.ordine.count(),
      prisma.ordine.count({ where: { stato: { predefinito: true } } }),
      contaClienti(),
      prisma.automazione.count(),
      prisma.script.count(),
    ]);
    return { ordini, daClassificare, clienti, liste: LISTE.length, automazioni, script };
  } catch {
    return { ordini: 0, daClassificare: 0, clienti: 0, liste: LISTE.length, automazioni: 0, script: 0 };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await conteggi();
  return (
    <html lang="it">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("orders-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
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
                <div className="brand-name">Deluxy Orders</div>
                <div className="brand-sub">Registro centralizzato ordini</div>
              </div>
            </a>
          </div>
        </header>
        <div className="layout">
          <Sidebar conteggi={c} />
          {children}
        </div>
      </body>
    </html>
  );
}
