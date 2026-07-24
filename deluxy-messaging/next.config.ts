import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Il widget viene caricato dentro un iframe sui siti dei clienti: la pagina
  // /widget deve poter essere incorniciata ovunque, il resto dell'app no.
  async headers() {
    return [
      {
        source: "/widget",
        headers: [
          // Nessun X-Frame-Options: l'iframe del widget è il prodotto stesso.
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
