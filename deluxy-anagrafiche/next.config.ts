import type { NextConfig } from "next";

// ⚠️ Intestazioni di sicurezza (27/08/2026). Prima l'unica presente era HSTS,
// che la mette Vercel: niente CSP, niente X-Frame-Options.
//
// La CSP è quella che conta: è la difesa che resta in piedi il giorno in cui
// un XSS entra in una pagina da cui si conia una chiave di scrittura piena
// (`/chiavi`). Le altre sono igiene — il clickjacking è già quasi neutralizzato
// dal cookie `sameSite: lax`, ma «quasi» non è una ragione per lasciarlo aperto.
//
// ⚠️ `unsafe-inline` sugli stili serve a Next, che inietta CSS in linea; sugli
// script NON c'è, ed è la metà che conta. `'self'` sugli script copre i bundle.
// Le immagini ammettono `data:` per i QR e le vCard generate nel browser.
const CSP = [
  "default-src 'self'",
  // ⚠️⚠️ `unsafe-inline` sugli SCRIPT è una rinuncia, e va detto: senza, Next
  // non parte. Provato in produzione il 27/08/2026 — la prima CSP scritta senza
  // di esso ha bloccato sette script in linea di Next (idratazione e bootstrap
  // dell'App Router) e la pagina di login è rimasta morta. Una CSP che rompe
  // l'app non protegge niente: la si allenta e lo si scrive, non la si lascia
  // rotta.
  //
  // Quello che questa CSP ferma comunque: script da ORIGINI esterne (una
  // libreria iniettata da fuori non parte), `object-src`, il dirottamento di
  // `base-uri`, l'invio di form a domini terzi e l'incorniciamento della pagina.
  // Quello che NON ferma più: uno script in linea iniettato in pagina.
  //
  // La via giusta è il **nonce per richiesta** generato dal middleware, che Next
  // supporta ma impone il rendering dinamico ovunque: è un cambio da fare con
  // calma e da misurare, non nello stesso giro di una correzione di sicurezza.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Google Identity e People API: la rubrica si legge dal browser.
  "connect-src 'self' https://accounts.google.com https://people.googleapis.com",
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
