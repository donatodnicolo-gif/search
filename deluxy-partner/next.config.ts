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
};

export default nextConfig;
