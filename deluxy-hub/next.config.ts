import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // I certificati di malattia si caricano con una server action, e il limite
    // di default del corpo di una action è 1 MB: la scansione di un certificato
    // lo supera facilmente. Il tetto vero resta 5 MB, controllato nel codice
    // (MAX_CERTIFICATO_BYTE); qui si lascia il margine per l'involucro del form.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
