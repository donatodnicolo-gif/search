import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import { PWARegister } from "@/components/PWARegister";
import { sessioneCorrente } from "@/lib/sessione-server";
import { prisma } from "@/lib/db";
import { giornoDi, minutiLavorati, oraDi } from "@/lib/cartellino";

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

// Lo stato del cartellino di chi guarda: la sidebar lo mostra (dentro/fuori +
// ora d'ingresso) senza aprire la pagina. Calcolato QUI (server) e passato alla
// sidebar; l'ora è formattata in ora di Roma. Se il database non risponde, la
// sidebar mostra «Fuori» e la pagina resta in piedi.
async function statoCartellino(uid: string): Promise<{ dentro: boolean; da: string | null }> {
  try {
    const adesso = new Date();
    const righe = await prisma.timbratura.findMany({
      where: { utenteId: uid, giorno: giornoDi(adesso) },
      select: { verso: true, istante: true },
      orderBy: { istante: "asc" },
    });
    const stato = minutiLavorati(righe, adesso);
    return { dentro: stato.aperto, da: stato.aperto && stato.dalle ? oraDi(stato.dalle) : null };
  } catch {
    return { dentro: false, da: null };
  }
}

// Riapplica lo stato «sidebar collassata» PRIMA del paint, così non lampeggia.
const PRE_PAINT =
  'try{if(localStorage.getItem("hub-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sulla pagina di login (e ovunque senza sessione) non c'è guscio: solo il
  // contenuto. Dove c'è sessione, il guscio standard: barra sottile + sidebar.
  const sessione = await sessioneCorrente();
  const cartellino = sessione ? await statoCartellino(sessione.uid) : null;

  return (
    <html lang="it">
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      </head>
      <body>
        <PWARegister />
        {sessione ? (
          <>
            <header className="topbar">
              <div className="topbar-sx">
                <ToggleSidebar />
                <a className="brand" href="/">
                  <div className="brand-logo">D</div>
                  <div>
                    <div className="brand-name">Deluxy Hub</div>
                    <div className="brand-sub">La porta d&rsquo;ingresso</div>
                  </div>
                </a>
              </div>
            </header>
            <div className="layout">
              <Sidebar sessione={sessione} cartellino={cartellino ?? { dentro: false, da: null }} />
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
