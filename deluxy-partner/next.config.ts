import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (PDF delle pro-forma) porta binari e font propri: non va
  // impacchettato dal bundler di Next, si carica come modulo Node esterno.
  serverExternalPackages: ["@react-pdf/renderer"],
  // ⚠️ I font standard del PDF (Helvetica, Times, Courier) sono file .afm che
  // pdfkit legge a runtime con readFileSync: il tracciamento di Next non li
  // vede e su Vercel la funzione crashava (ENOENT) — in locale funzionava
  // perché node_modules è tutto lì. Si includono a mano nel pacchetto della
  // rotta (02/09/2026).
  outputFileTracingIncludes: {
    "/proforma/[id]/pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
  // 08/09/2026 — le fatture si emettono in un posto solo (regola dell'utente):
  // il vecchio modulo di `/fatture` non c'è più. Il rimando sta QUI e non in
  // una pagina con `redirect()`: quello arriva solo a chi apre l'app col
  // browser (è un rimando dentro il payload React), mentre un segnalibro, un
  // link in una mail o una chiamata di un'altra app vogliono un 308 vero.
  async redirects() {
    return [{ source: "/fatture/nuova", destination: "/registrazioni/fatture/nuova", permanent: true }];
  },
};

export default nextConfig;
