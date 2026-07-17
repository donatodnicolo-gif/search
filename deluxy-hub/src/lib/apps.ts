import type { Ruolo } from "./ruoli";

// Catalogo delle app raggiungibili dal portale.
// Gli URL arrivano dall'ambiente: ogni app resta autonoma, il Hub la linka soltanto.

export type AppDeluxy = {
  id: string;
  nome: string;
  sottotitolo: string;
  descrizione: string;
  icona: "search" | "partner" | "scout" | "mail" | "anagrafiche";
  url: string;
  ruoli: readonly Ruolo[];
  // true = app mobile, si apre sul dispositivo/build web di Expo
  mobile?: boolean;
};

// Un'app si mostra solo se sappiamo dove mandare l'utente. In produzione l'URL
// deve arrivare dall'ambiente: se manca, l'app sparisce dalla home invece di
// diventare un'icona che non porta da nessuna parte. Il fallback locale serve
// solo in sviluppo. È così che Scout, che è un'app mobile senza sito pubblico,
// resta visibile in locale e nascosto in produzione (basta non impostare
// APP_URL_SCOUT).
function url(env: string | undefined, fallbackLocale: string): string | null {
  if (env) return env;
  return process.env.NODE_ENV === "production" ? null : fallbackLocale;
}

export function catalogoApp(): AppDeluxy[] {
  const app: (Omit<AppDeluxy, "url"> & { url: string | null })[] = [
    {
      id: "search",
      nome: "Search Partners",
      sottotitolo: "Ricerca e smistamento",
      descrizione:
        "Trova fiorai e pasticcerie sul territorio e smista gli ordini Shopify via WhatsApp o email.",
      icona: "search",
      url: url(process.env.APP_URL_SEARCH, "https://search-deluxy.vercel.app"),
      ruoli: ["admin", "commerciale"],
    },
    {
      id: "partner",
      nome: "Partner",
      sottotitolo: "Gestione finanziaria",
      descrizione:
        "Fatture servizi, vendite vendor, saldi e bonifici SEPA. Sostituisce il file PARTNER.xlsx.",
      icona: "partner",
      url: url(process.env.APP_URL_PARTNER, "http://localhost:3040"),
      ruoli: ["admin", "partner"],
    },
    {
      id: "anagrafiche",
      nome: "Anagrafiche",
      sottotitolo: "Registro partner B2B",
      descrizione:
        "Registro centralizzato di partner e prospect B2B: fonte di verità per tutte le app Deluxy, con API di lettura e scrittura.",
      icona: "anagrafiche",
      url: url(process.env.APP_URL_ANAGRAFICHE, "http://localhost:3060"),
      ruoli: ["admin", "commerciale"],
    },
    {
      id: "scout",
      nome: "Commerciale Scout",
      sottotitolo: "Prospezione sul campo",
      descrizione:
        "Mappa delle attività di Milano con priorità, registrazione visite offline e invio a HubSpot.",
      icona: "scout",
      url: url(process.env.APP_URL_SCOUT, "http://localhost:8081"),
      ruoli: ["admin", "commerciale"],
      mobile: true,
    },
    {
      id: "mail",
      nome: "AI Mail",
      sottotitolo: "Posta intelligente",
      descrizione:
        "Legge la posta, la smista nelle tue sezioni, estrae le attività e prepara le risposte da controllare.",
      icona: "mail",
      url: url(process.env.APP_URL_MAIL, "http://localhost:3050"),
      ruoli: ["admin"],
    },
  ];

  return app.filter((a): a is AppDeluxy => a.url !== null);
}

export function appPerRuolo(ruolo: Ruolo): AppDeluxy[] {
  return catalogoApp().filter((app) => app.ruoli.includes(ruolo));
}
