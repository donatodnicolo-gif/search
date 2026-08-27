import type { NextConfig } from "next";

// Header di sicurezza per ogni risposta. Prima non ce n'era nessuno (a parte
// l'HSTS che mette Vercel), quindi la pagina di login era incorniciabile in un
// iframe (clickjacking) e il framework era annunciato in chiaro.
//
// La CSP è volutamente PRUDENTE: solo `frame-ancestors`/`base-uri`/`object-src`/
// `form-action`, senza `script-src`/`default-src` — una CSP stretta sugli script
// romperebbe l'hydration di Next e gli stili inline. Questi quattro chiudono
// clickjacking, iniezione di <base>, plugin e dirottamento dei form senza
// toccare nulla che serva all'app.
const HEADER_SICUREZZA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  // Niente `clipboard-write=()`: la pagina Chiavi copia il token negli appunti.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  // Non annunciare il framework (fingerprinting): «X-Powered-By: Next.js» via.
  poweredByHeader: false,
  experimental: {
    // I certificati di malattia si caricano con una server action, e il limite
    // di default del corpo di una action è 1 MB: la scansione di un certificato
    // lo supera facilmente. Il tetto vero resta 5 MB, controllato nel codice
    // (MAX_CERTIFICATO_BYTE); qui si lascia il margine per l'involucro del form.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: HEADER_SICUREZZA }];
  },
};

export default nextConfig;
