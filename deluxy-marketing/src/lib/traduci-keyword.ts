import { eCittaNota } from "@/lib/citta";

// Tradurre una keyword da una lingua all'altra, per portarla su una campagna
// che parla a clienti diversi.
//
// ⚠️ **È una PROPOSTA, non una traduzione.** Il testo che ne esce va mostrato
// e reso modificabile prima di finire in coda: una traduzione automatica di
// keyword produce facilmente ricerche che nessuno fa, e comprarle costa. Qui
// si traducono **solo le parole del glossario** — quelle che tornano ogni
// giorno in questo mestiere — e tutto il resto resta com'è, in chiaro, così
// si vede subito cosa non è stato tradotto.
//
// Niente AI e niente servizi esterni: un glossario chiuso sbaglia in modo
// prevedibile, un traduttore generico sbaglia in modo sorprendente.

type Lingua = "ita" | "eng" | "fra";

// Una riga per concetto: [italiano, inglese, francese]. Le forme al plurale e
// le varianti stanno accanto separate da "|" — la prima è quella che si scrive
// quando si traduce VERSO quella lingua.
const GLOSSARIO: [string, string, string][] = [
  ["fiori|fiore", "flowers|flower", "fleurs|fleur"],
  ["rose|rosa", "roses|rose", "roses|rose"],
  ["mazzo|mazzi|bouquet", "bouquet|bouquets", "bouquet|bouquets"],
  ["piante|pianta", "plants|plant", "plantes|plante"],
  ["orchidee|orchidea", "orchids|orchid", "orchidées|orchidée"],
  ["girasoli|girasole", "sunflowers|sunflower", "tournesols|tournesol"],
  ["peonie|peonia", "peonies|peony", "pivoines|pivoine"],
  ["tulipani|tulipano", "tulips|tulip", "tulipes|tulipe"],
  ["torta|torte", "cake|cakes", "gâteau|gâteaux"],
  ["dolci|dolce", "sweets|desserts", "desserts|dessert"],
  ["pasticceria", "pastry", "pâtisserie"],
  ["colazione|colazioni", "breakfast", "petit-déjeuner"],
  ["panettone|panettoni", "panettone", "panettone"],
  ["palloncini|palloncino", "balloons|balloon", "ballons|ballon"],
  ["regalo|regali", "gift|gifts", "cadeau|cadeaux"],
  ["consegna|consegne", "delivery", "livraison"],
  ["consegnare|consegna", "deliver", "livrer"],
  ["spedizione|spedizioni", "shipping", "expédition"],
  ["inviare|invia|mandare|manda", "send|sending", "envoyer|envoi"],
  ["comprare|compra|acquistare", "buy|order", "acheter|commander"],
  ["ordinare|ordina", "order", "commander"],
  ["domicilio", "home", "domicile"],
  ["a domicilio", "home delivery", "à domicile"],
  ["online", "online", "en ligne"],
  ["negozio|negozi", "shop|store", "magasin|boutique"],
  ["fioraio|fioraia|fiorista", "florist", "fleuriste"],
  ["migliore|miglior", "best", "meilleur"],
  ["economico|economici|low cost", "cheap", "pas cher"],
  ["urgente", "urgent", "urgent"],
  ["oggi", "today", "aujourd'hui"],
  ["domani", "tomorrow", "demain"],
  ["subito|in giornata", "same day", "le jour même"],
  ["compleanno", "birthday", "anniversaire"],
  ["anniversario", "anniversary", "anniversaire"],
  ["laurea", "graduation", "remise de diplôme"],
  ["matrimonio", "wedding", "mariage"],
  ["funerale|funerali", "funeral", "funérailles"],
  ["lusso|di lusso", "luxury", "luxe"],
  ["gratis|gratuita", "free", "gratuit"],
  ["prezzo|prezzi", "price|prices", "prix"],
];

const INDICE: Record<Lingua, number> = { ita: 0, eng: 1, fra: 2 };

export type Traduzione = {
  testo: string;
  // Le parole che il glossario non conosceva: restano in lingua originale e
  // vanno guardate a mano. Dirle è metà del lavoro.
  nonTradotte: string[];
  // Se l'ordine delle parole è stato cambiato, e perché
  riordinata: boolean;
};

/**
 * Propone la traduzione di una keyword. Restituisce `null` quando non c'è
 * niente da tradurre — nessuna parola del glossario — perché in quel caso una
 * "traduzione" sarebbe solo il testo di partenza con un'aria di certezza.
 */
export function traduciKeyword(testo: string, da: string, a: string): Traduzione | null {
  if (!(da in INDICE) || !(a in INDICE) || da === a) return null;
  const iDa = INDICE[da as Lingua];
  const iA = INDICE[a as Lingua];

  const parole = testo.trim().split(/\s+/);
  const fuori: string[] = [];
  const nonTradotte: string[] = [];
  let almenoUna = false;

  // Prima le espressioni di due parole ("a domicilio", "same day"), poi le
  // singole: altrimenti "home delivery" diventa "casa consegna".
  const testoMin = testo.toLowerCase();
  let lavorato = testoMin;
  const doppie = GLOSSARIO.filter((r) => r[iDa].split("|").some((f) => f.includes(" ")));
  for (const riga of doppie) {
    for (const forma of riga[iDa].split("|")) {
      if (!forma.includes(" ")) continue;
      if (lavorato.includes(forma)) {
        lavorato = lavorato.split(forma).join(riga[iA].split("|")[0]);
        almenoUna = true;
      }
    }
  }

  for (const parola of lavorato.split(/\s+/)) {
    const pulita = parola.replace(/[^\p{L}\p{N}'-]/gu, "");
    if (pulita === "") continue;
    if (eCittaNota(pulita)) {
      fuori.push(parola);
      continue;
    }
    const riga = GLOSSARIO.find((r) => r[iDa].split("|").includes(pulita));
    if (riga) {
      fuori.push(riga[iA].split("|")[0]);
      almenoUna = true;
      continue;
    }
    // Già nella lingua d'arrivo (capita: "online", "bouquet"): non è un buco.
    const gia = GLOSSARIO.find((r) => r[iA].split("|").includes(pulita));
    fuori.push(parola);
    if (!gia) nonTradotte.push(parola);
  }

  if (!almenoUna) return null;

  // ⚠️ L'ordine delle parole: in italiano e francese il nome viene prima del
  // luogo («fiori milano»), in inglese capita il contrario («milano flowers»).
  // Si sposta la città in fondo quando si traduce VERSO italiano o francese e
  // la città stava all'inizio: è l'unico riordino che si fa, ed è dichiarato.
  let riordinata = false;
  if ((a === "ita" || a === "fra") && fuori.length > 1 && eCittaNota(fuori[0].replace(/[^\p{L}\p{N}'-]/gu, ""))) {
    fuori.push(fuori.shift()!);
    riordinata = true;
  }

  return { testo: fuori.join(" "), nonTradotte, riordinata };
}
