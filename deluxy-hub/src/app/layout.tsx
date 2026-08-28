import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Topbar } from "@/components/Topbar";
import { PWARegister } from "@/components/PWARegister";
import { sessioneCorrente } from "@/lib/sessione-server";

export const metadata: Metadata = {
  title: "Deluxy Hub",
  description: "Portale unico di accesso alle app Deluxy",
  applicationName: "Deluxy Hub",
  manifest: "/manifest.webmanifest",
  // «Aggiungi a Home» di iPhone: apre a schermo pieno con la sua icona.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Deluxy Hub" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#f5f5f7" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sulla pagina di login non c'è sessione: la barra non viene mostrata.
  const sessione = await sessioneCorrente();

  return (
    <html lang="it">
      <body>
        <PWARegister />
        {sessione && <Topbar sessione={sessione} />}
        {children}
      </body>
    </html>
  );
}
