import { prisma, SCHEMA } from "./db";
import { ESONIMI } from "./luoghi";
import { ALIQUOTA_IVA } from "./controllo";

// MARGINI — quanto resta di un ordine dopo aver pagato il fornitore.
//
// Tre idee, e il resto viene da lì:
//
//  1. **il margine si misura solo dove il costo lo sappiamo.** Il costo del
//     fioraio non sta nell'ordine Shopify: entra qui dal controllo (abbinamento
//     con l'addebito in banca) o a mano. Dove non c'è, l'ordine NON entra nel
//     conto e la pagina dichiara su quanti ordini è misurato. Spalmare una
//     media sui mancanti darebbe un numero preciso e falso;
//  2. **accanto al margine misurato c'è il margine ATTESO**, cioè quello che
//     verrebbe se ogni ordine costasse la quota di riferimento (~60%). È
//     un'ipotesi, si chiama così, e serve a due cose: dare un ordine di
//     grandezza sul venduto non ancora misurato e far vedere di quanto la
//     realtà si scosta dall'accordo;
//  3. **il margine è al NETTO IVA.** `Ordine.totale` è il totale Shopify (IVA e
//     spedizione incluse); il margine reale non è profitto finché non se ne
//     toglie l'IVA, che è un giro-partita per lo Stato. Si SCORPORA (÷ 1,22), non
//     si sottrae il 22%. ⚠️ Scelta dell'utente (24/08/2026): aliquota UNICA 22%
//     su tutto — anche fiori e torte, che in Italia sarebbero di norma al 10% (è
//     stato avvisato e ha deciso così). L'aliquota vive in `controllo.ALIQUOTA_IVA`,
//     un posto solo: il giorno che serve per categoria, si cambia lì. La **%**
//     del margine NON cambia con lo scorporo (l'IVA colpisce ricavo e costo alla
//     stessa aliquota): cambia solo il valore in euro.
//
// Annullati e rimborsati per intero stanno fuori, come in Analisi: un ordine
// annullato non ha margine, ha solo un costo se è stato pagato comunque.

const FUSO = "Europe/Rome";
const RIMBORSI = "('REFUNDED','VOIDED')";
const VALIDO = `("annullatoIl" IS NULL AND ("financialStatus" IS NULL OR "financialStatus" NOT IN ${RIMBORSI}))`;

// ⚠️⚠️ QUESTE DUE ESPRESSIONI DEVONO DIRE LA STESSA COSA DI `margineOrdine()`
// (src/lib/controllo.ts). Sono la sua traduzione in SQL, perche' qui il conto va
// fatto su decine di migliaia di righe raggruppate per dimensione, e caricarle
// tutte in memoria per passarle una a una alla funzione non e' un'opzione.
// Due implementazioni della stessa regola divergono sempre: se si tocca
// `margineOrdine`, si tocca anche qui — e si rilancia il confronto descritto in
// fondo a questo file, che le mette a paragone sui dati veri.
//
// MARGINE: quello della piattaforma consegne quando c'e' (e' il suo conto, gia'
// al netto IVA), altrimenti il ripiego del registro. NULL = non misurabile.
const MARGINE = `COALESCE(
  "margineFinale",
  CASE WHEN "costoFornitore" IS NULL THEN NULL ELSE (
    "totale" - "costoFornitore"
    - CASE WHEN "evasione" = 'piattaforma' AND "consegnataDa" <> 'fornitore'
           THEN COALESCE("costoConsegna", 0) ELSE 0 END
    + CASE WHEN "evasione" = 'piattaforma' AND "consegnataDa" <> 'fornitore'
           THEN COALESCE("feeConsegna", 0) ELSE 0 END
  ) / ${1 + ALIQUOTA_IVA / 100} END)`;

// COSTO DEL FORNITORE, per il confronto con la quota. Sugli ordini che la
// piattaforma conosce non e' `costoFornitore` (quasi sempre vuoto) ma il valore
// dato al partner, che si RICAVA dal primo margine:
//   primoMargine = (totale - valoreAlPartner) / 1,22  =>  valoreAlPartner = totale - primoMargine x 1,22
const COSTO = `COALESCE(
  CASE WHEN "primoMargine" IS NOT NULL THEN "totale" - "primoMargine" * ${1 + ALIQUOTA_IVA / 100} END,
  "costoFornitore")`;

export type Misure = {
  ordiniValidi: number;
  lordoValido: number;
  /** Ordini di cui si SA il margine (dalla piattaforma o dal ripiego). */
  ordiniConCosto: number;
  /** Il venduto lordo di quegli ordini: e' la base delle percentuali. */
  lordoConCosto: number;
  /** Il margine NETTO gia' sommato: non si ricalcola piu' qui. */
  margineNetto: number;
  costo: number;
  sopraQuota: number;
  sottoQuota: number;
};

const ZERO: Misure = {
  ordiniValidi: 0,
  lordoValido: 0,
  ordiniConCosto: 0,
  lordoConCosto: 0,
  margineNetto: 0,
  costo: 0,
  sopraQuota: 0,
  sottoQuota: 0,
};

export type Margine = Misure & {
  margine: number; // misurato, AL NETTO IVA: (lordo degli ordini con costo − costo) ÷ 1,22
  imponibileConCosto: number; // il venduto misurato AL NETTO IVA: è la base di pctMargine
  pctMargine: number; // margine NETTO in % del venduto LORDO misurato (= margine/lordoConCosto)
  coperturaOrdini: number; // % di ordini validi che hanno un costo
  coperturaLordo: number; // % di venduto valido coperto dalla misura
  costoMedioPct: number; // quanto paghiamo, in % del valore dell'ordine
  margineAtteso: number; // ipotesi sul venduto INTERO, alla quota di riferimento
};

export function calcola(m: Misure, quota: number): Margine {
  const iva = 1 + ALIQUOTA_IVA / 100;
  // ⚠️ Il margine NON si ricalcola piu' qui: arriva gia' sommato da SQL, riga
  // per riga, con la regola di `margineOrdine` (piattaforma dove c'e', ripiego
  // dove manca). Sommare i lordi e scorporare alla fine darebbe un numero
  // diverso, perche' gli ordini della piattaforma hanno gia' l'IVA tolta e
  // dentro anche fee, costo del valet e commissione d'incasso.
  const margine = Math.round(m.margineNetto * 100) / 100;
  return {
    ...m,
    margine,
    // La base della percentuale, scorporata qui una volta sola: a schermo il
    // margine netto va letto accanto al venduto NETTO, non accanto al lordo —
    // altrimenti i due numeri non tornano e chi guarda ha ragione.
    imponibileConCosto: Math.round((m.lordoConCosto / iva) * 100) / 100,
    // Stessa regola della scheda ordine (decisione utente 25/08/2026): margine
    // NETTO sul venduto LORDO. Non è (100 − quota): l'atteso si scorpora con
    // margineAttesoPct().
    pctMargine: m.lordoConCosto > 0.005 ? (margine / m.lordoConCosto) * 100 : 0,
    coperturaOrdini: m.ordiniValidi ? (m.ordiniConCosto / m.ordiniValidi) * 100 : 0,
    coperturaLordo: m.lordoValido > 0.005 ? (m.lordoConCosto / m.lordoValido) * 100 : 0,
    costoMedioPct: m.lordoConCosto > 0.005 ? (m.costo / m.lordoConCosto) * 100 : 0,
    // Anche l'atteso è netto IVA, così misurato e atteso sono confrontabili.
    margineAtteso: Math.round((m.lordoValido * (1 - quota / 100)) / iva * 100) / 100,
  };
}

// Le colonne che descrivono un insieme di ordini dal punto di vista del margine.
// `$3` è la quota in percentuale: sopra/sotto quota si contano in SQL perché è
// dove sta il confronto fra costo e totale, riga per riga.
const MISURE = `
  COUNT(*) FILTER (WHERE valido)::int AS "ordiniValidi",
  COALESCE(SUM("totale") FILTER (WHERE valido), 0)::float8 AS "lordoValido",
  COUNT(*) FILTER (WHERE valido AND margine IS NOT NULL)::int AS "ordiniConCosto",
  COALESCE(SUM("totale") FILTER (WHERE valido AND margine IS NOT NULL), 0)::float8 AS "lordoConCosto",
  COALESCE(SUM(margine) FILTER (WHERE valido), 0)::float8 AS "margineNetto",
  COALESCE(SUM(costo) FILTER (WHERE valido AND margine IS NOT NULL), 0)::float8 AS "costo",
  COUNT(*) FILTER (WHERE valido AND margine IS NOT NULL AND costo > "totale" * ($3::float8 / 100) + 0.005)::int AS "sopraQuota",
  COUNT(*) FILTER (WHERE valido AND margine IS NOT NULL AND costo <= "totale" * ($3::float8 / 100) + 0.005)::int AS "sottoQuota"
`;

function base(brand: string | null): string {
  return `SELECT *, ${VALIDO} AS valido, ${MARGINE} AS margine, ${COSTO} AS costo
            FROM "${SCHEMA}"."Ordine"
           WHERE "data" >= $1 AND "data" < $2${brand ? ` AND "brand" = $4` : ""}`;
}

// Le misure di un periodo: `da` incluso, `a` escluso.
export async function misure(da: Date, a: Date, brand: string | null, quota: number): Promise<Misure> {
  const parametri: unknown[] = [da, a, quota];
  if (brand) parametri.push(brand);
  const righe = await prisma.$queryRawUnsafe<Misure[]>(
    `SELECT ${MISURE} FROM (${base(brand)}) x`,
    ...parametri,
  );
  return righe[0] ?? ZERO;
}

// ---- Le dimensioni: dove il margine si fa e dove si perde -------------------

const CITTA_NORMALIZZATA = `CASE
  WHEN UPPER(COALESCE("paese", '')) = 'IT' AND LOWER(TRIM("citta")) IN (${Object.keys(ESONIMI)
    .map((k) => `'${k}'`)
    .join(", ")})
  THEN CASE ${Object.entries(ESONIMI)
    .map(([ing, ita]) => `WHEN LOWER(TRIM("citta")) = '${ing}' THEN '${ita}'`)
    .join(" ")} END
  ELSE INITCAP(LOWER(TRIM("citta")))
END`;

export type DimensioneMargine = {
  chiave: string;
  nome: string;
  spiega: string;
  gruppo: string;
  join?: string;
  nota?: string;
};

export const DIMENSIONI_MARGINE: DimensioneMargine[] = [
  {
    chiave: "brand",
    nome: "Negozio",
    spiega: "Quale sito porta il margine migliore.",
    gruppo: `"brand"`,
  },
  {
    chiave: "categoria",
    nome: "Categoria di prodotto",
    spiega: "Fiori, torte, colazioni: dove il margine è più largo.",
    gruppo: `COALESCE(NULLIF(cat, ''), 'non-classificato')`,
    join: `, UNNEST(CASE WHEN COALESCE("categorie", '') = '' THEN ARRAY[''] ELSE string_to_array("categorie", ' ') END) AS cat`,
    nota:
      "Le categorie stanno sull'ordine, non sulla riga: un ordine con fiori e una torta è contato in tutte e due le righe, quindi la somma delle righe supera il totale della pagina.",
  },
  {
    chiave: "fornitore",
    nome: "Fornitore pagato",
    spiega: "A chi è andato il denaro: il nome sull'addebito in banca.",
    gruppo: `COALESCE(NULLIF(TRIM("costoFornitoreNome"), ''), '(fornitore non indicato)')`,
    nota:
      "È il nome della CONTROPARTE del movimento bancario, non il fornitore assegnato all'ordine: se il bonifico è partito da un conto intestato diversamente, qui si legge quello. Gli ordini senza costo non compaiono in questa tabella.",
  },
  {
    chiave: "citta",
    nome: "Città di consegna",
    spiega: "Dove costa di più consegnare.",
    gruppo: `COALESCE(NULLIF(${CITTA_NORMALIZZATA}, ''), "cittaDedotta", '(città non indicata)')`,
  },
  {
    chiave: "urgenza",
    nome: "Tempo di consegna",
    spiega: "Un'urgenza si paga: qui si vede quanto.",
    gruppo: `COALESCE(NULLIF("urgenza", ''), 'senza-data')`,
  },
  {
    chiave: "canale",
    nome: "Canale di provenienza",
    spiega: "Da dove è arrivato l'ordine che marginava.",
    gruppo: `COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto')`,
  },
  {
    chiave: "mese",
    nome: "Mese",
    spiega: "Come si muove il margine nel tempo.",
    gruppo: `to_char(date_trunc('month', ("data" AT TIME ZONE 'UTC' AT TIME ZONE '${FUSO}')), 'YYYY-MM')`,
  },
];

export function dimensioneMargine(chiave: string | null | undefined): DimensioneMargine {
  return DIMENSIONI_MARGINE.find((d) => d.chiave === chiave) ?? DIMENSIONI_MARGINE[0];
}

export type RigaMargine = Misure & { etichetta: string };

export async function perDimensione(
  d: DimensioneMargine,
  da: Date,
  a: Date,
  brand: string | null,
  quota: number,
): Promise<RigaMargine[]> {
  const parametri: unknown[] = [da, a, quota];
  if (brand) parametri.push(brand);
  return prisma.$queryRawUnsafe<RigaMargine[]>(
    `SELECT ${d.gruppo} AS etichetta, ${MISURE}
       FROM (${base(brand)}) x
       ${d.join ?? ""}
      GROUP BY 1
      ORDER BY 5 DESC, 2 DESC`,
    ...parametri,
  );
}

// ---- La coda di lavoro: gli ordini pagati sopra la quota ---------------------
// Non è una statistica, è un elenco di cose da guardare: ogni riga è un ordine su
// cui abbiamo pagato più di quanto avevamo concordato. Ordinati per quanto ci è
// costato in più, non per percentuale: il 90% su un ordine da 30 € pesa meno del
// 70% su uno da 900 €.
export type OrdineSopraQuota = {
  id: string;
  numero: string;
  brand: string;
  data: Date;
  totale: number;
  costoFornitore: number;
  costoFornitoreNome: string | null;
  costoDa: string | null;
  differenza: number; // quanto abbiamo pagato in più della quota
  pct: number;
};

export async function sopraQuota(
  da: Date,
  a: Date,
  brand: string | null,
  quota: number,
  limite = 25,
): Promise<OrdineSopraQuota[]> {
  const ordini = await prisma.ordine.findMany({
    where: {
      data: { gte: da, lt: a },
      ...(brand ? { brand } : {}),
      annullatoIl: null,
      costoFornitore: { not: null },
    },
    select: {
      id: true,
      numero: true,
      brand: true,
      data: true,
      totale: true,
      costoFornitore: true,
      costoFornitoreNome: true,
      costoDa: true,
      financialStatus: true,
    },
  });
  return ordini
    .filter((o) => !["REFUNDED", "VOIDED"].includes(o.financialStatus ?? ""))
    .map((o) => {
      const costo = o.costoFornitore ?? 0;
      const atteso = o.totale * (quota / 100);
      return {
        id: o.id,
        numero: o.numero,
        brand: o.brand,
        data: o.data,
        totale: o.totale,
        costoFornitore: costo,
        costoFornitoreNome: o.costoFornitoreNome,
        costoDa: o.costoDa,
        differenza: costo - atteso,
        pct: o.totale > 0.005 ? (costo / o.totale) * 100 : 0,
      };
    })
    .filter((o) => o.differenza > 0.005)
    .sort((a2, b2) => b2.differenza - a2.differenza)
    .slice(0, limite);
}
