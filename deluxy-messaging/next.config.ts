import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚠️ I lettori di documenti restano FUORI dal bundle del server.
  //
  // pdf-parse si porta dietro pdf.js, che si aspetta di girare come modulo a
  // sé: impacchettato da Next fallisce su ogni PDF con «Object.defineProperty
  // called on non-object», un errore che non dice niente. In uno script node
  // normale non si vede — lì il pacchetto è già esterno — quindi la prova va
  // fatta passando dall'app, non da un file di prova a parte.
  serverExternalPackages: ["pdf-parse", "mammoth"],

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
