import { prisma } from "@/lib/db";

// Il nome di una località scritto nell'app → l'id con cui Google la conosce.
//
// ⚠️ PERCHÉ GLI ID E NON I NOMI. Il bulk upload accetta anche una colonna
// «Location» col nome, ma i nomi sono una trappola doppia: Google li conosce in
// **inglese** (`geo_target_constant.name` torna «Spain», «Milan»), mentre nel
// modulo si scrive in **italiano** («Spagna», «Milano»), e un nome che non
// combacia non produce un errore ma una località che semplicemente non c'è.
// L'id è un numero e non ha lingua.
//
// ⚠️ E QUELLO CHE NON SI RISOLVE SI DICHIARA. Una località che non sappiamo
// tradurre non va inventata né lasciata cadere in silenzio: torna in
// `nonRisolte`, l'app la scrive fra le cose da mettere a mano e chi legge sa
// che quella manca. Vale la regola di [[feedback-non-dedurre-dati-critici]]:
// meglio «non indicato» che sbagliato — qui, meglio «questa mettila tu» che una
// campagna che eroga dove non doveva.

/**
 * I paesi: l'id di Google è **2000 + il codice ISO 3166-1 numerico**.
 *
 * Non è una congettura, è verificato sull'archivio delle località già
 * importate dalle campagne vive: Italia 2380 (ISO 380), Grecia 2300 (300),
 * Portogallo 2620 (620), Svizzera 2756 (756), Francia 2250 (250), Germania
 * 2276 (276). La tabella qui sotto tiene i paesi che il nostro giro tocca
 * davvero, coi nomi come li scrive una persona in italiano.
 */
const PAESI: Record<string, number> = {
  italia: 2380,
  spagna: 2724,
  grecia: 2300,
  portogallo: 2620,
  francia: 2250,
  germania: 2276,
  svizzera: 2756,
  austria: 2040,
  "regno unito": 2826,
  inghilterra: 2826,
  uk: 2826,
  irlanda: 2372,
  "principato di monaco": 2492,
  monaco: 2492,
  croazia: 2191,
  slovenia: 2705,
  malta: 2470,
  belgio: 2056,
  "paesi bassi": 2528,
  olanda: 2528,
  lussemburgo: 2442,
  danimarca: 2208,
  svezia: 2752,
  norvegia: 2578,
  finlandia: 2246,
  polonia: 2616,
  "repubblica ceca": 2203,
  romania: 2642,
  "emirati arabi uniti": 2784,
  emirati: 2784,
  dubai: 2784,
  qatar: 2634,
  "arabia saudita": 2682,
  israele: 2376,
  turchia: 2792,
  egitto: 2818,
  "stati uniti": 2840,
  usa: 2840,
  canada: 2124,
  messico: 2484,
  brasile: 2076,
  argentina: 2032,
  australia: 2036,
  giappone: 2392,
  cina: 2156,
  "hong kong": 2344,
  singapore: 2702,
  india: 2356,
  thailandia: 2764,
  russia: 2643,
  "sud africa": 2710,
};

/**
 * Le città italiane del modulo, col nome inglese con cui stanno in archivio.
 * ⚠️ Solo per la traduzione: l'id vero si cerca fra le località già importate,
 * così non ci sono numeri scritti a mano che possono invecchiare.
 */
const CITTA_IN_INGLESE: Record<string, string> = {
  milano: "Milan",
  roma: "Rome",
  napoli: "Naples",
  torino: "Turin",
  firenze: "Florence",
  venezia: "Venice",
  bologna: "Bologna",
  como: "Como",
  verona: "Verona",
  bari: "Bari",
  genova: "Genoa",
  palermo: "Palermo",
  catania: "Catania",
  parigi: "Paris",
  londra: "London",
  madrid: "Madrid",
  barcellona: "Barcelona",
  monaco_di_baviera: "Munich",
  vienna: "Vienna",
  zurigo: "Zurich",
  ginevra: "Geneva",
  lugano: "Lugano",
  marbella: "Marbella",
  ibiza: "Ibiza",
  mykonos: "Mykonos",
  santorini: "Santorini",
  "new york": "New York",
};

function chiave(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // I segni diacritici per codice (U+0300–U+036F): scritti come caratteri
    // veri sono invisibili nell'editor e si perdono al primo salvataggio con
    // una codifica diversa.
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export type LocalitaRisolta = { nome: string; id: number; come: "paese" | "archivio" };
export type EsitoGeo = { risolte: LocalitaRisolta[]; nonRisolte: string[] };

/**
 * Traduce un elenco di località scritte a mano negli id di Google.
 *
 * Tre strade, in ordine: la tabella dei paesi (un id che non cambia mai), il
 * nome inglese della città cercato fra le località **già importate** dalle
 * campagne vive, e il nome così com'è — chi scrive «Milan» o «Spain» ha già
 * usato il vocabolario di Google.
 */
export async function risolviLocalita(nomi: string[]): Promise<EsitoGeo> {
  const puliti = [...new Set(nomi.map((n) => n.trim()).filter(Boolean))];
  if (puliti.length === 0) return { risolte: [], nonRisolte: [] };

  // Una lettura sola per tutto il lotto: sono 78 righe distinte in archivio,
  // non vale una query per località.
  const archivio = await prisma.localitaCampagna.findMany({
    select: { nome: true, idEsterno: true },
  });
  const perNome = new Map<string, number>();
  for (const r of archivio) {
    const id = Number(r.idEsterno);
    if (!r.nome || !Number.isFinite(id)) continue;
    const k = chiave(r.nome);
    if (!perNome.has(k)) perNome.set(k, id);
  }

  const risolte: LocalitaRisolta[] = [];
  const nonRisolte: string[] = [];
  for (const nome of puliti) {
    // Chi scrive un NUMERO ha già dato l'id: si prende com'è. È la via
    // d'uscita quando un nome è ambiguo e lo script ha chiesto di scegliere.
    if (/^\d+$/.test(nome)) {
      risolte.push({ nome, id: Number(nome), come: "archivio" });
      continue;
    }
    const k = chiave(nome);
    const paese = PAESI[k];
    if (paese) {
      risolte.push({ nome, id: paese, come: "paese" });
      continue;
    }
    const inglese = CITTA_IN_INGLESE[k];
    const daArchivio = (inglese ? perNome.get(chiave(inglese)) : undefined) ?? perNome.get(k);
    if (daArchivio) {
      risolte.push({ nome, id: daArchivio, come: "archivio" });
      continue;
    }
    nonRisolte.push(nome);
  }
  return { risolte, nonRisolte };
}
