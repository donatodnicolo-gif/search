import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { leggiSessione } from "@/lib/sessione";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AreaBadge } from "@/components/AreaBadge";

export const metadata: Metadata = {
  title: "Deluxy Budgets",
  description: "Budget aziendali, P&L, premi e spese ADV Deluxy",
};

// Chi sta guardando: serve alla sidebar per mostrare solo quello che questa
// persona puo' aprire. Il permesso vero lo fa il middleware — qui si evita
// soltanto di mettere in vista porte che poi si chiudono in faccia.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar ruolo={sessione?.ruolo ?? "admin"} nome={sessione?.nome ?? null} />
          <main className="main">
            <AreaBadge />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
