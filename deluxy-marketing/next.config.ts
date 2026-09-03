import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Il lancio Meta carica l'IMMAGINE dell'annuncio dentro una server
      // action: il default di Next è 1 MB e un jpg da campagna sta sopra.
      // ⚠️ Su Vercel il corpo di una function ha un tetto DURO a 4,5 MB
      // (infrastruttura, non configurabile): il modulo blocca le immagini
      // oltre i 4 MB così l'errore è il nostro e non un 413 muto, e i VIDEO
      // non passano di qui — vanno a pezzi dal browser via
      // /api/interno/meta/video, un pezzo per richiesta.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
