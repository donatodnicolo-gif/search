import type { Ruolo } from "./ruoli";

// Catalogo delle app raggiungibili dal portale.
// Gli URL arrivano dall'ambiente: ogni app resta autonoma, il Hub la linka soltanto.

export type AppDeluxy = {
  id: string;
  nome: string;
  sottotitolo: string;
  descrizione: string;
  icona: "search" | "partner" | "scout";
  url: string;
  ruoli: readonly Ruolo[];
  // true = app mobile, si apre sul dispositivo/build web di Expo
  mobile?: boolean;
};

export function catalogoApp(): AppDeluxy[] {
  return [
    {
      id: "search",
      nome: "Search Partners",
      sottotitolo: "Ricerca e smistamento",
      descrizione:
        "Trova fiorai e pasticcerie sul territorio e smista gli ordini Shopify via WhatsApp o email.",
      icona: "search",
      url: process.env.APP_URL_SEARCH ?? "https://search-deluxy.vercel.app",
      ruoli: ["admin", "commerciale"],
    },
    {
      id: "partner",
      nome: "Partner",
      sottotitolo: "Gestione finanziaria",
      descrizione:
        "Fatture servizi, vendite vendor, saldi e bonifici SEPA. Sostituisce il file PARTNER.xlsx.",
      icona: "partner",
      url: process.env.APP_URL_PARTNER ?? "http://localhost:3040",
      ruoli: ["admin", "partner"],
    },
    {
      id: "scout",
      nome: "Commerciale Scout",
      sottotitolo: "Prospezione sul campo",
      descrizione:
        "Mappa delle attività di Milano con priorità, registrazione visite offline e invio a HubSpot.",
      icona: "scout",
      url: process.env.APP_URL_SCOUT ?? "http://localhost:8081",
      ruoli: ["admin", "commerciale"],
      mobile: true,
    },
  ];
}

export function appPerRuolo(ruolo: Ruolo): AppDeluxy[] {
  return catalogoApp().filter((app) => app.ruoli.includes(ruolo));
}
