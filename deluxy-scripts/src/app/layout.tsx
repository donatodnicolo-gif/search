import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Scripts",
  description: "L'archivio dei testi pronti Deluxy: vendite, inviti, presentazioni",
};

// I conteggi della sidebar. Se il DB non è raggiungibile (build o prima
// configurazione) tornano a zero senza far cadere la pagina.
async function conteggi(): Promise<{ script: number; app: number; chiavi: number }> {
  try {
    const [script, app, chiavi] = await Promise.all([
      prisma.script.count({ where: { attivo: true } }),
      prisma.appCollegata.count({ where: { attiva: true } }),
      prisma.apiKey.count({ where: { attiva: true } }),
    ]);
    return { script, app, chiavi };
  } catch {
    return { script: 0, app: 0, chiavi: 0 };
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
              'try{if(localStorage.getItem("scripts-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
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
                <div className="brand-name">Deluxy Scripts</div>
                <div className="brand-sub">I testi pronti dell&apos;azienda</div>
              </div>
            </a>
          </div>
          <div className="topbar-azioni">
            <a className="btn" href="/script/nuovo">Nuovo testo</a>
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
