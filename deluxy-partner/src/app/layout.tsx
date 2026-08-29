import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { SessioneScaduta } from "@/components/SessioneScaduta";
import { SESSION_COOKIE, sessioneCorrente } from "@/lib/auth";

// Il nome dell'app è FINANCE: è così che la chiamano in azienda e negli altri
// progetti del repo. «Deluxy Partner» restano la cartella, il database, l'URL e
// il `sistema` con cui il registro Anagrafiche riconosce chi scrive: quelli non
// si toccano, rinominarli scollegherebbe le altre app.
export const metadata: Metadata = {
  title: "Finance",
  description: "Gestione finanziaria e operativa dei partner Deluxy",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sessione = await sessioneCorrente(jar.get(SESSION_COOKIE)?.value);
  const solaLettura = sessione?.ruolo === "sola_lettura";

  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar
            nome={sessione?.tipo === "utente" ? sessione.nome : null}
            ruolo={sessione?.ruolo ?? null}
          />
          <main className="main">
            {solaLettura && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  marginBottom: 18,
                  borderRadius: "var(--radius-m)",
                  background: "var(--orange-soft)",
                  border: "1px solid var(--orange-soft)",
                  fontSize: 13,
                  color: "var(--orange)",
                }}
              >
                🔒 <strong>Sola lettura</strong> — puoi consultare tutto ma non modificare nulla.
              </div>
            )}
            {children}
          </main>
        </div>
        {/* La fascia «sessione scaduta»: resta invisibile finché il poller dei
            pallini (Sidebar) non se ne accorge. Libro UX&UI v1.4 §7. */}
        <SessioneScaduta />
      </body>
    </html>
  );
}
