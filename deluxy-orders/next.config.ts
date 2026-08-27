import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Header di sicurezza (revisione 27/08/2026). Igiene a rischio ~zero:
  // - X-Frame-Options / frame-ancestors: la pagina (incluso /login) non è
  //   inquadrabile → niente clickjacking per carpire la password.
  // - nosniff: il browser non indovina il MIME (niente sniffing di risposte
  //   come script).
  // - Referrer-Policy: l'URL non trapela verso terzi.
  // Nessuna CSP piena: romperebbe gli stili inline dell'app e non vale il
  // rischio ora (il vettore vero, il framing, è già chiuso).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
