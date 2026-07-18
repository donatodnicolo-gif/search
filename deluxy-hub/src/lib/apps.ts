import type { Ruolo } from "./ruoli";

// Catalogo delle app raggiungibili dal portale.
// Gli URL arrivano dall'ambiente: ogni app resta autonoma, il Hub la linka soltanto.

export type AppDeluxy = {
  id: string;
  nome: string;
  sottotitolo: string;
  descrizione: string;
  icona: "consegne" | "search" | "partner" | "scout" | "mail" | "anagrafiche" | "maison";
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
      id: "consegne",
      nome: "Consegne",
      sottotitolo: "Piattaforma logistica",
      descrizione:
        "Il cuore operativo: consegne, attività, valletti e clienti delle spedizioni in guanti bianchi.",
      icona: "consegne",
      url: url(process.env.APP_URL_CONSEGNE, "http://localhost:4200/deliveries"),
      ruoli: ["admin"],
    },
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
      id: "partner", // id interno e APP_URL_PARTNER restano "partner": è l'app deluxy-partner
      nome: "Finance",
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
      id: "maison",
      nome: "Maison",
      sottotitolo: "Piano digitale Shopify",
      descrizione: "Deluxy OS: il piano digitale dei siti Shopify Deluxy.",
      icona: "maison",
      url: url(process.env.APP_URL_MAISON, "https://deluxy-os.base44.app/"),
      ruoli: ["admin", "partner", "commerciale"],
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
      url: url(process.env.APP_URL_MAIL, "http://localhost:3070"),
      ruoli: ["admin"],
    },
  ];

  return app.filter((a): a is AppDeluxy => a.url !== null);
}

// Le app suggerite per un ruolo: servono da preselezione quando si crea un
// utente, non decidono più da sole cosa vede (quello è la lista per-utente).
export function appPerRuolo(ruolo: Ruolo): AppDeluxy[] {
  return catalogoApp().filter((app) => app.ruoli.includes(ruolo));
}

// Le app che un utente può aprire davvero, dato l'elenco di id salvato su di lui.
// Filtra gli id che non esistono più nel catalogo (app rimossa o senza URL).
export function appPerIds(ids: readonly string[]): AppDeluxy[] {
  const scelti = new Set(ids);
  return catalogoApp().filter((app) => scelti.has(app.id));
}

// Tiene solo gli id che corrispondono a un'app reale del catalogo: usato prima
// di salvare, così sul database non finiscono id inventati.
export function idAppValidi(ids: readonly string[]): string[] {
  const esistenti = new Set(catalogoApp().map((a) => a.id));
  return [...new Set(ids)].filter((id) => esistenti.has(id));
}
