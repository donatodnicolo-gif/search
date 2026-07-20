import type { Metadata } from "next";
import { ToggleSidebar } from "@/components/ToggleSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deluxy Anagrafiche",
  description: "Registro centralizzato dei partner B2B Deluxy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Riapplica la preferenza sidebar prima del paint (niente lampeggio) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("anagrafiche-sidebar")==="chiusa")document.documentElement.setAttribute("data-sidebar-chiusa","")}catch(e){}',
          }}
        />
      </head>
      <body>
        <header className="topbar">
          <ToggleSidebar />
          <a className="brand" href="/">
            <div className="brand-logo">D</div>
            <div>
              <div className="brand-name">Deluxy Anagrafiche</div>
              <div className="brand-sub">Registro centralizzato partner B2B</div>
            </div>
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}
