import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AreaBadge } from "@/components/AreaBadge";

export const metadata: Metadata = {
  title: "Deluxy Budgets",
  description: "Budget aziendali, P&L, premi e spese ADV Deluxy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">
            <AreaBadge />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
