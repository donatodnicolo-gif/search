import type { Ruolo } from "./ruoli";

// Catalogo delle app raggiungibili dal portale.
// Gli URL arrivano dall'ambiente: ogni app resta autonoma, il Hub la linka soltanto.

export type AppDeluxy = {
  id: string;
  nome: string;
  sottotitolo: string;
  descrizione: string;
  icona: "consegne" | "search" | "partner" | "scout" | "mail" | "anagrafiche" | "maison" | "budgets" | "tasks" | "calendario" | "merchandising" | "marketing";
  url: string;
  ruoli: readonly Ruolo[];
  // true = app mobile, si apre sul dispositivo/build web di Expo
  mobile?: boolean;
  // true = l'app accetta il Single Sign-On del Hub: aprendola l'utente entra
  // senza rifare il login (il Hub le passa un token cifrato su /api/sso). Per
  // forzare il login proprio dell'app, l'admin toglie questo flag.
  sso?: boolean;
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
      // Consegne ora ha un sito pubblico: punta lì di default (anche in
      // produzione), restando sovrascrivibile via APP_URL_CONSEGNE.
      url: process.env.APP_URL_CONSEGNE ?? "https://deluxy-delivery.vercel.app",
      ruoli: ["admin"],
    },
    {
      id: "search", // id interno e APP_URL_SEARCH restano "search": è l'app deluxy-suppliers
      nome: "Ricerca fornitori",
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
      sso: true, // pilota SSO: si entra dal Hub senza digitare la password di team
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
      id: "merchandising",
      nome: "Merchandising",
      sottotitolo: "Prodotto & collezioni",
      descrizione:
        "Il prodotto a 360° come una maison: collezioni e stagioni, sviluppo (PLM), costi e margini, visual merchandising e pubblicazione su Shopify.",
      icona: "merchandising",
      // Eccezione voluta: la tessera resta visibile anche in produzione senza
      // APP_URL_MERCHANDISING, puntando all'istanza locale finché non c'è un URL pubblico.
      url: process.env.APP_URL_MERCHANDISING ?? "http://localhost:3120",
      ruoli: ["admin", "commerciale"],
    },
    {
      id: "marketing",
      nome: "Marketing",
      sottotitolo: "Analisi & campagne ADV",
      descrizione:
        "La memoria operativa dell'advertising: analisi e audit, azioni con storia e feedback, campagne con metriche e i documenti della cartella ADV DELUXY SRL.",
      icona: "marketing",
      // Eccezione voluta: la tessera resta visibile anche in produzione senza
      // APP_URL_MARKETING, puntando all'istanza locale finché non c'è un URL pubblico.
      url: process.env.APP_URL_MARKETING ?? "http://localhost:3130",
      ruoli: ["admin"],
    },
    {
      id: "budgets",
      nome: "Budgets",
      sottotitolo: "Budget e P&L",
      descrizione:
        "Budget aziendali su 3 livelli (raggiungibile, sfidante, irraggiungibile) con P&L, premi, proposte dei responsabili e spese ADV.",
      icona: "budgets",
      // Eccezione voluta: la tessera resta visibile anche in produzione senza
      // APP_URL_BUDGETS, puntando all'istanza locale finché non c'è un URL pubblico.
      url: process.env.APP_URL_BUDGETS ?? "http://localhost:3080",
      ruoli: ["admin"],
    },
    {
      id: "scout",
      nome: "Commerciale Scout",
      sottotitolo: "Prospezione sul campo",
      descrizione:
        "Mappa delle attività di Milano con priorità, registrazione visite offline e invio a HubSpot.",
      icona: "scout",
      // Scout ora ha una build web pubblica: punta lì di default (anche in
      // produzione), restando sovrascrivibile via APP_URL_SCOUT.
      url: process.env.APP_URL_SCOUT ?? "https://deluxy-scout.vercel.app",
      ruoli: ["admin", "commerciale"],
      mobile: true,
    },
    {
      id: "tasks",
      nome: "Attività",
      sottotitolo: "Le attività di tutte le app",
      descrizione:
        "Il registro centralizzato delle attività: ogni app Deluxy vi scrive le sue, qui le vedi e le chiudi in un posto solo.",
      icona: "tasks",
      // Eccezione voluta: la tessera resta visibile anche in produzione senza
      // APP_URL_TASKS, puntando all'istanza locale finché non c'è un URL pubblico.
      url: process.env.APP_URL_TASKS ?? "http://localhost:3090",
      ruoli: ["admin"],
    },
    {
      id: "calendario",
      nome: "Calendario",
      sottotitolo: "Gli eventi di tutte le app",
      descrizione:
        "Il calendario centralizzato: gli eventi datati di ogni app Deluxy in un'unica vista, gemello del registro Attività.",
      icona: "calendario",
      // Eccezione voluta: la tessera resta visibile anche in produzione senza
      // APP_URL_CALENDARIO, puntando all'istanza locale finché non c'è un URL pubblico.
      url: process.env.APP_URL_CALENDARIO ?? "http://localhost:3110",
      ruoli: ["admin"],
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

  return app
    .filter((a): a is AppDeluxy => a.url !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "it")); // ordine alfabetico A→Z
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
