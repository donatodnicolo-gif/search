// DA DOVE È ARRIVATO L'ORDINE.
//
// Shopify lo sa da sempre e non lo diceva a nessuno: per ogni ordine tiene il
// percorso che ha portato all'acquisto — la prima visita, il sito che ha mandato
// la persona, i parametri `utm_*` di una campagna. Qui quel dato diventa un
// **canale in italiano**, con un simbolo che si legge a colpo d'occhio in
// mezzo a una tabella.
//
// Due cose da sapere, perché cambiano il significato di quello che si legge:
//
//  1. **è attribuzione al PRIMO contatto**: la sorgente è la prima visita del
//     percorso che ha portato a quell'ordine, non l'ultimo clic. Chi ci ha
//     trovati con Google Ads e poi è tornato scrivendo l'indirizzo resta
//     «Google Ads». È la lettura più utile per capire chi ci porta i clienti,
//     ma non è quella con cui si giudica una singola campagna;
//  2. **non sapere è normale**: agli ordini creati a mano, e a molti ordini
//     vecchi, Shopify non associa nessuna visita. Lì il canale resta vuoto e
//     **non si mostra nessun simbolo** — meglio un buco onesto di un'etichetta
//     inventata («diretto» sarebbe una bugia comoda).

export type CanaleMarketing = {
  chiave: string;
  nome: string;
  simbolo: string;
  spiega: string;
  pagato: boolean; // ci è costato qualcosa? serve a separare traffico comprato e guadagnato
};

export const CANALI: CanaleMarketing[] = [
  {
    chiave: "google-ads",
    nome: "Google Ads",
    simbolo: "🎯",
    spiega: "Ha cliccato un annuncio a pagamento su Google.",
    pagato: true,
  },
  {
    chiave: "shopping",
    nome: "Google Shopping",
    simbolo: "🛒",
    spiega: "È arrivato dalla scheda prodotto nel feed di Google.",
    pagato: true,
  },
  {
    chiave: "ricerca",
    nome: "Ricerca non pagata",
    simbolo: "🔎",
    spiega: "Ci ha cercati su Google, Bing o simili e ci ha trovati senza che pagassimo il clic.",
    pagato: false,
  },
  {
    chiave: "meta-ads",
    nome: "Facebook / Instagram a pagamento",
    simbolo: "📣",
    spiega: "Ha cliccato un'inserzione su Facebook o Instagram.",
    pagato: true,
  },
  {
    chiave: "social",
    nome: "Social",
    simbolo: "📸",
    spiega: "Arriva da un profilo o da un post social, senza inserzione.",
    pagato: false,
  },
  {
    chiave: "email",
    nome: "Email",
    simbolo: "📧",
    spiega: "Ha cliccato il link di una nostra email (Klaviyo, Shopify Email).",
    pagato: false,
  },
  {
    chiave: "whatsapp",
    nome: "WhatsApp",
    simbolo: "💬",
    spiega: "È arrivato da un link mandato su WhatsApp.",
    pagato: false,
  },
  {
    chiave: "ai",
    nome: "Assistenti AI",
    simbolo: "🤖",
    spiega: "Ci ha trovati tramite ChatGPT, Perplexity o un altro assistente.",
    pagato: false,
  },
  {
    chiave: "referral",
    nome: "Da un altro sito",
    simbolo: "🔗",
    spiega: "Un altro sito ci ha linkati e la persona è arrivata da lì.",
    pagato: false,
  },
  {
    chiave: "diretto",
    nome: "Diretto",
    simbolo: "➜",
    spiega: "Ha scritto l'indirizzo o ci aveva già salvati: nessuno ce l'ha mandato.",
    pagato: false,
  },
  {
    chiave: "manuale",
    nome: "Ordine creato a mano",
    simbolo: "☎",
    spiega: "Bozza compilata da noi: telefono, WhatsApp, di persona. Non è traffico del sito.",
    pagato: false,
  },
  {
    chiave: "pos",
    nome: "In negozio",
    simbolo: "🏬",
    spiega: "Cassa fisica.",
    pagato: false,
  },
];

const PER_CHIAVE = new Map(CANALI.map((c) => [c.chiave, c]));

export function canale(chiave: string | null | undefined): CanaleMarketing | null {
  return chiave ? (PER_CHIAVE.get(chiave) ?? null) : null;
}

export function nomeCanale(chiave: string | null | undefined): string {
  return canale(chiave)?.nome ?? "Provenienza sconosciuta";
}

// Il testo che sta sotto il mouse: canale, campagna e il dato grezzo da cui è
// stato dedotto. Chi non si fida deve poter vedere su cosa abbiamo deciso.
export function titoloCanale(o: {
  canaleMarketing: string;
  utmCampaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  visitaSorgente?: string | null;
}): string {
  const c = canale(o.canaleMarketing);
  if (!c) return "Provenienza sconosciuta";
  const pezzi = [c.nome, c.spiega];
  if (o.utmCampaign) pezzi.push(`Campagna: ${o.utmCampaign}`);
  const grezzo = o.utmSource
    ? `utm ${o.utmSource}${o.utmMedium ? ` / ${o.utmMedium}` : ""}`
    : o.visitaSorgente
      ? `prima visita: ${o.visitaSorgente}`
      : null;
  if (grezzo) pezzi.push(`Dedotto da ${grezzo}`);
  return pezzi.join(" — ");
}

export type DatiProvenienza = {
  sorgente?: string | null;
  visitaSorgente?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
};

const PAGATO = /(^|[^a-z])(ppc|cpc|paid|paidsocial|paid_social|ads?)([^a-z]|$)/;

// Da cosa si deduce il canale, in ordine di fiducia: prima gli `utm_*` (li
// abbiamo scritti noi nei link delle campagne, quindi sono la verità), poi la
// prima visita, infine il canale tecnico di Shopify. Se non basta nessuno dei
// tre, si torna stringa vuota: non lo sappiamo.
export function deduciCanale(d: DatiProvenienza): string {
  const s = (d.utmSource ?? "").trim().toLowerCase();
  const m = (d.utmMedium ?? "").trim().toLowerCase();

  if (s) {
    const pagato = PAGATO.test(m);
    if (/adwords|google[_-]?ads|gads/.test(s)) return "google-ads";
    if (/^google/.test(s)) {
      if (/product[_-]?sync|shopping|surfaces|free/.test(m)) return "shopping";
      return pagato ? "google-ads" : "ricerca";
    }
    if (/bing|microsoft/.test(s)) return pagato ? "google-ads" : "ricerca";
    if (/facebook|^fb$|instagram|^ig$|meta/.test(s)) return pagato || /social/.test(m) ? "meta-ads" : "social";
    if (/klaviyo|shopify[_-]?email|mailchimp|newsletter/.test(s) || m === "email") return "email";
    if (/whatsapp|^wa$/.test(s)) return "whatsapp";
    if (/tiktok|pinterest|youtube|linkedin|snapchat/.test(s)) return pagato ? "meta-ads" : "social";
    if (/chatgpt|openai|perplexity|copilot|gemini/.test(s)) return "ai";
    return "referral";
  }

  const v = (d.visitaSorgente ?? "").trim().toLowerCase();
  if (v) {
    if (v === "direct") return "diretto";
    if (/google|bing|duckduckgo|yahoo|ecosia|qwant|search/.test(v)) return "ricerca";
    // l.wl.co è il dominio con cui WhatsApp apre i link: è WhatsApp, non un sito
    if (/whatsapp|l\.wl\.co|wa\.me/.test(v)) return "whatsapp";
    if (/instagram|facebook|fb\.|ig\.|tiktok|pinterest|linkedin/.test(v)) return "social";
    if (/chatgpt|openai|perplexity|copilot|gemini/.test(v)) return "ai";
    if (/klaviyo|mailchimp|^email$|shopify_email/.test(v)) return "email";
    return "referral";
  }

  const sorgente = (d.sorgente ?? "").trim().toLowerCase();
  if (/draft[_-]?order/.test(sorgente)) return "manuale";
  if (sorgente === "pos") return "pos";
  return "";
}
