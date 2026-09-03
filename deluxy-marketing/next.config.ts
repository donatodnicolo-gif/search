import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Il lancio Meta carica l'IMMAGINE dell'annuncio dentro una server
      // action: il default di Next è 1 MB e un jpg da campagna sta sopra.
      // 8 MB copre le immagini vere e resta sotto i limiti delle function
      // Vercel; il modulo rifiuta comunque i file oltre i 6 MB, così il
      // messaggio d'errore è il nostro e non un 413 muto.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
