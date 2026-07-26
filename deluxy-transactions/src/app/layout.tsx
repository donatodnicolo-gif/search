import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { esci } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Transactions",
  description: "Registro sicuro delle richieste di pagamento delle app Deluxy",
  robots: { index: false, follow: false },
};

// Pagine sempre dinamiche: qui non esiste niente che si possa mettere in cache.
export const dynamic = "force-dynamic";

async function conteggi(): Promise<{ inAttesa: number; approvate: number }> {
  try {
    const [inAttesa, approvate] = await Promise.all([
      prisma.richiesta.count({ where: { stato: { in: ["in_attesa", "sospesa"] } } }),
      prisma.richiesta.count({ where: { stato: "approvata" } }),
    ]);
    return { inAttesa, approvate };
  } catch {
    return { inAttesa: 0, approvate: 0 };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const operatore = await operatoreCorrente();
  const c = operatore ? await conteggi() : { inAttesa: 0, approvate: 0 };

  return (
    <html lang="it">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("trx-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
          }}
        />
      </head>
      <body>
        {operatore ? (
          <>
            <header className="topbar">
              <div style={{ display: "flex", alignItems: "center" }}>
                <ToggleSidebar />
                <a className="brand" href="/">
                  <div className="brand-logo">D</div>
                  <div>
                    <div className="brand-name">Deluxy Transactions</div>
                    <div className="brand-sub">Autorizzazione dei pagamenti</div>
                  </div>
                </a>
              </div>
              <div className="topbar-azioni">
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {operatore.nome} · {operatore.ruolo}
                </span>
                <form action={esci}>
                  <button className="btn btn-secondario small" type="submit">
                    Esci
                  </button>
                </form>
              </div>
            </header>
            <div className="layout">
              <Sidebar conteggi={c} ruolo={operatore.ruolo} />
              {children}
            </div>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
