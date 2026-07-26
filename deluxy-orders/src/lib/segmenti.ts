import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Classificazione dei clienti: segmenti di valore, tipologia e liste pronte.
//
// Qui c'è SOLO il vocabolario (soglie, regole, catalogo delle liste). Le query
// che lo applicano stanno in `clienti.ts`, che costruisce la vista aggregata su
// cui questi frammenti SQL lavorano.
//
// Due principi, entrambi già pagati altrove nel repo:
//  1. **Criteri scritti, non magici.** Ogni lista dichiara in chiaro chi ci
//     finisce dentro: un elenco di clienti che nessuno sa spiegare non si usa.
//  2. **Si deduce solo ciò che si può dedurre.** La tipologia si ricava dal
//     nome dell'ACQUIRENTE (mai dal destinatario: nei fiori il destinatario è
//     spessissimo un'altra persona o un hotel) e solo con parole che non sono
//     anche cognomi. Provato sui dati reali: «Villa», «Fiori», «Spa» sono
//     cognomi/forme societarie e producevano falsi positivi, quindi sono fuori.
//     Il resto lo mette l'operatore a mano, e la mano vince sempre.
// ---------------------------------------------------------------------------

// Soglie dei segmenti. Calibrate sui dati reali del registro (luglio 2026):
// 10.375 clienti, mediana di spesa 110 EUR, p95 515 EUR, p99 1.498 EUR;
// 85% dei clienti ha un solo ordine, 210 hanno superato i 1.000 EUR.
export const SOGLIE = {
  vipSpesa: 1000, // ~top 2% per spesa totale
  vipOrdini: 8, // ~top 0,5% per frequenza
  fedeleOrdini: 4,
  giorniNuovo: 90,
  giorniAttivo: 365, // oltre = non è più un cliente attivo
  giorniDormiente: 730, // oltre = perso
  altoScontrino: 250, // ordine medio: p90 reale = 265 EUR
} as const;

// --- Segmenti di valore (uno solo per cliente, cascata: vince il primo) -----
export type Segmento =
  | "vip"
  | "da-non-perdere"
  | "fedele"
  | "ricorrente"
  | "nuovo"
  | "una-tantum"
  | "da-riattivare"
  | "perso";

export const SEGMENTI: { chiave: Segmento; nome: string; colore: string }[] = [
  { chiave: "vip", nome: "VIP", colore: "var(--gold-strong)" },
  { chiave: "da-non-perdere", nome: "Da non perdere", colore: "var(--red)" },
  { chiave: "fedele", nome: "Fedele", colore: "var(--green)" },
  { chiave: "ricorrente", nome: "Ricorrente", colore: "var(--blue)" },
  { chiave: "nuovo", nome: "Nuovo", colore: "var(--purple)" },
  { chiave: "una-tantum", nome: "Una tantum", colore: "var(--text-secondary)" },
  { chiave: "da-riattivare", nome: "Da riattivare", colore: "var(--orange)" },
  { chiave: "perso", nome: "Perso", colore: "var(--text-tertiary)" },
];

export function nomeSegmento(s: string): string {
  return SEGMENTI.find((x) => x.chiave === s)?.nome ?? s;
}
export function coloreSegmento(s: string): string {
  return SEGMENTI.find((x) => x.chiave === s)?.colore ?? "var(--text-secondary)";
}

// L'espressione che assegna il segmento. Lavora sulle colonne aggregate
// (ordini, speso, giorni = giorni dall'ultimo ordine valido).
export const SQL_SEGMENTO = Prisma.raw(`CASE
  WHEN (speso >= ${SOGLIE.vipSpesa} OR ordini >= ${SOGLIE.vipOrdini}) AND giorni <= ${SOGLIE.giorniAttivo} THEN 'vip'
  WHEN (speso >= ${SOGLIE.vipSpesa} OR ordini >= ${SOGLIE.vipOrdini}) THEN 'da-non-perdere'
  WHEN ordini >= ${SOGLIE.fedeleOrdini} AND giorni <= ${SOGLIE.giorniAttivo} THEN 'fedele'
  WHEN ordini >= 2 AND giorni <= ${SOGLIE.giorniAttivo} THEN 'ricorrente'
  WHEN ordini = 1 AND giorni <= ${SOGLIE.giorniNuovo} THEN 'nuovo'
  WHEN ordini = 1 AND giorni <= ${SOGLIE.giorniAttivo} THEN 'una-tantum'
  WHEN giorni <= ${SOGLIE.giorniDormiente} THEN 'da-riattivare'
  ELSE 'perso'
END`);

// --- Attività: da quanto non ordina ----------------------------------------
// È il segmento ridotto all'osso — solo il tempo — perché è la domanda che si
// fa davvero guardando un elenco: «questo cliente c'è ancora?». Il segmento di
// valore mescola tempo e denaro; qui il tempo sta da solo, e si può ordinare e
// filtrare l'elenco per quello.
export const ATTIVITA = [
  { chiave: "attivo", nome: "Attivo", colore: "var(--green)", spiega: `Ha ordinato negli ultimi ${SOGLIE.giorniNuovo} giorni.` },
  { chiave: "recente", nome: "Recente", colore: "var(--blue)", spiega: "Ultimo ordine fra 3 e 12 mesi fa." },
  { chiave: "dormiente", nome: "Dormiente", colore: "var(--orange)", spiega: "Ultimo ordine fra 12 e 24 mesi fa." },
  { chiave: "inattivo", nome: "Inattivo", colore: "var(--text-tertiary)", spiega: "Ultimo ordine oltre 24 mesi fa." },
] as const;

export type Attivita = (typeof ATTIVITA)[number]["chiave"];

export function nomeAttivita(a: string): string {
  return ATTIVITA.find((x) => x.chiave === a)?.nome ?? a;
}
export function coloreAttivita(a: string): string {
  return ATTIVITA.find((x) => x.chiave === a)?.colore ?? "var(--text-secondary)";
}

export const SQL_ATTIVITA = Prisma.raw(`CASE
  WHEN giorni <= ${SOGLIE.giorniNuovo} THEN 'attivo'
  WHEN giorni <= ${SOGLIE.giorniAttivo} THEN 'recente'
  WHEN giorni <= ${SOGLIE.giorniDormiente} THEN 'dormiente'
  ELSE 'inattivo'
END`);

// --- Privacy: si può scrivere a questa persona? -----------------------------
// Regola unica, valida per la UI, per l'export e per le automazioni:
//  1. se il cliente è **bloccato** non si contatta, su nessun canale;
//  2. se qualcuno ha scritto a mano `si`/`no`, vince quello (è l'ultima volontà
//     che conosciamo: una telefonata, una richiesta a voce);
//  3. altrimenti vale il consenso di Shopify, e conta solo `SUBSCRIBED`;
//  4. se non sappiamo niente, **non si contatta**. Nel dubbio si tace: è il
//     senso del consenso, e un messaggio a chi non l'ha chiesto costa più di
//     un messaggio in meno.
export const SQL_CONTATTABILE_EMAIL = Prisma.raw(`CASE
  WHEN bloccato THEN false
  WHEN privacy_email = 'no' THEN false
  WHEN privacy_email = 'si' THEN true
  ELSE COALESCE(consenso_email = 'SUBSCRIBED', false)
END`);

export const SQL_CONTATTABILE_SMS = Prisma.raw(`CASE
  WHEN bloccato THEN false
  WHEN privacy_sms = 'no' THEN false
  WHEN privacy_sms = 'si' THEN true
  ELSE COALESCE(consenso_sms = 'SUBSCRIBED', false)
END`);

export const SQL_CONTATTABILE_TELEFONO = Prisma.raw(`CASE
  WHEN bloccato THEN false
  WHEN privacy_telefono = 'no' THEN false
  WHEN privacy_telefono = 'si' THEN true
  ELSE false
END`);

// Come si legge un consenso Shopify in italiano.
export function consensoLeggibile(stato: string | null): string {
  const nomi: Record<string, string> = {
    SUBSCRIBED: "iscritto",
    NOT_SUBSCRIBED: "mai iscritto",
    UNSUBSCRIBED: "disiscritto",
    PENDING: "in attesa di conferma",
    REDACTED: "cancellato",
  };
  return stato ? (nomi[stato] ?? stato) : "non indicato";
}

// Il canale di un'automazione e il consenso che richiede.
export const CANALI = [
  { chiave: "whatsapp", nome: "WhatsApp", consenso: "sms", recapito: "telefono" },
  { chiave: "email", nome: "Email", consenso: "email", recapito: "email" },
  { chiave: "telefono", nome: "Telefonata", consenso: "telefono", recapito: "telefono" },
] as const;

export type Canale = (typeof CANALI)[number]["chiave"];

export function nomeCanale(c: string): string {
  return CANALI.find((x) => x.chiave === c)?.nome ?? c;
}
export function canaleValido(v: string | null | undefined): Canale {
  return CANALI.some((c) => c.chiave === v) ? (v as Canale) : "whatsapp";
}

// --- Tipologia (chi è il cliente) ------------------------------------------
export type Tipologia = "privato" | "azienda" | "horeca" | "eventi" | "rivenditore";

export const TIPOLOGIE: { chiave: Tipologia; nome: string; colore: string; spiega: string }[] = [
  { chiave: "privato", nome: "Privato", colore: "var(--text-secondary)", spiega: "Persona fisica: regalo, ricorrenza, occasione." },
  { chiave: "azienda", nome: "Azienda", colore: "var(--blue)", spiega: "Società, studio, agenzia: ordini ricorrenti e fatturazione." },
  { chiave: "horeca", nome: "Hotel / Ristorante", colore: "var(--green)", spiega: "Ho.Re.Ca.: allestimenti e forniture ricorrenti." },
  { chiave: "eventi", nome: "Eventi / Wedding", colore: "var(--purple)", spiega: "Wedding planner, agenzie di eventi: pochi ordini, importi alti." },
  { chiave: "rivenditore", nome: "Rivenditore", colore: "var(--orange)", spiega: "Fiorai, pasticcerie e negozi che rivendono." },
];

export function nomeTipologia(t: string): string {
  return TIPOLOGIE.find((x) => x.chiave === t)?.nome ?? t;
}
export function coloreTipologia(t: string): string {
  return TIPOLOGIE.find((x) => x.chiave === t)?.colore ?? "var(--text-secondary)";
}
export function tipologiaValida(v: string | null | undefined): Tipologia | null {
  return TIPOLOGIE.some((t) => t.chiave === v) ? (v as Tipologia) : null;
}

// Riconoscimento automatico dal nome dell'acquirente. Solo parole che in
// italiano NON sono anche cognomi o nomi di persona: la prova sui 10.375
// clienti reali ha scartato «villa», «castello», «location», «fiori», «cake»,
// «torte» e «spa» (che pesca le S.p.A. e i centri benessere).
const RE_HORECA = String.raw`\m(hotel|hotels|albergo|resort|ristorante|ristoranti|osteria|trattoria|pizzeria|bistrot|caffetteria|catering|agriturismo|locanda|relais|enoteca)\M`;
const RE_EVENTI = String.raw`\m(wedding|weddings|matrimoni|eventi|events|planner|congressi|banqueting)\M`;
const RE_RIVENDITORE = String.raw`\m(fioreria|fiorista|fioristi|floral|flowers|floricoltura|vivaio|vivai|pasticceria|pasticcerie|bakery|garden)\M`;
const RE_AZIENDA = String.raw`\m(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|sarl|sagl|gmbh|ltd|societa|impresa|azienda|studio|avvocat|avvocati|notai|commercialist|farmacia|clinica|poliambulatorio|immobiliare|assicuraz|banca|agenzia|consulting|holding|editrice|onlus|associazione|cooperativa|fondazione|boutique|showroom|group)\M`;

// La colonna `nomi` contiene i nomi dell'acquirente (mai il destinatario).
export const SQL_TIPOLOGIA_AUTO = Prisma.raw(`CASE
  WHEN nomi ~* '${RE_HORECA}' THEN 'horeca'
  WHEN nomi ~* '${RE_EVENTI}' THEN 'eventi'
  WHEN nomi ~* '${RE_RIVENDITORE}' THEN 'rivenditore'
  WHEN nomi ~* '${RE_AZIENDA}' THEN 'azienda'
  ELSE 'privato'
END`);

// Domini di posta "personali": chi non è in questa lista ha un dominio proprio,
// che è un indizio di azienda — un indizio, non una certezza: si propone
// all'operatore nella lista «Probabili aziende», non si scrive da solo.
const DOMINI_LIBERI = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "hotmail.fr", "hotmail.co.uk", "hotmail.es",
  "icloud.com", "me.com", "mac.com", "libero.it", "yahoo.com", "yahoo.it", "yahoo.co.uk", "yahoo.fr",
  "yahoo.de", "yahoo.es", "ymail.com", "outlook.com", "outlook.it", "live.it", "live.com", "live.co.uk",
  "virgilio.it", "alice.it", "tin.it", "tiscali.it", "fastwebnet.it", "email.it", "inwind.it", "iol.it",
  "msn.com", "aol.com", "protonmail.com", "proton.me", "gmx.de", "gmx.net", "web.de", "mail.ru",
  "yandex.ru", "free.fr", "orange.fr", "wanadoo.fr", "sfr.fr", "laposte.net", "bluewin.ch", "sunrise.ch",
  "t-online.de", "telefonica.net", "terra.com", "uol.com.br", "qq.com", "163.com", "naver.com",
  "hanmail.net", "zoho.com", "pec.it", "poste.it", "teletu.it", "vodafone.it", "tim.it",
];

export const SQL_DOMINIO_AZIENDALE = Prisma.raw(
  `(dominio <> '' AND dominio IS NOT NULL AND NOT (dominio = ANY(ARRAY['${DOMINI_LIBERI.join("','")}'])))`,
);

// --- Occasioni ricorrenti ---------------------------------------------------
// Le finestre in cui si compra "per" la ricorrenza: si ordina nei giorni
// precedenti, non il giorno stesso. Sui dati reali pesano tantissimo:
// San Valentino 1.063 ordini, Natale 999, Festa della mamma 902, 8 marzo 408.
export const OCCASIONI = [
  { chiave: "san-valentino", nome: "San Valentino", mese: 2, dal: 1, al: 14 },
  { chiave: "festa-della-donna", nome: "Festa della donna", mese: 3, dal: 1, al: 8 },
  { chiave: "festa-della-mamma", nome: "Festa della mamma", mese: 5, dal: 1, al: 14 },
  { chiave: "natale", nome: "Natale", mese: 12, dal: 1, al: 25 },
] as const;

// Colonna aggregata per ogni occasione (quanti ordini validi ci sono caduti).
export function colonnaOccasione(chiave: string): string {
  return `occ_${chiave.replace(/-/g, "_")}`;
}

// --- Catalogo delle liste ---------------------------------------------------
export type FamigliaLista = "valore" | "tipologia" | "occasioni" | "attivazione" | "privacy";

export type Lista = {
  chiave: string;
  nome: string;
  famiglia: FamigliaLista;
  colore: string;
  // Chi ci finisce dentro, detto in chiaro. Sempre.
  criterio: string;
  // Cosa farci: è il motivo per cui la lista esiste.
  consiglio: string;
  // Il predicato SQL sulla vista dei clienti classificati.
  dove: Prisma.Sql;
};

const seg = (s: Segmento) => Prisma.sql`segmento = ${s}`;
const tip = (t: Tipologia) => Prisma.sql`tipologia = ${t}`;

export const FAMIGLIE: { chiave: FamigliaLista; nome: string; sotto: string }[] = [
  {
    chiave: "valore",
    nome: "Valore e ciclo di vita",
    sotto: "Dove sta il cliente fra il primo ordine e l'abbandono. Ogni cliente sta in una sola di queste liste.",
  },
  {
    chiave: "tipologia",
    nome: "Tipologia di cliente",
    sotto: "Chi è chi compra: privato, azienda, hotel, wedding, rivenditore. Dedotta dal nome dell'acquirente e correggibile a mano.",
  },
  {
    chiave: "occasioni",
    nome: "Occasioni ricorrenti",
    sotto: "Chi ha già comprato per una ricorrenza: torna a comprare per la stessa, l'anno dopo.",
  },
  {
    chiave: "attivazione",
    nome: "Liste operative e ADV",
    sotto: "Pronte da usare: pubblici Customer Match e Meta, cross-sell, contatti WhatsApp, casi da guardare.",
  },
  {
    chiave: "privacy",
    nome: "Privacy e consensi",
    sotto:
      "Chi si può contattare davvero. Avere un'email non è avere il permesso di usarla: qui contano i consensi di Shopify e le scelte scritte a mano nella scheda del cliente, che vincono sempre.",
  },
];

export const LISTE: Lista[] = [
  // ---- valore / ciclo di vita (esclusive) ----
  {
    chiave: "vip",
    nome: "VIP",
    famiglia: "valore",
    colore: "var(--gold-strong)",
    criterio: `Ha speso almeno ${SOGLIE.vipSpesa} EUR o fatto almeno ${SOGLIE.vipOrdini} ordini, e ha ordinato negli ultimi 12 mesi.`,
    consiglio:
      "Trattamento umano, non campagne: telefonata prima delle ricorrenze, upgrade del bouquet, consegna curata. Escluderli dagli sconti di acquisizione: comprano lo stesso.",
    dove: seg("vip"),
  },
  {
    chiave: "da-non-perdere",
    nome: "Da non perdere",
    famiglia: "valore",
    colore: "var(--red)",
    criterio: `Stessi numeri dei VIP (${SOGLIE.vipSpesa} EUR o ${SOGLIE.vipOrdini} ordini) ma fermo da più di 12 mesi.`,
    consiglio:
      "La lista più preziosa dell'app: sono clienti che valevano molto e non tornano. Contatto personale, non email di massa. Chiedere cosa è successo prima di offrire uno sconto.",
    dove: seg("da-non-perdere"),
  },
  {
    chiave: "fedeli",
    nome: "Fedeli",
    famiglia: "valore",
    colore: "var(--green)",
    criterio: `Almeno ${SOGLIE.fedeleOrdini} ordini e attivo negli ultimi 12 mesi.`,
    consiglio: "Zoccolo duro: seed migliore per i lookalike e primi destinatari delle novità.",
    dove: seg("fedele"),
  },
  {
    chiave: "ricorrenti",
    nome: "Ricorrenti",
    famiglia: "valore",
    colore: "var(--blue)",
    criterio: "2 o 3 ordini, attivo negli ultimi 12 mesi.",
    consiglio: "Il salto da fare è il terzo/quarto ordine: promemoria sulla ricorrenza che hanno già festeggiato con noi.",
    dove: seg("ricorrente"),
  },
  {
    chiave: "nuovi",
    nome: "Nuovi",
    famiglia: "valore",
    colore: "var(--purple)",
    criterio: `Un solo ordine, fatto negli ultimi ${SOGLIE.giorniNuovo} giorni.`,
    consiglio: "Finestra breve: il secondo ordine si gioca adesso. Ringraziamento, foto della consegna, invito alla prossima occasione.",
    dove: seg("nuovo"),
  },
  {
    chiave: "una-tantum",
    nome: "Una tantum",
    famiglia: "valore",
    colore: "var(--text-secondary)",
    criterio: "Un solo ordine, fra 3 e 12 mesi fa.",
    consiglio: "Regalo isolato. Vale una campagna a basso costo sulla ricorrenza in cui hanno comprato, non una corte serrata.",
    dove: seg("una-tantum"),
  },
  {
    chiave: "da-riattivare",
    nome: "Da riattivare",
    famiglia: "valore",
    colore: "var(--orange)",
    criterio: "Ultimo ordine fra 12 e 24 mesi fa.",
    consiglio: "Ancora recuperabili: una sola campagna con un motivo vero (nuova collezione, ricorrenza), poi si lasciano andare.",
    dove: seg("da-riattivare"),
  },
  {
    chiave: "persi",
    nome: "Persi",
    famiglia: "valore",
    colore: "var(--text-tertiary)",
    criterio: "Ultimo ordine oltre 24 mesi fa.",
    consiglio:
      "Da ESCLUDERE dalle campagne, non da inseguire: bruciano budget e peggiorano il MER. Utili come pubblico di esclusione su Meta e Google.",
    dove: seg("perso"),
  },

  // ---- tipologia ----
  {
    chiave: "aziende",
    nome: "Aziende",
    famiglia: "tipologia",
    colore: "var(--blue)",
    criterio: "Tipologia «Azienda»: forma societaria o professione riconosciuta nel nome dell'acquirente, oppure impostata a mano.",
    consiglio: "Il B2B non compra come il privato: listino dedicato, fatturazione, referente unico, promemoria a Natale (il regalo aziendale si decide a novembre).",
    dove: tip("azienda"),
  },
  {
    chiave: "horeca",
    nome: "Hotel e ristoranti",
    famiglia: "tipologia",
    colore: "var(--green)",
    criterio: "Tipologia «Hotel / Ristorante», dal nome dell'acquirente o impostata a mano.",
    consiglio: "Fornitura ricorrente, non regalo: proporre un abbonamento settimanale agli allestimenti invece del singolo ordine.",
    dove: tip("horeca"),
  },
  {
    chiave: "eventi",
    nome: "Eventi e wedding",
    famiglia: "tipologia",
    colore: "var(--purple)",
    criterio: "Tipologia «Eventi / Wedding», dal nome dell'acquirente o impostata a mano.",
    consiglio: "Pochi ordini, importi alti, decisi con mesi di anticipo: preventivo e sopralluogo valgono più di qualsiasi campagna.",
    dove: tip("eventi"),
  },
  {
    chiave: "rivenditori",
    nome: "Rivenditori",
    famiglia: "tipologia",
    colore: "var(--orange)",
    criterio: "Tipologia «Rivenditore» (fiorai, pasticcerie, negozi), dal nome o impostata a mano.",
    consiglio: "Da tenere fuori dalle campagne al consumatore e dai calcoli di marginalità del retail: sono un canale, non un cliente finale.",
    dove: tip("rivenditore"),
  },
  {
    chiave: "privati",
    nome: "Privati",
    famiglia: "tipologia",
    colore: "var(--text-secondary)",
    criterio: "Tutti quelli che non risultano azienda, hotel, eventi o rivenditore.",
    consiglio: "È il pubblico del retail: qui hanno senso ricorrenze, urgenza e consegna in giornata.",
    dove: tip("privato"),
  },
  {
    chiave: "probabili-aziende",
    nome: "Probabili aziende da confermare",
    famiglia: "tipologia",
    colore: "var(--gold-strong)",
    criterio:
      "Ordina con un'email a dominio proprio (non gmail, libero, icloud…) ma il nome non dice che è un'azienda, e nessuno l'ha ancora classificato a mano.",
    consiglio:
      "Coda di lavoro, non verità: si aprono, si guarda il nome e si conferma la tipologia. È così che il registro impara chi è B2B.",
    dove: Prisma.sql`${SQL_DOMINIO_AZIENDALE} AND tipologia = 'privato' AND tipo_manuale IS NULL`,
  },

  // ---- occasioni ----
  ...OCCASIONI.map<Lista>((o) => ({
    chiave: o.chiave,
    nome: `Ha comprato per ${o.nome}`,
    famiglia: "occasioni",
    colore: "var(--gold-strong)",
    criterio: `Almeno un ordine valido fra il ${o.dal} e il ${o.al} ${["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][o.mese]}, in un anno qualsiasi.`,
    consiglio: `Chi compra per ${o.nome} ricompra per ${o.nome}: è il pubblico da caricare 3 settimane prima, non a ridosso della data.`,
    dove: Prisma.raw(`${colonnaOccasione(o.chiave)} > 0`),
  })),

  // ---- attivazione ----
  {
    chiave: "alto-scontrino",
    nome: "Alto scontrino",
    famiglia: "attivazione",
    colore: "var(--gold-strong)",
    criterio: `Ordine medio di almeno ${SOGLIE.altoScontrino} EUR (il 90° percentile reale è 265 EUR).`,
    consiglio: "Non guardano il prezzo ma il risultato: mostrare le composizioni grandi, mai le promozioni.",
    dove: Prisma.raw(`medio >= ${SOGLIE.altoScontrino}`),
  },
  {
    chiave: "multi-brand",
    nome: "Multi-brand",
    famiglia: "attivazione",
    colore: "var(--green)",
    criterio: "Ha ordinato da almeno due negozi Deluxy.",
    consiglio: "Il cross-sell è già riuscito: sono i clienti più difficili da perdere e il seed migliore per i lookalike.",
    dove: Prisma.raw(`n_brand >= 2`),
  },
  {
    chiave: "cross-sell",
    nome: "Cross-sell da fare",
    famiglia: "attivazione",
    colore: "var(--blue)",
    criterio: "Almeno 2 ordini ma sempre e solo su un negozio.",
    consiglio: "Conoscono già il servizio: presentare l'altro brand (fiori ↔ pasticceria) costa poco e converte molto più di un pubblico freddo.",
    dove: Prisma.raw(`ordini >= 2 AND n_brand = 1`),
  },
  {
    chiave: "con-email",
    nome: "Ha un'email",
    famiglia: "attivazione",
    colore: "var(--blue)",
    criterio: "Ha lasciato un indirizzo email. Attenzione: avere l'indirizzo NON vuol dire poterlo usare per il marketing.",
    consiglio:
      "Per i pubblici pubblicitari (Customer Match, Meta) e per qualunque invio serve la lista «Consenso email», non questa.",
    dove: Prisma.raw(`email IS NOT NULL AND email <> ''`),
  },
  {
    chiave: "con-telefono",
    nome: "Ha un telefono",
    famiglia: "attivazione",
    colore: "var(--green)",
    criterio: "Ha lasciato un numero di telefono. Anche qui: averlo non vuol dire poterci scrivere.",
    consiglio: "Utile per il servizio (chiamare per una consegna). Per scrivere in massa serve «Consenso WhatsApp/SMS».",
    dove: Prisma.raw(`telefono IS NOT NULL AND telefono <> ''`),
  },
  {
    chiave: "consenso-email",
    nome: "Consenso email",
    famiglia: "privacy",
    colore: "var(--blue)",
    criterio:
      "Si può scrivere via email: consenso dato (Shopify «iscritto») o autorizzato a mano qui, e cliente non bloccato.",
    consiglio: "È QUESTA la lista da esportare per newsletter, Customer Match e pubblici Meta. Non «Ha un'email».",
    dove: Prisma.raw(`contattabile_email`),
  },
  {
    chiave: "consenso-whatsapp",
    nome: "Consenso WhatsApp / SMS",
    famiglia: "privacy",
    colore: "var(--green)",
    criterio: "Ha un telefono e il consenso ai messaggi (Shopify o dato a mano qui), e non è bloccato.",
    consiglio: "Il canale che converte di più su ricorrenze e riordini: è la base delle automazioni WhatsApp.",
    dove: Prisma.raw(`contattabile_sms AND telefono IS NOT NULL AND telefono <> ''`),
  },
  {
    chiave: "non-contattare",
    nome: "Non contattare",
    famiglia: "privacy",
    colore: "var(--red)",
    criterio: "Bloccato a mano, oppure disiscritto su Shopify, oppure con un «no» scritto su un canale.",
    consiglio:
      "Da escludere da qualunque invio, sempre. Le automazioni lo fanno da sole: questa lista serve a controllare che il conto torni.",
    dove: Prisma.raw(
      `bloccato OR privacy_email = 'no' OR privacy_sms = 'no' OR privacy_telefono = 'no' OR consenso_email IN ('UNSUBSCRIBED','REDACTED')`,
    ),
  },
  {
    chiave: "consenso-da-chiedere",
    nome: "Consenso da chiedere",
    famiglia: "privacy",
    colore: "var(--gold-strong)",
    criterio:
      "Cliente vero, con un recapito, ma di cui non sappiamo niente sul consenso: né Shopify né noi. Non è bloccato: è solo un dato che manca.",
    consiglio:
      "Sono contatti che oggi non si possono usare. Vale la pena chiederlo (al prossimo ordine, o con una telefonata) invece di scrivergli e sperare.",
    dove: Prisma.raw(
      `NOT bloccato AND consenso_email IS NULL AND privacy_email IS NULL AND privacy_sms IS NULL AND ((email IS NOT NULL AND email <> '') OR (telefono IS NOT NULL AND telefono <> ''))`,
    ),
  },
  {
    chiave: "con-annullamenti",
    nome: "Con ordini annullati",
    famiglia: "attivazione",
    colore: "var(--red)",
    criterio: "Ha almeno un ordine annullato (oltre a quelli validi).",
    consiglio:
      "Da guardare prima di spingerli con le campagne: un annullamento è un problema di consegna o di pagamento, e si ripete.",
    dove: Prisma.raw(`annullati > 0`),
  },
];

export function lista(chiave: string): Lista | undefined {
  return LISTE.find((l) => l.chiave === chiave);
}

// Nome della colonna del conteggio nella query del catalogo (niente trattini).
export function colonnaConteggio(chiave: string): string {
  return `n_${chiave.replace(/-/g, "_")}`;
}
export function colonnaSpesa(chiave: string): string {
  return `s_${chiave.replace(/-/g, "_")}`;
}
