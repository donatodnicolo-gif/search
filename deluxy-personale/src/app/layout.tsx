import type { Metadata } from "next";
import { cookies } from "next/headers";
import { authAttiva, leggiSessione, SESSION_COOKIE } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Personale",
  description:
    "Organico, funzioni e mansioni, organigramma, inquadramenti e retribuzioni delle persone Deluxy",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  const nome = sessione?.nome || "Team Deluxy";
  const ruolo = sessione ? sessione.ruolo : authAttiva() ? "ospite" : "sviluppo";

  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar nome={nome} ruolo={ruolo} conLogout={Boolean(sessione)} />
          <main className="contenuto">{children}</main>
        </div>
      </body>
    </html>
  );
}
