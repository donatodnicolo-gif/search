import { prisma, SCHEMA } from "./db";

// ANALISI DELLE VENDITE — gli stessi numeri che si guardano in un negozio, ma
// calcolati sull'archivio invece che a mente.
//
// Tre idee, e tutto il resto viene da lì:
//
//  1. **un numero da solo non dice niente**: 40.000 € in un mese è tanto o
//     poco? Ogni misura esce sempre accanto allo stesso periodo di prima e
//     allo stesso periodo dell'anno scorso;
//  2. **il periodo in corso non si confronta con un periodo intero**: a metà
//     mese si è a metà mese. Il confronto si fa **a parità di giorni** —
//     altrimenti ogni mese sembra un disastro fino al 28;
//  3. **quello che si esclude si dichiara**: annullati e rimborsati restano
//     fuori dal venduto, ma sono contati a parte con la loro incidenza. Sono
//     l'unica misura che nessuno guarda finché non fa male.
//
// Lo scontrino medio non è un numero atomico: è **pezzi per ordine × prezzo
// medio del pezzo**. Tenerli separati è la differenza fra «vendiamo meno» e
// «vendiamo le stesse cose a meno», che sono due problemi diversi.

export type Granularita = "settimana" | "mese" | "anno";

export const GRANULARITA: { chiave: Granularita; nome: string; unita: string }[] = [
  { chiave: "settimana", nome: "Settimane", unita: "settimana" },
  { chiave: "mese", nome: "Mesi", unita: "mese" },
  { chiave: "anno", nome: "Anni", unita: "anno" },
];

export type Metriche = {
  ordini: number;
  lordo: number;
  pezzi: number;
  clienti: number;
  primi: number; // ordini di clienti mai visti prima
  daRepeater: number;
  annullatiOrdini: number;
  annullatiLordo: number;
  rimborsatiOrdini: number; // rimborso pieno o storno
  rimborsatiLordo: number;
  parzialiOrdini: number; // rimborso parziale: l'ordine resta valido e CONTATO
  parzialiLordo: number;
};

const ZERO: Metriche = {
  ordini: 0,
  lordo: 0,
  pezzi: 0,
  clienti: 0,
  primi: 0,
  daRepeater: 0,
  annullatiOrdini: 0,
  annullatiLordo: 0,
  rimborsatiOrdini: 0,
  rimborsatiLordo: 0,
  parzialiOrdini: 0,
  parzialiLordo: 0,
};

// I KPI che si ricavano dalle misure grezze. Stanno insieme perché si leggono
// insieme: lo scontrino medio scende, e la riga dopo dice se è colpa dei pezzi
// o del prezzo.
export type Kpi = Metriche & {
  scontrinoMedio: number; // lordo / ordini — è anche «l'ordine medio»: stesso numero
  upt: number; // pezzi per ordine (units per transaction)
  prezzoMedio: number; // lordo / pezzi
  ordiniPerCliente: number;
  quotaAnnullati: number; // % sul totale degli ordini emessi (validi + annullati)
  quotaRimborsati: number; // % del venduto tornato indietro
  quotaParziali: number; // % del venduto su ordini con un rimborso parziale dentro
  quotaPrimi: number; // % di ordini da clienti nuovi
};

export function kpi(m: Metriche): Kpi {
  const emessi = m.ordini + m.annullatiOrdini + m.rimborsatiOrdini;
  const lordoConResi = m.lordo + m.rimborsatiLordo;
  return {
    ...m,
    scontrinoMedio: m.ordini ? m.lordo / m.ordini : 0,
    upt: m.ordini ? m.pezzi / m.ordini : 0,
    prezzoMedio: m.pezzi ? m.lordo / m.pezzi : 0,
    ordiniPerCliente: m.clienti ? m.ordini / m.clienti : 0,
    quotaAnnullati: emessi ? (m.annullatiOrdini / emessi) * 100 : 0,
    quotaRimborsati: lordoConResi ? (m.rimborsatiLordo / lordoConResi) * 100 : 0,
    quotaParziali: m.lordo ? (m.parzialiLordo / m.lordo) * 100 : 0,
    quotaPrimi: m.ordini ? (m.primi / m.ordini) * 100 : 0,
  };
}

// Variazione percentuale fra due periodi. `null` quando prima era zero: una
// crescita «infinita» non è un'informazione, è una divisione per zero travestita.
export function variazione(ora: number, prima: number): number | null {
  if (!prima) return null;
  return ((ora - prima) / prima) * 100;
}

const FUSO = "Europe/Rome";
const RIMBORSI = "('REFUNDED','VOIDED')";

// La numerazione degli ordini di ogni cliente si fa su TUTTA la storia e solo
// dopo si taglia il periodo: se si contasse dentro la finestra, il secondo
// ordine di un cliente dell'anno scorso risulterebbe un cliente nuovo.
function cte(brand: string | null, indiceParametroBrand: number): string {
  return `
    WITH pezzi AS (
      SELECT "ordineId", SUM("quantita")::int AS pezzi
        FROM "${SCHEMA}"."RigaOrdine"
       GROUP BY 1
    ),
    base AS (
      SELECT o."id", o."data", o."totale", o."annullatoIl", o."financialStatus",
             o."categorie", COALESCE(p.pezzi, 0) AS pezzi,
             COALESCE(
               NULLIF(LOWER(TRIM(o."clienteEmail")), ''),
               NULLIF(TRIM(o."clienteTelefono"), ''),
               NULLIF(LOWER(TRIM(o."clienteNome")), '')
             ) AS chiave
        FROM "${SCHEMA}"."Ordine" o
        LEFT JOIN pezzi p ON p."ordineId" = o."id"
       ${brand ? `WHERE o."brand" = $${indiceParametroBrand}` : ""}
    ),
    numerati AS (
      SELECT b.*,
             CASE WHEN b.chiave IS NULL THEN NULL ELSE
               COUNT(*) FILTER (WHERE b."annullatoIl" IS NULL)
                 OVER (PARTITION BY b.chiave ORDER BY b."data"
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
             END AS precedenti
        FROM base b
    )`;
}

// Le colonne che descrivono un insieme di ordini. `valido` = non annullato e
// non rimborsato del tutto: è quello che chiamiamo «venduto».
const MISURE = `
  COUNT(*) FILTER (WHERE valido)::int AS ordini,
  COALESCE(SUM("totale") FILTER (WHERE valido), 0)::float8 AS lordo,
  COALESCE(SUM(pezzi) FILTER (WHERE valido), 0)::int AS pezzi,
  COUNT(DISTINCT chiave) FILTER (WHERE valido)::int AS clienti,
  COUNT(*) FILTER (WHERE valido AND precedenti = 0)::int AS primi,
  COUNT(*) FILTER (WHERE valido AND precedenti > 0)::int AS "daRepeater",
  COUNT(*) FILTER (WHERE "annullatoIl" IS NOT NULL)::int AS "annullatiOrdini",
  COALESCE(SUM("totale") FILTER (WHERE "annullatoIl" IS NOT NULL), 0)::float8 AS "annullatiLordo",
  COUNT(*) FILTER (WHERE "annullatoIl" IS NULL AND "financialStatus" IN ${RIMBORSI})::int AS "rimborsatiOrdini",
  COALESCE(SUM("totale") FILTER (WHERE "annullatoIl" IS NULL AND "financialStatus" IN ${RIMBORSI}), 0)::float8 AS "rimborsatiLordo",
  COUNT(*) FILTER (WHERE valido AND "financialStatus" = 'PARTIALLY_REFUNDED')::int AS "parzialiOrdini",
  COALESCE(SUM("totale") FILTER (WHERE valido AND "financialStatus" = 'PARTIALLY_REFUNDED'), 0)::float8 AS "parzialiLordo"
`;

const VALIDO = `("annullatoIl" IS NULL AND ("financialStatus" IS NULL OR "financialStatus" NOT IN ${RIMBORSI}))`;

// Le misure di un periodo: da incluso, a escluso.
export async function metriche(da: Date, a: Date, brand: string | null): Promise<Metriche> {
  const parametri: unknown[] = [da, a];
  if (brand) parametri.push(brand);
  const righe = await prisma.$queryRawUnsafe<Metriche[]>(
    `${cte(brand, 3)}
     SELECT ${MISURE}
       FROM (SELECT *, ${VALIDO} AS valido FROM numerati WHERE "data" >= $1 AND "data" < $2) x`,
    ...parametri,
  );
  return righe[0] ?? ZERO;
}

export type Punto = Metriche & { periodo: string };

// La serie storica: gli ultimi N periodi, dal più vecchio al più recente.
export async function serie(
  gran: Granularita,
  quanti: number,
  brand: string | null,
  adesso: Date,
): Promise<Punto[]> {
  const unita = gran === "settimana" ? "week" : gran === "mese" ? "month" : "year";
  // `quanti` periodi CONTANDO quello in corso: si parte da quanti-1 indietro e
  // si arriva alla fine di quello di adesso. Derivare l'inizio dalla fine
  // toglieva un periodo senza dirlo.
  const parametri: unknown[] = [
    inizioPeriodo(adesso, gran, -(quanti - 1)),
    finePeriodo(inizioPeriodo(adesso, gran), gran),
  ];
  if (brand) parametri.push(brand);
  const righe = await prisma.$queryRawUnsafe<Punto[]>(
    `${cte(brand, 3)}
     SELECT to_char(date_trunc('${unita}', ("data" AT TIME ZONE 'UTC' AT TIME ZONE '${FUSO}')), 'YYYY-MM-DD') AS periodo,
            ${MISURE}
       FROM (SELECT *, ${VALIDO} AS valido FROM numerati WHERE "data" >= $1 AND "data" < $2) x
      GROUP BY 1
      ORDER BY 1`,
    ...parametri,
  );
  return righe;
}

export type RigaCategoria = {
  categoria: string;
  ordini: number;
  lordo: number;
  pezzi: number;
};

// Il venduto per categoria di prodotto.
//
// ⚠️ Un ordine con fiori E una torta conta in TUTTE E DUE le righe: le
// categorie stanno sull'ordine, non sulla singola riga, e spezzare l'importo
// «a metà» sarebbe un numero inventato. La somma delle righe supera quindi il
// totale, ed è giusto che si veda: la pagina lo scrive.
export async function perCategoria(da: Date, a: Date, brand: string | null): Promise<RigaCategoria[]> {
  const parametri: unknown[] = [da, a];
  if (brand) parametri.push(brand);
  return prisma.$queryRawUnsafe<RigaCategoria[]>(
    `${cte(brand, 3)}
     SELECT COALESCE(NULLIF(cat, ''), 'non-classificato') AS categoria,
            COUNT(*)::int AS ordini,
            COALESCE(SUM("totale"), 0)::float8 AS lordo,
            COALESCE(SUM(pezzi), 0)::int AS pezzi
       FROM (
         SELECT n.*, UNNEST(
                  CASE WHEN COALESCE(n."categorie", '') = '' THEN ARRAY['']
                       ELSE string_to_array(n."categorie", ' ') END
                ) AS cat
           FROM numerati n
          WHERE n."data" >= $1 AND n."data" < $2 AND ${VALIDO}
       ) y
      GROUP BY 1
      ORDER BY 3 DESC`,
    ...parametri,
  );
}

// ---- Periodi ----------------------------------------------------------------
// Tutti i confini sono calcolati sull'ora italiana: un ordine delle 00:30 del
// 1° gennaio è di gennaio, non di dicembre. La settimana comincia di LUNEDÌ,
// come la settimana lavorativa di chi legge questi numeri.

const MS_GIORNO = 86_400_000;

function aMezzanotteItaliana(d: Date): Date {
  // Si passa per la stringa locale: è l'unico modo affidabile senza librerie di
  // fusi orari, e sbagliare qui vorrebbe dire spostare ordini di un giorno.
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return new Date(`${iso}T00:00:00${offsetItaliano(d)}`);
}

// +01:00 d'inverno, +02:00 d'estate: si ricava dal fuso invece di indovinarlo.
function offsetItaliano(d: Date): string {
  const parti = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}:\d{2})/.exec(parti ?? "");
  return m ? m[1] : "+01:00";
}

// L'inizio del periodo che contiene `d`, spostato di `salto` periodi.
export function inizioPeriodo(d: Date, gran: Granularita, salto = 0): Date {
  const g = aMezzanotteItaliana(d);
  if (gran === "settimana") {
    const giorno = (g.getDay() + 6) % 7; // 0 = lunedì
    return aMezzanotteItaliana(new Date(g.getTime() - (giorno - salto * 7) * MS_GIORNO));
  }
  const anno = Number(new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric" }).format(d));
  const mese = Number(new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, month: "numeric" }).format(d));
  if (gran === "mese") {
    const totale = anno * 12 + (mese - 1) + salto;
    return aMezzanotteItaliana(new Date(Date.UTC(Math.floor(totale / 12), totale % 12, 1, 12)));
  }
  return aMezzanotteItaliana(new Date(Date.UTC(anno + salto, 0, 1, 12)));
}

// La fine di un periodo è l'inizio del successivo (estremo escluso): così due
// periodi consecutivi non si sovrappongono di un millisecondo né lasciano buchi.
export function finePeriodo(inizio: Date, gran: Granularita): Date {
  return inizioPeriodo(inizio, gran, 1);
}

// Quanti giorni sono già passati dentro il periodo che contiene `adesso`.
// Serve al confronto a parità di giorni: mezzo mese si confronta con mezzo mese.
export function giorniTrascorsi(inizio: Date, adesso: Date): number {
  return Math.max(1, Math.ceil((adesso.getTime() - inizio.getTime()) / MS_GIORNO));
}

// La data come la vede l'Italia, in forma YYYY-MM-DD. Serve per confrontarla
// con le chiavi che arrivano dal database: `toISOString()` darebbe l'ora UTC, e
// la mezzanotte italiana del 1° luglio lì è ancora il 30 giugno.
export function chiaveGiorno(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function nomePeriodo(inizio: Date, gran: Granularita): string {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, ...o }).format(inizio);
  if (gran === "anno") return f({ year: "numeric" });
  if (gran === "mese") return f({ month: "long", year: "numeric" });
  const fine = new Date(inizio.getTime() + 6 * MS_GIORNO);
  const g = (d: Date) => new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, day: "2-digit", month: "short" }).format(d);
  return `${g(inizio)} – ${g(fine)}`;
}
