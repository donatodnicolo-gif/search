import type { Metadata } from "next";
import "./globals.css";
import { Topbar } from "@/components/Topbar";
import { sessioneCorrente } from "@/lib/sessione-server";

export const metadata: Metadata = {
  title: "Deluxy Hub",
  description: "Portale unico di accesso alle app Deluxy",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sulla pagina di login non c'è sessione: la barra non viene mostrata.
  const sessione = await sessioneCorrente();

  return (
    <html lang="it">
      <body>
        {sessione && <Topbar sessione={sessione} />}
        {children}
      </body>
    </html>
  );
}
