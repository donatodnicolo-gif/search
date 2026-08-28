import { prisma, SCHEMA } from "./db";
import { ESONIMI } from "./luoghi";
import { SQL_TIPOLOGIA_AUTO } from "./segmenti";

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
      SELECT o."id", o."numero", o."data", o."totale", o."annullatoIl", o."financialStatus",
             o."categorie", o."citta", o."cittaDedotta", o."paese", o."urgenza", o."canaleMarketing", o."clienteNome", o."mittentePaese",
             COALESCE(p.pezzi, 0) AS pezzi,
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
  COUNT(DISTINCT x.chiave) FILTER (WHERE valido)::int AS clienti,
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

// ---- Le dimensioni: gli assi lungo cui tagliare gli stessi numeri -----------
//
// Lo stesso mestiere visto da sei parti diverse. Non è vezzo: «il venduto è
// sceso» non è una notizia finché non si sa DOVE — a Milano o a Roma, sui fiori
// o sulle torte, sui clienti nuovi o su quelli che tornano. Ogni riga porta
// tutti i KPI e la variazione rispetto allo stesso periodo di confronto della
// pagina.
//
// Ogni dimensione dichiara come si raggruppa; qualcuna ha bisogno di un pezzo
// di query in più (le categorie si moltiplicano, la tipologia e l'occasione
// stanno su altre tabelle). Sta tutto qui in un posto solo, così aggiungerne
// una domanda tre righe.

export type Dimensione = {
  chiave: string;
  nome: string;
  spiega: string;
  gruppo: string; // l'espressione SQL che dà l'etichetta della riga
  join?: string; // eventuale pezzo di FROM in più
  nota?: string; // avvertenza da mostrare sotto la tabella
};

// «Milan» e «Milano» sono la stessa città, ma solo in Italia: la stessa regola
// che vale per i tag, scritta in SQL perché il raggruppamento avviene lì.
const CITTA_NORMALIZZATA = `CASE
  WHEN UPPER(COALESCE("paese", '')) = 'IT' AND LOWER(TRIM("citta")) IN (${Object.keys(ESONIMI)
    .map((k) => `'${k}'`)
    .join(", ")})
  THEN CASE ${Object.entries(ESONIMI)
    .map(([ing, ita]) => `WHEN LOWER(TRIM("citta")) = '${ing}' THEN '${ita}'`)
    .join(" ")} END
  ELSE INITCAP(LOWER(TRIM("citta")))
END`;

export const DIMENSIONI: Dimensione[] = [
  {
    chiave: "citta",
    nome: "Città di consegna",
    spiega: "Dove arriva il regalo.",
    nota:
      "Quando l'indirizzo non ha la città si usa quella **dedotta** dai tag dell'ordine o dal nome del prodotto (894 ordini su 13.983, riconciliazione in Impostazioni). Una città dedotta non è un indirizzo di consegna: serve a contare e a cercare, e sulla scheda dell'ordine si legge da dove è stata presa.",
    gruppo: `COALESCE(NULLIF(${CITTA_NORMALIZZATA}, ''), "cittaDedotta", '(città non indicata)')`,
  },
  {
    chiave: "categoria",
    nome: "Categoria di prodotto",
    spiega: "Di che cosa è fatto l'ordine, dai titoli delle sue righe.",
    gruppo: `COALESCE(NULLIF(cat, ''), 'non-classificato')`,
    join: `, UNNEST(CASE WHEN COALESCE("categorie", '') = '' THEN ARRAY[''] ELSE string_to_array("categorie", ' ') END) AS cat`,
    nota:
      "Le categorie stanno sull'ordine, non sulla riga: un ordine con fiori e una torta è contato in tutte e due le righe, e la somma supera il totale.",
  },
  {
    chiave: "tipologia",
    nome: "Tipologia di cliente",
    spiega: "Privato, azienda, hotel e ristoranti, eventi, rivenditore.",
    gruppo: `COALESCE(tip.tipologia, 'privato')`,
    join: `LEFT JOIN tipologie tip ON tip.chiave = x.chiave`,
    nota:
      "La tipologia è del CLIENTE, non dell'ordine: si deduce dai nomi con cui quella persona ha comprato, e una scelta fatta a mano vince sulla deduzione. Se «azienda» sembra troppo piccola non è un errore del conto: il riconoscimento automatico è prudente apposta — pescava i cognomi «Villa» e «Fiori» — e le circa mille «probabili aziende» sono ancora da confermare a mano nella pagina Clienti. Finché non lo sono, il loro venduto sta dentro «privato».",
  },
  {
    chiave: "occasione",
    nome: "Occasione",
    spiega: "Compleanni, anniversari, lauree: le ricorrenze riconosciute negli ordini.",
    gruppo: `COALESCE(occ.tipo, '(nessuna occasione riconosciuta)')`,
    join: `LEFT JOIN occasioni occ ON occ.chiave = x.chiave AND occ.numero = x."numero"`,
    nota:
      "Un ordine entra in un'occasione solo se quella ricorrenza lo cita fra le sue prove; gli altri stanno in «nessuna occasione riconosciuta». La riga più grande è «da precisare»: sono occasioni vere e riconosciute, di cui però nessuno ha ancora detto il motivo — si fanno dire all'AI dalla pagina Eventi clienti, e solo allora questa tabella diventa interessante.",
  },
  {
    chiave: "paeseMittente",
    nome: "Nazione di chi ordina",
    spiega: "Da quale paese parte la richiesta: l'indirizzo di fatturazione.",
    gruppo: `COALESCE(NULLIF(UPPER(TRIM("mittentePaese")), ''), '(non indicata)')`,
    nota:
      "È il paese di CHI MANDA, non di chi riceve: più di un ordine su quattro arriva da fuori Italia. Gli ordini creati a mano spesso non hanno un indirizzo di fatturazione, e finiscono in «non indicata».",
  },
  {
    chiave: "paese",
    nome: "Nazione di consegna",
    spiega: "In quale paese arriva il regalo.",
    gruppo: `COALESCE(NULLIF(UPPER(TRIM("paese")), ''), '(non indicata)')`,
  },
  {
    chiave: "urgenza",
    nome: "Tipo di ordine",
    spiega: "Quanto tempo c'è fra l'ordine e la consegna richiesta.",
    gruppo: `COALESCE(NULLIF("urgenza", ''), 'senza-data')`,
  },
  {
    chiave: "canale",
    nome: "Canale di provenienza",
    spiega: "Da dove è arrivato l'ordine: Google Ads, ricerca, social, email…",
    gruppo: `COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto')`,
  },
];

export function dimensione(chiave: string | null | undefined): Dimensione {
  return DIMENSIONI.find((d) => d.chiave === chiave) ?? DIMENSIONI[0];
}

export type RigaDimensione = Metriche & { etichetta: string };

// Le due CTE che servono solo a certe dimensioni. Si aggiungono sempre: costano
// una scansione su tabelle piccole e tengono la query una sola.
function cteExtra(): string {
  return `,
    nomiCliente AS (
      SELECT chiave, COALESCE(STRING_AGG(DISTINCT nome, ' | '), '') AS nomi
        FROM (SELECT chiave, "clienteNome" AS nome FROM base WHERE "clienteNome" IS NOT NULL) n
       GROUP BY 1
    ),
    tipologie AS (
      SELECT n.chiave,
             COALESCE(t."tipo", ${SQL_TIPOLOGIA_AUTO.sql}) AS tipologia
        FROM nomiCliente n
        LEFT JOIN "${SCHEMA}"."TagCliente" t ON t."chiave" = n.chiave
    ),
    occasioni AS (
      SELECT e."chiave", UNNEST(string_to_array(e."ordini", ' ')) AS numero, e."tipo"
        FROM "${SCHEMA}"."EventoCliente" e
       WHERE e."stato" <> 'ignorato' AND COALESCE(e."ordini", '') <> ''
    )`;
}

// Gli stessi numeri di `metriche`, ma spezzati lungo una dimensione.
export async function perDimensione(
  d: Dimensione,
  da: Date,
  a: Date,
  brand: string | null,
): Promise<RigaDimensione[]> {
  const parametri: unknown[] = [da, a];
  if (brand) parametri.push(brand);
  return prisma.$queryRawUnsafe<RigaDimensione[]>(
    `${cte(brand, 3)}${cteExtra()}
     SELECT ${d.gruppo} AS etichetta, ${MISURE}
       FROM (
         SELECT n.*, ${VALIDO} AS valido
           FROM numerati n
          WHERE n."data" >= $1 AND n."data" < $2
       ) x
       ${d.join ?? ""}
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

// Da «2026-02-01» alla mezzanotte italiana di quel giorno. Serve al periodo
// scelto a mano: chi scrive «1 febbraio» intende il 1° febbraio qui, non a
// Greenwich — e mezz'ora di differenza sposta gli ordini della notte.
export function inizioGiornoItaliano(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const sonda = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(sonda.getTime())) return null;
  const d = new Date(`${iso}T00:00:00${offsetItaliano(sonda)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const MS_IN_GIORNO = MS_GIORNO;

// Le scorciatoie di periodo (Libro UX&UI v1.9 §8-bis): UN parametro
// (`periodo=mese|scorso|trimestre|anno`) tradotto qui, in un punto solo, in un
// intervallo { gte, lt } a confini italiani (stessa regola di inizioPeriodo).
// Semantica: mese = mese corrente · scorso = mese precedente · trimestre =
// ultimi 3 mesi incluso il corrente · anno = anno solare corrente.
export function intervalloScorciatoia(
  chiave: string | null | undefined,
  adesso = new Date(),
): { gte: Date; lt: Date } | null {
  if (chiave === "mese") return { gte: inizioPeriodo(adesso, "mese"), lt: inizioPeriodo(adesso, "mese", 1) };
  if (chiave === "scorso") return { gte: inizioPeriodo(adesso, "mese", -1), lt: inizioPeriodo(adesso, "mese") };
  if (chiave === "trimestre") return { gte: inizioPeriodo(adesso, "mese", -2), lt: inizioPeriodo(adesso, "mese", 1) };
  if (chiave === "anno") return { gte: inizioPeriodo(adesso, "anno"), lt: inizioPeriodo(adesso, "anno", 1) };
  return null;
}

// «01 – 14 feb 2026», o «01 feb – 03 mar 2026» quando il periodo scavalca il
// mese: si scrive quello che serve a riconoscerlo, non una data intera due volte.
export function nomeIntervallo(inizio: Date, fineEsclusa: Date): string {
  const ultimo = new Date(fineEsclusa.getTime() - MS_GIORNO);
  const f = (d: Date, opzioni: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, ...opzioni }).format(d);
  // Un giorno solo si scrive una volta sola: «14 – 14 feb» sembra un errore.
  if (fineEsclusa.getTime() - inizio.getTime() <= MS_GIORNO) {
    return f(inizio, { day: "2-digit", month: "short", year: "numeric" });
  }
  const stessoMese = f(inizio, { month: "short", year: "numeric" }) === f(ultimo, { month: "short", year: "numeric" });
  if (stessoMese) return `${f(inizio, { day: "2-digit" })} – ${f(ultimo, { day: "2-digit", month: "short", year: "numeric" })}`;
  return `${f(inizio, { day: "2-digit", month: "short" })} – ${f(ultimo, { day: "2-digit", month: "short", year: "numeric" })}`;
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

// ---- Scelta rapida del periodo: un anno o un mese in un clic ----------------
//
// Le frecce vanno bene per «il periodo prima»; per arrivare a giugno 2024
// erano venticinque clic, e nessuno li fa. L'anno e il mese si scelgono
// direttamente: la pagina resta quella di sempre (stesso `salto`, stesso
// confronto), qui si calcola solo **quanti periodi indietro** sta la scelta.

export const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Anno e mese (1-12) come li vede l'Italia. `getFullYear()` darebbe l'ora del
// server, che su Vercel è UTC: dalle 23 del 31 dicembre l'anno sarebbe ancora
// quello vecchio per un'ora — e la scelta rapida partirebbe dall'anno sbagliato.
export function annoMeseItaliano(d: Date): { anno: number; mese: number } {
  const n = (o: Intl.DateTimeFormatOptions) =>
    Number(new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, ...o }).format(d));
  return { anno: n({ year: "numeric" }), mese: n({ month: "numeric" }) };
}

// Quanti anni indietro sta `anno` rispetto ad adesso. Negativo = nel futuro:
// chi chiama lo usa per non offrire un periodo che non è ancora cominciato.
export function saltoAnno(adesso: Date, anno: number): number {
  return annoMeseItaliano(adesso).anno - anno;
}

// Quanti mesi indietro sta il mese `mese` (1-12) dell'anno `anno`.
export function saltoMese(adesso: Date, anno: number, mese: number): number {
  const ora = annoMeseItaliano(adesso);
  return ora.anno * 12 + ora.mese - (anno * 12 + mese);
}

// Gli anni in cui c'è almeno un ordine, dal più recente. Sono quelli da
// offrire: un elenco fisso mostrerebbe anni vuoti e, prima o poi, ne
// nasconderebbe uno vero.
// ⚠️ La conversione del fuso è quella giusta — `AT TIME ZONE 'UTC'` PRIMA,
// altrimenti Postgres sottrae due ore invece di aggiungerle e gli ordini della
// notte di Capodanno finiscono nell'anno sbagliato (vedi la trappola nel handoff).
export async function anniConOrdini(): Promise<number[]> {
  const righe = await prisma.$queryRawUnsafe<{ anno: number }[]>(
    `SELECT DISTINCT EXTRACT(YEAR FROM ("data" AT TIME ZONE 'UTC' AT TIME ZONE '${FUSO}'))::int AS anno
       FROM "${SCHEMA}"."Ordine"
      ORDER BY 1 DESC`,
  );
  return righe.map((r) => r.anno);
}
