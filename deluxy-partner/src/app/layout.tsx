import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { SESSION_COOKIE, ruoloDaSessione } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Deluxy Partner",
  description: "Gestione finanziaria e operativa dei partner Deluxy",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const ruolo = await ruoloDaSessione(jar.get(SESSION_COOKIE)?.value);
  const solaLettura = ruolo === "sola_lettura";

  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">
            {solaLettura && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  marginBottom: 18,
                  borderRadius: 10,
                  background: "rgba(201,52,0,0.08)",
                  border: "1px solid rgba(201,52,0,0.18)",
                  fontSize: 13,
                  color: "var(--orange, #c93400)",
                }}
              >
                🔒 <strong>Sola lettura</strong> — puoi consultare tutto ma non modificare nulla.
              </div>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
